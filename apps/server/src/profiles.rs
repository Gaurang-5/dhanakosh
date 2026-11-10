//! Instance authentication owns browser grants; each financial request receives
//! a fixed AppState through extensions. Browser locks do not stop server workers.
use crate::{
    auth::BackupSession,
    config::Config,
    main_lib::{build_profile_state, AppState},
};
use anyhow::Context;
use axum::{
    body::Body,
    extract::{Path, State},
    http::{Request, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    routing::{get, post},
    Extension, Json, Router,
};
use futures::StreamExt;
use serde_json::{json, Value};
use std::{
    collections::{BTreeMap, HashMap},
    sync::Arc,
};
use tokio::sync::Mutex;
use uuid::Uuid;
use wealthfolio_core::accounts::AccountServiceTrait;
use wealthfolio_core::profiles::{ProfileRegistry, ProfileSession, PROFILE_SCOPE_HEADER};

type Result<T> = std::result::Result<T, (StatusCode, String)>;
fn failure(error: impl ToString) -> (StatusCode, String) {
    (StatusCode::LOCKED, error.to_string())
}

/// Runtime failures are not revoked grants. Keep details in the authenticated
/// response: arbitrary service errors can contain financial data or credentials.
fn startup_failure(stage: &'static str, error: anyhow::Error) -> (StatusCode, String) {
    let (kind, io_kind, os_code) = crate::error::safe_error_diagnostic(error.as_ref());
    tracing::error!(
        code = "PROFILE_STARTUP_FAILED",
        stage,
        kind,
        ?io_kind,
        ?os_code,
        "Profile startup failed"
    );
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        format!("PROFILE_STARTUP_FAILED: {error:#}"),
    )
}

/// Original browser grant, retained so a waiting login can revalidate before mutation.
#[derive(Clone)]
pub(crate) struct ProfileAccess {
    pub owner: String,
    pub session: ProfileSession,
}

pub(crate) fn connect_guard(
    state: &AppState,
) -> std::result::Result<tokio::sync::OwnedRwLockReadGuard<()>, String> {
    state
        .connect_transition
        .clone()
        .try_read_owned()
        .map_err(|_| "Connect account change is in progress. Try again.".to_string())
}

/// Applied by Connect/device-sync routers, after universal profile admission.
pub async fn admit_connect(
    Extension(state): Extension<Arc<AppState>>,
    request: Request<Body>,
    next: Next,
) -> Result<Response> {
    let _guard = connect_guard(&state).map_err(|error| (StatusCode::SERVICE_UNAVAILABLE, error))?;
    Ok(next.run(request).await)
}

pub struct WebProfiles {
    pub registry: Arc<ProfileRegistry>,
    config: Config,
    deletion: Mutex<()>,
    auth: Option<Arc<crate::auth::AuthManager>>,
    pub(crate) oidc: Option<Arc<crate::oidc::OidcManager>>,
    runtimes: Mutex<HashMap<Uuid, Arc<AppState>>>,
    // Keep slow startup serialized without blocking cached runtime lookups.
    initialization: Mutex<()>,
    mcp: Mutex<HashMap<Uuid, Router>>,
    visited: std::sync::Mutex<std::collections::HashSet<String>>,
}
impl WebProfiles {
    pub async fn open(config: &Config) -> anyhow::Result<Arc<Self>> {
        let db = std::path::PathBuf::from(&config.db_path);
        let directory = db
            .parent()
            .filter(|p| !p.as_os_str().is_empty())
            .unwrap_or_else(|| std::path::Path::new("."));
        let store = crate::secrets::build_secret_store(
            std::env::var("WF_SECRET_FILE")
                .map(std::path::PathBuf::from)
                .unwrap_or_else(|_| directory.join("secrets.json")),
            Some(config.secrets_encryption_key),
            Some(&config.raw_secret_key),
        )
        .map_err(anyhow::Error::new)?;
        if !db.exists()
            && !directory.join("profiles.json").exists()
            && !directory.join("profiles.json.bak").exists()
        {
            use wealthfolio_core::secrets::SecretStore;
            let has_credentials = [
                wealthfolio_core::secrets::CLOUD_REFRESH_TOKEN_KEY,
                wealthfolio_core::secrets::SYNC_IDENTITY_KEY,
            ]
            .iter()
            .try_fold(false, |found, key| {
                store.get_secret(key).map(|value| found || value.is_some())
            })?;
            anyhow::ensure!(!has_credentials, "The default database is missing. Restore its file before starting; existing credentials were preserved.");
        }
        let registry_directory = std::path::absolute(directory)?;
        let registry = Arc::new(
            ProfileRegistry::open(directory.to_path_buf(), db, Arc::new(store)).with_context(
                || {
                    format!(
                    "Cannot open the profile registry in {} (profiles.json and profiles.json.bak). \
                     Stop the service and automatic restarts. Check the data mount, permissions, \
                     and whether another instance is running. If registry files are missing or \
                     damaged, preserve the complete data directory before restoring a matching \
                     registry backup. Do not delete profile directories or credentials. \
                     Recovery guide: docs/self-host/backups.md#profile-registry-startup-failures",
                    registry_directory.display()
                )
                },
            )?,
        );
        registry.set_legacy_addons_root(std::path::PathBuf::from(&config.addons_root))?;
        for id in registry.pending_deletions()? {
            if let Err(error) = registry.finish_delete(id) {
                let (kind, io_kind, os_code) = crate::error::safe_error_diagnostic(&error);
                tracing::warn!(%id, kind, ?io_kind, ?os_code, "Profile deletion cleanup needs a retry");
            }
        }
        let auth = crate::auth::AuthState::from_config(config).await?;
        Ok(Arc::new(Self {
            registry,
            config: config.clone(),
            auth: auth.auth,
            oidc: auth.oidc,
            deletion: Mutex::new(()),
            runtimes: Mutex::new(HashMap::new()),
            initialization: Mutex::new(()),
            mcp: Mutex::new(HashMap::new()),
            visited: std::sync::Mutex::new(Default::default()),
        }))
    }

    async fn delete(
        self: &Arc<Self>,
        owner: String,
        selected: Option<Uuid>,
        id: Uuid,
        confirmation: String,
        proof: Option<String>,
    ) -> Result<()> {
        let _deletion = self.deletion.lock().await;
        if !self.registry.is_deleting(id) {
            let session = self
                .registry
                .sessions
                .admit(&owner, selected.ok_or_else(|| failure("PROFILE_LOCKED"))?)
                .map_err(failure)?;
            if session.profile_id != id {
                return Err(failure("PROFILE_STALE"));
            }
            let registry = self.registry.clone();
            tokio::task::spawn_blocking(move || {
                registry.begin_delete(id, &confirmation, proof.as_deref())
            })
            .await
            .map_err(failure)?
            .map_err(failure)?;
        }
        self.visited.lock().map_err(failure)?.insert(owner);
        self.mcp.lock().await.remove(&id);
        let runtime = {
            let _initialization = self.initialization.lock().await;
            self.runtimes.lock().await.remove(&id)
        };
        if let Some(runtime) = runtime {
            runtime.backup_scheduler.set_paused(true);
            let _lifecycle = runtime.profile_lifecycle.lock().await;
            let workers = std::mem::take(&mut *runtime.workers.lock().map_err(failure)?);
            for worker in workers {
                worker.abort();
                let _ = worker.await;
            }
            runtime.device_sync_runtime.clear_restore().await;
            runtime
                .device_sync_runtime
                .ensure_background_stopped()
                .await;
            runtime.writer.shutdown().await;
            if let Some(task) = runtime.writer_task.lock().await.take() {
                task.join().await;
            }
            let mcp_sessions = runtime.mcp_sessions.clone();
            close_mcp_sessions(&mcp_sessions).await?;
            let owner = Arc::downgrade(&runtime._database_owner);
            drop(_lifecycle);
            drop(runtime);
            let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(10);
            while owner.strong_count() > 0 {
                // An HTTP initialize already in flight may finish after the first close.
                close_mcp_sessions(&mcp_sessions).await?;
                if tokio::time::Instant::now() >= deadline {
                    return Err(failure("Profile deletion is pending. Background work is finishing; retry deletion or restart the server."));
                }
                tokio::time::sleep(std::time::Duration::from_millis(50)).await;
            }
        }
        let registry = self.registry.clone();
        tokio::task::spawn_blocking(move || {
            let paths = registry.deletion_paths(id).map_err(failure)?;
            if paths.database.exists() {
                // Also check retries: an earlier timed-out runtime may still own it.
                let owner = wealthfolio_storage_sqlite::db::DatabaseOwner::acquire(
                    paths.database.to_string_lossy().as_ref(),
                )
                .map_err(failure)?;
                drop(owner);
            }
            registry.finish_delete(id).map_err(failure)
        })
        .await
        .map_err(failure)?
    }

    pub fn new(default: Arc<AppState>, config: &Config) -> anyhow::Result<Arc<Self>> {
        let db = std::path::PathBuf::from(&config.db_path);
        let root = db
            .parent()
            .filter(|p| !p.as_os_str().is_empty())
            .unwrap_or_else(|| std::path::Path::new("."))
            .to_path_buf();
        let registry = Arc::new(ProfileRegistry::open(
            root,
            db,
            default.secret_store.clone(),
        )?);
        let default_id = registry.default_id()?;
        let auth = default.auth.clone();
        let oidc = default.oidc.clone();
        let _ = default.profile_binding.set((registry.clone(), default_id));
        crate::scheduler::start_background_workers(default.clone());
        let mut runtimes = HashMap::new();
        runtimes.insert(default_id, default);
        Ok(Arc::new(Self {
            registry,
            auth,
            oidc,
            config: config.clone(),
            deletion: Mutex::new(()),
            runtimes: Mutex::new(runtimes),
            initialization: Mutex::new(()),
            mcp: Mutex::new(HashMap::new()),
            visited: std::sync::Mutex::new(Default::default()),
        }))
    }
    fn auto_open(&self, owner: &str) -> Result<Option<wealthfolio_core::profiles::ProfileSession>> {
        let revision = self
            .registry
            .sessions
            .unlock_revision(owner)
            .map_err(failure)?;
        let profiles = self.registry.list().map_err(failure)?;
        if profiles.len() != 1
            || profiles[0].lock_enabled
            || !self.visited.lock().map_err(failure)?.insert(owner.into())
        {
            return Ok(None);
        }
        let protected = self
            .registry
            .verify(profiles[0].id, None)
            .map_err(failure)?;
        self.registry
            .sessions
            .issue_if_current(owner, revision, profiles[0].id, protected)
            .map(Some)
            .map_err(failure)
    }

    pub(crate) fn auth_state(&self) -> crate::auth::AuthState {
        crate::auth::AuthState {
            auth: self.auth.clone(),
            oidc: self.oidc.clone(),
        }
    }

    pub async fn runtime(&self, id: Uuid) -> Result<Arc<AppState>> {
        {
            let runtimes = self.runtimes.lock().await;
            self.registry.profile(id).map_err(failure)?;
            if let Some(runtime) = runtimes.get(&id) {
                return Ok(runtime.clone());
            }
        }
        let _initialization = self.initialization.lock().await;
        // A waiting open may have been initialized or marked for deletion.
        let profile = self.registry.profile(id).map_err(failure)?;
        if let Some(runtime) = self.runtimes.lock().await.get(&id) {
            return Ok(runtime.clone());
        }
        let paths = self.registry.paths(&profile);
        if profile.legacy_database.is_some() && !paths.database.is_file() {
            return Err(startup_failure("legacy_database", anyhow::anyhow!("The legacy profile database is missing. Restore its file before opening this profile; existing credentials were preserved.")));
        }
        let mut config = self.config.clone();
        config.db_path = paths.database.to_string_lossy().into_owned();
        if profile.legacy_database.is_none() {
            config.addons_root = paths.root.to_string_lossy().into_owned();
            config.database_key =
                crate::auth::derive_profile_database_key(&config.raw_secret_key, id);
        }
        let runtime = build_profile_state(&config, self.registry.secret_store(&profile))
            .await
            .map_err(|error| startup_failure("runtime_initialization", error))?;
        let _ = runtime.profile_binding.set((self.registry.clone(), id));
        self.runtimes.lock().await.insert(id, runtime.clone());
        crate::scheduler::start_background_workers(runtime.clone());
        Ok(runtime)
    }
    pub fn start_connected_profiles(self: &Arc<Self>) {
        let root = self.clone();
        tokio::spawn(async move {
            if let Ok(profiles) = root.registry.list() {
                for profile in profiles {
                    if crate::local_maintenance::enabled() && !profile.lock_enabled {
                        if root.runtime(profile.id).await.is_err() {
                            tracing::warn!("Local backup startup could not open a member database");
                        }
                        continue;
                    }
                    if root
                        .registry
                        .profile(profile.id)
                        .ok()
                        .and_then(|p| {
                            root.registry
                                .secret_store(&p)
                                .get_secret(wealthfolio_core::secrets::CLOUD_REFRESH_TOKEN_KEY)
                                .ok()
                                .flatten()
                        })
                        .is_some()
                    {
                        if let Err((status, _)) = root.runtime(profile.id).await {
                            tracing::warn!(%status, "Profile sync startup deferred");
                        }
                    }
                }
            }
        });
    }
}

async fn close_mcp_sessions(
    manager: &rmcp::transport::streamable_http_server::session::local::LocalSessionManager,
) -> Result<()> {
    use rmcp::transport::streamable_http_server::session::SessionManager;
    let sessions: Vec<_> = manager.sessions.read().await.keys().cloned().collect();
    for id in sessions {
        manager.close_session(&id).await.map_err(failure)?;
    }
    Ok(())
}

pub fn router<S: Clone + Send + Sync + 'static>(root: Arc<WebProfiles>) -> Router<S> {
    Router::new()
        .route("/profiles/household-summary", get(household_summary))
        .route("/profiles/household-history", get(household_history))
        .route("/profiles/household-activities", get(household_activities))
        .route("/profiles/household-goals", get(household_goals))
        .route(
            "/profiles/household-investment-plans",
            get(household_investment_plans),
        )
        .route("/profiles/household-exposure", get(household_exposure))
        .route("/profiles/household-overview", get(household_overview))
        .route("/profiles/household-income", get(household_income))
        .route(
            "/profiles/household-performance",
            post(household_performance),
        )
        .route(
            "/profiles/household-activity-search",
            post(household_activity_search),
        )
        .route("/profiles/{command}", post(command))
        .with_state(root)
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct HouseholdOverviewQuery {
    member_ids: String,
    currency: String,
    taxonomy_id: Option<String>,
    category_id: Option<String>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct HouseholdPerformanceQuery {
    member_ids: Vec<Uuid>,
    currency: String,
    account_ids: Option<Vec<String>>,
    start_date: Option<chrono::NaiveDate>,
    end_date: Option<chrono::NaiveDate>,
}

async fn household_performance(
    State(root): State<Arc<WebProfiles>>,
    Json(query): Json<HouseholdPerformanceQuery>,
) -> Result<Json<wealthfolio_core::portfolio::performance::PerformanceResult>> {
    use wealthfolio_core::{
        accounts::{account_supports_portfolio_scope, AccountPurpose},
        portfolio::performance::{combined::measure_combined, empty_performance_metrics},
    };
    let profiles = root.registry.list().map_err(failure)?;
    if query.member_ids.is_empty()
        || query
            .member_ids
            .iter()
            .any(|id| !profiles.iter().any(|p| p.id == *id && !p.lock_enabled))
        || query
            .start_date
            .zip(query.end_date)
            .is_some_and(|(a, b)| a > b)
    {
        return Err((
            StatusCode::BAD_REQUEST,
            "Invalid member scope or dates".to_string(),
        ));
    }
    let unavailable = |_| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            "Household performance is unavailable".to_string(),
        )
    };
    let mut members = Vec::new();
    for profile in profiles
        .into_iter()
        .filter(|p| query.member_ids.contains(&p.id))
    {
        let runtime = root.runtime(profile.id).await?;
        let currency = runtime
            .base_currency
            .read()
            .unwrap_or_else(|p| p.into_inner())
            .clone();
        if currency != query.currency {
            return Err((
                StatusCode::BAD_REQUEST,
                "Members must use the same reporting currency".to_string(),
            ));
        }
        let prefix = format!("{}::", profile.id);
        let accounts = runtime
            .account_service
            .get_all_accounts()
            .map_err(unavailable)?
            .into_iter()
            .filter(|a| account_supports_portfolio_scope(a, AccountPurpose::Performance))
            .filter(|a| {
                query
                    .account_ids
                    .as_ref()
                    .is_none_or(|ids| ids.contains(&format!("{prefix}{}", a.id)))
            })
            .map(|a| a.id)
            .collect::<Vec<_>>();
        if accounts.is_empty() {
            continue;
        }
        let prepared = runtime
            .performance_service
            .prepare_combined_inputs(&accounts)
            .await
            .map_err(unavailable)?;
        members.push((profile.id.to_string(), prepared, accounts));
    }
    if members.is_empty() {
        return Ok(Json(empty_performance_metrics(
            "portfolio:all",
            query.currency,
            query.start_date,
            query.end_date,
        )));
    }
    Ok(Json(
        measure_combined(members, query.currency, query.start_date, query.end_date)
            .await
            .map_err(unavailable)?,
    ))
}

async fn household_income(
    State(root): State<Arc<WebProfiles>>,
    axum::extract::Query(query): axum::extract::Query<HouseholdOverviewQuery>,
) -> Result<Json<Vec<Value>>> {
    use wealthfolio_core::accounts::{account_supports_portfolio_scope, AccountPurpose};
    let ids = query
        .member_ids
        .split(',')
        .map(Uuid::parse_str)
        .collect::<std::result::Result<std::collections::HashSet<_>, _>>()
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid member IDs".to_string()))?;
    let profiles = root.registry.list().map_err(failure)?;
    if ids
        .iter()
        .any(|id| !profiles.iter().any(|p| p.id == *id && !p.lock_enabled))
    {
        return Err((StatusCode::BAD_REQUEST, "Member is unavailable".to_string()));
    }
    let mut reports = Vec::new();
    for profile in profiles.into_iter().filter(|p| ids.contains(&p.id)) {
        let runtime = root.runtime(profile.id).await?;
        let currency = runtime
            .base_currency
            .read()
            .unwrap_or_else(|p| p.into_inner())
            .clone();
        if currency != query.currency {
            return Err((
                StatusCode::BAD_REQUEST,
                "Members must use the same reporting currency for combined income".to_string(),
            ));
        }
        let unavailable = |_| {
            (
                StatusCode::SERVICE_UNAVAILABLE,
                "Household income is unavailable".to_string(),
            )
        };
        let accounts = runtime
            .account_service
            .get_all_accounts()
            .map_err(unavailable)?;
        let account_ids = accounts
            .into_iter()
            .filter(|a| account_supports_portfolio_scope(a, AccountPurpose::Income))
            .map(|a| a.id)
            .collect::<Vec<_>>();
        if account_ids.is_empty() {
            continue;
        }
        let income = runtime
            .income_service
            .get_income_summary(Some(&account_ids))
            .map_err(unavailable)?;
        let first_activity = runtime
            .activity_service
            .get_first_activity_date(Some(&account_ids))
            .map_err(unavailable)?;
        let timezone = runtime
            .timezone
            .read()
            .unwrap_or_else(|p| p.into_inner())
            .clone();
        let tz = wealthfolio_core::utils::time_utils::parse_user_timezone_or_default(&timezone);
        let first_activity = first_activity
            .map(|date| wealthfolio_core::utils::time_utils::activity_date_in_tz(date, tz));
        let today = wealthfolio_core::utils::time_utils::user_today(tz);
        reports.push(json!({"memberId": profile.id, "memberName": profile.name, "income": income, "firstActivity": first_activity, "today": today}));
    }
    Ok(Json(reports))
}

// Read-only orchestration over the same core services used by the member overview.
// No profile session is switched and no financial records are copied or persisted.
async fn household_overview(
    State(root): State<Arc<WebProfiles>>,
    axum::extract::Query(query): axum::extract::Query<HouseholdOverviewQuery>,
) -> Result<Json<Vec<Value>>> {
    use wealthfolio_core::{
        accounts::{account_supports_portfolio_scope, AccountPurpose},
        portfolio::{holdings::HoldingListItem, valuation::CurrentAccountValuationService},
        utils::time_utils::{parse_user_timezone_or_default, user_today},
    };
    let ids = query
        .member_ids
        .split(',')
        .map(Uuid::parse_str)
        .collect::<std::result::Result<std::collections::HashSet<_>, _>>()
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid member IDs".to_string()))?;
    if query.currency.len() != 3 || !query.currency.bytes().all(|b| b.is_ascii_uppercase()) {
        return Err((StatusCode::BAD_REQUEST, "Invalid currency".to_string()));
    }
    let profiles = root.registry.list().map_err(failure)?;
    if ids
        .iter()
        .any(|id| !profiles.iter().any(|p| p.id == *id && !p.lock_enabled))
    {
        return Err((StatusCode::BAD_REQUEST, "Member is unavailable".to_string()));
    }
    let unavailable = |_| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            "Household overview is unavailable".to_string(),
        )
    };
    let mut reports = Vec::new();
    for profile in profiles.into_iter().filter(|p| ids.contains(&p.id)) {
        let runtime = root.runtime(profile.id).await?;
        let accounts = runtime
            .account_service
            .get_all_accounts()
            .map_err(unavailable)?
            .into_iter()
            .filter(|a| account_supports_portfolio_scope(a, AccountPurpose::Holdings))
            .collect::<Vec<_>>();
        let account_ids = accounts.iter().map(|a| a.id.clone()).collect::<Vec<_>>();
        if let (Some(taxonomy), Some(category)) = (&query.taxonomy_id, &query.category_id) {
            let allocation = runtime
                .allocation_service
                .get_holdings_by_allocation_for_accounts(
                    &account_ids,
                    &query.currency,
                    taxonomy,
                    category,
                    "portfolio:all",
                )
                .await
                .map_err(unavailable)?;
            reports.push(json!({"memberId": profile.id, "allocation": allocation}));
            continue;
        }
        let mut holdings = Vec::new();
        for account in &accounts {
            holdings.extend(
                runtime
                    .holdings_service
                    .get_holdings_with_options(&account.id, &query.currency, true)
                    .await
                    .map_err(unavailable)?
                    .into_iter()
                    .map(HoldingListItem::from),
            );
        }
        let allocations = runtime
            .allocation_service
            .get_portfolio_allocations_for_accounts(&account_ids, &query.currency, "portfolio:all")
            .await
            .map_err(unavailable)?;
        let timezone = runtime
            .timezone
            .read()
            .unwrap_or_else(|p| p.into_inner())
            .clone();
        let today = user_today(parse_user_timezone_or_default(&timezone));
        let service = CurrentAccountValuationService::new(
            runtime.account_service.as_ref(),
            runtime.snapshot_service.as_ref(),
            runtime.asset_service.as_ref(),
            runtime.quote_service.as_ref(),
            runtime.fx_service.as_ref(),
        );
        let current = service
            .get_current_valuation_for_scope(
                "portfolio:all",
                &account_ids,
                &query.currency,
                today,
                true,
            )
            .await
            .map_err(unavailable)?;
        let net_worth = runtime
            .net_worth_service
            .get_net_worth(today)
            .await
            .map_err(unavailable)?;
        let Json(alternatives) =
            crate::api::get_alternative_holdings(axum::Extension(runtime.clone()))
                .await
                .map_err(|_| {
                    (
                        StatusCode::SERVICE_UNAVAILABLE,
                        "Household assets unavailable".to_string(),
                    )
                })?;
        reports.push(json!({"memberId": profile.id, "memberName": profile.name, "accounts": accounts, "holdings": holdings, "allocations": allocations, "currentValuation": current, "netWorth": net_worth, "alternativeHoldings": alternatives}));
    }
    Ok(Json(reports))
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct HouseholdActivitySearch {
    member_ids: Vec<Uuid>,
    page: usize,
    page_size: usize,
    #[serde(flatten)]
    filters: serde_json::Map<String, Value>,
}

async fn household_activity_search(
    State(root): State<Arc<WebProfiles>>,
    Json(query): Json<HouseholdActivitySearch>,
) -> Result<Json<Value>> {
    if query.page > 100 || !(1..=100).contains(&query.page_size) || query.member_ids.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "Invalid search scope or page".to_string(),
        ));
    }
    let profiles = root.registry.list().map_err(failure)?;
    if query
        .member_ids
        .iter()
        .any(|id| !profiles.iter().any(|p| p.id == *id && !p.lock_enabled))
    {
        return Err((StatusCode::BAD_REQUEST, "Member is unavailable".to_string()));
    }
    let sort_id = query
        .filters
        .get("sort")
        .and_then(|s| s.get("id"))
        .and_then(Value::as_str)
        .unwrap_or("date");
    if !["date", "activityType", "assetSymbol", "accountName"].contains(&sort_id) {
        return Err((StatusCode::BAD_REQUEST, "Invalid sort".to_string()));
    }
    let desc = query
        .filters
        .get("sort")
        .and_then(|s| s.get("desc"))
        .and_then(Value::as_bool)
        .unwrap_or(true);
    let mut rows = Vec::new();
    let mut total = 0;
    for profile in profiles
        .into_iter()
        .filter(|p| query.member_ids.contains(&p.id))
    {
        let mut body = query.filters.clone();
        let prefix = format!("{}::", profile.id);
        let mut excluded = false;
        for field in ["accountIdFilter", "activityIdFilter"] {
            if let Some(values) = body.get(field).filter(|v| !v.is_null()) {
                let values = values
                    .as_array()
                    .ok_or((StatusCode::BAD_REQUEST, "Invalid filter".to_string()))?;
                let owned = values
                    .iter()
                    .filter_map(|v| v.as_str().and_then(|s| s.strip_prefix(&prefix)))
                    .map(|s| json!(s))
                    .collect::<Vec<_>>();
                if owned.is_empty() {
                    excluded = true;
                }
                body.insert(field.to_string(), json!(owned));
            }
        }
        if excluded {
            continue;
        }
        body.insert("page".to_string(), json!(0));
        body.insert(
            "pageSize".to_string(),
            json!((query.page + 1) * query.page_size),
        );
        let body: crate::api::ActivitySearchBody = serde_json::from_value(Value::Object(body))
            .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid filters".to_string()))?;
        let runtime = root.runtime(profile.id).await?;
        let response = crate::api::search_activities(axum::Extension(runtime), Json(body))
            .await
            .map_err(|_| {
                (
                    StatusCode::BAD_REQUEST,
                    "Unable to search household activities; check filters".to_string(),
                )
            })?
            .0;
        total += response.meta.total_row_count;
        for row in response.data {
            rows.push((profile.id, profile.name.clone(), row));
        }
    }
    rows.sort_by(|a, b| {
        let order = match sort_id {
            "activityType" => a.2.activity_type.cmp(&b.2.activity_type),
            "assetSymbol" => a.2.asset_id.cmp(&b.2.asset_id),
            "accountName" => a.2.account_name.cmp(&b.2.account_name),
            _ => {
                a.2.date
                    .cmp(&b.2.date)
                    .then_with(|| a.2.created_at.cmp(&b.2.created_at))
                    .then_with(|| a.2.id.cmp(&b.2.id))
            }
        }
        .then_with(|| a.0.cmp(&b.0));
        if desc {
            order.reverse()
        } else {
            order
        }
    });
    let data = rows
        .into_iter()
        .skip(query.page * query.page_size)
        .take(query.page_size)
        .map(|(id, name, mut row)| {
            row.id = format!("{id}::{}", row.id);
            row.account_id = format!("{id}::{}", row.account_id);
            row.asset_id = format!("{id}::{}", row.asset_id);
            row.account_name = format!("{name} · {}", row.account_name);
            row
        })
        .collect::<Vec<_>>();
    Ok(Json(
        json!({"data": data, "meta": {"totalRowCount": total}}),
    ))
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct HouseholdSummaryQuery {
    date: String,
    #[serde(default)]
    include_holdings: bool,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct HouseholdMemberSummary {
    id: Uuid,
    name: String,
    avatar_id: String,
    status: &'static str,
    currency: Option<String>,
    assets: Option<rust_decimal::Decimal>,
    liabilities: Option<rust_decimal::Decimal>,
    net_worth: Option<rust_decimal::Decimal>,
    accounts_available: bool,
    accounts: Vec<HouseholdAccountSummary>,
    holdings_available: bool,
    holdings: Vec<HouseholdHoldingSummary>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct HouseholdHoldingSummary {
    id: String,
    asset_id: Option<String>,
    account_id: String,
    account_name: String,
    symbol: Option<String>,
    name: String,
    currency: String,
    quantity: rust_decimal::Decimal,
    market_value: rust_decimal::Decimal,
    market_value_base: rust_decimal::Decimal,
    cost_basis_base: Option<rust_decimal::Decimal>,
    unrealized_gain_base: Option<rust_decimal::Decimal>,
    income_base: Option<rust_decimal::Decimal>,
    instrument_type: Option<String>,
    exchange_mic: Option<String>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct HouseholdAccountSummary {
    id: String,
    name: String,
    account_type: String,
    group: Option<String>,
    currency: String,
    is_active: bool,
    is_archived: bool,
}

#[derive(Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct HouseholdCurrencyTotal {
    assets: rust_decimal::Decimal,
    liabilities: rust_decimal::Decimal,
    net_worth: rust_decimal::Decimal,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct HouseholdSummary {
    date: chrono::NaiveDate,
    members: Vec<HouseholdMemberSummary>,
    totals_by_currency: BTreeMap<String, HouseholdCurrencyTotal>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct HouseholdHistoryQuery {
    start_date: String,
    end_date: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct HouseholdMemberHistory {
    member_id: Uuid,
    currency: String,
    points: Vec<HouseholdHistoryPoint>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct HouseholdHistoryPoint {
    date: chrono::NaiveDate,
    net_worth: rust_decimal::Decimal,
    total_assets: rust_decimal::Decimal,
    total_liabilities: rust_decimal::Decimal,
    portfolio_value: rust_decimal::Decimal,
    net_contribution: rust_decimal::Decimal,
    alternative_assets_value: rust_decimal::Decimal,
    breakdown: BTreeMap<String, rust_decimal::Decimal>,
}

async fn household_history(
    State(root): State<Arc<WebProfiles>>,
    axum::extract::Query(query): axum::extract::Query<HouseholdHistoryQuery>,
) -> Result<Json<Vec<HouseholdMemberHistory>>> {
    let start = chrono::NaiveDate::parse_from_str(&query.start_date, "%Y-%m-%d")
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid start date".to_string()))?;
    let end = chrono::NaiveDate::parse_from_str(&query.end_date, "%Y-%m-%d")
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid end date".to_string()))?;
    if end < start || (end - start).num_days() > 36_600 {
        return Err((StatusCode::BAD_REQUEST, "Invalid date range".to_string()));
    }
    let mut members = Vec::new();
    for profile in root.registry.list().map_err(failure)? {
        if profile.lock_enabled {
            continue;
        }
        let runtime = root.runtime(profile.id).await?;
        match runtime
            .net_worth_service
            .get_net_worth_history(start, end)
            .await
        {
            Ok(history) => members.push(HouseholdMemberHistory {
                member_id: profile.id,
                currency: history
                    .first()
                    .map(|point| point.currency.clone())
                    .unwrap_or_else(|| {
                        runtime
                            .base_currency
                            .read()
                            .unwrap_or_else(|poisoned| poisoned.into_inner())
                            .clone()
                    }),
                points: history
                    .into_iter()
                    .map(|point| HouseholdHistoryPoint {
                        date: point.date,
                        net_worth: point.net_worth,
                        total_assets: point.total_assets,
                        total_liabilities: point.total_liabilities,
                        portfolio_value: point.portfolio_value,
                        net_contribution: point.net_contribution,
                        alternative_assets_value: point.alternative_assets_value,
                        breakdown: point.breakdown,
                    })
                    .collect(),
            }),
            Err(_) => {
                return Err((
                    StatusCode::SERVICE_UNAVAILABLE,
                    "Household history is unavailable".to_string(),
                ))
            }
        }
    }
    Ok(Json(members))
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct HouseholdActivitiesQuery {
    #[serde(default)]
    page: i64,
    #[serde(default = "default_household_page_size")]
    page_size: i64,
    member_ids: Option<String>,
}

fn default_household_page_size() -> i64 {
    30
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct HouseholdActivity {
    id: String,
    member_id: Uuid,
    member_name: String,
    account_name: String,
    asset_name: Option<String>,
    symbol: String,
    activity_type: String,
    date: String,
    quantity: Option<String>,
    amount: Option<String>,
    currency: String,
    #[serde(skip_serializing)]
    created_at: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct HouseholdActivitiesResponse {
    data: Vec<HouseholdActivity>,
    total: i64,
}

async fn household_activities(
    State(root): State<Arc<WebProfiles>>,
    axum::extract::Query(query): axum::extract::Query<HouseholdActivitiesQuery>,
) -> Result<Json<HouseholdActivitiesResponse>> {
    if query.page < 0 || query.page > 100 || query.page_size < 1 || query.page_size > 100 {
        return Err((StatusCode::BAD_REQUEST, "Invalid page".to_string()));
    }
    let fetch_count = (query.page + 1) * query.page_size;
    let selected_ids = query
        .member_ids
        .as_deref()
        .map(|ids| {
            ids.split(',')
                .map(Uuid::parse_str)
                .collect::<std::result::Result<std::collections::HashSet<_>, _>>()
        })
        .transpose()
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid member IDs".to_string()))?;
    let mut rows = Vec::new();
    let mut total = 0;
    for profile in root.registry.list().map_err(failure)? {
        if profile.lock_enabled {
            continue;
        }
        if selected_ids
            .as_ref()
            .is_some_and(|ids| !ids.contains(&profile.id))
        {
            continue;
        }
        let runtime = root.runtime(profile.id).await?;
        let sort = wealthfolio_core::activities::Sort {
            id: "date".to_string(),
            desc: true,
        };
        match runtime.activity_service.search_activities(
            0,
            fetch_count,
            None,
            None,
            None,
            Some(sort),
            None,
            None,
            None,
            None,
            None,
        ) {
            Ok(response) => {
                total += response.meta.total_row_count;
                rows.extend(response.data.into_iter().map(|activity| HouseholdActivity {
                    id: activity.id,
                    member_id: profile.id,
                    member_name: profile.name.clone(),
                    account_name: activity.account_name,
                    asset_name: activity.asset_name,
                    symbol: activity.asset_symbol,
                    activity_type: activity.activity_type,
                    date: activity.date,
                    quantity: activity.quantity,
                    amount: activity.amount,
                    currency: activity.currency,
                    created_at: activity.created_at,
                }));
            }
            Err(_) => {
                return Err((
                    StatusCode::SERVICE_UNAVAILABLE,
                    "Household activities are unavailable".to_string(),
                ))
            }
        }
    }
    rows.sort_by(|a, b| {
        b.date
            .cmp(&a.date)
            .then_with(|| b.created_at.cmp(&a.created_at))
            .then_with(|| b.id.cmp(&a.id))
            .then_with(|| b.member_id.cmp(&a.member_id))
    });
    let start = (query.page * query.page_size) as usize;
    let data = rows
        .into_iter()
        .skip(start)
        .take(query.page_size as usize)
        .collect();
    Ok(Json(HouseholdActivitiesResponse { data, total }))
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct HouseholdGoal {
    member_id: Uuid,
    member_name: String,
    goal: wealthfolio_core::goals::Goal,
}

async fn household_goals(State(root): State<Arc<WebProfiles>>) -> Result<Json<Vec<HouseholdGoal>>> {
    let mut goals = Vec::new();
    for profile in root.registry.list().map_err(failure)? {
        if profile.lock_enabled {
            continue;
        }
        let runtime = root.runtime(profile.id).await?;
        match runtime.goal_service.get_goals() {
            Ok(rows) => goals.extend(rows.into_iter().map(|goal| HouseholdGoal {
                member_id: profile.id,
                member_name: profile.name.clone(),
                goal,
            })),
            Err(_) => {
                return Err((
                    StatusCode::SERVICE_UNAVAILABLE,
                    "Household goals are unavailable".to_string(),
                ))
            }
        }
    }
    Ok(Json(goals))
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct HouseholdInvestmentPlans {
    member_id: Uuid,
    member_name: String,
    plans: Vec<wealthfolio_core::investment_plans::InvestmentPlan>,
}

async fn household_investment_plans(
    State(root): State<Arc<WebProfiles>>,
) -> Result<Json<Vec<HouseholdInvestmentPlans>>> {
    let mut members = Vec::new();
    for profile in root.registry.list().map_err(failure)? {
        if profile.lock_enabled {
            continue;
        }
        let runtime = root.runtime(profile.id).await?;
        let plans = wealthfolio_core::investment_plans::list(runtime.settings_service.as_ref())
            .map_err(|_| {
                (
                    StatusCode::SERVICE_UNAVAILABLE,
                    "Household investment plans are unavailable".to_string(),
                )
            })?;
        members.push(HouseholdInvestmentPlans {
            member_id: profile.id,
            member_name: profile.name,
            plans,
        });
    }
    Ok(Json(members))
}

async fn household_summary(
    State(root): State<Arc<WebProfiles>>,
    axum::extract::Query(query): axum::extract::Query<HouseholdSummaryQuery>,
) -> Result<Json<HouseholdSummary>> {
    let date = chrono::NaiveDate::parse_from_str(&query.date, "%Y-%m-%d")
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid date".to_string()))?;
    let profiles = root.registry.list().map_err(failure)?;
    let mut members = Vec::with_capacity(profiles.len());
    let mut totals_by_currency = BTreeMap::<String, HouseholdCurrencyTotal>::new();

    for profile in profiles {
        if profile.lock_enabled {
            members.push(HouseholdMemberSummary {
                id: profile.id,
                name: profile.name,
                avatar_id: profile.avatar_id,
                status: "unavailable",
                currency: None,
                assets: None,
                liabilities: None,
                net_worth: None,
                accounts_available: false,
                accounts: Vec::new(),
                holdings_available: false,
                holdings: Vec::new(),
            });
            continue;
        }
        let runtime = match root.runtime(profile.id).await {
            Ok(runtime) => runtime,
            Err((status, _)) => {
                tracing::warn!(profile_id = %profile.id, %status, "Household member runtime is unavailable");
                members.push(HouseholdMemberSummary {
                    id: profile.id,
                    name: profile.name,
                    avatar_id: profile.avatar_id,
                    status: "unavailable",
                    currency: None,
                    assets: None,
                    liabilities: None,
                    net_worth: None,
                    accounts_available: false,
                    accounts: Vec::new(),
                    holdings_available: false,
                    holdings: Vec::new(),
                });
                continue;
            }
        };
        let net_worth = match runtime.net_worth_service.get_net_worth(date).await {
            Ok(net_worth) => net_worth,
            Err(_) => {
                tracing::warn!(profile_id = %profile.id, "Household member net worth is unavailable");
                members.push(HouseholdMemberSummary {
                    id: profile.id,
                    name: profile.name,
                    avatar_id: profile.avatar_id,
                    status: "unavailable",
                    currency: None,
                    assets: None,
                    liabilities: None,
                    net_worth: None,
                    accounts_available: false,
                    accounts: Vec::new(),
                    holdings_available: false,
                    holdings: Vec::new(),
                });
                continue;
            }
        };
        let total = totals_by_currency
            .entry(net_worth.currency.clone())
            .or_default();
        total.assets += net_worth.assets.total;
        total.liabilities += net_worth.liabilities.total;
        total.net_worth += net_worth.net_worth;
        let (accounts, accounts_available): (Vec<HouseholdAccountSummary>, bool) = match runtime
            .account_service
            .get_all_accounts()
        {
            Ok(accounts) => (
                accounts
                    .into_iter()
                    .map(|account| HouseholdAccountSummary {
                        id: account.id,
                        name: account.name,
                        account_type: account.account_type,
                        group: account.group,
                        currency: account.currency,
                        is_active: account.is_active,
                        is_archived: account.is_archived,
                    })
                    .collect(),
                true,
            ),
            Err(_) => {
                tracing::warn!(profile_id = %profile.id, "Household member accounts are unavailable");
                (Vec::new(), false)
            }
        };
        let mut holdings = Vec::new();
        let mut holdings_available = accounts_available;
        if query.include_holdings && accounts_available {
            let base_currency = net_worth.currency.as_str();
            for account in accounts
                .iter()
                .filter(|account| account.is_active && !account.is_archived)
            {
                match runtime
                    .holdings_service
                    .get_holdings_with_options(&account.id, base_currency, false)
                    .await
                {
                    Ok(rows) => holdings.extend(rows.into_iter().map(|row| {
                        let symbol = row
                            .instrument
                            .as_ref()
                            .map(|instrument| instrument.symbol.clone());
                        let name = row
                            .instrument
                            .as_ref()
                            .and_then(|instrument| instrument.name.clone())
                            .or_else(|| symbol.clone())
                            .unwrap_or_else(|| "Cash".to_string());
                        HouseholdHoldingSummary {
                            asset_id: row
                                .instrument
                                .as_ref()
                                .map(|instrument| instrument.id.clone()),
                            id: row.id,
                            account_id: account.id.clone(),
                            account_name: account.name.clone(),
                            symbol,
                            name,
                            currency: row.local_currency,
                            quantity: row.quantity,
                            market_value: row.market_value.local,
                            market_value_base: row.market_value.base,
                            cost_basis_base: row.cost_basis.map(|value| value.base),
                            unrealized_gain_base: row.unrealized_gain.map(|value| value.base),
                            income_base: row.income.map(|value| value.base),
                            instrument_type: row.instrument.as_ref().and_then(|instrument| {
                                instrument
                                    .instrument_type
                                    .as_ref()
                                    .map(|kind| kind.as_db_str().to_string())
                            }),
                            exchange_mic: row
                                .instrument
                                .as_ref()
                                .and_then(|instrument| instrument.exchange_mic.clone()),
                        }
                    })),
                    Err(_) => {
                        holdings_available = false;
                        tracing::warn!(profile_id = %profile.id, account_id = %account.id, "Household account holdings are unavailable");
                    }
                }
            }
        }
        members.push(HouseholdMemberSummary {
            id: profile.id,
            name: profile.name,
            avatar_id: profile.avatar_id,
            status: "ready",
            currency: Some(net_worth.currency),
            assets: Some(net_worth.assets.total),
            liabilities: Some(net_worth.liabilities.total),
            net_worth: Some(net_worth.net_worth),
            accounts_available,
            accounts,
            holdings_available,
            holdings,
        });
    }

    Ok(Json(HouseholdSummary {
        date,
        members,
        totals_by_currency,
    }))
}

fn text<'a>(body: &'a Value, key: &str) -> Result<&'a str> {
    body.get(key)
        .and_then(Value::as_str)
        .ok_or_else(|| failure(format!("Missing {key}")))
}
fn id(body: &Value) -> Result<Uuid> {
    Uuid::parse_str(text(body, "profileId")?).map_err(failure)
}
fn scope(headers: &axum::http::HeaderMap) -> Result<Uuid> {
    headers
        .get(PROFILE_SCOPE_HEADER)
        .and_then(|v| v.to_str().ok())
        .and_then(|s| Uuid::parse_str(s).ok())
        .ok_or_else(|| failure("PROFILE_LOCKED"))
}
// Accept only serialized HTTP(S) origins, never URLs with credentials or paths.
fn browser_origin(value: &str) -> Option<reqwest::Url> {
    let (_, authority) = value.split_once("://")?;
    if authority.is_empty()
        || authority.contains(['/', '?', '#', '@', '\\'])
        || value.chars().any(char::is_whitespace)
    {
        return None;
    }
    let origin = reqwest::Url::parse(value).ok()?;
    matches!(origin.scheme(), "http" | "https").then_some(origin)
}

fn allowed_profile_origin(headers: &axum::http::HeaderMap, configured: &[String]) -> bool {
    if headers
        .get("sec-fetch-site")
        .is_some_and(|v| v != "same-origin" && v != "none")
    {
        return false;
    }
    if headers.get_all("origin").iter().count() > 1 {
        return false;
    }
    let Some(value) = headers.get("origin") else {
        return true; // Preserve non-browser API clients that omit Origin.
    };
    let Some(origin) = value.to_str().ok().and_then(browser_origin) else {
        return false;
    };
    // Preserve direct access and TLS termination without trusting forwarded headers.
    let host_matches = headers.get_all("host").iter().count() == 1
        && headers
            .get("host")
            .and_then(|v| v.to_str().ok())
            .and_then(|host| browser_origin(&format!("{}://{host}", origin.scheme())))
            .is_some_and(|host| host.origin() == origin.origin());
    host_matches
        || configured.iter().any(|value| {
            // Wildcard CORS is not permission to mutate profile grants.
            browser_origin(value).is_some_and(|allowed| allowed.origin() == origin.origin())
        })
}

async fn command(
    State(root): State<Arc<WebProfiles>>,
    Extension(owner): Extension<BackupSession>,
    Path(command): Path<String>,
    headers: axum::http::HeaderMap,
    Json(body): Json<Value>,
) -> Result<Json<Value>> {
    // JSON-only POST plus same-origin checks prevent cross-site grant mutations.
    if !allowed_profile_origin(&headers, &root.config.cors_allow) {
        return Err(failure("PROFILE_ORIGIN_REJECTED: Preserve the public Host header or configure its exact origin in WF_CORS_ALLOW_ORIGINS. Cross-site profile requests are not allowed."));
    }
    let registry = root.registry.clone();
    let admitted = || {
        registry
            .sessions
            .admit(&owner.0, scope(&headers)?)
            .map_err(failure)
    };
    match command.as_str() {
        "get_profile_state" => {
            let profiles = registry.list().map_err(failure)?;
            let mut session = registry.sessions.current(&owner.0).map_err(failure)?;
            if session.is_none() {
                session = root.auto_open(&owner.0)?;
            }
            if let Some(session) = &session {
                // Gate financial UI startup on the runtime, not just the grant.
                // Failed initialization remains retryable with the same session.
                root.runtime(session.profile_id).await?;
                registry
                    .sessions
                    .admit(&owner.0, session.scope_id)
                    .map_err(failure)?;
            }
            Ok(Json(
                json!({"profiles":profiles,"pendingDeletions":registry.pending_profiles().map_err(failure)?,"session":session,"starting":false}),
            ))
        }
        "delete_profile" => {
            let id = id(&body)?;
            let selected = scope(&headers).ok();
            let confirmation = text(&body, "confirmation")?.to_string();
            let proof = body.get("proof").and_then(Value::as_str).map(str::to_owned);
            let root = root.clone();
            tokio::spawn(async move {
                root.delete(owner.0, selected, id, confirmation, proof)
                    .await
            })
            .await
            .map_err(failure)??;
            Ok(Json(Value::Null))
        }
        "create_profile" => {
            let name = text(&body, "name")?.to_string();
            let avatar = text(&body, "avatarId")?.to_string();
            let password = body
                .get("password")
                .and_then(Value::as_str)
                .map(|value| zeroize::Zeroizing::new(value.to_string()));
            let (profile, recovery_code) = tokio::task::spawn_blocking(move || {
                registry.create_with_password(
                    &name,
                    &avatar,
                    password.as_deref().map(String::as_str),
                )
            })
            .await
            .map_err(failure)?
            .map_err(failure)?;
            let mut result = json!(profile);
            result["recoveryCode"] = json!(recovery_code);
            Ok(Json(result))
        }
        "unlock_profile" => {
            root.visited
                .lock()
                .map_err(failure)?
                .insert(owner.0.clone());
            let revision = registry
                .sessions
                .unlock_revision(&owner.0)
                .map_err(failure)?;
            let id = id(&body)?;
            let proof = body
                .get("proof")
                .and_then(Value::as_str)
                .map(str::to_string);
            let verify = registry.clone();
            let protected =
                tokio::task::spawn_blocking(move || verify.verify(id, proof.as_deref()))
                    .await
                    .map_err(failure)?
                    .map_err(failure)?;
            root.runtime(id).await?;
            registry.auth_flows.select(&owner.0, id).map_err(failure)?;
            let session = registry
                .sessions
                .issue_if_current(&owner.0, revision, id, protected)
                .map_err(failure)?;
            Ok(Json(json!(session)))
        }
        "lock_profile" => {
            root.visited
                .lock()
                .map_err(failure)?
                .insert(owner.0.clone());
            registry.auth_flows.cancel(&owner.0).map_err(failure)?;
            registry.sessions.revoke(&owner.0).map_err(failure)?;
            Ok(Json(Value::Null))
        }
        "profile_activity" => {
            let session = admitted()?;
            registry
                .sessions
                .activity(&owner.0, session.scope_id)
                .map_err(failure)?;
            Ok(Json(Value::Null))
        }
        "update_profile" => {
            let session = admitted()?;
            let name = text(&body, "name")?.to_string();
            let avatar = text(&body, "avatarId")?.to_string();
            tokio::task::spawn_blocking(move || {
                registry.update(session.profile_id, &name, &avatar)
            })
            .await
            .map_err(failure)?
            .map_err(failure)?;
            Ok(Json(Value::Null))
        }
        "set_profile_password" | "recover_profile_password" => {
            let recovery = command == "recover_profile_password";
            let id = if recovery {
                id(&body)?
            } else {
                admitted()?.profile_id
            };
            let proof = body
                .get(if recovery { "recoveryCode" } else { "proof" })
                .and_then(Value::as_str)
                .map(str::to_string);
            let password = body
                .get("password")
                .and_then(Value::as_str)
                .map(str::to_string);
            let code = tokio::task::spawn_blocking(move || {
                if recovery && !registry.verify(id, proof.as_deref())? {
                    return Err(wealthfolio_core::profiles::ProfileError::Locked);
                }
                registry.set_password(id, proof.as_deref(), password.as_deref())
            })
            .await
            .map_err(failure)?
            .map_err(failure)?;
            Ok(Json(json!(code)))
        }
        "profile_auth_storage" => {
            let session = admitted()?;
            let flows = &registry.auth_flows;
            let expected = body
                .get("flowId")
                .and_then(Value::as_str)
                .and_then(|s| Uuid::parse_str(s).ok());
            let result = match text(&body, "operation")? {
                "set" => json!(flows
                    .set_with_id(
                        &owner.0,
                        session.profile_id,
                        text(&body, "key")?,
                        text(&body, "value")?,
                        expected.unwrap_or_else(Uuid::new_v4)
                    )
                    .map_err(failure)?),
                "validate" => json!(expected.is_some_and(|id| flows
                    .is_current(&owner.0, session.profile_id, id)
                    .unwrap_or(false))),
                "get" => json!(flows
                    .get_scoped(&owner.0, session.profile_id, text(&body, "key")?, expected)
                    .map_err(failure)?),
                "remove" => {
                    flows
                        .remove(&owner.0, session.profile_id, expected)
                        .map_err(failure)?;
                    Value::Null
                }
                "callback" => Value::Null,
                _ => return Err(failure("Invalid authentication operation")),
            };
            Ok(Json(result))
        }
        "get_profile_sync_identity" | "update_profile_sync_identity" => {
            let session = admitted()?;
            let runtime = root.runtime(session.profile_id).await?;
            let _admission = connect_guard(&runtime)
                .map_err(|error| (StatusCode::SERVICE_UNAVAILABLE, error))?;
            let profile = registry.profile(session.profile_id).map_err(failure)?;
            let store = registry.secret_store(&profile);
            let key = wealthfolio_core::secrets::SYNC_IDENTITY_KEY;
            if command == "get_profile_sync_identity" {
                return Ok(Json(json!(store.get_secret(key).map_err(failure)?)));
            }
            let identity = body
                .get("identity")
                .and_then(Value::as_str)
                .ok_or_else(|| failure("Use device sync reset to remove enrollment."))?;
            wealthfolio_core::secrets::update_existing_sync_identity(store.as_ref(), identity)
                .map_err(failure)?;
            Ok(Json(Value::Null))
        }
        _ => Err((StatusCode::NOT_FOUND, "Unknown profile operation".into())),
    }
}

pub async fn admit(
    State(root): State<Arc<WebProfiles>>,
    mut request: Request<Body>,
    next: Next,
) -> Result<Response> {
    let owner = request
        .extensions()
        .get::<BackupSession>()
        .ok_or_else(|| failure("PROFILE_LOCKED"))?
        .0
        .clone();
    let selected = if request.headers().contains_key(PROFILE_SCOPE_HEADER) {
        Some(scope(request.headers())?)
    } else if let Some(value) = request.uri().query().and_then(|q| {
        q.split('&')
            .find_map(|part| part.strip_prefix("profileScope="))
    }) {
        Some(Uuid::parse_str(value).map_err(failure)?)
    } else {
        None
    };
    let session = if let Some(selected) = selected {
        root.registry
            .sessions
            .admit(&owner, selected)
            .map_err(failure)?
    } else {
        let profiles = root.registry.list().map_err(failure)?;
        if profiles.len() != 1 || profiles[0].lock_enabled {
            return Err(failure("PROFILE_LOCKED"));
        }
        match root.registry.sessions.current(&owner).map_err(failure)? {
            Some(session) => session,
            None => root
                .auto_open(&owner)?
                .ok_or_else(|| failure("PROFILE_LOCKED"))?,
        }
    };
    let selected = session.scope_id;
    let state = root.runtime(session.profile_id).await?;
    request.extensions_mut().insert(state);
    request.extensions_mut().insert(root.clone());
    // A download ticket belongs to this unlock, not just the browser cookie.
    request
        .extensions_mut()
        .insert(BackupSession(format!("{owner}:{selected}")));
    request.extensions_mut().insert(ProfileAccess {
        owner: owner.clone(),
        session,
    });
    let response = next.run(request).await;
    root.registry
        .sessions
        .admit(&owner, selected)
        .map_err(failure)?;
    let (parts, body) = response.into_parts();
    // Recheck each chunk, and wake idle SSE/AI bodies on revocation.
    let stream = futures::stream::unfold(
        (body.into_data_stream(), root, owner, selected),
        |(mut stream, root, owner, selected)| async move {
            loop {
                if root.registry.sessions.admit(&owner, selected).is_err() {
                    return None;
                }
                tokio::select! {
                    data = stream.next() => {
                        if root.registry.sessions.admit(&owner,selected).is_err() { return None; }
                        return data.map(|data| (data,(stream,root,owner,selected)));
                    }
                    _ = tokio::time::sleep(std::time::Duration::from_secs(1)) => {}
                }
            }
        },
    );
    Ok(Response::from_parts(parts, Body::from_stream(stream)))
}

pub async fn mcp(State(root): State<Arc<WebProfiles>>, request: Request<Body>) -> Response {
    use tower::ServiceExt;
    let id = match request
        .headers()
        .get(wealthfolio_core::profiles::PROFILE_ID_HEADER)
    {
        Some(value) => match value.to_str().ok().and_then(|s| Uuid::parse_str(s).ok()) {
            Some(id) => id,
            None => return StatusCode::BAD_REQUEST.into_response(),
        },
        None => match root.registry.default_id() {
            Ok(id) => id,
            Err(e) => return failure(e).into_response(),
        },
    };
    if let Err(error) = root.registry.profile(id) {
        return failure(error).into_response();
    }
    let mut routers = root.mcp.lock().await;
    let router = if let Some(router) = routers.get(&id) {
        router.clone()
    } else {
        let state = match root.runtime(id).await {
            Ok(state) => state,
            Err(e) => return e.into_response(),
        };
        let router = crate::mcp::router(state, &root.config);
        routers.insert(id, router.clone());
        router
    };
    drop(routers);
    router
        .oneshot(request)
        .await
        .unwrap_or_else(|never| match never {})
}

pub async fn instance_logout(
    State(root): State<Arc<WebProfiles>>,
    request: Request<Body>,
    next: Next,
) -> Response {
    if request.uri().path().ends_with("/auth/logout")
        || request.uri().path().ends_with("/auth/oidc/logout")
    {
        if let Some(auth) = &root.auth {
            if let Ok(token) = crate::auth::extract_token(&request) {
                if let Ok(claims) = auth.validate_token(&token) {
                    use sha2::Digest;
                    let owner = if claims.sid.is_empty() {
                        format!("{:x}", sha2::Sha256::digest(token.as_bytes()))
                    } else {
                        claims.sid
                    };
                    let _ = root.registry.sessions.revoke(&owner);
                    let _ = root.registry.auth_flows.cancel(&owner);
                }
            }
        }
    }
    next.run(request).await
}

/// Offline selection retains registry ownership through the entire operation.
pub(crate) fn offline_database(
    default: String,
    master: &[u8],
    selected: Option<Uuid>,
) -> anyhow::Result<(String, [u8; 32], Option<ProfileRegistry>)> {
    let db = std::path::PathBuf::from(&default);
    let root = db
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or_else(|| std::path::Path::new("."));
    if !root.join("profiles.json").exists() && !root.join("profiles.json.bak").exists() {
        anyhow::ensure!(selected.is_none(), "No profile registry exists");
        return Ok((default, crate::auth::derive_database_key(master), None));
    }
    let (_, vault_key) = crate::auth::derive_keys(master);
    let store = crate::secrets::build_secret_store(
        std::env::var("WF_SECRET_FILE")
            .map(std::path::PathBuf::from)
            .unwrap_or_else(|_| root.join("secrets.json")),
        Some(vault_key),
        Some(master),
    )
    .map_err(anyhow::Error::new)?;
    let registry = ProfileRegistry::open(root.to_path_buf(), db.clone(), Arc::new(store))?;
    let id = selected.unwrap_or(registry.default_id()?);
    let profile = registry.profile(id)?;
    let path = registry
        .paths(&profile)
        .database
        .to_string_lossy()
        .into_owned();
    let mut key = crate::auth::derive_database_key(master);
    if profile.legacy_database.is_none() {
        key = crate::auth::derive_profile_database_key(master, id);
    }
    Ok((path, key, Some(registry)))
}

async fn household_exposure(
    State(root): State<Arc<WebProfiles>>,
    axum::extract::Query(query): axum::extract::Query<HouseholdOverviewQuery>,
) -> Result<Json<Vec<Value>>> {
    let ids = query
        .member_ids
        .split(',')
        .map(Uuid::parse_str)
        .collect::<std::result::Result<std::collections::HashSet<_>, _>>()
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid member IDs".into()))?;
    let profiles = root.registry.list().map_err(failure)?;
    if ids
        .iter()
        .any(|id| !profiles.iter().any(|p| p.id == *id && !p.lock_enabled))
    {
        return Err((StatusCode::BAD_REQUEST, "Member is unavailable".into()));
    }
    let mut reports = vec![];
    for profile in profiles.into_iter().filter(|p| ids.contains(&p.id)) {
        let runtime = root.runtime(profile.id).await?;
        let view = wealthfolio_core::fund_exposure::read(
            runtime.settings_service.as_ref(),
            runtime.account_service.as_ref(),
            runtime.asset_service.as_ref(),
            runtime.holdings_service.as_ref(),
            &query.currency,
            None,
        )
        .await
        .map_err(|_| {
            (
                StatusCode::SERVICE_UNAVAILABLE,
                "Fund exposure is unavailable".into(),
            )
        })?;
        reports.push(json!({"memberId":profile.id,"memberName":profile.name,"view":view}));
    }
    Ok(Json(reports))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn profile_origin_policy_handles_direct_and_proxied_requests() {
        use axum::http::{HeaderMap, HeaderValue};
        let allowed = vec![
            "https://portfolio.example.com".into(),
            "https://portfolio.example.com:8443".into(),
            "http://192.168.1.10:8088".into(),
        ];
        for (origin, host, expected) in [
            ("http://localhost:1420", "localhost:1420", true),
            ("http://192.168.1.10:8088", "192.168.1.10:8088", true),
            ("http://[::1]:8088", "[::1]:8088", true),
            (
                "https://portfolio.example.com",
                "portfolio.example.com",
                true,
            ),
            ("https://portfolio.example.com", "wealthfolio:8088", true),
            (
                "https://portfolio.example.com:443",
                "wealthfolio:8088",
                true,
            ),
            ("https://PORTFOLIO.example.com", "wealthfolio:8088", true),
            (
                "https://portfolio.example.com:8443",
                "portfolio.example.com",
                true,
            ),
            ("http://portfolio.example.com", "wealthfolio:8088", false),
            (
                "https://portfolio.example.com:8444",
                "wealthfolio:8088",
                false,
            ),
            ("https://other.example.com", "wealthfolio:8088", false),
            (
                "https://portfolio.example.com.evil.test",
                "wealthfolio:8088",
                false,
            ),
            ("https://evil.test", "wealthfolio:8088", false),
            ("null", "wealthfolio:8088", false),
            (
                "https://portfolio.example.com/path",
                "portfolio.example.com",
                false,
            ),
            (
                "https://user@portfolio.example.com",
                "portfolio.example.com",
                false,
            ),
            (
                "ftp://portfolio.example.com",
                "portfolio.example.com",
                false,
            ),
            (
                "https://portfolio.example.com?x",
                "portfolio.example.com",
                false,
            ),
            (
                "https://portfolio.example.com#x",
                "portfolio.example.com",
                false,
            ),
            (
                "https://portfolio.example.com https://evil.test",
                "portfolio.example.com",
                false,
            ),
        ] {
            let mut headers = HeaderMap::new();
            headers.insert("origin", HeaderValue::from_str(origin).unwrap());
            headers.insert("host", HeaderValue::from_str(host).unwrap());
            assert_eq!(
                allowed_profile_origin(&headers, &allowed),
                expected,
                "{origin} via {host}"
            );
            headers.insert("sec-fetch-site", HeaderValue::from_static("same-origin"));
            assert_eq!(allowed_profile_origin(&headers, &allowed), expected);
            for site in ["same-site", "cross-site"] {
                headers.insert("sec-fetch-site", HeaderValue::from_static(site));
                assert!(!allowed_profile_origin(&headers, &allowed));
            }
        }
        let mut headers = HeaderMap::new();
        assert!(allowed_profile_origin(&headers, &[]));
        headers.insert("sec-fetch-site", HeaderValue::from_static("cross-site"));
        assert!(!allowed_profile_origin(&headers, &allowed));
        headers.remove("sec-fetch-site");
        headers.insert(
            "origin",
            HeaderValue::from_static("https://portfolio.example.com"),
        );
        headers.insert("host", HeaderValue::from_static("wealthfolio:8088"));
        assert!(!allowed_profile_origin(&headers, &["*".into()]));
        assert!(!allowed_profile_origin(&headers, &[]));
        headers.append("origin", HeaderValue::from_static("https://evil.test"));
        assert!(!allowed_profile_origin(&headers, &allowed));
    }

    #[test]
    fn grant_mutations_reject_cross_origin_and_sibling_sites() {
        let mut headers = axum::http::HeaderMap::new();
        assert!(allowed_profile_origin(&headers, &[]));
        headers.insert("host", "wealthfolio.test".parse().unwrap());
        headers.insert("origin", "https://wealthfolio.test".parse().unwrap());
        assert!(allowed_profile_origin(&headers, &[]));
        headers.insert("origin", "https://other.test".parse().unwrap());
        assert!(!allowed_profile_origin(&headers, &[]));
        headers.remove("origin");
        headers.insert("sec-fetch-site", "same-site".parse().unwrap());
        assert!(!allowed_profile_origin(&headers, &[]));
    }
}
