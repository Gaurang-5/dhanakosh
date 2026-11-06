//! Optional local PDF worker. Conversion is read-only; native import still owns commits.
use serde::{Deserialize, Serialize};
use std::{process::Stdio, time::Duration};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

#[derive(Deserialize)]
pub struct CasImportRequest {
    pub content: String,
    pub password: String,
}
#[derive(Serialize, Deserialize)]
pub struct CasImportPreview {
    pub csv: String,
    pub rows: usize,
}

pub async fn parse_cas(request: CasImportRequest) -> Result<CasImportPreview, String> {
    use base64::Engine;
    if request.content.len() > 14 * 1024 * 1024 || request.password.len() > 1024 {
        return Err("PDF exceeds the 10 MB limit".into());
    }
    let decoded = base64::engine::general_purpose::STANDARD
        .decode(&request.content)
        .map_err(|_| "Invalid PDF encoding")?;
    if !decoded.starts_with(b"%PDF-") {
        return Err("Choose an original CAS PDF".into());
    }
    let python =
        std::env::var_os("WF_CAS_PYTHON").unwrap_or_else(|| ".venv-portfolio/bin/python".into());
    let mut child = tokio::process::Command::new(python)
        .args(["-I", "-c", include_str!("cas_bridge.py")])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .spawn()
        .map_err(|_| {
            "CAS parser unavailable. Install the local parser and configure WF_CAS_PYTHON."
        })?;
    let input = serde_json::to_vec(
        &serde_json::json!({"content": request.content, "password": request.password}),
    )
    .map_err(|_| "Invalid CAS request")?;
    let mut stdin = child.stdin.take().ok_or("CAS input unavailable")?;
    let mut stdout = child
        .stdout
        .take()
        .ok_or("CAS output unavailable")?
        .take(16 * 1024 * 1024 + 1);
    let work = async {
        stdin
            .write_all(&input)
            .await
            .map_err(|_| "CAS worker failed")?;
        drop(stdin);
        let mut bytes = Vec::new();
        stdout
            .read_to_end(&mut bytes)
            .await
            .map_err(|_| "CAS worker failed")?;
        if bytes.len() > 16 * 1024 * 1024 {
            return Err("CAS output exceeds limit".to_string());
        }
        let status = child.wait().await.map_err(|_| "CAS worker failed")?;
        if !status.success() {
            return Err("CAS parser failed. Nothing was imported.".into());
        }
        let value: serde_json::Value =
            serde_json::from_slice(&bytes).map_err(|_| "Invalid CAS parser response")?;
        if let Some(error) = value.get("error").and_then(|v| v.as_str()) {
            return Err(error.to_owned());
        }
        serde_json::from_value(value).map_err(|_| "Invalid CAS parser response".into())
    };
    tokio::time::timeout(Duration::from_secs(90), work)
        .await
        .map_err(|_| "CAS parsing timed out; nothing was imported".to_string())?
}
