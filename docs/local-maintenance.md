# Private-server backups and automatic prices

Architecture: the Axum server already starts its core periodic portfolio job for
open profiles (two-minute initial delay, six-hour interval). This keeps the
existing provider enablement, override precedence, coordination and event
status. There is no second quote scheduler and no Connect subscription
requirement for that job. An enabled provider can still require its own API key
or charge fees.

## Local snapshot schedule

Set `WF_LOCAL_BACKUP_INTERVAL_HOURS=24` in the private server environment and
restart it. Omitted, empty or zero disables the schedule. Accepted values are
whole hours from 1 through 720; invalid values disable it with a generic
warning. The first snapshot occurs about a minute after startup when no
scheduled copy exists. Later starts use the newest scheduled snapshot timestamp
to resume the interval. Unprotected member runtimes open at startup when
scheduling is enabled; password-locked members are not unlocked. Their schedule
starts after normal unlock. The server must remain running; this is not an
operating-system service.

The worker uses native SQLite snapshots and profile lifecycle cancellation.
Catalogue reads and copies run on blocking workers. Copies preserve source
encryption and appear in each member's existing backup catalogue. Encrypted
snapshots require the original server key; use password-protected portable
exports for independently recoverable copies.

`WF_LOCAL_BACKUP_KEEP` retains 1–365 scheduled local copies (default 30).
Retention runs after successful capture/copy and deletes only scheduled copies,
never manual or pre-restore backups. Existing snapshot download leases apply.

Optionally set `WF_LOCAL_BACKUP_COPY_DIR` to an existing mounted drive/NAS
folder. The source database must be encrypted. A private temporary copy is
hashed, re-read, synced and atomically published without replacing an existing
filename. Copy failure preserves the local snapshot and prevents retention for
that run. Off-device copies are not automatically pruned. Keep the encryption
key backed up separately. No destination is configured by default, and no cloud
upload or paid service is involved. Desktop/Tauri retains its manual backup
workflow.

## Market-data coverage

The existing provider resolver supports NSE (`XNSE` → `.NS`), BSE (`XBOM` →
`.BO`), US listings, and London UCITS listings (`XLON` → `.L`). Listing identity
includes the exchange: an ISIN alone does not choose a trading currency. Native
currency handling distinguishes GBp/GBX from GBP and converts pence to pounds.
These deterministic mappings are tested, not a guarantee of upstream data
availability or licensing.

The AMFI provider resolves exact `AMFI-<scheme code>` identities and downloads
current/historical official NAV reports. It respects provider enablement and
uses a bounded in-memory feed cache; existing user overrides retain precedence.
Search distinguishes direct/regular plans and growth/dividend options. No valid
NAV is fabricated for missing data. SGBs need their exact exchange listing;
those without available exchange quotes and other manual assets still require
manual updates. The existing Securities and Health pages expose stale/missing
quotes and FX issues. Do not treat seeded demonstration prices as live quotes.
Existing dated FX and price-history interfaces remain in use; import review must
verify transaction currency separately from quote units.
