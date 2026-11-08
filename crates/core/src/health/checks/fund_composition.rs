//! Funds that still sit in the portfolio as one holding.
//!
//! A fund is uncovered when look-through has no saved composition for it.
//! Cash, bonds, and undisclosed weight left inside an expanded fund stay in
//! the exposure residual and are not reported here.

use serde_json::json;

use crate::health::model::{
    AffectedItem, DiagnosticDomain, DiagnosticLevel, Evidence, FixAction, HealthCategory,
    HealthDiagnostic, HealthEntityRef, HealthIssue, Severity,
};

/// One fund position that look-through could not expand.
#[derive(Debug, Clone)]
pub struct UnexpandedFund {
    pub asset_id: String,
    pub name: String,
    pub value: f64,
}

/// Builds one warning per uncovered fund, with fetch and upload actions.
pub fn analyze(funds: &[UnexpandedFund], total_portfolio_value: f64) -> Vec<HealthIssue> {
    let mut issues = Vec::new();
    for fund in funds {
        let asset_id = fund.asset_id.trim();
        if asset_id.is_empty() {
            continue;
        }
        let name = fund.name.trim();
        let name = if name.is_empty() { asset_id } else { name };
        let route = format!("/holdings/{}", urlencoding::encode(asset_id));
        let payload = json!({
            "assetId": asset_id,
            "name": name,
        });
        let mv_pct = if total_portfolio_value > 0.0 && fund.value > 0.0 {
            fund.value / total_portfolio_value
        } else {
            0.0
        };
        let diagnostic = HealthDiagnostic::new(
            "FUND_COMPOSITION_MISSING",
            format!("{name} is not expanded"),
            "This fund is still a single holding. Fetch its published composition or upload the issuer file.",
        )
        .domain(DiagnosticDomain::MarketData)
        .level(DiagnosticLevel::Source)
        .severity(Severity::Warning)
        .entity(
            HealthEntityRef::new("asset", asset_id)
                .label(name)
                .route(route.clone()),
        )
        .evidence(
            Evidence::new("Fund", name).with_route(route.clone()),
        )
        .fix(
            true,
            FixAction {
                id: "refresh_fund_composition".to_string(),
                label: "Fetch composition".to_string(),
                payload: payload.clone(),
            },
        )
        .fix(
            false,
            FixAction {
                id: "upload_fund_composition".to_string(),
                label: "Upload composition".to_string(),
                payload,
            },
        );

        issues.push(
            HealthIssue::builder()
                .id("fund_composition_missing")
                .severity(Severity::Warning)
                .category(HealthCategory::DataConsistency)
                .code("fund_composition_missing")
                .param("name", name)
                .title(format!("{name} is not expanded"))
                .message(
                    "This fund is still a single holding. Fetch its published composition or upload the issuer file.",
                )
                .affected_count(1)
                .affected_mv_pct(mv_pct)
                .affected_items(vec![AffectedItem {
                    id: asset_id.to_string(),
                    name: name.to_string(),
                    symbol: None,
                    route: Some(route),
                }])
                .diagnostics(vec![diagnostic])
                .build(),
        );
    }
    issues
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::health::model::ActionRef;

    fn action_ids(issue: &HealthIssue) -> Vec<(&str, bool)> {
        issue
            .diagnostics
            .as_ref()
            .expect("diagnostic")
            .iter()
            .flat_map(|diagnostic| diagnostic.actions.iter())
            .map(|entry| match &entry.action {
                ActionRef::Fix { action } => (action.id.as_str(), entry.primary),
                ActionRef::Navigate { .. } => ("", false),
            })
            .collect()
    }

    #[test]
    fn uncovered_fund_offers_fetch_and_upload() {
        let issues = analyze(
            &[UnexpandedFund {
                asset_id: "fund-1".to_string(),
                name: "HDFC Flexi Cap".to_string(),
                value: 250.0,
            }],
            1000.0,
        );

        assert_eq!(issues.len(), 1);
        let issue = &issues[0];
        assert_eq!(issue.severity, Severity::Warning);
        assert_eq!(issue.category, HealthCategory::DataConsistency);
        assert_eq!(issue.code.as_deref(), Some("fund_composition_missing"));
        assert_eq!(issue.params["name"], "HDFC Flexi Cap");
        assert!((issue.affected_mv_pct.unwrap_or(0.0) - 0.25).abs() < f64::EPSILON);
        assert!(
            issue.fix_action.is_none()
                || issue.fix_action.as_ref().unwrap().id == "refresh_fund_composition"
        );
        assert_eq!(
            action_ids(issue),
            vec![
                ("refresh_fund_composition", true),
                ("upload_fund_composition", false)
            ]
        );
        let payload = match &issue.diagnostics.as_ref().unwrap()[0].actions[1].action {
            ActionRef::Fix { action } => &action.payload,
            ActionRef::Navigate { .. } => panic!("upload is a fix"),
        };
        assert_eq!(payload["assetId"], "fund-1");
        assert_eq!(payload["name"], "HDFC Flexi Cap");
    }

    #[test]
    fn each_fund_is_its_own_issue() {
        let issues = analyze(
            &[
                UnexpandedFund {
                    asset_id: "fund-1".to_string(),
                    name: "One".to_string(),
                    value: 10.0,
                },
                UnexpandedFund {
                    asset_id: "fund-2".to_string(),
                    name: "Two".to_string(),
                    value: 20.0,
                },
            ],
            100.0,
        );
        assert_eq!(issues.len(), 2);
        assert_ne!(issues[0].id, issues[1].id);
    }
}
