#![allow(clippy::unwrap_used, clippy::panic, reason = "test code")]
mod support;
use rust_decimal_macros::dec;
use support::{Pipeline, Scenario};

fn run(separate: bool) -> Pipeline {
    let scenario: Scenario = serde_yaml::from_str(r#"
id: separate-cash
policy: { base_currency: INR, timezone: UTC, as_of: 2026-01-03 }
accounts:
  - { id: broker, currency: INR }
assets:
  - { id: stock, quote_ccy: INR }
activities:
  - { id: buy, account: broker, type: BUY, date: 2026-01-01, asset: stock, quantity: 10, unit_price: 10, fee: 1, amount: 101 }
  - { id: sell, account: broker, type: SELL, date: 2026-01-02, asset: stock, quantity: 4, unit_price: 15, fee: 1, amount: 59 }
  - { id: cash, account: broker, type: DEPOSIT, date: 2026-01-03, amount: 7 }
quotes:
  - { asset: stock, day: 2026-01-01, close: 10 }
  - { asset: stock, day: 2026-01-02, close: 15 }
  - { asset: stock, day: 2026-01-03, close: 15 }
"#).unwrap();
    let mut facts = scenario.raw_facts();
    facts.accounts[0].separate_cash_ledger = separate;
    Pipeline::run(facts).unwrap()
}

#[test]
fn trades_do_not_change_manual_cash_but_keep_lots_and_external_flows() {
    let result = run(true);
    let days = &result.series.values().next().unwrap().days;
    assert_eq!(days[0].cash_balance, dec!(0));
    assert_eq!(days[0].net_contribution, dec!(101));
    assert_eq!(days[1].cash_balance, dec!(0));
    assert_eq!(days[1].flow.outflow_base, dec!(59));
    assert_eq!(days[2].cash_balance, dec!(7));
    assert_eq!(days[2].investment_market_value, dec!(90));
    assert_eq!(days[2].total_value, dec!(97));
    assert_eq!(days[2].net_contribution, dec!(49));
    assert_eq!(result.bundle.disposals.len(), 1);
    let lots = result.lots();
    let inputs = result.measure_inputs(&lots);
    let performance = wealthfolio_portfolio_engine::measure_account(
        &inputs,
        &result.portfolio_scope()[0],
        wealthfolio_portfolio_engine::Window::default(),
        wealthfolio_portfolio_engine::MeasureProfile::Full,
        true,
    )
    .unwrap();
    assert_eq!(performance.summary.amount, Some(dec!(48)));
}

#[test]
fn normal_cash_ledger_behavior_is_preserved_when_not_separate() {
    let result = run(false);
    let days = &result.series.values().next().unwrap().days;
    assert_eq!(days[0].cash_balance, dec!(-101));
    assert_eq!(days[1].cash_balance, dec!(-42));
    assert_eq!(days[2].cash_balance, dec!(-35));
    assert_eq!(days[2].investment_market_value, dec!(90));
    assert_eq!(days[2].net_contribution, dec!(7));
}

#[test]
fn funded_us_account_debits_a_buy_from_available_cash() {
    let scenario: Scenario = serde_yaml::from_str(r#"
id: funded-us-cash
policy: { base_currency: INR, timezone: UTC, as_of: 2026-01-02 }
accounts:
  - { id: us-broker, currency: USD }
assets:
  - { id: stock, quote_ccy: USD }
activities:
  - { id: funding, account: us-broker, type: DEPOSIT, date: 2026-01-01, amount: 1000, currency: USD }
  - { id: buy, account: us-broker, type: BUY, date: 2026-01-02, asset: stock, quantity: 5, unit_price: 100, amount: 500, currency: USD }
quotes:
  - { asset: stock, day: 2026-01-02, close: 100 }
fx:
  - { base: USD, quote: INR, day: 2026-01-01, rate: 85 }
  - { base: USD, quote: INR, day: 2026-01-02, rate: 86 }
"#).unwrap();
    let result = Pipeline::run(scenario.raw_facts()).unwrap();
    let final_day = result.series.values().next().unwrap().days.last().unwrap();

    assert_eq!(final_day.cash_balance, dec!(500));
    assert_eq!(final_day.investment_market_value, dec!(500));
    assert_eq!(final_day.total_value, dec!(1000));
}

#[test]
fn investment_income_is_not_automatically_available_cash() {
    let scenario: Scenario = serde_yaml::from_str(r#"
id: separate-income
policy: { base_currency: INR, timezone: UTC, as_of: 2026-01-02 }
accounts:
  - { id: broker, currency: INR }
assets:
  - { id: stock, quote_ccy: INR }
activities:
  - { id: buy, account: broker, type: BUY, date: 2026-01-01, asset: stock, quantity: 1, unit_price: 100, amount: 100 }
  - { id: dividend, account: broker, type: DIVIDEND, date: 2026-01-02, asset: stock, amount: 5 }
quotes:
  - { asset: stock, day: 2026-01-01, close: 100 }
"#).unwrap();
    let mut facts = scenario.raw_facts();
    facts.accounts[0].separate_cash_ledger = true;
    let result = Pipeline::run(facts).unwrap();
    let day = result.series.values().next().unwrap().days.last().unwrap();
    assert_eq!(day.cash_balance, dec!(0));
    assert_eq!(day.flow.outflow_base, dec!(5));
    assert_eq!(day.net_contribution, dec!(95));
}
