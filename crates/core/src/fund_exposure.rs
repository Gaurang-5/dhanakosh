//! Dated, long-only fund composition snapshots. Exposure never creates ledger positions.
use crate::{
    assets::{AssetServiceTrait, AutoClassificationService, QuoteMode},
    errors::{Error, Result},
    quotes::service::QuoteServiceTrait,
    secrets::SecretStore,
    settings::SettingsServiceTrait,
    taxonomies::TaxonomyServiceTrait,
};
use chrono::{NaiveDate, Utc};
use log::warn;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, HashMap, HashSet},
    str::FromStr,
    sync::Arc,
    time::Duration,
};

const KEY: &str = "fund_compositions_v1";
const BHARATSTOCK_ROOT: &str = "https://bharatstockapi.com";
const BHARATSTOCK_SOURCE: &str = "BHARATSTOCK / OFFICIAL AMC MONTHLY DISCLOSURE";
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Constituent {
    /// ISIN when supplied; otherwise an exchange-qualified ticker.
    pub identifier: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sector: Option<String>,
    #[serde(with = "rust_decimal::serde::str")]
    pub weight_percent: Decimal,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FundComposition {
    pub asset_id: String,
    pub source: String,
    pub as_of: Option<NaiveDate>,
    pub fetched_at: String,
    pub imported: bool,
    pub constituents: Vec<Constituent>,
}
fn invalid(message: &str) -> Error {
    Error::InvalidConfigValue(message.into())
}
pub fn validate(snapshot: &FundComposition) -> Result<()> {
    if snapshot.asset_id.is_empty()
        || snapshot.source.trim().is_empty()
        || snapshot.source.len() > 500
        || snapshot.constituents.len() > 5000
        || snapshot.constituents.is_empty()
        || snapshot.as_of.is_some_and(|d| d > Utc::now().date_naive())
    {
        return Err(invalid(
            "Invalid fund composition: check source, date and constituents",
        ));
    }
    let mut seen = HashSet::new();
    let mut total = Decimal::ZERO;
    for row in &snapshot.constituents {
        if row.identifier.trim() != row.identifier
            || row.identifier.is_empty()
            || row.identifier.len() > 80
            || !row
                .identifier
                .bytes()
                .all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || b":.-&".contains(&c))
            || row.name.trim().is_empty()
            || row.name.len() > 200
            || row.weight_percent <= Decimal::ZERO
            || row.weight_percent > Decimal::from(100)
            || !seen.insert(&row.identifier)
        {
            return Err(invalid(
                "Invalid constituent: use a unique ISIN or MARKET:TICKER and a positive weight",
            ));
        }
        total += row.weight_percent;
    }
    if total > Decimal::from(100) {
        return Err(invalid(
            "Constituent weights exceed 100%; leveraged or overlapping rows are not supported",
        ));
    }
    if snapshot.imported && snapshot.as_of.is_none() {
        return Err(invalid("An issuer holdings date is required for imports"));
    }
    Ok(())
}
pub fn list(settings: &dyn SettingsServiceTrait) -> Result<Vec<FundComposition>> {
    let rows: Vec<FundComposition> = match settings.get_setting_value(KEY)? {
        None => vec![],
        Some(raw) => serde_json::from_str(&raw)
            .map_err(|_| invalid("Stored fund compositions are invalid"))?,
    };
    for row in &rows {
        validate(row)?;
    }
    Ok(rows)
}
pub async fn save(
    settings: &dyn SettingsServiceTrait,
    assets: &dyn AssetServiceTrait,
    mut snapshot: FundComposition,
) -> Result<FundComposition> {
    assets.get_asset_by_id(&snapshot.asset_id)?;
    validate(&snapshot)?;
    snapshot.fetched_at = Utc::now().to_rfc3339();
    let mut rows = list(settings)?;
    if !snapshot.imported
        && rows
            .iter()
            .any(|r| r.asset_id == snapshot.asset_id && r.imported)
    {
        return Err(invalid(
            "Imported composition takes priority; remove it before using automatic data",
        ));
    }
    rows.retain(|r| r.asset_id != snapshot.asset_id);
    if rows.len() >= 200 {
        return Err(invalid(
            "At most 200 fund compositions per member are supported",
        ));
    }
    rows.push(snapshot.clone());
    let json =
        serde_json::to_string(&rows).map_err(|_| invalid("Could not serialize composition"))?;
    if json.len() > 8 * 1024 * 1024 {
        return Err(invalid("Fund composition storage exceeds 8 MB"));
    }
    settings.set_setting_value(KEY, &json).await?;
    Ok(snapshot)
}
pub async fn remove(settings: &dyn SettingsServiceTrait, asset_id: &str) -> Result<()> {
    let mut rows = list(settings)?;
    rows.retain(|r| r.asset_id != asset_id);
    settings
        .set_setting_value(
            KEY,
            &serde_json::to_string(&rows)
                .map_err(|_| invalid("Could not serialize composition"))?,
        )
        .await
}

/// Applies only the sector portion of an issuer composition to the existing
/// taxonomy system. The classifier preserves manual user assignments.
pub async fn sync_sector_classification(
    taxonomy_service: Arc<dyn TaxonomyServiceTrait>,
    snapshot: &FundComposition,
) {
    let mut sectors = HashMap::<String, Decimal>::new();
    for row in &snapshot.constituents {
        let Some(sector) = row
            .sector
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
        else {
            continue;
        };
        *sectors.entry(sector.to_string()).or_default() += row.weight_percent;
    }
    if sectors.is_empty() {
        return;
    }
    let weights = sectors
        .into_iter()
        .filter_map(|(name, percent)| {
            percent
                .to_string()
                .parse::<f64>()
                .ok()
                .map(|value| (name, value / 100.0))
        })
        .collect();
    let classifier = AutoClassificationService::new(taxonomy_service);
    if let Err(error) = classifier
        .replace_sector_classification(&snapshot.asset_id, weights)
        .await
    {
        warn!(
            "Could not apply fund composition sectors for {}: {}",
            snapshot.asset_id, error
        );
    }
}

pub async fn clear_sector_classification(
    taxonomy_service: Arc<dyn TaxonomyServiceTrait>,
    asset_id: &str,
) {
    let classifier = AutoClassificationService::new(taxonomy_service);
    if let Err(error) = classifier
        .replace_sector_classification(asset_id, Vec::new())
        .await
    {
        warn!(
            "Could not clear fund composition sectors for {}: {}",
            asset_id, error
        );
    }
}
pub async fn refresh(
    settings: &dyn SettingsServiceTrait,
    assets: &dyn AssetServiceTrait,
    quotes: &dyn QuoteServiceTrait,
    secret_store: &dyn SecretStore,
    asset_id: &str,
) -> Result<FundComposition> {
    if list(settings)?
        .iter()
        .any(|s| s.asset_id == asset_id && s.imported)
    {
        return Err(invalid(
            "Imported composition takes priority; remove it before using automatic data",
        ));
    }
    let asset = assets.get_asset_by_id(asset_id)?;
    if asset.quote_mode == QuoteMode::Manual {
        return Err(invalid(
            "This security uses manual data. Import an issuer composition file instead.",
        ));
    }
    if let Some(index) = tracked_index(
        asset.name.as_deref().unwrap_or(""),
        asset.instrument_symbol.as_deref().unwrap_or(""),
    ) {
        let snapshot = fetch_index_composition(asset_id, index).await?;
        return save(settings, assets, snapshot).await;
    }
    if is_indian_fund_asset(&asset) {
        let snapshot = fetch_bharatstock_composition(&asset, secret_store).await?;
        return save(settings, assets, snapshot).await;
    }

    let profile = quotes.get_asset_profile(&asset).await?;
    let constituents = profile.fund_holdings.ok_or_else(|| {
        invalid("No automatic fund composition is available. Import an issuer file.")
    })?;
    let rows: Vec<Constituent> = serde_json::from_value(constituents)
        .map_err(|_| invalid("Provider returned an unsupported fund composition"))?;
    let latest = assets.get_asset_by_id(asset_id)?;
    if latest.instrument_key != asset.instrument_key
        || latest.quote_mode != asset.quote_mode
        || latest.provider_config != asset.provider_config
    {
        return Err(invalid("Security changed during refresh; retry"));
    }
    save(
        settings,
        assets,
        FundComposition {
            asset_id: asset_id.into(),
            source: if profile.data_source.eq_ignore_ascii_case("YAHOO") {
                "YAHOO TOP HOLDINGS (PARTIAL)".into()
            } else {
                profile.data_source
            },
            as_of: None,
            fetched_at: String::new(),
            imported: false,
            constituents: rows,
        },
    )
    .await
}

#[derive(Debug, Deserialize)]
struct BharatStockSchemePage {
    data: Vec<BharatStockScheme>,
}

#[derive(Debug, Deserialize)]
struct BharatStockScheme {
    scheme_name: String,
    isin_growth: Option<String>,
    isin_div_reinvest: Option<String>,
}

#[derive(Debug, Deserialize)]
struct BharatStockPortfolioPage {
    data: Vec<BharatStockPortfolio>,
}

#[derive(Debug, Deserialize)]
struct BharatStockPortfolio {
    scheme_name: String,
}

#[derive(Debug, Deserialize)]
struct BharatStockHoldingPage {
    portfolio_date: Option<NaiveDate>,
    data: Vec<BharatStockHolding>,
    pagination: BharatStockPagination,
}

#[derive(Debug, Deserialize)]
struct BharatStockPagination {
    total_pages: usize,
}

#[derive(Debug, Deserialize)]
struct BharatStockHolding {
    symbol: Option<String>,
    company_name: String,
    isin: Option<String>,
    instrument_type: String,
    pct_of_aum: Option<serde_json::Number>,
}

fn bharatstock_holding_identifier(holding: &BharatStockHolding) -> Option<String> {
    holding
        .symbol
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|symbol| format!("NSE:{}", symbol.to_uppercase()))
        .or_else(|| {
            holding
                .isin
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_uppercase)
        })
}

#[derive(Clone, Copy)]
enum TrackedIndex {
    Nifty50,
    Nifty500,
}

struct IndexMember {
    symbol: String,
    name: String,
    industry: String,
}

/// Nifty 50 and Nifty 500 ETFs hold the index, so look-through uses the official
/// constituent list rather than a provider's top-10 holdings preview.
fn tracked_index(name: &str, symbol: &str) -> Option<TrackedIndex> {
    let etf = name
        .split(|character: char| !character.is_ascii_alphanumeric())
        .any(|word| word.eq_ignore_ascii_case("ETF"))
        || matches!(
            symbol.to_ascii_uppercase().as_str(),
            "NIFTYBEES" | "MONIFTY500"
        );
    if !etf {
        return None;
    }
    let haystack = format!("{} {}", name.to_lowercase(), symbol.to_lowercase());
    if index_phrase(&haystack, "nifty 500") || symbol.eq_ignore_ascii_case("MONIFTY500") {
        return Some(TrackedIndex::Nifty500);
    }
    if index_phrase(&haystack, "nifty 50") || symbol.eq_ignore_ascii_case("NIFTYBEES") {
        return Some(TrackedIndex::Nifty50);
    }
    None
}

fn index_phrase(text: &str, phrase: &str) -> bool {
    let mut rest = text;
    while let Some(pos) = rest.find(phrase) {
        let before_ok = pos == 0
            || !rest[..pos]
                .chars()
                .next_back()
                .is_some_and(|character| character.is_ascii_alphanumeric());
        let after = pos + phrase.len();
        let after_ok = !rest[after..]
            .chars()
            .next()
            .is_some_and(|character| character.is_ascii_digit());
        if before_ok && after_ok {
            return true;
        }
        rest = &rest[pos + 1..];
    }
    false
}

fn parse_nse_index_list(text: &str) -> Result<Vec<IndexMember>> {
    let mut lines = text.lines().filter(|line| !line.trim().is_empty());
    let header = lines
        .next()
        .ok_or_else(|| invalid("Index constituent list was empty"))?;
    let headers = parse_csv_row(header.trim_start_matches('\u{feff}'));
    let column = |name: &str| {
        headers
            .iter()
            .position(|header| header.eq_ignore_ascii_case(name))
            .ok_or_else(|| invalid("Index constituent list is missing a required column"))
    };
    let name = column("Company Name")?;
    let industry = column("Industry")?;
    let symbol = column("Symbol")?;
    let mut members = Vec::new();
    let mut seen = HashSet::new();
    for line in lines {
        let fields = parse_csv_row(line);
        let symbol = fields.get(symbol).map(|value| value.trim()).unwrap_or("");
        let company = fields.get(name).map(|value| value.trim()).unwrap_or("");
        if symbol.is_empty() || company.is_empty() {
            continue;
        }
        if !seen.insert(symbol.to_string()) {
            return Err(invalid("Index constituent list repeats a symbol"));
        }
        members.push(IndexMember {
            symbol: symbol.to_string(),
            name: company.to_string(),
            industry: fields
                .get(industry)
                .map(|value| value.trim().to_string())
                .unwrap_or_default(),
        });
    }
    if members.is_empty() {
        return Err(invalid("Index constituent list had no companies"));
    }
    Ok(members)
}

fn parse_csv_row(line: &str) -> Vec<String> {
    let mut fields = Vec::new();
    let mut current = String::new();
    let mut quoted = false;
    for character in line.chars() {
        match character {
            '"' => quoted = !quoted,
            ',' if !quoted => {
                fields.push(std::mem::take(&mut current));
                current.clear();
            }
            _ => current.push(character),
        }
    }
    fields.push(current);
    fields
}

fn weight_index_members(
    members: &[IndexMember],
    market_caps: &std::collections::HashMap<String, Decimal>,
) -> Result<Vec<Constituent>> {
    let mut rows = Vec::with_capacity(members.len());
    for member in members {
        let cap = market_caps
            .get(&member.symbol)
            .copied()
            .filter(|cap| *cap > Decimal::ZERO)
            .ok_or_else(|| {
                invalid("A constituent has no market cap, so the full index was not saved")
            })?;
        rows.push((member, cap));
    }
    rows.sort_by(|left, right| {
        left.1
            .cmp(&right.1)
            .then_with(|| left.0.symbol.cmp(&right.0.symbol))
    });
    let total: Decimal = rows.iter().map(|(_, cap)| *cap).sum();
    if total <= Decimal::ZERO {
        return Err(invalid("Index market caps could not be weighted"));
    }
    let mut used = Decimal::ZERO;
    let mut constituents = Vec::with_capacity(rows.len());
    for (index, (member, cap)) in rows.iter().enumerate() {
        let weight = if index + 1 == rows.len() {
            Decimal::from(100) - used
        } else {
            let weight = ((*cap / total) * Decimal::from(100)).round_dp(4);
            used += weight;
            weight
        };
        if weight <= Decimal::ZERO || weight > Decimal::from(100) {
            return Err(invalid(
                "Index weights could not be formed from market caps",
            ));
        }
        let identifier = format!("NSE:{}", member.symbol);
        if !identifier.bytes().all(|character| {
            character.is_ascii_uppercase()
                || character.is_ascii_digit()
                || b":.-&".contains(&character)
        }) {
            return Err(invalid("An index symbol cannot be stored as a constituent"));
        }
        constituents.push(Constituent {
            identifier,
            name: member.name.clone(),
            sector: (!member.industry.is_empty()).then(|| member.industry.clone()),
            weight_percent: weight,
        });
    }
    Ok(constituents)
}

async fn fetch_index_composition(asset_id: &str, index: TrackedIndex) -> Result<FundComposition> {
    let (url, source, minimum, maximum) = match index {
        TrackedIndex::Nifty50 => (
            "https://nsearchives.nseindia.com/content/indices/ind_nifty50list.csv",
            "NSE NIFTY 50 CONSTITUENTS",
            50,
            50,
        ),
        TrackedIndex::Nifty500 => (
            "https://nsearchives.nseindia.com/content/indices/ind_nifty500list.csv",
            "NSE NIFTY 500 CONSTITUENTS",
            500,
            510,
        ),
    };
    let client = wealthfolio_http::client_builder()
        .timeout(Duration::from_secs(45))
        .build()
        .map_err(|_| invalid("Could not initialize the index constituent download."))?;
    let response = client
        .get(url)
        .header(reqwest::header::USER_AGENT, "Mozilla/5.0")
        .send()
        .await
        .map_err(|_| invalid("The official index constituent list could not be downloaded."))?;
    if !response.status().is_success() {
        return Err(invalid(
            "The official index constituent list could not be downloaded.",
        ));
    }
    let body = response
        .text()
        .await
        .map_err(|_| invalid("The official index constituent list could not be read."))?;
    let members = parse_nse_index_list(&body)?;
    if members.len() < minimum || members.len() > maximum {
        return Err(invalid(
            "The official index constituent list was not the full index.",
        ));
    }
    let symbols = members
        .iter()
        .map(|member| format!("{}.NS", member.symbol))
        .collect::<Vec<_>>();
    let market_caps = wealthfolio_market_data::provider::yahoo::fetch_market_caps(&symbols)
        .await
        .map_err(|_| invalid("Market caps for the index constituents could not be loaded."))?;
    Ok(FundComposition {
        asset_id: asset_id.into(),
        source: source.into(),
        as_of: None,
        fetched_at: String::new(),
        imported: false,
        constituents: weight_index_members(&members, &market_caps)?,
    })
}

fn is_indian_fund_asset(asset: &crate::assets::Asset) -> bool {
    let isin = asset
        .metadata
        .as_ref()
        .and_then(|value| value.pointer("/identifiers/isin"))
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default();
    asset.quote_ccy.eq_ignore_ascii_case("INR")
        && (isin.to_ascii_uppercase().starts_with("INF")
            || matches!(
                asset.instrument_exchange_mic.as_deref(),
                Some("XNSE" | "XBOM")
            )
            || asset
                .instrument_symbol
                .as_deref()
                .is_some_and(|symbol| symbol.starts_with("AMFI-")))
}

fn normalized_scheme_name(value: &str) -> String {
    let normalized = value
        .split(|character: char| !character.is_ascii_alphanumeric())
        .filter(|token| {
            !token.is_empty()
                && !matches!(
                    token.to_ascii_lowercase().as_str(),
                    "direct" | "regular" | "plan" | "growth" | "idcw" | "option"
                )
        })
        .map(str::to_ascii_lowercase)
        .collect::<Vec<_>>()
        .join(" ");
    // The AMC renamed Value Discovery Fund to Value Fund, while monthly
    // disclosures and AMFI schemes can still use opposite names.
    normalized.replace(
        "icici prudential value discovery fund",
        "icici prudential value fund",
    )
}

fn select_portfolio_name(
    scheme_name: &str,
    portfolios: Vec<BharatStockPortfolio>,
) -> Result<String> {
    let expected = normalized_scheme_name(scheme_name);
    let mut matches = portfolios
        .into_iter()
        .filter(|portfolio| normalized_scheme_name(&portfolio.scheme_name) == expected);
    let selected = matches.next().ok_or_else(|| {
        invalid("No complete monthly portfolio matches this fund. Check its ISIN or import the AMC file.")
    })?;
    if matches.next().is_some() {
        return Err(invalid(
            "More than one monthly portfolio matches this fund. Import the AMC file to choose explicitly.",
        ));
    }
    Ok(selected.scheme_name)
}

async fn bharatstock_get<T: serde::de::DeserializeOwned>(
    client: &reqwest::Client,
    api_key: &str,
    url: url::Url,
) -> Result<T> {
    let response = client
        .get(url)
        .header("X-API-Key", api_key)
        .send()
        .await
        .map_err(|_| invalid("BharatStock could not be reached. Try again later."))?;
    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err(invalid(
            "The BharatStock API key is invalid. Update it in Settings > Market Data.",
        ));
    }
    if response.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
        return Err(invalid(
            "The BharatStock daily request limit was reached. Existing snapshots remain available.",
        ));
    }
    response
        .error_for_status()
        .map_err(|_| {
            invalid("BharatStock returned an error. Existing snapshots remain available.")
        })?
        .json::<T>()
        .await
        .map_err(|_| invalid("BharatStock returned an unsupported fund composition."))
}

async fn fetch_bharatstock_composition(
    asset: &crate::assets::Asset,
    secret_store: &dyn SecretStore,
) -> Result<FundComposition> {
    use crate::quotes::constants::DATA_SOURCE_BHARATSTOCK;

    let api_key = secret_store
        .get_secret(DATA_SOURCE_BHARATSTOCK)?
        .filter(|key| !key.trim().is_empty())
        .ok_or_else(|| {
            invalid(
                "Add a free BharatStock API key in Settings > Market Data to load the complete fund composition.",
            )
        })?;
    let isin = asset
        .metadata
        .as_ref()
        .and_then(|value| value.pointer("/identifiers/isin"))
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            invalid("This Indian fund needs an ISIN before its full composition can be matched.")
        })?;
    let client = wealthfolio_http::client_builder()
        .timeout(Duration::from_secs(45))
        .build()
        .map_err(|_| invalid("Could not initialize the full-composition provider."))?;

    let mut schemes_url = url::Url::parse(&format!("{BHARATSTOCK_ROOT}/v1/mf/schemes"))
        .expect("BharatStock base URL is valid");
    schemes_url
        .query_pairs_mut()
        .append_pair("isin", isin)
        .append_pair("limit", "10");
    let schemes: BharatStockSchemePage = bharatstock_get(&client, &api_key, schemes_url).await?;
    let scheme = schemes
        .data
        .into_iter()
        .find(|scheme| {
            [
                scheme.isin_growth.as_deref(),
                scheme.isin_div_reinvest.as_deref(),
            ]
            .into_iter()
            .flatten()
            .any(|candidate| candidate.eq_ignore_ascii_case(isin))
        })
        .ok_or_else(|| invalid("BharatStock could not identify this mutual fund from its ISIN."))?;

    let mut portfolios_url = url::Url::parse(&format!("{BHARATSTOCK_ROOT}/v1/mf/portfolios"))
        .expect("BharatStock base URL is valid");
    portfolios_url
        .query_pairs_mut()
        .append_pair("q", &scheme.scheme_name)
        .append_pair("limit", "200");
    let portfolios: BharatStockPortfolioPage =
        bharatstock_get(&client, &api_key, portfolios_url).await?;
    let portfolio_name = match select_portfolio_name(&scheme.scheme_name, portfolios.data) {
        Ok(name) => name,
        Err(error)
            if normalized_scheme_name(&scheme.scheme_name).contains("icici prudential value") =>
        {
            let mut renamed_url = url::Url::parse(&format!("{BHARATSTOCK_ROOT}/v1/mf/portfolios"))
                .expect("BharatStock base URL is valid");
            renamed_url
                .query_pairs_mut()
                .append_pair("q", "ICICI Prudential Value Fund")
                .append_pair("limit", "200");
            let renamed: BharatStockPortfolioPage =
                bharatstock_get(&client, &api_key, renamed_url).await?;
            select_portfolio_name("ICICI Prudential Value Fund", renamed.data).map_err(|_| error)?
        }
        Err(error) => return Err(error),
    };

    let mut page = 1usize;
    let mut total_pages = 1usize;
    let mut as_of = None;
    let mut constituents = BTreeMap::<String, (String, Decimal)>::new();
    while page <= total_pages {
        let mut holdings_url =
            url::Url::parse(BHARATSTOCK_ROOT).expect("BharatStock base URL is valid");
        holdings_url
            .path_segments_mut()
            .expect("BharatStock URL can be a base")
            .extend(["v1", "mf", "portfolios", &portfolio_name, "holdings"]);
        holdings_url
            .query_pairs_mut()
            .append_pair("page", &page.to_string())
            .append_pair("page_size", "100");
        let holdings: BharatStockHoldingPage =
            bharatstock_get(&client, &api_key, holdings_url).await?;
        total_pages = holdings.pagination.total_pages.max(1);
        as_of = as_of.or(holdings.portfolio_date);
        for holding in holdings.data.into_iter().filter(|holding| {
            matches!(
                holding.instrument_type.as_str(),
                "EQUITY" | "FOREIGN_EQUITY"
            )
        }) {
            let Some(pct_of_aum) = holding.pct_of_aum.as_ref() else {
                continue;
            };
            let weight = Decimal::from_str(&pct_of_aum.to_string())
                .map_err(|_| invalid("BharatStock returned an invalid holding weight."))?;
            if weight <= Decimal::ZERO {
                continue;
            }
            let identifier = bharatstock_holding_identifier(&holding);
            let Some(identifier) = identifier else {
                continue;
            };
            let entry = constituents
                .entry(identifier)
                .or_insert((holding.company_name, Decimal::ZERO));
            entry.1 += weight;
        }
        page += 1;
    }
    if as_of.is_none() || constituents.is_empty() {
        return Err(invalid(
            "BharatStock has no complete monthly portfolio for this fund yet. Import the AMC file instead.",
        ));
    }
    Ok(FundComposition {
        asset_id: asset.id.clone(),
        source: BHARATSTOCK_SOURCE.into(),
        as_of,
        fetched_at: String::new(),
        imported: false,
        constituents: constituents
            .into_iter()
            .map(|(identifier, (name, weight_percent))| Constituent {
                identifier,
                name,
                sector: None,
                weight_percent,
            })
            .collect(),
    })
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExposurePosition {
    pub asset_id: String,
    pub account_id: String,
    pub identifier: String,
    pub aliases: Vec<String>,
    pub name: String,
    #[serde(with = "rust_decimal::serde::str")]
    pub value: Decimal,
    pub is_fund: bool,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExposureContribution {
    pub identifier: String,
    pub name: String,
    pub asset_id: String,
    pub account_id: String,
    pub via_fund: Option<String>,
    pub source: Option<String>,
    pub as_of: Option<NaiveDate>,
    #[serde(with = "rust_decimal::serde::str")]
    pub value: Decimal,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExposureReport {
    pub contributions: Vec<ExposureContribution>,
    /// Includes unavailable compositions and residual cash/bonds/undisclosed constituents.
    #[serde(with = "rust_decimal::serde::str")]
    pub unexpanded_value: Decimal,
    pub uncovered_funds: Vec<String>,
}

fn normalized_security_name(value: &str) -> String {
    value
        .split(|character: char| !character.is_ascii_alphanumeric())
        .filter(|token| {
            !token.is_empty()
                && !matches!(
                    token.to_ascii_lowercase().as_str(),
                    "limited" | "ltd" | "inc" | "incorporated" | "corporation" | "corp" | "plc"
                )
        })
        .map(str::to_ascii_lowercase)
        .collect::<Vec<_>>()
        .join(" ")
}

pub fn calculate(positions: &[ExposurePosition], snapshots: &[FundComposition]) -> ExposureReport {
    let direct_identifiers: HashMap<&str, (&str, &str)> = positions
        .iter()
        .filter(|position| !position.is_fund)
        .flat_map(|position| {
            position.aliases.iter().map(move |alias| {
                (
                    alias.as_str(),
                    (position.identifier.as_str(), position.name.as_str()),
                )
            })
        })
        .collect();
    let mut direct_names = HashMap::<String, Option<(&str, &str)>>::new();
    for position in positions.iter().filter(|position| !position.is_fund) {
        let key = normalized_security_name(&position.name);
        if key.is_empty() {
            continue;
        }
        direct_names
            .entry(key)
            .and_modify(|candidate| *candidate = None)
            .or_insert(Some((position.identifier.as_str(), position.name.as_str())));
    }
    let mut report = ExposureReport {
        contributions: vec![],
        unexpanded_value: Decimal::ZERO,
        uncovered_funds: vec![],
    };
    for position in positions {
        let snapshot = snapshots.iter().find(|s| s.asset_id == position.asset_id);
        if let Some(snapshot) =
            snapshot.filter(|s| validate(s).is_ok() && position.value >= Decimal::ZERO)
        {
            let mut expanded = Decimal::ZERO;
            for row in &snapshot.constituents {
                let value = position.value * row.weight_percent / Decimal::from(100);
                expanded += value;
                let name_match = direct_names
                    .get(&normalized_security_name(&row.name))
                    .and_then(|candidate| *candidate);
                let (identifier, name) = direct_identifiers
                    .get(row.identifier.as_str())
                    .copied()
                    .or(name_match)
                    .unwrap_or((row.identifier.as_str(), row.name.as_str()));
                report.contributions.push(ExposureContribution {
                    identifier: identifier.to_string(),
                    name: name.to_string(),
                    asset_id: position.asset_id.clone(),
                    account_id: position.account_id.clone(),
                    via_fund: Some(position.name.clone()),
                    source: Some(snapshot.source.clone()),
                    as_of: snapshot.as_of,
                    value,
                });
            }
            report.unexpanded_value += position.value - expanded;
        } else if position.is_fund || snapshot.is_some() {
            report.unexpanded_value += position.value;
            if !report.uncovered_funds.contains(&position.asset_id) {
                report.uncovered_funds.push(position.asset_id.clone());
            }
        } else {
            report.contributions.push(ExposureContribution {
                identifier: position.identifier.clone(),
                name: position.name.clone(),
                asset_id: position.asset_id.clone(),
                account_id: position.account_id.clone(),
                via_fund: None,
                source: None,
                as_of: None,
                value: position.value,
            });
        }
    }
    report
}
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exposure_identifier_prefers_isin_for_direct_and_fund_matching() {
        let metadata = serde_json::json!({"identifiers": {"isin": "ine002a01018"}});
        assert_eq!(
            exposure_identifier(Some(&metadata), Some("XNSE"), "RELIANCE", "asset-id"),
            "INE002A01018"
        );
        assert_eq!(
            exposure_identifier(None, Some("XNSE"), "RELIANCE", "asset-id"),
            "NSE:RELIANCE"
        );
        let legacy_metadata = serde_json::json!({"isin": "ine0ndh25011"});
        assert_eq!(
            exposure_identifier(Some(&legacy_metadata), Some("XNSE"), "NXST", "asset-id"),
            "INE0NDH25011"
        );
    }

    #[test]
    fn nifty_500_etf_is_not_read_as_nifty_50() {
        assert!(matches!(
            tracked_index("Motilal Oswal Nifty 500 ETF", "MONIFTY500"),
            Some(TrackedIndex::Nifty500)
        ));
        assert!(matches!(
            tracked_index("Nippon India ETF Nifty 50 BeES", "NIFTYBEES"),
            Some(TrackedIndex::Nifty50)
        ));
        assert!(tracked_index("Reliance Industries", "RELIANCE").is_none());
    }

    #[test]
    fn index_composition_keeps_every_company_and_sums_to_the_whole_fund() {
        let members = parse_nse_index_list(
            "Company Name,Industry,Symbol,Series,ISIN Code\n\
             Reliance Industries Ltd.,Energy,RELIANCE,EQ,INE002A01018\n\
             Mahindra & Mahindra Ltd.,Automobile,M&M,EQ,INE101A01026\n\
             HDFC Bank Ltd.,Financial Services,HDFCBANK,EQ,INE040A01034\n",
        )
        .unwrap();
        let market_caps = std::collections::HashMap::from([
            ("RELIANCE".into(), Decimal::from(50)),
            ("M&M".into(), Decimal::from(30)),
            ("HDFCBANK".into(), Decimal::from(20)),
        ]);
        let rows = weight_index_members(&members, &market_caps).unwrap();
        assert_eq!(rows.len(), 3);
        assert_eq!(
            rows.iter().map(|row| row.weight_percent).sum::<Decimal>(),
            Decimal::from(100)
        );
        let mahindra = rows.iter().find(|row| row.identifier == "NSE:M&M").unwrap();
        assert_eq!(mahindra.weight_percent, Decimal::from(30));
        assert_eq!(mahindra.sector.as_deref(), Some("Automobile"));
        let mut missing = market_caps;
        missing.remove("M&M");
        assert!(weight_index_members(&members, &missing).is_err());
    }

    #[test]
    fn listed_reit_with_stale_mutual_fund_profile_stays_a_direct_security() {
        assert!(!is_exposure_fund(
            "MUTUALFUND",
            "Nexus Select Trust",
            "NXST",
            Some("XNSE"),
            Some("INE0NDH25011"),
            false,
        ));
        assert!(is_exposure_fund(
            "MUTUALFUND",
            "HDFC Flexi Cap",
            "0P0000XW77",
            Some("XBOM"),
            Some("INF179K01BE2"),
            false,
        ));
        assert!(is_exposure_fund(
            "ETF",
            "Example Index",
            "EXAMPLE",
            Some("XNSE"),
            Some("INF000000000"),
            false,
        ));
    }

    #[test]
    fn reit_direct_shares_join_the_same_isin_from_a_fund() {
        let direct = ExposurePosition {
            asset_id: "reit".into(),
            account_id: "account".into(),
            identifier: "INE0NDH25011".into(),
            aliases: vec!["INE0NDH25011".into(), "NSE:NXST".into()],
            name: "Nexus Select Trust".into(),
            value: Decimal::new(5_007_374, 2),
            is_fund: false,
        };
        let fund = ExposurePosition {
            asset_id: "fund".into(),
            account_id: "account".into(),
            identifier: "INF000000000".into(),
            aliases: vec!["INF000000000".into()],
            name: "Fund".into(),
            value: Decimal::new(612_582, 1),
            is_fund: true,
        };
        let mut composition = snapshot();
        composition.constituents = vec![Constituent {
            identifier: "INE0NDH25011".into(),
            name: "Nexus Select Trust REIT".into(),
            sector: Some("Realty".into()),
            weight_percent: Decimal::from(10),
        }];
        let report = calculate(&[direct, fund], &[composition]);
        assert_eq!(report.contributions.len(), 2);
        assert!(report
            .contributions
            .iter()
            .all(|row| row.identifier == "INE0NDH25011"));
        assert_eq!(report.unexpanded_value, Decimal::new(5_513_238, 2));
    }

    fn snapshot() -> FundComposition {
        FundComposition {
            asset_id: "fund".into(),
            source: "issuer".into(),
            as_of: NaiveDate::from_ymd_opt(2026, 9, 30),
            fetched_at: String::new(),
            imported: true,
            constituents: vec![Constituent {
                identifier: "NSE:RELIANCE".into(),
                name: "Reliance".into(),
                sector: Some("Energy".into()),
                weight_percent: Decimal::from(8),
            }],
        }
    }
    #[test]
    fn exposure_preserves_total_without_inventing_missing_holdings() {
        let rows = vec![
            ExposurePosition {
                asset_id: "stock".into(),
                account_id: "a".into(),
                identifier: "NSE:RELIANCE".into(),
                aliases: vec!["NSE:RELIANCE".into()],
                name: "Reliance".into(),
                value: Decimal::from(50000),
                is_fund: false,
            },
            ExposurePosition {
                asset_id: "fund".into(),
                account_id: "a".into(),
                identifier: "fund".into(),
                aliases: vec!["fund".into()],
                name: "Fund 1".into(),
                value: Decimal::from(100000),
                is_fund: true,
            },
        ];
        let report = calculate(&rows, &[snapshot()]);
        assert_eq!(
            report
                .contributions
                .iter()
                .map(|r| r.value)
                .sum::<Decimal>(),
            Decimal::from(58000)
        );
        assert_eq!(report.unexpanded_value, Decimal::from(92000));
        assert_eq!(calculate(&rows, &[]).uncovered_funds, vec!["fund"]);
    }

    #[test]
    fn fund_ticker_alias_joins_a_direct_stock_identified_by_isin() {
        let rows = vec![
            ExposurePosition {
                asset_id: "stock".into(),
                account_id: "a".into(),
                identifier: "INE467B01029".into(),
                aliases: vec!["INE467B01029".into(), "NSE:TCS".into()],
                name: "Tata Consultancy Services Limited".into(),
                value: Decimal::from(50_000),
                is_fund: false,
            },
            ExposurePosition {
                asset_id: "fund".into(),
                account_id: "a".into(),
                identifier: "AMFI:TEST".into(),
                aliases: vec!["AMFI:TEST".into()],
                name: "Example Fund".into(),
                value: Decimal::from(100_000),
                is_fund: true,
            },
        ];
        let mut fund = snapshot();
        fund.constituents[0].identifier = "NSE:TCS".into();
        fund.constituents[0].name = "TCS".into();

        let report = calculate(&rows, &[fund]);
        let indirect = report
            .contributions
            .iter()
            .find(|row| row.via_fund.is_some())
            .expect("fund contribution");

        assert_eq!(indirect.identifier, "INE467B01029");
        assert_eq!(indirect.name, "Tata Consultancy Services Limited");
        assert_eq!(indirect.value, Decimal::from(8_000));
    }

    #[test]
    fn unique_company_name_joins_an_isin_constituent_to_a_stock_missing_its_isin() {
        let rows = vec![
            ExposurePosition {
                asset_id: "stock".into(),
                account_id: "a".into(),
                identifier: "NSE:TCS".into(),
                aliases: vec!["NSE:TCS".into()],
                name: "Tata Consultancy Services Limited".into(),
                value: Decimal::from(50_000),
                is_fund: false,
            },
            ExposurePosition {
                asset_id: "fund".into(),
                account_id: "a".into(),
                identifier: "AMFI:TEST".into(),
                aliases: vec!["AMFI:TEST".into()],
                name: "Example Fund".into(),
                value: Decimal::from(100_000),
                is_fund: true,
            },
        ];
        let mut fund = snapshot();
        fund.constituents[0].identifier = "INE467B01029".into();
        fund.constituents[0].name = "Tata Consultancy Services Ltd.".into();

        let report = calculate(&rows, &[fund]);
        let indirect = report
            .contributions
            .iter()
            .find(|row| row.via_fund.is_some())
            .expect("fund contribution");

        assert_eq!(indirect.identifier, "NSE:TCS");
        assert_eq!(indirect.name, "Tata Consultancy Services Limited");
    }

    #[test]
    fn matches_a_plan_variant_to_its_scheme_level_portfolio() {
        let selected = select_portfolio_name(
            "HDFC Flexi Cap Fund - Direct Plan - Growth",
            vec![BharatStockPortfolio {
                scheme_name: "HDFC Flexi Cap Fund".into(),
            }],
        )
        .expect("plan and option suffixes do not change the underlying portfolio");

        assert_eq!(selected, "HDFC Flexi Cap Fund");
    }

    #[test]
    fn matches_renamed_icici_value_portfolio() {
        let selected = select_portfolio_name(
            "ICICI Prudential Value Fund - Direct Plan - Growth",
            vec![BharatStockPortfolio {
                scheme_name: "ICICI Prudential Value Discovery Fund".into(),
            }],
        )
        .expect("the old and new AMC names identify the same fund");

        assert_eq!(selected, "ICICI Prudential Value Discovery Fund");
    }

    #[test]
    fn refuses_an_ambiguous_full_portfolio_match() {
        let result = select_portfolio_name(
            "Example Fund - Direct Growth",
            vec![
                BharatStockPortfolio {
                    scheme_name: "Example Fund".into(),
                },
                BharatStockPortfolio {
                    scheme_name: "Example Fund - Regular Plan".into(),
                },
            ],
        );

        assert!(result.is_err());
    }

    #[test]
    fn accepts_bharatstock_rows_without_an_aum_weight() {
        let page: BharatStockHoldingPage = serde_json::from_str(
            r#"{
                "portfolio_date":"2026-09-30",
                "data":[{
                    "symbol":null,
                    "company_name":"Unpriced disclosure row",
                    "isin":"INF000000000",
                    "instrument_type":"EQUITY",
                    "pct_of_aum":null
                }],
                "pagination":{"total_pages":1}
            }"#,
        )
        .expect("nullable disclosure weights are valid provider data");

        assert!(page.data[0].pct_of_aum.is_none());
    }

    #[test]
    fn bharatstock_ticker_matches_an_indian_stock_without_an_isin() {
        let holding = BharatStockHolding {
            symbol: Some("TCS".into()),
            company_name: "Tata Consultancy Services Limited".into(),
            isin: Some("INE467B01029".into()),
            instrument_type: "EQUITY".into(),
            pct_of_aum: Some(serde_json::Number::from_f64(1.23).expect("finite weight")),
        };

        assert_eq!(
            bharatstock_holding_identifier(&holding).as_deref(),
            Some("NSE:TCS")
        );
    }

    #[test]
    fn rejects_duplicate_and_overweight_rows() {
        let mut s = snapshot();
        s.constituents.push(s.constituents[0].clone());
        assert!(validate(&s).is_err());
        s.constituents.pop();
        s.constituents[0].weight_percent = Decimal::from(101);
        assert!(validate(&s).is_err());
        s.constituents[0].weight_percent = Decimal::ZERO;
        assert!(validate(&s).is_err());
    }

    #[test]
    fn previews_indian_amc_portfolio_headers_and_sector() {
        let csv = concat!(
            "Name of the Instrument,ISIN,Industry*,% to Net Assets\n",
            "Reliance Industries Limited,INE002A01018,Petroleum Products,8.25\n"
        );
        let composition = preview_csv(
            "fund".into(),
            "Official AMC portfolio".into(),
            NaiveDate::from_ymd_opt(2026, 9, 30).expect("valid test date"),
            csv,
        )
        .expect("official Indian AMC columns should be supported");

        assert_eq!(composition.constituents.len(), 1);
        assert_eq!(composition.constituents[0].identifier, "INE002A01018");
        assert_eq!(
            composition.constituents[0].sector.as_deref(),
            Some("Petroleum Products")
        );
        assert_eq!(
            composition.constituents[0].weight_percent,
            Decimal::new(825, 2)
        );
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExposureView {
    pub currency: String,
    pub positions: Vec<ExposurePosition>,
    pub snapshots: Vec<FundComposition>,
    pub report: ExposureReport,
}

fn exposure_identifier(
    metadata: Option<&serde_json::Value>,
    exchange_mic: Option<&str>,
    symbol: &str,
    asset_id: &str,
) -> String {
    if let Some(isin) = metadata
        .and_then(|value| {
            value
                .pointer("/identifiers/isin")
                .or_else(|| value.get("isin"))
        })
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        return isin.to_uppercase();
    }

    let market = match exchange_mic {
        Some("XNSE") => "NSE",
        Some("XBOM") => "BSE",
        Some("XNAS" | "XNYS" | "ARCX" | "BATS" | "XASE") => "US",
        Some(mic) => mic,
        None => "ASSET",
    };
    if market == "ASSET" {
        format!("ASSET:{}", asset_id.to_uppercase())
    } else {
        format!("{market}:{symbol}")
    }
}

fn is_exposure_fund(
    kind: &str,
    name: &str,
    symbol: &str,
    exchange_mic: Option<&str>,
    isin: Option<&str>,
    has_snapshot: bool,
) -> bool {
    let name_says_etf = name
        .split(|character: char| !character.is_ascii_alphanumeric())
        .any(|word| word.eq_ignore_ascii_case("ETF"));
    if has_snapshot || name_says_etf || kind == "ETF" {
        return true;
    }
    // Some providers label listed Indian REITs and stocks as MUTUALFUND.
    // A listed equity with a stock symbol is a direct security; genuine
    // Indian fund schemes use an INF ISIN or Yahoo's 0P scheme symbol.
    let listed_indian_equity = matches!(exchange_mic, Some("XNSE" | "XBOM"))
        && !symbol.starts_with("0P")
        && !isin.is_some_and(|value| value.starts_with("INF"));
    matches!(kind, "MUTUALFUND" | "MUTUAL_FUND") && !listed_indian_equity
}

fn exposure_aliases(
    canonical: &str,
    exchange_mic: Option<&str>,
    symbol: &str,
    asset_id: &str,
) -> Vec<String> {
    let market_identifier = exposure_identifier(None, exchange_mic, symbol, asset_id);
    if market_identifier == canonical {
        vec![canonical.to_string()]
    } else {
        vec![canonical.to_string(), market_identifier]
    }
}

pub async fn read(
    settings: &dyn SettingsServiceTrait,
    accounts: &dyn crate::accounts::AccountServiceTrait,
    assets: &dyn AssetServiceTrait,
    holdings: &dyn crate::portfolio::holdings::HoldingsServiceTrait,
    currency: &str,
    account_ids: Option<&[String]>,
) -> Result<ExposureView> {
    use crate::accounts::{account_supports_portfolio_scope, AccountPurpose};
    if currency.len() != 3 || !currency.bytes().all(|c| c.is_ascii_uppercase()) {
        return Err(invalid("Invalid reporting currency"));
    }
    let snapshots = list(settings)?;
    let mut positions = vec![];
    for account in accounts.get_all_accounts()?.into_iter().filter(|a| {
        account_supports_portfolio_scope(a, AccountPurpose::Holdings)
            && account_ids.is_none_or(|ids| ids.contains(&a.id))
    }) {
        for holding in holdings
            .get_holdings_with_options(&account.id, currency, false)
            .await?
        {
            let Some(instrument) = holding.instrument else {
                continue;
            };
            if holding.is_closed
                || holding.holding_type != crate::portfolio::holdings::HoldingType::Security
            {
                continue;
            }
            let asset = assets.get_asset_by_id(&instrument.id)?;
            let metadata = asset.metadata.as_ref();
            let kind = metadata
                .and_then(|m| m.get("profile"))
                .and_then(|p| p.get("quoteType"))
                .and_then(|s| s.as_str())
                .unwrap_or_default();
            let asset_name = asset.name.as_deref().unwrap_or(&instrument.symbol);
            let symbol = asset
                .instrument_symbol
                .as_deref()
                .unwrap_or(&instrument.symbol);
            let isin = metadata
                .and_then(|m| m.pointer("/identifiers/isin").or_else(|| m.get("isin")))
                .and_then(serde_json::Value::as_str);
            let is_fund = is_exposure_fund(
                kind,
                asset_name,
                symbol,
                asset.instrument_exchange_mic.as_deref(),
                isin,
                snapshots.iter().any(|s| s.asset_id == asset.id),
            );
            let identifier = exposure_identifier(
                metadata,
                asset.instrument_exchange_mic.as_deref(),
                symbol,
                &asset.id,
            );
            let aliases = exposure_aliases(
                &identifier,
                asset.instrument_exchange_mic.as_deref(),
                symbol,
                &asset.id,
            );
            positions.push(ExposurePosition {
                asset_id: asset.id,
                account_id: account.id.clone(),
                identifier,
                aliases,
                name: asset_name.to_string(),
                value: holding.market_value.base,
                is_fund,
            });
        }
    }
    let report = calculate(&positions, &snapshots);
    Ok(ExposureView {
        currency: currency.into(),
        positions,
        snapshots,
        report,
    })
}

pub fn preview_csv(
    asset_id: String,
    source: String,
    as_of: NaiveDate,
    csv_text: &str,
) -> Result<FundComposition> {
    use std::str::FromStr;
    if csv_text.len() > 2 * 1024 * 1024 {
        return Err(invalid("Composition CSV exceeds 2 MB"));
    }
    let mut reader = csv::ReaderBuilder::new()
        .trim(csv::Trim::All)
        .from_reader(csv_text.trim_start_matches('\u{feff}').as_bytes());
    let headers = reader
        .headers()
        .map_err(|_| invalid("Invalid CSV header"))?
        .clone();
    let column = |names: &[&str]| {
        headers
            .iter()
            .position(|h| names.iter().any(|n| h.eq_ignore_ascii_case(n)))
    };
    let id = column(&["identifier", "isin"])
        .ok_or_else(|| invalid("CSV needs identifier or ISIN, name and weightPercent columns"))?;
    let name = column(&[
        "name",
        "holdingName",
        "Name of the Instrument",
        "Name of Instrument",
        "security name",
        "issuer name",
    ])
    .ok_or_else(|| invalid("CSV needs a name column"))?;
    let weight = column(&[
        "weightPercent",
        "weight",
        "% to Net Assets",
        "% to NAV",
        "% of NAV",
        "Weight (%)",
        "Percent",
    ])
    .ok_or_else(|| invalid("CSV needs a weightPercent column (0 to 100)"))?;
    let sector_columns: Vec<usize> = ["sector / rating", "sector", "industry*", "industry"]
        .iter()
        .filter_map(|name| column(&[*name]))
        .collect();
    let mut constituents = vec![];
    for row in reader.records() {
        let row = row.map_err(|_| invalid("Invalid CSV row"))?;
        let identifier = row.get(id).unwrap_or_default().trim().to_uppercase();
        let name = row.get(name).unwrap_or_default().trim().to_string();
        let sector = sector_columns
            .iter()
            .filter_map(|index| row.get(*index))
            .map(str::trim)
            .find(|value| !value.is_empty())
            .map(str::to_string);
        let raw = row
            .get(weight)
            .unwrap_or_default()
            .trim()
            .trim_end_matches('%')
            .trim();
        constituents.push(Constituent {
            identifier,
            name,
            sector,
            weight_percent: Decimal::from_str(raw)
                .map_err(|_| invalid("Invalid weight; use a percentage such as 8.5"))?,
        });
        if constituents.len() > 5000 {
            return Err(invalid("At most 5000 constituent rows are supported"));
        }
    }
    let snapshot = FundComposition {
        asset_id,
        source,
        as_of: Some(as_of),
        fetched_at: String::new(),
        imported: true,
        constituents,
    };
    validate(&snapshot)?;
    Ok(snapshot)
}
