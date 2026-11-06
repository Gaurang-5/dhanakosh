//! Monthly investment instructions, separate from executed ledger activities.
use crate::{
    accounts::{account_supports_portfolio_scope, AccountPurpose, AccountServiceTrait},
    assets::{AssetKind, AssetServiceTrait},
    errors::{Error, Result},
    settings::SettingsServiceTrait,
};
use chrono::NaiveDate;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
const KEY: &str = "investment_plans_v1";
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InvestmentPlan {
    pub id: String,
    pub name: String,
    pub account_id: String,
    pub asset_id: String,
    #[serde(serialize_with = "rust_decimal::serde::str::serialize")]
    pub amount: Decimal,
    pub currency: String,
    pub start_date: NaiveDate,
    pub end_date: Option<NaiveDate>,
    pub day_of_month: u32,
    pub paused: bool,
}
fn invalid() -> Error {
    Error::InvalidConfigValue(
        "Invalid investment plan: check name, amount, currency, dates and monthly day".into(),
    )
}
pub fn validate(plans: &[InvestmentPlan]) -> Result<()> {
    if plans.len() > 100 {
        return Err(invalid());
    }
    let mut ids = HashSet::new();
    for p in plans {
        if uuid::Uuid::parse_str(&p.id).is_err()
            || !ids.insert(&p.id)
            || p.name.trim().is_empty()
            || p.name.len() > 120
            || p.amount <= Decimal::ZERO
            || p.amount > Decimal::from(1_000_000_000u64)
            || !(1..=31).contains(&p.day_of_month)
            || p.currency.len() != 3
            || !p.currency.bytes().all(|c| c.is_ascii_uppercase())
            || p.end_date.is_some_and(|end| end < p.start_date)
        {
            return Err(invalid());
        }
    }
    Ok(())
}
pub fn list(settings: &dyn SettingsServiceTrait) -> Result<Vec<InvestmentPlan>> {
    match settings.get_setting_value(KEY)? {
        None => Ok(vec![]),
        Some(raw) => serde_json::from_str(&raw).map_err(|_| {
            Error::InvalidConfigValue(
                "Stored investment plans are invalid; restore a backup".into(),
            )
        }),
    }
}
pub async fn save(
    settings: &dyn SettingsServiceTrait,
    accounts: &dyn AccountServiceTrait,
    assets: &dyn AssetServiceTrait,
    plans: &[InvestmentPlan],
) -> Result<()> {
    validate(plans)?;
    for p in plans {
        let account = accounts.get_account(&p.account_id)?;
        if account.is_archived
            || !account_supports_portfolio_scope(&account, AccountPurpose::Holdings)
        {
            return Err(Error::InvalidConfigValue(
                "Choose an active investment account".into(),
            ));
        }
        if assets.get_asset_by_id(&p.asset_id)?.kind != AssetKind::Investment {
            return Err(Error::InvalidConfigValue(
                "Choose an investment asset".into(),
            ));
        }
    }
    let value = serde_json::to_string(plans).map_err(|_| invalid())?;
    settings.set_setting_value(KEY, &value).await
}
#[cfg(test)]
mod tests {
    use super::*;
    fn plan() -> InvestmentPlan {
        InvestmentPlan {
            id: uuid::Uuid::new_v4().to_string(),
            name: "Monthly fund".into(),
            account_id: "a".into(),
            asset_id: "s".into(),
            amount: Decimal::from(5000),
            currency: "INR".into(),
            start_date: NaiveDate::from_ymd_opt(2026, 1, 1).unwrap(),
            end_date: None,
            day_of_month: 31,
            paused: false,
        }
    }
    #[test]
    fn rejects_invalid_amount_days_and_duplicate_ids() {
        let p = plan();
        assert_eq!(serde_json::to_value(&p).unwrap()["amount"], "5000");
        assert!(validate(std::slice::from_ref(&p)).is_ok());
        assert!(validate(&[p.clone(), p.clone()]).is_err());
        let mut bad = p.clone();
        bad.amount = Decimal::ZERO;
        assert!(validate(&[bad]).is_err());
        let mut bad = p;
        bad.day_of_month = 32;
        assert!(validate(&[bad]).is_err());
    }
}
