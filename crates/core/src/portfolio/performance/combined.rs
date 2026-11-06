//! Read-only composition of member stores using the existing measurement engine.
use std::collections::BTreeMap;

use super::{from_kernel, PerformanceResult};
use crate::{errors::ValidationError, portfolio::coordinator::blocking, Error, Result};
use wealthfolio_portfolio_engine::{self as engine, model::*};

pub struct PreparedPerformance {
    pub effects: Effects,
    pub cash_fx: Option<BTreeMap<AccountId, Vec<engine::CashFxEffect>>>,
    pub series: BTreeMap<AccountId, ValuationSeries>,
    pub lots: Vec<LotRecord>,
    pub disposals: Vec<LotDisposal>,
}

impl PreparedPerformance {
    pub fn inputs(&self) -> engine::MeasureInputs<'_> {
        engine::MeasureInputs {
            effects: self.effects.clone(),
            cash_fx: self.cash_fx.clone(),
            series: &self.series,
            lots: &self.lots,
            disposals: &self.disposals,
        }
    }

    fn namespace(&mut self, member: &str) {
        let scoped = |id: &str| format!("{member}::{id}");
        let account = |id: &AccountId| AccountId::new(scoped(id.as_str()));
        self.effects.accounts = std::mem::take(&mut self.effects.accounts)
            .into_iter()
            .map(|(id, value)| (account(&id), value))
            .collect();
        for event in &mut self.effects.events {
            event.id = EventId::new(scoped(event.id.as_str()));
            event.source = ActivityId::new(scoped(event.source.as_str()));
            event.account = account(&event.account);
            if let Boundary::Internal { counterparty } = &mut event.boundary {
                *counterparty = account(counterparty);
            }
        }
        for pair in &mut self.effects.pairs {
            pair.group = scoped(&pair.group);
            pair.transfer_in = ActivityId::new(scoped(pair.transfer_in.as_str()));
            pair.transfer_out = ActivityId::new(scoped(pair.transfer_out.as_str()));
            pair.in_account = account(&pair.in_account);
            pair.out_account = account(&pair.out_account);
        }
        self.cash_fx = self.cash_fx.take().map(|map| {
            map.into_iter()
                .map(|(id, value)| (account(&id), value))
                .collect()
        });
        self.series = std::mem::take(&mut self.series)
            .into_iter()
            .map(|(id, mut value)| {
                value.account = account(&value.account);
                (account(&id), value)
            })
            .collect();
        for lot in &mut self.lots {
            lot.id = scoped(&lot.id);
            lot.account = account(&lot.account);
            lot.asset = AssetId::new(scoped(lot.asset.as_str()));
            lot.open_activity = lot
                .open_activity
                .as_ref()
                .map(|id| ActivityId::new(scoped(id.as_str())));
        }
        for disposal in &mut self.disposals {
            disposal.id = scoped(&disposal.id);
            disposal.lot_id = scoped(&disposal.lot_id);
            disposal.account = account(&disposal.account);
            disposal.asset = AssetId::new(scoped(disposal.asset.as_str()));
            disposal.event = EventId::new(scoped(disposal.event.as_str()));
        }
    }
}

/// All inputs must already use one base currency. No rates are fetched here.
/// Member IDs isolate transfers and lots even when databases reuse record IDs.
pub async fn measure_combined(
    members: Vec<(String, PreparedPerformance, Vec<String>)>,
    currency: String,
    start: Option<chrono::NaiveDate>,
    end: Option<chrono::NaiveDate>,
) -> Result<PerformanceResult> {
    blocking(move || {
        if start.zip(end).is_some_and(|(a, b)| a > b) {
            return Err(invalid("Invalid date range"));
        }
        let mut combined: Option<PreparedPerformance> = None;
        let mut scope = Vec::new();
        for (member, mut prepared, accounts) in members {
            if prepared.effects.base_currency.as_str() != currency {
                return Err(invalid("Members must use the same reporting currency"));
            }
            prepared.namespace(&member);
            scope.extend(
                accounts
                    .iter()
                    .map(|id| AccountId::new(format!("{member}::{id}"))),
            );
            if let Some(total) = &mut combined {
                total.effects.range.start =
                    total.effects.range.start.min(prepared.effects.range.start);
                total.effects.range.end = total.effects.range.end.max(prepared.effects.range.end);
                total.effects.accounts.extend(prepared.effects.accounts);
                total.effects.events.extend(prepared.effects.events);
                total.effects.pairs.extend(prepared.effects.pairs);
                if let (Some(total_fx), Some(fx)) = (&mut total.cash_fx, prepared.cash_fx) {
                    total_fx.extend(fx);
                }
                total.series.extend(prepared.series);
                total.lots.extend(prepared.lots);
                total.disposals.extend(prepared.disposals);
            } else {
                combined = Some(prepared);
            }
        }
        let combined = combined.ok_or_else(|| invalid("No eligible accounts"))?;
        Ok(from_kernel(engine::measure_scope(
            &combined.inputs(),
            "portfolio:all",
            &scope,
            engine::Window { start, end },
            engine::MeasureProfile::Full,
            true,
        )?))
    })
    .await
}

fn invalid(message: &str) -> Error {
    Error::Validation(ValidationError::InvalidInput(message.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use rust_decimal::Decimal;

    fn fixture(open: i64, close: i64) -> PreparedPerformance {
        let start = chrono::NaiveDate::from_ymd_opt(2026, 1, 1).unwrap();
        let end = chrono::NaiveDate::from_ymd_opt(2026, 1, 2).unwrap();
        let id = AccountId::new("same-account");
        let currency = Currency::parse("INR").unwrap();
        let days = [(start, open), (end, close)]
            .into_iter()
            .map(|(date, value)| {
                let value = Decimal::from(value);
                DailyValuation {
                    date,
                    fx_rate_to_base: Decimal::ONE,
                    cash_balance: Decimal::ZERO,
                    investment_market_value: value,
                    total_value: value,
                    cost_basis: Decimal::from(open),
                    book_basis: Decimal::from(open),
                    net_contribution: Decimal::from(open),
                    cash_balance_base: Decimal::ZERO,
                    investment_market_value_base: value,
                    total_value_base: value,
                    cost_basis_base: Decimal::from(open),
                    book_basis_base: Decimal::from(open),
                    net_contribution_base: Decimal::from(open),
                    performance_eligible_value_base: value,
                    value_status: ValueStatus::Complete,
                    basis_status: BasisStatus::Complete,
                    flow: DailyFlow::default(),
                }
            })
            .collect();
        PreparedPerformance {
            effects: Effects {
                base_currency: currency.clone(),
                range: DateRange { start, end },
                accounts: BTreeMap::from([(
                    id.clone(),
                    AccountProfile {
                        currency: currency.clone(),
                        tracking: TrackingMode::Transactions,
                        kind: AccountKind::Securities,
                        archived: false,
                        cost_basis_method: CostBasisMethod::Fifo,
                        started: true,
                    },
                )]),
                events: vec![],
                pairs: vec![],
            },
            cash_fx: Some(BTreeMap::from([(id.clone(), vec![])])),
            series: BTreeMap::from([(
                id.clone(),
                ValuationSeries {
                    account: id,
                    currency,
                    days,
                    diagnostics: vec![],
                },
            )]),
            lots: vec![],
            disposals: vec![],
        }
    }

    #[tokio::test]
    async fn combined_return_uses_values_not_sum_of_member_returns() {
        let result = measure_combined(
            vec![
                ("a".into(), fixture(100, 110), vec!["same-account".into()]),
                ("b".into(), fixture(900, 900), vec!["same-account".into()]),
            ],
            "INR".into(),
            None,
            None,
        )
        .await
        .unwrap();
        // 10 gain on 1000: 1%, not the first member's 10%.
        assert_eq!(result.returns.twr, Some(Decimal::new(1, 2)));
    }

    #[tokio::test]
    async fn deposits_are_not_counted_as_investment_return() {
        let mut member = fixture(100, 600);
        let end = member.effects.range.end;
        member.effects.events.push(EventEffect {
            id: EventId::new("deposit"),
            source: ActivityId::new("deposit"),
            account: AccountId::new("same-account"),
            date: end,
            currency: Currency::parse("INR").unwrap(),
            boundary: Boundary::External,
            flow: Some(PricedFlow {
                amount: Decimal::from(500),
                source: FlowSource::CashAmount,
                outflow: false,
                leg_outflow: false,
                units: Decimal::ZERO,
            }),
            income: None,
            fee: None,
            tax: None,
            realizes: false,
            trade_charge: None,
            marked_external: true,
        });
        let day = &mut member
            .series
            .get_mut(&AccountId::new("same-account"))
            .unwrap()
            .days[1];
        day.net_contribution = Decimal::from(600);
        day.net_contribution_base = Decimal::from(600);
        day.flow = DailyFlow {
            inflow_base: Decimal::from(500),
            outflow_base: Decimal::ZERO,
            source: FlowSource::CashAmount,
        };
        let result = measure_combined(
            vec![
                ("a".into(), member, vec!["same-account".into()]),
                ("b".into(), fixture(900, 900), vec!["same-account".into()]),
            ],
            "INR".into(),
            None,
            None,
        )
        .await
        .unwrap();
        assert_eq!(result.returns.twr, Some(Decimal::ZERO));
    }

    #[tokio::test]
    async fn combined_rejects_different_base_currencies() {
        assert!(measure_combined(
            vec![("a".into(), fixture(100, 110), vec!["same-account".into()])],
            "USD".into(),
            None,
            None
        )
        .await
        .is_err());
    }
}
