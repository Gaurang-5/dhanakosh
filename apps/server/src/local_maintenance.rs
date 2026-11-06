//! Opt-in local maintenance, independent of Connect subscriptions.
//! Uses the same profile-owned worker lifecycle and services as manual actions.
use std::{sync::Arc, time::Duration};

use crate::main_lib::AppState;
use wealthfolio_storage_sqlite::db;

const BACKUP_INTERVAL: &str = "WF_LOCAL_BACKUP_INTERVAL_HOURS";

fn interval_hours(value: Option<&str>, maximum: u64) -> Result<Option<Duration>, ()> {
    let Some(value) = value.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };
    let hours = value.parse::<u64>().map_err(|_| ())?;
    match hours {
        0 => Ok(None),
        1.. if hours <= maximum => Ok(Some(Duration::from_secs(hours * 3600))),
        _ => Err(()),
    }
}

fn configured_interval(key: &str, maximum: u64) -> Option<Duration> {
    match interval_hours(std::env::var(key).ok().as_deref(), maximum) {
        Ok(interval) => interval,
        Err(()) => {
            tracing::warn!(
                setting = key,
                "Invalid local maintenance interval; task disabled"
            );
            None
        }
    }
}

pub(crate) fn enabled() -> bool {
    configured_interval(BACKUP_INTERVAL, 720).is_some()
}

fn scheduled_files(
    root: &str,
    key: Option<Arc<db::DbEncryptionKey>>,
) -> anyhow::Result<Vec<db::snapshots::Snapshot>> {
    Ok(db::snapshots::list(root, key)?
        .into_iter()
        .filter(|s| matches!(s.reason, db::snapshots::SnapshotReason::Scheduled))
        .collect())
}

fn copy_off_device(source: &std::path::Path, destination: &std::path::Path) -> anyhow::Result<()> {
    use sha2::{Digest, Sha256};
    use std::io::{Read, Write};
    anyhow::ensure!(
        destination.is_dir(),
        "Backup destination must already exist"
    );
    let mut input = std::fs::File::open(source)?;
    let mut output = tempfile::NamedTempFile::new_in(destination)?;
    let mut digest = Sha256::new();
    let mut buffer = [0u8; 65536];
    loop {
        let n = input.read(&mut buffer)?;
        if n == 0 {
            break;
        }
        digest.update(&buffer[..n]);
        output.write_all(&buffer[..n])?;
    }
    output.as_file().sync_all()?;
    let expected = digest.finalize();
    let mut verify = std::fs::File::open(output.path())?;
    let mut digest = Sha256::new();
    loop {
        let n = verify.read(&mut buffer)?;
        if n == 0 {
            break;
        }
        digest.update(&buffer[..n]);
    }
    anyhow::ensure!(expected == digest.finalize(), "Backup checksum mismatch");
    let filename = source
        .file_name()
        .ok_or_else(|| anyhow::anyhow!("Invalid backup filename"))?;
    output.persist_noclobber(destination.join(filename))?;
    #[cfg(unix)]
    std::fs::File::open(destination)?.sync_all()?;
    Ok(())
}

fn capture(state: &AppState) -> anyhow::Result<()> {
    let path = db::snapshots::create(
        &state.db_access,
        &state.data_root,
        db::snapshots::SnapshotReason::Scheduled,
    )?;
    if let Some(destination) =
        std::env::var_os("WF_LOCAL_BACKUP_COPY_DIR").filter(|v| !v.is_empty())
    {
        anyhow::ensure!(
            state.db_access.is_encrypted(),
            "Off-device copy requires encrypted storage"
        );
        copy_off_device(&path, std::path::Path::new(&destination))?;
    }
    let keep = std::env::var("WF_LOCAL_BACKUP_KEEP")
        .ok()
        .and_then(|n| n.parse::<usize>().ok())
        .filter(|n| (1..=365).contains(n))
        .unwrap_or(30);
    // Only scheduled local copies are pruned, and only after a verified successful capture/copy.
    for snapshot in scheduled_files(&state.data_root, Some(state.database_key.clone()))?
        .into_iter()
        .skip(keep)
    {
        db::snapshots::delete(&state.data_root, &snapshot.filename)?;
    }
    Ok(())
}

pub fn start(state: Arc<AppState>) {
    if let Some(period) = configured_interval(BACKUP_INTERVAL, 720) {
        let runtime = state.clone();
        let worker = tokio::spawn(async move {
            // Catalogue timestamps survive restarts; a new installation gets its first copy after startup.
            let catalogue_runtime = runtime.clone();
            let last = tokio::task::spawn_blocking(move || {
                scheduled_files(
                    &catalogue_runtime.data_root,
                    Some(catalogue_runtime.database_key.clone()),
                )
            })
            .await
            .ok()
            .and_then(Result::ok)
            .and_then(|files| {
                files
                    .first()
                    .and_then(|f| chrono::DateTime::parse_from_rfc3339(&f.modified_at).ok())
            });
            let delay = last
                .map(|last| {
                    let elapsed = (chrono::Utc::now() - last.with_timezone(&chrono::Utc))
                        .to_std()
                        .unwrap_or_default();
                    period.saturating_sub(elapsed).max(Duration::from_secs(60))
                })
                .unwrap_or(Duration::from_secs(60));
            tokio::time::sleep(delay).await;
            loop {
                let owner_runtime = runtime.clone();
                let result = tokio::task::spawn_blocking(move || capture(&owner_runtime)).await;
                if matches!(result, Ok(Ok(_))) {
                    tracing::info!("Scheduled local snapshot completed");
                } else {
                    // Never log paths, database content, or secrets from storage errors.
                    tracing::warn!("Scheduled local snapshot failed; check backup storage");
                }
                tokio::time::sleep(period).await;
            }
        });
        state
            .workers
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .push(worker);
        tracing::info!("Local snapshot schedule enabled");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn off_device_copy_is_exact_and_does_not_overwrite() {
        let source = tempfile::tempdir().unwrap();
        let destination = tempfile::tempdir().unwrap();
        let path = source.path().join("snapshot.db");
        let bytes = vec![42u8; 150_000];
        std::fs::write(&path, &bytes).unwrap();
        copy_off_device(&path, destination.path()).unwrap();
        assert_eq!(
            std::fs::read(destination.path().join("snapshot.db")).unwrap(),
            bytes
        );
        assert!(copy_off_device(&path, destination.path()).is_err());
        assert!(copy_off_device(&path, &destination.path().join("missing")).is_err());
    }

    #[test]
    fn schedules_are_disabled_unless_explicitly_enabled() {
        for value in [None, Some(""), Some(" "), Some("0")] {
            assert_eq!(interval_hours(value, 720), Ok(None));
        }
    }

    #[test]
    fn intervals_are_bounded_before_duration_conversion() {
        for value in ["-1", "0.5", "721", "18446744073709551615", "daily"] {
            assert!(interval_hours(Some(value), 720).is_err());
        }
        assert_eq!(
            interval_hours(Some(" 24 "), 720),
            Ok(Some(Duration::from_secs(86400)))
        );
    }
}
