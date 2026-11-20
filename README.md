<p align="center">
  <img src="asset/brand/exports/app/saf0o-app-icon-512.png" alt="Saf0o" width="150" />
</p>

<h1 align="center">Saf0o</h1>

<p align="center">A desktop EVM wallet for reviewing and signing requests from browsers and native apps.</p>

<p align="center">
  <a href="https://getwren.xyz">Website</a> ·
  <a href="https://github.com/NgoKimPhu/saf0o/releases">Download</a> ·
  <a href="https://github.com/NgoKimPhu/saf0o-companion/releases">Companion</a> ·
  <a href="release-notes/v0.1.12.md">What’s new</a> ·
  <a href="SECURITY.md">Security</a> ·
  <a href="RPC_COMPATIBILITY.md">Developer reference</a>
</p>

Review app requests in Saf0o. Each app has its own account permission and network route.

The latest release is [**0.1.12**](release-notes/v0.1.12.md).

## Highlights

- Clear reviews for transactions, approvals, permits, messages, EIP-712, SIWE,
  EIP-7702 revocation, and sequential EIP-5792 calls.
- Previews of expected asset changes from configured-RPC simulation, with calldata
  and trace details available when supported.
- Adjustable token allowances with a **Use balance** shortcut, editable fees and
  nonces, and compact transaction progress.
- Encrypted software signers, supported hardware wallets, watch-only accounts,
  and per-app permissions.
- Local contacts, Send, and multi-asset Sweep.

See [supported standards](SUPPORTED_EIPS.md),
[execution boundaries](EXECUTION_BOUNDARIES.md) for exact behavior.

## Account activity

While Saf0o runs, Activity tracks direct transactions and standard token transfers
for saved addresses on enabled, connected networks. Calls made outside Saf0o show
**Outside Saf0o**. Common approvals, deposits, and withdrawals have short action names.

Monitoring starts at the current chain position. Saf0o saves progress and catches up
after reconnecting. Alerts appear while Saf0o is hidden; use **Wallet activity
notifications** in Settings to turn them off. Alerts omit amounts and addresses.
Monitoring does not include internal-call traces or activity from before it began.

## Token approvals

On the wallet's account screen, open **Approvals** below the balance card and
**Receive / Send** buttons. The list includes approvals sent through Saf0o and
successful direct approvals found by Activity. **Refresh** checks allowances
through your configured RPC. **Revoke** opens a zero-allowance transaction for
review and signing.

The list covers locally observed ERC-20 approval calls. Earlier approvals, NFT
approvals, and signed permits are not included. Records stay on this device for
up to a year, with a limit of 500. They are excluded from profile backups.
**Forget observed approvals** clears the list without changing onchain allowances.

## Support

Saf0o 0.1.12 works with Companion 0.1.3 over pairing protocol 3.
Companion 0.1.2 also works; 0.1.3 adds connection retry fixes.
Linux x64 is the main release target. Windows and macOS are unqualified previews.
Linux arm64 has automated package checks only. Read
[Signer and platform support](HARDWARE_SUPPORT.md) for tested platforms, signers, and limits.

## Install

Download Saf0o and `SHA256SUMS` from the
[desktop releases page](https://github.com/NgoKimPhu/saf0o/releases).

### Linux x64

Verify the downloaded files:

```bash
sha256sum --check --ignore-missing SHA256SUMS
```

Run the AppImage:

```bash
chmod +x Saf0o-0.1.12.AppImage
./Saf0o-0.1.12.AppImage
```

Or install the deb:

```bash
sudo apt install ./saf0o_0.1.12_amd64.deb
```

Linux packages are unsigned. Checksums and GitHub attestations verify their
release identity.

### Windows and macOS previews

Windows x64 is unsigned and may show an unknown-publisher warning; follow the
[Windows preview guide](WINDOWS_RELEASE_QUALIFICATION.md). macOS Intel and Apple
Silicon builds are ad-hoc signed and unnotarized; follow the
[macOS preview guide](MACOS_UNNOTARIZED.md). Future Windows signing will follow
the [code-signing policy](CODE_SIGNING_POLICY.md).

### Browser companion

Chrome and Brave users can install
[Saf0o Companion from the Chrome Web Store](https://chromewebstore.google.com/detail/wren-companion/ifimccfajfbgligbhcgfapdagpnfkbhn).
Firefox users can install
[Saf0o Companion from Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/wren-companion/).
Manual Chrome and Firefox archives are available
from the [Companion releases page](https://github.com/NgoKimPhu/saf0o-companion/releases).

Compare the six-digit code shown by Saf0o and Companion before pairing.

### Import a Frame profile

Saf0o does not read Frame’s live profile. To import a private copy:

1. Close both apps.
2. Back up `~/.config/frame`.
3. Run this command before Saf0o creates its profile:

```bash
./Saf0o-0.1.12.AppImage --import-frame-profile
```

The import copies only the supported configuration and encrypted signer files.
Frame remains unchanged.

## Build from source

The repository pins Node and npm. On Ubuntu or Debian:

```bash
sudo apt-get update
sudo apt-get install build-essential libudev-dev libusb-1.0-0-dev
git clone https://github.com/NgoKimPhu/saf0o.git
cd saf0o
nvm install
nvm use
npm install --global npm@11.12.0
npm run setup:ci
npm run prod
```

For packaging and qualification, follow the
[release procedure](RELEASE.md) and [qualification checklist](QUALIFICATION.md).

## Privacy

Saf0o has no hosted wallet backend. Common network requests use these services:

| Purpose                 | Default                  | Shared data                                                                 |
| ----------------------- | ------------------------ | --------------------------------------------------------------------------- |
| EVM RPC                 | PublicNode               | IP address, queries, calldata, and submitted transactions                   |
| USD prices              | DefiLlama; GeckoTerminal | IP address, network and token IDs; no wallet address                        |
| App content             | IPFS.io                  | IP address and the requested content ID and path                            |
| Token artwork           | Reviewed CoinGecko host  | Recognized artwork requests only                                            |
| Contract names and ABIs | Sourcify; Etherscan      | IP address, network and contract address                                    |
| Trezor definitions      | Trezor SDK service       | IP address, network, target/token address and sometimes a function selector |

GeckoTerminal supplies Robinhood Chain prices and fills missing quotes on supported
networks. Lookups run from the desktop and resume after rate limits. Previous
quotes can remain during retries. Saf0o does not show a 24-hour change for these quotes.
See [pricing and network details](THREAT_MODEL.md#remote-services-and-content)
for supported networks, pool rules and cache limits.

Saf0o does not contact Pylon or use an NFT indexer. Read the
[threat model](THREAT_MODEL.md) for other requests and data access. Custom RPC
and IPFS endpoints are supported through settings and environment configuration.

## Security and license

Please report vulnerabilities privately through the
[security policy](SECURITY.md). Only the latest published Saf0o release receives security fixes.

Saf0o is a community-maintained continuation of the
[Frame wallet](https://github.com/floating/frame). Saf0o's source uses the
[GNU GPL v3.0](LICENSE). Dependencies have their own licenses.
