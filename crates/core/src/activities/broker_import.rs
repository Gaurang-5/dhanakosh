//! Explicit, read-only broker preview. Credentials are transient; ledger writes use native import.
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::{collections::HashSet, str::FromStr, time::Duration};

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Broker {
    Kite,
    Upstox,
}
impl Broker {
    fn name(self) -> &'static str {
        match self {
            Self::Kite => "Kite",
            Self::Upstox => "Upstox",
        }
    }
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrokerRequest {
    pub provider: Broker,
    #[serde(default)]
    pub api_key: String,
    pub access_token: String,
}
#[derive(Serialize)]
pub struct BrokerPreview {
    pub csv: String,
    pub rows: usize,
}
fn invalid() -> String {
    "Broker returned unsupported or invalid trades. Use a reviewed tradebook CSV instead.".into()
}
fn convert(value: serde_json::Value, broker: Broker) -> Result<BrokerPreview, String> {
    if value["status"] != "success" {
        return Err("Broker could not return trades".into());
    }
    let trades = value["data"].as_array().ok_or_else(invalid)?;
    if trades.is_empty() {
        return Err("No executed trades returned for today".into());
    }
    if trades.len() > 10000 {
        return Err(invalid());
    }
    let mut out = csv::Writer::from_writer(Vec::new());
    out.write_record([
        "date",
        "symbol",
        "activityType",
        "quantity",
        "unitPrice",
        "amount",
        "currency",
        "comment",
    ])
    .map_err(|_| invalid())?;
    let mut ids = HashSet::new();
    for trade in trades {
        let text = |key: &str| {
            trade[key]
                .as_str()
                .filter(|s| !s.is_empty())
                .ok_or_else(invalid)
        };
        let exchange = text("exchange")?;
        if !matches!(exchange, "NSE" | "BSE")
            || text("product")?
                != match broker {
                    Broker::Kite => "CNC",
                    Broker::Upstox => "D",
                }
        {
            return Err(invalid());
        }
        let side = text("transaction_type")?;
        if !matches!(side, "BUY" | "SELL") {
            return Err(invalid());
        }
        let id = text("trade_id")?;
        let symbol = text(match broker {
            Broker::Kite => "tradingsymbol",
            Broker::Upstox => "trading_symbol",
        })?;
        let symbol = if matches!(broker, Broker::Upstox) && exchange == "NSE" {
            symbol.strip_suffix("-EQ").unwrap_or(symbol)
        } else {
            symbol
        };
        if symbol.len() > 100
            || !symbol
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || b"&-._".contains(&c))
            || id.len() > 100
        {
            return Err(invalid());
        }
        let timestamp = chrono::NaiveDateTime::parse_from_str(
            text(match broker {
                Broker::Kite => "fill_timestamp",
                Broker::Upstox => "exchange_timestamp",
            })?,
            match broker {
                Broker::Kite => "%Y-%m-%d %H:%M:%S",
                Broker::Upstox => "%d-%b-%Y %H:%M:%S",
            },
        )
        .map_err(|_| invalid())?;
        if !ids.insert((exchange, id)) {
            return Err("Broker returned duplicate trade IDs; nothing was imported".into());
        }
        let quantity = Decimal::from_str(&trade["quantity"].to_string()).map_err(|_| invalid())?;
        let price =
            Decimal::from_str(&trade["average_price"].to_string()).map_err(|_| invalid())?;
        if quantity <= Decimal::ZERO || price <= Decimal::ZERO {
            return Err(invalid());
        }
        let amount = quantity.checked_mul(price).ok_or_else(invalid)?;
        let symbol = format!("{symbol}.{}", if exchange == "NSE" { "NS" } else { "BO" });
        out.write_record([
            timestamp.date().to_string(),
            symbol,
            side.into(),
            quantity.to_string(),
            price.to_string(),
            amount.to_string(),
            "INR".into(),
            format!("{} {exchange} trade {id}", broker.name()),
        ])
        .map_err(|_| invalid())?;
    }
    let bytes = out.into_inner().map_err(|_| invalid())?;
    Ok(BrokerPreview {
        csv: String::from_utf8(bytes).map_err(|_| invalid())?,
        rows: trades.len(),
    })
}

pub async fn preview_broker(request: BrokerRequest) -> Result<BrokerPreview, String> {
    let valid = |value: &str| {
        !value.is_empty()
            && value.len() <= 4096
            && value
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || b"-._=".contains(&c))
    };
    if !valid(&request.access_token)
        || (matches!(request.provider, Broker::Kite) && !valid(&request.api_key))
    {
        return Err("Enter valid broker credentials and a current access token".into());
    }
    let (url, authorization) = match request.provider {
        Broker::Kite => (
            "https://api.kite.trade/trades",
            format!("token {}:{}", request.api_key, request.access_token),
        ),
        Broker::Upstox => (
            "https://api.upstox.com/v2/order/trades/get-trades-for-day",
            format!("Bearer {}", request.access_token),
        ),
    };
    let mut auth = reqwest::header::HeaderValue::from_str(&authorization)
        .map_err(|_| "Invalid credentials")?;
    auth.set_sensitive(true);
    let client = wealthfolio_http::client_builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|_| "Broker client unavailable")?;
    let mut response = client
        .get(url)
        .header("X-Kite-Version", "3")
        .header(reqwest::header::AUTHORIZATION, auth)
        .send()
        .await
        .map_err(|_| "Could not reach broker; no trades imported")?;
    if !response.status().is_success() {
        return Err("Broker rejected the request. Check API access and token expiry.".into());
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
    convert(
        serde_json::from_slice(&bytes).map_err(|_| invalid())?,
        request.provider,
    )
}
#[cfg(test)]
mod tests {
    use super::*;
    fn sample() -> serde_json::Value {
        serde_json::json!({"status":"success","data":[{"trade_id":"1","exchange":"NSE","tradingsymbol":"SBIN","product":"CNC","average_price":420.65,"quantity":2,"transaction_type":"BUY","fill_timestamp":"2026-10-23 09:16:39"}]})
    }
    #[test]
    fn previews_decimal_trades_without_ledger_writes() {
        let result = convert(sample(), Broker::Kite).unwrap();
        assert_eq!(result.rows, 1);
        assert!(result
            .csv
            .contains("SBIN.NS,BUY,2,420.65,841.30,INR,Kite NSE trade 1"));
    }
    #[test]
    fn rejects_unsupported_and_duplicate_rows_as_a_whole() {
        let mut data = sample();
        data["data"][0]["product"] = "MIS".into();
        assert!(convert(data, Broker::Kite).is_err());
        let mut data = sample();
        let row = data["data"][0].clone();
        data["data"].as_array_mut().unwrap().push(row);
        assert!(convert(data, Broker::Kite).is_err());
    }
    #[test]
    fn upstox_delivery_maps_exchange_series_and_trade_date() {
        let data = serde_json::json!({"status":"success","data":[{"trade_id":"2","exchange":"NSE","trading_symbol":"GMRINFRA-EQ","product":"D","average_price":299.4,"quantity":1,"transaction_type":"BUY","exchange_timestamp":"03-Aug-2017 15:03:42"}]});
        let csv = convert(data, Broker::Upstox).unwrap().csv;
        assert!(csv.contains("2017-08-03,GMRINFRA.NS,BUY,1,299.4,299.4,INR,Upstox NSE trade 2"));
    }
    #[tokio::test]
    async fn invalid_credentials_fail_before_network() {
        assert!(preview_broker(BrokerRequest {
            provider: Broker::Kite,
            api_key: "".into(),
            access_token: "".into()
        })
        .await
        .is_err());
    }
}
