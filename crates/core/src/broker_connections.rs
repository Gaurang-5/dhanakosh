//! User-triggered broker reads. No order endpoints or ledger writes live here.
use crate::{accounts::AccountServiceTrait, secrets::SecretStore};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{collections::HashSet, str::FromStr, time::Duration};

pub const SECRET_PREFIX: &str = "direct_broker_v1:";
#[derive(Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    Zerodha,
    Icici,
}
impl Provider {
    fn key(self) -> &'static str {
        match self {
            Self::Zerodha => "zerodha",
            Self::Icici => "icici",
        }
    }
}
#[derive(Deserialize)]
#[serde(tag = "action", rename_all = "camelCase")]
pub enum Operation {
    Status,
    Connect {
        #[serde(rename = "apiKey")]
        api_key: String,
        #[serde(rename = "apiSecret")]
        api_secret: String,
        #[serde(rename = "loginToken")]
        login_token: String,
    },
    Holdings,
    Disconnect,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Request {
    pub account_id: String,
    pub provider: Provider,
    pub operation: Operation,
}
#[derive(Serialize, Deserialize)]
struct Credentials {
    api_key: String,
    api_secret: String,
    token: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Holding {
    pub identifier: String,
    pub broker_symbol: String,
    pub quantity: String,
}
#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Response {
    pub configured: bool,
    pub holdings: Option<Vec<Holding>>,
    pub fetched_at: Option<String>,
}

fn valid_secret(value: &str) -> bool {
    !value.is_empty() && value.len() <= 4096 && value.bytes().all(|b| b.is_ascii_graphic())
}
fn sensitive(value: &str) -> Result<reqwest::header::HeaderValue, String> {
    let mut header =
        reqwest::header::HeaderValue::from_str(value).map_err(|_| "Invalid broker credential")?;
    header.set_sensitive(true);
    Ok(header)
}
fn checksum(timestamp: &str, payload: &str, secret: &str) -> String {
    format!(
        "{:x}",
        Sha256::digest(format!("{timestamp}{payload}{secret}"))
    )
}
async fn response(request: reqwest::RequestBuilder) -> Result<Value, String> {
    let mut response = request.send().await.map_err(|_| "Could not reach broker")?;
    if !response.status().is_success() {
        return Err(
            "Broker rejected the request. Check API permissions and renew your login session."
                .into(),
        );
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "Incomplete broker response")?
    {
        if bytes.len() + chunk.len() > 8 * 1024 * 1024 {
            return Err("Broker response exceeds limit".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&bytes).map_err(|_| "Invalid broker response".into())
}
fn rows(value: &Value, provider: Provider) -> Result<&Vec<Value>, String> {
    let data = match provider {
        Provider::Zerodha if value["status"] == "success" => &value["data"],
        Provider::Icici
            if value["Status"].as_i64() == Some(200)
                && value["Error"].as_str().is_none_or(str::is_empty) =>
        {
            &value["Success"]
        }
        _ => {
            return Err(
                "Broker session expired or permission denied. Reconnect to continue.".into(),
            )
        }
    };
    data.as_array()
        .filter(|v| v.len() <= 10000)
        .ok_or_else(|| "Unsupported broker holdings response".into())
}
fn parse_holdings(value: &Value, provider: Provider) -> Result<Vec<Holding>, String> {
    let mut seen = HashSet::new();
    rows(value, provider)?
        .iter()
        .map(|row| {
            let (isin, symbol, quantity) = match provider {
                Provider::Zerodha => (&row["isin"], &row["tradingsymbol"], &row["quantity"]),
                Provider::Icici => (&row["stock_ISIN"], &row["stock_code"], &row["quantity"]),
            };
            let identifier: String = isin
                .as_str()
                .unwrap_or_default()
                .split_whitespace()
                .collect::<String>()
                .to_uppercase();
            let broker_symbol = symbol
                .as_str()
                .filter(|s| !s.is_empty() && s.len() <= 100)
                .ok_or("Missing broker stock code")?
                .to_string();
            if identifier.len() != 12
                || !identifier.bytes().all(|b| b.is_ascii_alphanumeric())
                || !seen.insert(identifier.clone())
            {
                return Err("Missing or duplicate ISIN; holdings were not imported".into());
            }
            let quantity = Decimal::from_str(
                quantity
                    .as_str()
                    .map(str::to_owned)
                    .unwrap_or_else(|| quantity.to_string())
                    .as_str(),
            )
            .map_err(|_| "Invalid holding quantity")?;
            if quantity < Decimal::ZERO {
                return Err("Unsupported negative holding quantity".into());
            }
            Ok(Holding {
                identifier,
                broker_symbol,
                quantity: quantity.to_string(),
            })
        })
        .collect()
}
async fn holdings(
    client: &reqwest::Client,
    provider: Provider,
    credentials: &Credentials,
) -> Result<Vec<Holding>, String> {
    let request = match provider {
        Provider::Zerodha => client
            .get("https://api.kite.trade/portfolio/holdings")
            .header("X-Kite-Version", "3")
            .header(
                "Authorization",
                sensitive(&format!(
                    "token {}:{}",
                    credentials.api_key, credentials.token
                ))?,
            ),
        Provider::Icici => {
            let timestamp = chrono::Utc::now()
                .format("%Y-%m-%dT%H:%M:%S.000Z")
                .to_string();
            let payload = "{}";
            client
                .get("https://api.icicidirect.com/breezeapi/api/v1/dematholdings")
                .header("Content-Type", "application/json")
                .header("X-Timestamp", &timestamp)
                .header(
                    "X-Checksum",
                    sensitive(&format!(
                        "token {}",
                        checksum(&timestamp, payload, &credentials.api_secret)
                    ))?,
                )
                .header("X-AppKey", sensitive(&credentials.api_key)?)
                .header("X-SessionToken", sensitive(&credentials.token)?)
                .body(payload)
        }
    };
    parse_holdings(&response(request).await?, provider)
}

pub async fn execute(
    accounts: &dyn AccountServiceTrait,
    store: &dyn SecretStore,
    request: Request,
) -> Result<Response, String> {
    // Resolve within the active member before any credentials or network access.
    let account = accounts
        .get_account(&request.account_id)
        .map_err(|_| "Select an account belonging to this member")?;
    if !matches!(request.operation, Operation::Status | Operation::Disconnect)
        && (account.currency != "INR" || account.account_type != "SECURITIES")
    {
        return Err("Select an INR investment account".into());
    }
    let key = format!(
        "{SECRET_PREFIX}{}:{}",
        request.provider.key(),
        request.account_id
    );
    if matches!(request.operation, Operation::Disconnect) {
        store
            .delete_secret(&key)
            .map_err(|_| "Could not remove broker credentials")?;
        return Ok(Response::default());
    }
    if matches!(request.operation, Operation::Status) {
        return Ok(Response {
            configured: store
                .get_secret(&key)
                .map_err(|_| "Credential store unavailable")?
                .is_some(),
            ..Default::default()
        });
    }
    let client = wealthfolio_http::client_builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|_| "Broker client unavailable")?;
    let (credentials, save) = match request.operation {
        Operation::Connect {
            api_key,
            api_secret,
            login_token,
        } => {
            if ![&api_key, &api_secret, &login_token]
                .into_iter()
                .all(|s| valid_secret(s))
            {
                return Err("Enter the API key, API secret and fresh login token".into());
            }
            let token = match request.provider {
                Provider::Zerodha => {
                    let hash = checksum(&api_key, &login_token, &api_secret);
                    let data = response(
                        client
                            .post("https://api.kite.trade/session/token")
                            .header("X-Kite-Version", "3")
                            .form(&[
                                ("api_key", api_key.as_str()),
                                ("request_token", login_token.as_str()),
                                ("checksum", hash.as_str()),
                            ]),
                    )
                    .await?;
                    if data["status"] != "success" {
                        return Err("Zerodha login failed; obtain a fresh request_token".into());
                    }
                    data["data"]["access_token"].as_str().map(str::to_owned)
                }
                Provider::Icici => {
                    let data = response(
                        client
                            .get("https://api.icicidirect.com/breezeapi/api/v1/customerdetails")
                            .json(&json!({"SessionToken":login_token,"AppKey":api_key})),
                    )
                    .await?;
                    if data["Status"].as_i64() != Some(200) {
                        return Err("ICICI login failed; obtain a fresh API_Session".into());
                    }
                    data["Success"]["session_token"].as_str().map(str::to_owned)
                }
            }
            .filter(|s| valid_secret(s))
            .ok_or("Broker did not return a usable session")?;
            // Zerodha's secret is only needed during the exchange.
            let api_secret = if matches!(request.provider, Provider::Zerodha) {
                String::new()
            } else {
                api_secret
            };
            (
                Credentials {
                    api_key,
                    api_secret,
                    token,
                },
                true,
            )
        }
        Operation::Holdings => {
            let value = store
                .get_secret(&key)
                .map_err(|_| "Credential store unavailable")?
                .ok_or("Connect this account first")?;
            (
                serde_json::from_str::<Credentials>(&value)
                    .map_err(|_| "Reconnect this account")?,
                false,
            )
        }
        _ => return Err("Unsupported broker operation".into()),
    };
    let holdings = holdings(&client, request.provider, &credentials).await?;
    if save {
        accounts
            .get_account(&request.account_id)
            .map_err(|_| "Account was removed during login")?;
        store
            .set_secret(
                &key,
                &serde_json::to_string(&credentials).map_err(|_| "Could not encode credentials")?,
            )
            .map_err(|_| "Could not securely store broker credentials")?;
    }
    Ok(Response {
        configured: true,
        holdings: Some(holdings),
        fetched_at: Some(chrono::Utc::now().to_rfc3339()),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn icici_uses_isin_not_broker_code() {
        let result = parse_holdings(&json!({"Status":200,"Error":null,"Success":[{"stock_ISIN":"INE 694 A 01020","stock_code":"UNITEC","quantity":"1"}]}), Provider::Icici).unwrap();
        assert_eq!(result[0].identifier, "INE694A01020");
        assert_eq!(result[0].quantity, "1");
    }
    #[test]
    fn rejects_duplicate_identity_and_invalid_quantities() {
        let row = json!({"isin":"INE009A01021","tradingsymbol":"INFY","quantity":2});
        assert!(parse_holdings(
            &json!({"status":"success","data":[row.clone(), row]}),
            Provider::Zerodha
        )
        .is_err());
        assert!(parse_holdings(&json!({"status":"success","data":[{"isin":"INE009A01021","tradingsymbol":"INFY","quantity":-1}]}), Provider::Zerodha).is_err());
        assert!(parse_holdings(&json!({"Status":401,"Success":[]}), Provider::Icici).is_err());
    }
    #[test]
    fn signs_exact_body_and_rejects_control_characters() {
        assert_ne!(
            checksum("date", "{}", "secret"),
            checksum("date", "{ }", "secret")
        );
        assert!(!valid_secret("token\nheader"));
        assert!(!valid_secret(""));
    }
}
