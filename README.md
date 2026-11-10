<div align="center">
  <a href="https://github.com/Gaurang-5/dhanakosh">
    <img src="assets/brand/icon.png" alt="Dhanakosh logo" width="80" height="80">
  </a>

  <h1>Dhanakosh</h1>

  <p>
    One private home for an Indian household's local and global investments.
    <br>
    Desktop app or self-hosted server. Your financial records stay under your control.
  </p>

  <p>
    <a href="https://github.com/Gaurang-5/dhanakosh/releases/latest"><img alt="Download latest release" src="https://img.shields.io/badge/Download-Latest_release-C99A2E?style=for-the-badge&logo=github&logoColor=white"></a>
    <a href="#docker-quick-start"><img alt="Run with Docker" src="https://img.shields.io/badge/Run_with-Docker-1D63ED?style=for-the-badge&logo=docker&logoColor=white"></a>
    <a href="#build-from-source"><img alt="Build from source" src="https://img.shields.io/badge/Build-From_source-374151?style=for-the-badge&logo=rust&logoColor=white"></a>
  </p>

  <p>
    <a href="https://github.com/Gaurang-5/dhanakosh/actions/workflows/release.yml"><img alt="Release status" src="https://github.com/Gaurang-5/dhanakosh/actions/workflows/release.yml/badge.svg"></a>
    <a href="LICENSE"><img alt="License" src="https://img.shields.io/github/license/Gaurang-5/dhanakosh"></a>
    <a href="https://github.com/Gaurang-5/dhanakosh/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/Gaurang-5/dhanakosh"></a>
  </p>
</div>

<p align="center">
  <img src="apps/frontend/public/screenshot.webp" alt="Dhanakosh portfolio dashboard" width="920">
</p>

## The idea

An Indian household rarely has one neat portfolio. Investments are split across
family members, brokers, mutual funds, currencies, and exchanges. Many trackers
either treat India as an afterthought or require sending financial records to a
hosted service.

**Dhanakosh** (धनकोश, “treasury”) starts with a different premise: the household
ledger should stay local, ownership should remain visible, and Indian and global
securities should live in the same books. You can use the desktop app or run a
private server for your household.

| Principle            | What it means                                                                              |
| :------------------- | :----------------------------------------------------------------------------------------- |
| **Household first**  | Keep family members and portfolios together without flattening ownership.                  |
| **India and global** | Track stocks, ETFs, and mutual funds across markets and currencies.                        |
| **Local first**      | Store records on your computer, or on infrastructure you control when self-hosting.        |
| **Import friendly**  | Import CSV files and Zerodha tradebooks; parse CAMS and KFintech statements locally.       |
| **Open foundation**  | Build on Wealthfolio while maintaining separate product decisions, branding, and releases. |

The current release tracks stocks, ETFs, and mutual funds by ISIN. Indian mutual
fund prices come from AMFI; NSE and BSE quotes use Yahoo after the exchange is
known. EPF, NPS, deposits, and other passbooks are outside the current release
contract. See
[the supported-securities contract](docs/securities-public-release.md).

## Download

Choose the installer for your computer from the
[latest release](https://github.com/Gaurang-5/dhanakosh/releases/latest):

| Platform                | Asset                                                |
| :---------------------- | :--------------------------------------------------- |
| **Windows x64**         | `Dhanakosh_<version>_x64-setup.exe`                  |
| **Windows ARM64**       | `Dhanakosh_<version>_arm64-setup.exe`                |
| **macOS Apple Silicon** | `Dhanakosh_<version>_aarch64.dmg`                    |
| **macOS Intel**         | `Dhanakosh_<version>_x64.dmg`                        |
| **Linux x64**           | `Dhanakosh_<version>_amd64.AppImage` or `_amd64.deb` |

Releases remain drafts until all advertised platform builds are present. If the
latest-release page has no installers, check the
[release workflow](https://github.com/Gaurang-5/dhanakosh/actions/workflows/release.yml).

### Download security

macOS packages are signed and notarized when Apple Developer credentials are
configured. Community builds made without those credentials are still checked
for both app and DMG output, but macOS will show an unidentified-developer
warning when they are opened.

Windows installers are currently community builds, so SmartScreen may appear.
Maintainer setup and the release checklist are in
[docs/releasing.md](docs/releasing.md).

## Docker quick start

```bash
git clone https://github.com/Gaurang-5/dhanakosh.git
cd dhanakosh
./scripts/prepare-docker-env.sh
docker compose --env-file .env.docker up -d --build
```

Open [http://localhost:8088](http://localhost:8088), create the household, and
add the first family member. The setup script stores the encryption key in the
local `.env.docker` file; keep that file private and backed up. Dhanakosh cannot
reset the password for you.

Start the existing installation with:

```bash
docker compose --env-file .env.docker up -d
```

`docker compose --env-file .env.docker down` stops the app without deleting its
data. Adding `-v` deletes the Docker volumes and their data.

## Build from source

The repository pins Node.js, pnpm, and Rust versions.

```bash
git clone https://github.com/Gaurang-5/dhanakosh.git
cd dhanakosh
pnpm install --frozen-lockfile
pnpm tauri dev
```

For browser development, run `pnpm dev:web` and open
[http://localhost:1420](http://localhost:1420). Production checks use:

```bash
pnpm check
pnpm --filter frontend exec vitest run
cargo test --locked -p wealthfolio-core
cargo check --locked -p wealthfolio-app -p wealthfolio-server
```

## How it is built

```text
apps/frontend/          React interface and Tauri/web adapters
apps/tauri/             Native desktop runtime and credential storage
apps/server/            Axum server for self-hosted web mode
crates/core/            Shared portfolio and application services
crates/storage-sqlite/  Local SQLite persistence
packages/ui/            Shared interface components
packages/addon-sdk/     Typed addon API
```

Financial records remain in SQLite. Desktop secrets use native credential
storage; the web server uses its configured encrypted secret store. Addons have
declared permissions and user consent boundaries. See the
[architecture documentation](docs/architecture/) and
[addon documentation](docs/addons/index.md) for the detailed contracts.

## Useful documentation

- [Activity types](docs/activities/activity-types.md)
- [Self-hosting](docs/self-host/README.md)
- [Credential storage](docs/architecture/credential-storage.md)
- [Adapter architecture](docs/architecture/adapters.md)
- [Release process](docs/releasing.md)
- [Roadmap](ROADMAP.md)

## Project lineage

Dhanakosh is an independent fork of
[Wealthfolio](https://github.com/wealthfolio/wealthfolio). It keeps the upstream
foundation and attribution while maintaining its own household focus, branding,
documentation, and release pipeline. Wealthfolio is a trademark of Teymz Inc.;
this repository is not the official Wealthfolio app.

## Contributing and license

Open an issue before a large change so its scope and data implications are
clear. Keep pull requests focused and include the checks you ran.

The source is licensed under AGPL-3.0. See [LICENSE](LICENSE). Brand assets in
`assets/brand/` are trademarks covered by [TRADEMARKS.md](TRADEMARKS.md); the
software license does not grant those trademarks.
