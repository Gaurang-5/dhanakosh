# Excel uploads and explicit duplicate imports

The activity upload accepts CSV, XLS and XLSX files. Excel is read locally using
the pinned SheetJS CE package and converted to CSV in memory. A multi-sheet file
requires a worksheet selection. Only that sheet enters the existing parser,
mapping, asset resolution and review flow. Account selection remains unchanged.

Numeric cells retain stored precision. Excel date cells are formatted as ISO
dates. The reader does not calculate formulas, execute macros, merge sheets or
automatically post transactions. Report headers, totals and missing values still
need review. For Value Research reports, use the parsing settings to select the
transaction header and exclude totals, or use the prepared transaction CSVs. The
original uploaded file is unchanged. Files over 10 MB and worksheet ranges over
one million cells are rejected.

Unskip on a row already flagged as a duplicate now sets the existing
`forceImport` flag, preserving duplicate status and warnings through submission.
This matches the user's explicit choice to include the row. Invalid rows remain
blocked, ordinary rows do not gain an override, and untouched duplicate rows
retain the backend's normal duplicate protection. The existing Import anyway
action remains available.

## Architecture impact

Excel adds a lazy-loaded client-side parser dependency, shared by the web and
Tauri bundles. No new runtime network requests, endpoints, provider settings,
storage, background jobs or retries are introduced. The duplicate fix changes
user-edit precedence in the review reducer: an explicit unskip now reaches the
existing backend override. Backend validation, idempotency enforcement for other
rows, persistence and recalculation events remain unchanged.

Validation covers XLS/XLSX dates and decimal precision, sheet isolation, invalid
files, explicit duplicate overrides, invalid-row blocking, and sheet selection
in the UI. A disposable browser flow covers desktop and RTL mobile upload.
