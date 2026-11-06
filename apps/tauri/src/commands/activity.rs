use crate::profiles::ProfileAccess;
use std::collections::HashMap;

use log::debug;
use wealthfolio_core::activities::{
    Activity, ActivityBulkMutationRequest, ActivityBulkMutationResult, ActivityImport,
    ActivitySearchResponse, ActivityServiceTrait, ActivityUpdate, ImportActivitiesResult,
    ImportAssetCandidate, ImportAssetPreviewItem, ImportMappingData, ImportTemplateData,
    InternalTransferPairRequest, InternalTransferPairResponse, NewActivity, ParseConfig,
    ParsedCsvResult, Sort, TransferMatchCandidate, TransferMatchCandidateRequest,
};
use wealthfolio_core::health::HealthServiceTrait;
use wealthfolio_core::utils::time_utils::{
    local_date_range_utc_bounds, parse_user_timezone_or_default,
};

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn search_activities(
    page: i64,                                 // Page number, 0-based
    page_size: i64,                            // Number of items per page
    account_id_filter: Option<Vec<String>>,    // Optional account_id filter
    activity_type_filter: Option<Vec<String>>, // Optional activity_type filter
    asset_id_keyword: Option<String>,          // Optional asset_id keyword for search
    sort: Option<Sort>,
    needs_review_filter: Option<bool>, // Optional needs_review filter for pending review
    date_from: Option<String>,         // Optional start date filter (YYYY-MM-DD, inclusive)
    date_to: Option<String>,           // Optional end date filter (YYYY-MM-DD, inclusive)
    instrument_type_filter: Option<Vec<String>>, // Optional instrument_type filter
    activity_id_filter: Option<Vec<String>>, // Optional exact activity-id filter
    include_cash_balances: Option<bool>, // Cash balance after each row, for one cash account
    state: ProfileAccess,
) -> Result<ActivitySearchResponse, String> {
    let context = state.context()?;
    debug!("Search activities... {}, {}", page, page_size);

    // Parse date strings to NaiveDate
    let date_from_parsed = date_from
        .map(|s| chrono::NaiveDate::parse_from_str(&s, "%Y-%m-%d"))
        .transpose()
        .map_err(|e| format!("Invalid date_from format: {}", e))?;
    let date_to_parsed = date_to
        .map(|s| chrono::NaiveDate::parse_from_str(&s, "%Y-%m-%d"))
        .transpose()
        .map_err(|e| format!("Invalid date_to format: {}", e))?;
    let timezone = context.get_timezone();
    let tz = parse_user_timezone_or_default(&timezone);
    let (date_from_utc, date_to_utc_exclusive) =
        local_date_range_utc_bounds(date_from_parsed, date_to_parsed, tz)
            .map_err(|e| e.to_string())?;

    let activity_service = context.activity_service();
    let mut response = activity_service.search_activities_in_utc_range(
        page,
        page_size,
        account_id_filter,
        activity_type_filter,
        asset_id_keyword,
        sort,
        needs_review_filter,
        date_from_utc,
        date_to_utc_exclusive,
        instrument_type_filter,
        activity_id_filter,
    )?;
    if include_cash_balances.unwrap_or(false) {
        activity_service.attach_cash_balances(&mut response).await?;
    }
    Ok(response)
}

#[tauri::command]
pub async fn create_activity(
    activity: NewActivity,
    state: ProfileAccess,
) -> Result<Activity, String> {
    let context = state.context()?;
    debug!("Creating activity...");
    // Domain events handle recalculation and asset enrichment automatically
    let created = context
        .activity_service()
        .create_activity(activity)
        .await
        .map_err(|e| e.to_string())?;
    context.health_service().clear_cache().await;
    Ok(created)
}

#[tauri::command]
pub async fn update_activity(
    activity: ActivityUpdate,
    state: ProfileAccess,
) -> Result<Activity, String> {
    let context = state.context()?;
    debug!("Updating activity...");
    // Domain events handle recalculation and asset enrichment automatically
    let updated = context
        .activity_service()
        .update_activity(activity)
        .await
        .map_err(|e| e.to_string())?;
    context.health_service().clear_cache().await;
    Ok(updated)
}

#[tauri::command]
pub async fn delete_activity(
    activity_id: String,
    state: ProfileAccess,
) -> Result<Activity, String> {
    let context = state.context()?;
    debug!("Deleting activity...");
    // Domain events handle recalculation automatically
    let deleted = context
        .activity_service()
        .delete_activity(activity_id)
        .await
        .map_err(|e| e.to_string())?;
    context.health_service().clear_cache().await;
    Ok(deleted)
}

#[tauri::command]
pub async fn get_transfer_pair_for_activity(
    activity_id: String,
    state: ProfileAccess,
) -> Result<Option<InternalTransferPairResponse>, String> {
    let context = state.context()?;
    debug!("Getting transfer pair...");
    context
        .activity_service()
        .get_transfer_pair_for_activity(activity_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn find_transfer_match_candidates(
    request: TransferMatchCandidateRequest,
    state: ProfileAccess,
) -> Result<Vec<TransferMatchCandidate>, String> {
    let context = state.context()?;
    debug!("Finding transfer match candidates...");
    context
        .activity_service()
        .find_transfer_match_candidates(request)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_internal_transfer_pair(
    request: InternalTransferPairRequest,
    state: ProfileAccess,
) -> Result<InternalTransferPairResponse, String> {
    let context = state.context()?;
    debug!("Saving internal transfer pair...");
    let pair = context
        .activity_service()
        .save_internal_transfer_pair(request)
        .await
        .map_err(|e| e.to_string())?;
    context.health_service().clear_cache().await;
    Ok(pair)
}

#[tauri::command]
pub async fn link_transfer_activities(
    activity_a_id: String,
    activity_b_id: String,
    state: ProfileAccess,
) -> Result<(Activity, Activity), String> {
    let context = state.context()?;
    debug!("Linking transfer activities...");
    // Domain events handle recalculation automatically
    let pair = context
        .activity_service()
        .link_transfer_activities(activity_a_id, activity_b_id)
        .await
        .map_err(|e| e.to_string())?;
    context.health_service().clear_cache().await;
    Ok(pair)
}

#[tauri::command]
pub async fn unlink_transfer_activities(
    activity_a_id: String,
    activity_b_id: String,
    state: ProfileAccess,
) -> Result<(Activity, Activity), String> {
    let context = state.context()?;
    debug!("Unlinking transfer activities...");
    // Domain events handle recalculation automatically
    let pair = context
        .activity_service()
        .unlink_transfer_activities(activity_a_id, activity_b_id)
        .await
        .map_err(|e| e.to_string())?;
    context.health_service().clear_cache().await;
    Ok(pair)
}

#[tauri::command]
pub async fn save_activities(
    request: ActivityBulkMutationRequest,
    state: ProfileAccess,
) -> Result<ActivityBulkMutationResult, String> {
    let context = state.context()?;
    let create_count = request.creates.len();
    let update_count = request.updates.len();
    let delete_count = request.delete_ids.len();
    debug!(
        "Bulk activity mutation request: {} creates, {} updates, {} deletes",
        create_count, update_count, delete_count
    );

    // Domain events handle recalculation and asset enrichment automatically
    let result = context
        .activity_service()
        .bulk_mutate_activities(request)
        .await
        .map_err(|e| e.to_string())?;
    context.health_service().clear_cache().await;
    Ok(result)
}

#[tauri::command]
pub async fn get_account_import_mapping(
    account_id: String,
    context_kind: String,
    state: ProfileAccess,
) -> Result<ImportMappingData, String> {
    let context = state.context()?;
    debug!("Getting import mapping for account: {}", account_id);
    Ok(context
        .activity_service()
        .get_import_mapping(account_id, context_kind)?)
}

#[tauri::command]
pub async fn save_account_import_mapping(
    mapping: ImportMappingData,
    state: ProfileAccess,
) -> Result<ImportMappingData, String> {
    let context = state.context()?;
    debug!("Saving import mapping for account: {}", mapping.account_id);
    context
        .activity_service()
        .save_import_mapping(mapping)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn link_account_template(
    account_id: String,
    template_id: String,
    context_kind: String,
    state: ProfileAccess,
) -> Result<(), String> {
    let context = state.context()?;
    debug!("Linking account {} to template {}", account_id, template_id);
    context
        .activity_service()
        .link_account_template(account_id, template_id, context_kind)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_import_templates(
    state: ProfileAccess,
) -> Result<Vec<ImportTemplateData>, String> {
    let context = state.context()?;
    Ok(context.activity_service().list_import_templates()?)
}

#[tauri::command]
pub async fn get_import_template(
    id: String,
    state: ProfileAccess,
) -> Result<ImportTemplateData, String> {
    let context = state.context()?;
    Ok(context.activity_service().get_import_template(id)?)
}

#[tauri::command]
pub async fn save_import_template(
    template: ImportTemplateData,
    state: ProfileAccess,
) -> Result<ImportTemplateData, String> {
    let context = state.context()?;
    context
        .activity_service()
        .save_import_template(template)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_import_template(id: String, state: ProfileAccess) -> Result<(), String> {
    let context = state.context()?;
    context
        .activity_service()
        .delete_import_template(id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn check_activities_import(
    activities: Vec<ActivityImport>,
    state: ProfileAccess,
) -> Result<Vec<ActivityImport>, String> {
    let context = state.context()?;
    debug!("Checking activities import for {} rows", activities.len());
    let result = context
        .activity_service()
        .check_activities_import(activities)
        .await?;
    Ok(result)
}

#[tauri::command]
pub async fn preview_import_assets(
    candidates: Vec<ImportAssetCandidate>,
    state: ProfileAccess,
) -> Result<Vec<ImportAssetPreviewItem>, String> {
    let context = state.context()?;
    let result = context
        .activity_service()
        .preview_import_assets(candidates)
        .await?;
    Ok(result)
}

#[tauri::command]
pub async fn import_activities(
    activities: Vec<ActivityImport>,
    file_name: Option<String>,
    state: ProfileAccess,
) -> Result<ImportActivitiesResult, String> {
    let context = state.context()?;
    debug!("Importing {} activities", activities.len());
    // Domain events handle recalculation and asset enrichment automatically
    let result = context
        .activity_service()
        .import_activities_with_file_name(activities, file_name)
        .await
        .map_err(|e| e.to_string())?;
    context.health_service().clear_cache().await;
    Ok(result)
}

#[tauri::command]
pub async fn undo_activity_import(
    import_run_id: String,
    state: ProfileAccess,
) -> Result<wealthfolio_core::activities::UndoActivityImportResult, String> {
    let context = state.context()?;
    debug!("Undoing activity import {}", import_run_id);
    let result = context
        .activity_service()
        .undo_activity_import(import_run_id)
        .await
        .map_err(|e| e.to_string())?;
    context.health_service().clear_cache().await;
    Ok(result)
}

#[tauri::command]
pub async fn check_existing_duplicates(
    idempotency_keys: Vec<String>,
    state: ProfileAccess,
) -> Result<HashMap<String, String>, String> {
    let context = state.context()?;
    debug!(
        "Checking for existing duplicates with {} idempotency keys",
        idempotency_keys.len()
    );
    context
        .activity_service()
        .check_existing_duplicates(idempotency_keys)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn parse_csv(
    content: Vec<u8>,
    config: ParseConfig,
    state: ProfileAccess,
) -> Result<ParsedCsvResult, String> {
    let context = state.context()?;
    debug!(
        "Parsing CSV with {} bytes, config: {:?}",
        content.len(),
        config
    );
    context
        .activity_service()
        .parse_csv(&content, &config)
        .map_err(|e| {
            debug!("CSV parse error: {}", e);
            e.to_string()
        })
}

#[tauri::command]
pub async fn parse_cas(
    content: String,
    password: String,
    state: ProfileAccess,
) -> Result<wealthfolio_core::activities::cas_import::CasImportPreview, String> {
    let _context = state.context()?;
    wealthfolio_core::activities::cas_import::parse_cas(
        wealthfolio_core::activities::cas_import::CasImportRequest { content, password },
    )
    .await
}

#[tauri::command]
pub async fn get_investment_plans(
    state: ProfileAccess,
) -> Result<Vec<wealthfolio_core::investment_plans::InvestmentPlan>, String> {
    let ctx = state.context()?;
    wealthfolio_core::investment_plans::list(ctx.settings_service().as_ref())
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub async fn save_investment_plans(
    plans: Vec<wealthfolio_core::investment_plans::InvestmentPlan>,
    state: ProfileAccess,
) -> Result<Vec<wealthfolio_core::investment_plans::InvestmentPlan>, String> {
    let ctx = state.context()?;
    wealthfolio_core::investment_plans::save(
        ctx.settings_service().as_ref(),
        ctx.account_service().as_ref(),
        ctx.asset_service().as_ref(),
        &plans,
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(plans)
}

#[tauri::command]
pub async fn preview_broker(
    provider: wealthfolio_core::activities::broker_import::Broker,
    api_key: String,
    access_token: String,
    state: ProfileAccess,
) -> Result<wealthfolio_core::activities::broker_import::BrokerPreview, String> {
    let _context = state.context()?;
    wealthfolio_core::activities::broker_import::preview_broker(
        wealthfolio_core::activities::broker_import::BrokerRequest {
            provider,
            api_key,
            access_token,
        },
    )
    .await
}

#[tauri::command]
pub async fn get_fund_exposure(
    currency: String,
    filter: wealthfolio_core::portfolios::AccountScope,
    state: ProfileAccess,
) -> Result<wealthfolio_core::fund_exposure::ExposureView, String> {
    let ctx = state.context()?;
    wealthfolio_core::fund_exposure::read(
        ctx.settings_service().as_ref(),
        ctx.account_service().as_ref(),
        ctx.asset_service().as_ref(),
        ctx.holdings_service().as_ref(),
        &currency,
        Some(
            &ctx.portfolio_service()
                .resolve_account_scope(&filter, &currency)
                .map_err(|e| e.to_string())?
                .account_ids,
        ),
    )
    .await
    .map_err(|e| e.to_string())
}
#[tauri::command]
pub async fn save_fund_composition(
    mut snapshot: wealthfolio_core::fund_exposure::FundComposition,
    state: ProfileAccess,
) -> Result<wealthfolio_core::fund_exposure::FundComposition, String> {
    let ctx = state.context()?;
    snapshot.imported = true;
    let saved = wealthfolio_core::fund_exposure::save(
        ctx.settings_service().as_ref(),
        ctx.asset_service().as_ref(),
        snapshot,
    )
    .await
    .map_err(|e| e.to_string())?;
    wealthfolio_core::fund_exposure::sync_sector_classification(ctx.taxonomy_service(), &saved)
        .await;
    Ok(saved)
}
#[tauri::command]
pub async fn refresh_fund_composition(
    asset_id: String,
    state: ProfileAccess,
) -> Result<wealthfolio_core::fund_exposure::FundComposition, String> {
    let ctx = state.context()?;
    let saved = wealthfolio_core::fund_exposure::refresh(
        ctx.settings_service().as_ref(),
        ctx.asset_service().as_ref(),
        ctx.quote_service().as_ref(),
        ctx.secret_store.as_ref(),
        &asset_id,
    )
    .await
    .map_err(|e| e.to_string())?;
    wealthfolio_core::fund_exposure::sync_sector_classification(ctx.taxonomy_service(), &saved)
        .await;
    Ok(saved)
}
#[tauri::command]
pub async fn remove_fund_composition(asset_id: String, state: ProfileAccess) -> Result<(), String> {
    let ctx = state.context()?;
    let had_imported_sectors =
        wealthfolio_core::fund_exposure::list(ctx.settings_service().as_ref())
            .map_err(|e| e.to_string())?
            .iter()
            .find(|snapshot| snapshot.asset_id == asset_id)
            .is_some_and(|snapshot| snapshot.constituents.iter().any(|row| row.sector.is_some()));
    wealthfolio_core::fund_exposure::remove(ctx.settings_service().as_ref(), &asset_id)
        .await
        .map_err(|e| e.to_string())?;
    if had_imported_sectors {
        wealthfolio_core::fund_exposure::clear_sector_classification(
            ctx.taxonomy_service(),
            &asset_id,
        )
        .await;
    }
    Ok(())
}

#[tauri::command]
pub async fn preview_fund_composition(
    asset_id: String,
    source: String,
    as_of: chrono::NaiveDate,
    csv_text: String,
) -> Result<wealthfolio_core::fund_exposure::FundComposition, String> {
    wealthfolio_core::fund_exposure::preview_csv(asset_id, source, as_of, &csv_text)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn broker_connection(
    request: wealthfolio_core::broker_connections::Request,
    state: ProfileAccess,
) -> Result<wealthfolio_core::broker_connections::Response, String> {
    let ctx = state.context()?;
    wealthfolio_core::broker_connections::execute(
        ctx.account_service().as_ref(),
        state.secret_store.as_ref(),
        request,
    )
    .await
}
