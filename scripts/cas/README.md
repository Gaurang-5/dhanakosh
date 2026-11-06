# Local CAMS/KFintech CAS preview

From the repository root:

```sh
python3 -m venv .venv-portfolio
.venv-portfolio/bin/python -m pip install -r scripts/cas/requirements.txt
export WF_CAS_PYTHON="$PWD/.venv-portfolio/bin/python"
```

Set `WF_CAS_PYTHON` to an absolute executable path for packaged desktop or
server launches outside this checkout. The Python environment must be on the
machine running the Rust backend. Conversion uses
[CASParser](https://github.com/codereverser/casparser) (MIT); its installed
distribution includes upstream license notices.

Choose a member/account in the native import wizard, then expand **CAMS/KFintech
CAS PDF**. Use an original detailed statement since inception. The PDF and its
password travel only to your own backend and its local subprocess; neither is
persisted by this converter. Review the generated transactions, securities,
account and duplicate status before committing. Use HTTPS for a remote private
server, as with all financial uploads.

Supported conversion: purchases/SIPs, redemptions, switches, dividends,
reinvestment and supported tax rows. Running and closing units must reconcile.
Nonzero opening holdings, missing AMFI identities, mixed owners, parser
warnings, mergers, reversals, summary/demat CAS and unsupported transactions
reject the whole conversion. No inferred opening cost or silently omitted
transactions. Re-imported generated rows have stable comments for native
duplicate detection; CSV imports from another source can have different
identifiers and still need review. Tax amounts/fees should be compared with the
source before committing.

Tests use synthetic parsed statements. Real password-protected issuer PDFs still
need acceptance testing against redacted samples. EPFO/NPS PDFs and MF Central
exports are not covered by this converter.

```sh
python3 -m unittest discover -s scripts/cas/tests
```
