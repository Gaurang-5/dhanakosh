//! AMFI's public bulk NAV reports. Scheme codes, not fund-name guesses, identify plans.
use super::{MarketDataProvider, ProviderCapabilities, RateLimit};
use crate::{
    errors::MarketDataError,
    models::{Coverage, InstrumentKind, ProviderInstrument, Quote, QuoteContext, SearchResult},
};
use async_trait::async_trait;
use chrono::{DateTime, NaiveDate, Utc};
use rust_decimal::Decimal;
use std::{
    collections::{BTreeMap, VecDeque},
    str::FromStr,
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::sync::Mutex;

pub const DATA_SOURCE_AMFI: &str = "AMFI";
const ROOT: &str = "https://portal.amfiindia.com";
const MAX_BYTES: usize = 32 * 1024 * 1024;
type FeedCache = VecDeque<(String, Instant, Arc<str>)>;
pub struct AmfiProvider {
    client: reqwest::Client,
    cache: Mutex<FeedCache>,
}

#[derive(Debug)]
struct Nav {
    code: String,
    name: String,
    isin: String,
    value: Decimal,
    date: NaiveDate,
}
fn invalid() -> MarketDataError {
    MarketDataError::ProviderError {
        provider: DATA_SOURCE_AMFI.into(),
        message: "Invalid or unavailable AMFI NAV report".into(),
    }
}
fn scheme_code(instrument: &ProviderInstrument) -> Result<&str, MarketDataError> {
    let ProviderInstrument::EquitySymbol { symbol } = instrument else {
        return Err(invalid());
    };
    let code = symbol.strip_prefix("AMFI-").unwrap_or(symbol);
    if !(5..=8).contains(&code.len()) || !code.bytes().all(|b| b.is_ascii_digit()) {
        return Err(MarketDataError::SymbolNotFound(
            "AMFI scheme code required".into(),
        ));
    }
    Ok(code)
}

// Both the old six-column report and the newer Plan/Option report are header-driven.
fn parse_feed(text: &str) -> Result<Vec<Nav>, MarketDataError> {
    let mut lines = text.lines();
    let header = lines
        .find(|line| {
            line.trim_start_matches('\u{feff}')
                .starts_with("Scheme Code;")
        })
        .ok_or_else(invalid)?;
    let headers: Vec<_> = header
        .trim_start_matches('\u{feff}')
        .split(';')
        .map(str::trim)
        .collect();
    let column = |names: &[&str]| {
        headers
            .iter()
            .position(|h| names.contains(h))
            .ok_or_else(invalid)
    };
    let code = column(&["Scheme Code"])?;
    let name = column(&["Scheme Name", "NAV Name"])?;
    let nav = column(&["Net Asset Value"])?;
    let date = column(&["Date"])?;
    let isin = column(&[
        "ISIN Div Payout/ ISIN Growth",
        "ISIN Div Payout/ISIN Growth",
    ])?;
    let plan = headers.iter().position(|h| *h == "Plan");
    let option = headers.iter().position(|h| *h == "Option");
    let mut rows = Vec::new();
    for line in lines {
        let fields: Vec<_> = line.split(';').map(str::trim).collect();
        if fields.len() != headers.len()
            || !fields[code].bytes().all(|b| b.is_ascii_digit())
            || fields[code].is_empty()
        {
            continue;
        }
        // Unpublished/N.A. NAVs must never become zero prices.
        let Ok(value) = Decimal::from_str(fields[nav]) else {
            continue;
        };
        let Ok(day) = NaiveDate::parse_from_str(fields[date], "%d-%b-%Y") else {
            continue;
        };
        if value <= Decimal::ZERO || day > Utc::now().date_naive() {
            continue;
        }
        let mut label = fields[name].to_string();
        for i in [plan, option].into_iter().flatten() {
            if !fields[i].is_empty() && !label.to_lowercase().contains(&fields[i].to_lowercase()) {
                label.push_str(" - ");
                label.push_str(fields[i]);
            }
        }
        rows.push(Nav {
            code: fields[code].into(),
            name: label,
            isin: fields[isin].into(),
            value,
            date: day,
        });
    }
    if rows.is_empty() {
        return Err(invalid());
    }
    Ok(rows)
}

impl Default for AmfiProvider {
    fn default() -> Self {
        Self::new()
    }
}
impl AmfiProvider {
    pub fn new() -> Self {
        Self {
            client: wealthfolio_http::client(),
            cache: Mutex::new(VecDeque::new()),
        }
    }
    async fn feed(&self, path: &str) -> Result<Arc<str>, MarketDataError> {
        let mut cache = self.cache.lock().await;
        cache.retain(|(_, at, _)| at.elapsed() < Duration::from_secs(900));
        if let Some((_, _, text)) = cache.iter().find(|(key, _, _)| key == path) {
            return Ok(text.clone());
        }
        let mut response = self
            .client
            .get(format!("{ROOT}{path}"))
            .timeout(Duration::from_secs(45))
            .send()
            .await
            .map_err(|_| invalid())?
            .error_for_status()
            .map_err(|_| invalid())?;
        if response
            .content_length()
            .is_some_and(|n| n > MAX_BYTES as u64)
        {
            return Err(invalid());
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(|_| invalid())? {
            if bytes.len() + chunk.len() > MAX_BYTES {
                return Err(invalid());
            }
            bytes.extend_from_slice(&chunk);
        }
        let text: Arc<str> = String::from_utf8(bytes).map_err(|_| invalid())?.into();
        // Reject HTML/error responses before caching.
        if !text.contains("Scheme Code;") {
            return Err(invalid());
        }
        while cache.iter().map(|(_, _, t)| t.len()).sum::<usize>() + text.len() > MAX_BYTES {
            cache.pop_front();
        }
        cache.push_back((path.into(), Instant::now(), text.clone()));
        Ok(text)
    }
    fn quote(row: &Nav) -> Quote {
        Quote::new(
            row.date
                .and_hms_opt(0, 0, 0)
                .expect("midnight is valid")
                .and_utc(),
            row.value,
            "INR".into(),
            DATA_SOURCE_AMFI.into(),
        )
    }
}

#[async_trait]
impl MarketDataProvider for AmfiProvider {
    fn id(&self) -> &'static str {
        DATA_SOURCE_AMFI
    }
    fn capabilities(&self) -> ProviderCapabilities {
        ProviderCapabilities {
            instrument_kinds: &[InstrumentKind::Equity],
            coverage: Coverage::global_best_effort(),
            supports_latest: true,
            supports_historical: true,
            supports_search: true,
            supports_profile: false,
            supports_dividends: false,
        }
    }
    fn rate_limit(&self) -> RateLimit {
        RateLimit {
            requests_per_minute: 20,
            max_concurrency: 1,
            min_delay: Duration::from_secs(1),
        }
    }
    async fn get_latest_quote(
        &self,
        _: &QuoteContext,
        instrument: ProviderInstrument,
    ) -> Result<Quote, MarketDataError> {
        let code = scheme_code(&instrument)?;
        parse_feed(&self.feed("/spages/NAVAll.txt").await?)?
            .into_iter()
            .filter(|row| row.code == code)
            .max_by_key(|r| r.date)
            .map(|row| Self::quote(&row))
            .ok_or(MarketDataError::NoDataForRange)
    }
    async fn get_historical_quotes(
        &self,
        _: &QuoteContext,
        instrument: ProviderInstrument,
        start: DateTime<Utc>,
        end: DateTime<Utc>,
    ) -> Result<Vec<Quote>, MarketDataError> {
        let code = scheme_code(&instrument)?;
        let mut day = start.date_naive();
        let end = end.date_naive().min(Utc::now().date_naive());
        if day > end || (end - day).num_days() > 36525 {
            return Err(MarketDataError::NoDataForRange);
        }
        let mut quotes = BTreeMap::new();
        while day <= end {
            let last = (day + chrono::Duration::days(29)).min(end);
            let path = format!(
                "/DownloadNAVHistoryReport_Po.aspx?frmdt={}&todt={}",
                day.format("%d-%b-%Y"),
                last.format("%d-%b-%Y")
            );
            for row in parse_feed(&self.feed(&path).await?)? {
                if row.code == code && row.date >= day && row.date <= last {
                    quotes.insert(row.date, Self::quote(&row));
                }
            }
            day = last + chrono::Duration::days(1);
            if day <= end {
                tokio::time::sleep(Duration::from_secs(1)).await;
            }
        }
        if quotes.is_empty() {
            return Err(MarketDataError::NoDataForRange);
        }
        Ok(quotes.into_values().collect())
    }
    async fn search(&self, query: &str) -> Result<Vec<SearchResult>, MarketDataError> {
        let normalized = query.trim().to_lowercase();
        let query = normalized.strip_prefix("amfi-").unwrap_or(&normalized);
        if query.len() < 3 {
            return Ok(vec![]);
        }
        let rows = parse_feed(&self.feed("/spages/NAVAll.txt").await?)?;
        Ok(rows
            .into_iter()
            .filter(|r| {
                r.name.to_lowercase().contains(query)
                    || r.code == query
                    || r.isin.to_lowercase() == query
            })
            .take(30)
            .map(|r| {
                SearchResult::new(format!("AMFI-{}", r.code), r.name, "AMFI", "MUTUALFUND")
                    .with_currency("INR")
                    .with_data_source(DATA_SOURCE_AMFI)
            })
            .collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    #[ignore = "Contacts the official AMFI feed; run explicitly"]
    async fn live_official_feed_has_resolvable_plans() {
        let provider = AmfiProvider::new();
        let results = provider.search("120503").await.unwrap();
        assert!(!results.is_empty());
        let report = provider
            .feed("/DownloadNAVHistoryReport_Po.aspx?frmdt=20-Oct-2026&todt=23-Oct-2026")
            .await
            .unwrap();
        assert!(parse_feed(&report)
            .unwrap()
            .iter()
            .any(|r| r.code == "120503"));
    }

    #[test]
    fn handles_new_and_old_columns_and_preserves_plan() {
        let new = "Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Plan;Option;Net Asset Value;Date\n123456;INF000000001;-;Example Fund;Direct Plan;Growth Option;12.3456;23-Oct-2025";
        let rows = parse_feed(new).unwrap();
        assert_eq!(rows[0].value.to_string(), "12.3456");
        assert!(rows[0].name.contains("Direct Plan - Growth Option"));
        let old = "Scheme Code;Scheme Name;ISIN Div Payout/ISIN Growth;ISIN Div Reinvestment;Net Asset Value;Date\n123456;Fund;INF000000001;;12.34;23-Oct-2025";
        assert_eq!(parse_feed(old).unwrap()[0].code, "123456");
    }
    #[test]
    fn rejects_html_missing_columns_and_unpublished_nav() {
        assert!(parse_feed("<html>upstream error</html>").is_err());
        assert!(parse_feed("Scheme Code;Date\n123456;23-Oct-2025").is_err());
        assert!(parse_feed("Scheme Code;Scheme Name;ISIN Div Payout/ISIN Growth;Net Asset Value;Date\n123456;Fund;INF000000001;N.A.;23-Oct-2025").is_err());
        assert!(scheme_code(&ProviderInstrument::EquitySymbol {
            symbol: "AAPL".into()
        })
        .is_err());
    }
}
