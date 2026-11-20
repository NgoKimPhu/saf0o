# macOS unnotarized release

Saf0o 0.1.4 and later releases may include separate Intel (`x64`) and Apple
Silicon (`arm64`) macOS artifacts. They remain unqualified previews until their
architecture-specific physical checks pass.

These previews use ad-hoc code signatures. They have no Apple Developer ID,
Team ID or notarization ticket. macOS blocks first launch until you approve an
exception. The current release process uses this signature policy.

## Choose and verify the download

- Apple Silicon (`M1` or later): `Saf0o-<version>-macos-arm64-unnotarized.dmg`
- Intel: `Saf0o-<version>-macos-x64-unnotarized.dmg`

Download the matching DMG and `SHA256SUMS` only from Saf0o's GitHub release. In
Terminal, from the download directory, verify the selected file:

```bash
file='Saf0o-<version>-macos-arm64-unnotarized.dmg'
grep "  $file$" SHA256SUMS | shasum -a 256 --check
gh attestation verify "$file" -R NgoKimPhu/saf0o
```

Replace the filename with the Intel DMG when applicable. Do not install if the
checksum entry is missing, the checksum differs, or
attestation verification fails.

## Install and open

1. Open the verified DMG and drag **Saf0o** to **Applications**.
2. Try to open Saf0o once. macOS should block the unidentified, unnotarized app.
3. Open **System Settings → Privacy & Security**, scroll to **Security**, and
   choose **Open Anyway** for Saf0o.
4. Authenticate when macOS asks, confirm **Open**, and verify that the app name
   is Saf0o before continuing.

The exception applies only to this application. Do not disable Gatekeeper or
remove quarantine attributes globally. A managed Mac may prohibit the override.

## Support boundary

- Checksums and GitHub attestations identify the release and its source.
  They do not provide Apple notarization.
- Automatic macOS updates are not published. Download and verify each later
  version independently.
- macOS has no Saf0o OS-backed device-protection layer. Software-signer records
  remain password-encrypted, and profile backups remain password-protected.
- Physical qualification remains pending. Use a disposable account and test funds.
