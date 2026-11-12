# Releasing Dhanakosh

Dhanakosh publishes desktop builds from `.github/workflows/release.yml`. A tag
must match the version in `Cargo.toml`, `package.json`, and
`apps/tauri/tauri.conf.json`. The workflow keeps the GitHub release in draft
until every advertised platform succeeds and all required assets are present.

## macOS signing and notarization

Add these repository secrets to produce signed and notarized macOS packages:

| Secret                       | Value                                                                            |
| :--------------------------- | :------------------------------------------------------------------------------- |
| `APPLE_CERTIFICATE`          | Base64-encoded Developer ID Application certificate in PKCS #12 (`.p12`) format. |
| `APPLE_CERTIFICATE_PASSWORD` | Password used when the `.p12` file was exported.                                 |
| `APPLE_SIGNING_IDENTITY`     | Full Developer ID Application identity used by `codesign`.                       |
| `APPLE_TEAM_ID`              | Apple Developer team identifier.                                                 |
| `APPLE_API_ISSUER`           | App Store Connect API issuer identifier.                                         |
| `APPLE_API_KEY`              | App Store Connect API key identifier.                                            |
| `APPLE_API_KEY_P8`           | Complete contents of the App Store Connect `.p8` private key.                    |

Store these only as GitHub Actions secrets. Do not commit certificates, private
keys, passwords, or API keys to the repository.

When all credentials are present, the Tauri build signs the app, submits it to
Apple's notary service, and staples the accepted ticket. The workflow verifies
the app signature, asks Gatekeeper to assess both the app and DMG, and validates
the stapled ticket. Any verification failure prevents publication.

When the credentials are absent, the workflow applies a complete ad-hoc
signature to the community build. This seals the app bundle and prevents a
partial linker signature from making Gatekeeper report that the app is damaged.
The workflow verifies the app signature and DMG integrity before publication.
This mode does not provide Apple notarization or remove the first-launch
unidentified-developer warning.

## Publishing a version

1. Update all project version files to the same version.
2. Run the normal checks and a manual Release workflow dispatch.
3. Create and push an annotated `v<version>` tag.
4. Wait for every matrix job and the final asset verification job to pass.
5. Confirm the release is public and contains both macOS architectures, both
   Windows architectures, and the Linux AppImage and Debian package.

Never publish a draft manually to bypass a failed build or asset-verification
step. When signing is configured, do not bypass a signing or notarization
failure.
