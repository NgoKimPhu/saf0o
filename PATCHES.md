# saf0o patch stack

- `upstream` is pristine jorphex/wren. `main` is `upstream` plus our linear stack of commits prefixed `saf0o:`.
- Sync with `git fetch` then `git rebase upstream` on `main`. Never merge upstream into `main`.
- Run `git config rerere.enabled true` once per clone so repeated conflict resolutions replay.

List the stack: `git log --reverse upstream..main`. Hashes below are current and change on every rebase; find a patch by its subject.

## 1. pnpm migration
Commit: 8ae72e80 "migrate npm to pnpm"

Intent: Use pnpm with a lockfile and a minimum release age, instead of npm.

Files: `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.npmrc`, `.github/workflows/*`, `.husky/*`, `scripts/pnpm-lock.mjs` (+ test), SBOM and packaging scripts in `scripts/`, `tsconfig.json`.

Rebase notes:
- Never merge `pnpm-lock.yaml` or `package-lock.json`. On conflict, take our `package.json` merge, delete `package-lock.json` if upstream touched it, then run `pnpm install --lockfile-only` to regenerate.
- `scripts/pnpm-lock.mjs` is a lockfile reader for SBOM tooling. It is not a converter.
- Upstream edits to scripts or workflows that call `npm` need the same pnpm port. Drop the literal `--` in `pnpm run x -- args`.

Upstream-PR candidate: no.

## 2. Release and updater links
Commit: b868885a

Intent: Point the updater and release links at NgoKimPhu/saf0o (companion: NgoKimPhu/saf0o-companion), not jorphex/wren. App id io.github.ngokimphu.saf0o.

Files: `package.json` (`repository`), `main/windows/window.ts` (release allowlist), `resources/constants/index.ts`, tests for both.

Rebase notes: Conflicts are one-line URL edits. Search for `jorphex` after each rebase and fix any new hit.

Upstream-PR candidate: no.

## 3. Trezor manifest email
Commit: f7d98a32

Intent: Remove the upstream author email from the Trezor bridge manifest.

Files: `main/signers/trezor/bridge.ts`, its test.

Rebase notes: One-line change. Re-apply if upstream edits the manifest.

Upstream-PR candidate: no.

## 4. Remove support address and QR
Commit: 0456ac39

Intent: Remove the upstream support address, QR code and copy button from the dashboard.

Files: `app/dash/Main/index.js`, `app/dash/Main/style/index.styl`, `resources/constants/index.ts`, `test/app/dash/Main/index.test.js`.

Rebase notes: Conflicts come from upstream edits to the same dashboard block. Keep upstream changes outside the removed block.

Upstream-PR candidate: no.

## 5. Extension id allowlist and pairing dialog
Commit: 1167ca37

Intent: Upstream accepts any `chrome-extension` origin. Pin Chromium origins to a list of ids and show browser and id in the pairing dialog.

Files: `main/api/extensionIds.ts` (new, holds the id list), `main/api/origins.ts`, `main/api/extensionAuth.ts`, `main/api/extensionPairing.ts`, `app/tray/Notify/ExtensionConnect/index.jsx`, `app/tray/Notify/index.js`, tests.

Rebase notes: The id list lives in its own file to keep conflicts small. Firefox ids are per-install UUIDs and cannot be pinned.

Upstream-PR candidate: yes.

## 6. Omit spoofed tokens
Commit: 30b67338

Intent: Add spoofed WBTC, stETH and the homoglyph LINEA token (chain 59144) to the default omit list.

Files: `main/externalData/inventory/default-tokens.json`, `test/main/externalData/inventory/tokens.test.js`.

Rebase notes: Data-only entries. If the JSON conflicts, keep upstream entries and re-add ours.

Upstream-PR candidate: yes (omit flags).

## 7. Verify signed bytes before broadcast
Commit: 09331bf1

Intent: Single `eth_sendTransaction` did not compare the signed bytes with the reviewed tx. Reuse the wallet-calls `verifySignedTransaction` in `signAndSend`.

Files: `main/provider/index.ts`, `main/provider/walletCallPreparedExecution.ts`, `test/main/provider/signAndSendVerification.test.js` (new).

Rebase notes: Touches the large `signAndSend` function, so expect conflicts there. The new test fails if verification is removed.

Upstream-PR candidate: yes.

## 8. Restore "Gas values set by <source>" warning
Commit: 7fbef22a

Intent: Upstream shows a red warning when fees came from the dapp. Wren only shows "set by user". Restore the warning for non-Frame sources.

Files: `app/tray/Account/Requests/TransactionRequest/TxFee/index.js` and its test.

Rebase notes: Small edit in `TxFee`. Keep upstream layout changes, re-add the source check.

Upstream-PR candidate: yes.

## 9. Remove Yearn Earn
Commit: ea785e68

Intent: Remove the Yearn Earn feature and its network calls.

Files: `app/dash/Earn/*`, `main/yearn/*`, `transaction/actions/yearn.ts`, RPC and IPC entries, balance-scan allowlist, docs (`YEARN_EARN.md`, `README.md`, `THREAT_MODEL.md`, `QUALIFICATION.md`). Adds `main/store/migrate/migrations/77/index.ts` (+ test, fixture edit), which drops `main.yearn`.

Rebase notes:
- Modify/delete conflicts on removed files: resolve with `git rm <path>`.
- Our migration 77 will clash with any upstream migration 77. Renumber ours to the next free number, and update `main/store/migrate/index.ts`, the test name and fixtures.
- Search for new `yearn` references after each rebase and remove them.

Upstream-PR candidate: no.

## 10. Dependency bump and fallout fixes
Commits, in order:
- ea15a97c bump dependencies to latest (min age 3d)
- ef8aa7c9 port to `@ethereumjs/{common,tx,util}` 10 and `eth-sig-util` 10
- 019cad59 `parseCookie` for cookie 2
- bb9cd587 async Electron 45 clipboard in `secretClipboard`
- 4ce2519a TypeScript 6 and `@types/node` 26 compile errors
- 1624de2a alias `uuid` for Parcel (uuid 14 is exports-only)
- 1337ac37 jest on Babel 8 (own transformer, TS import elision, TextEncoder)
- de7d143a bytes for `isValidPrivate`
- ecb3684d port tx tests to the `@ethereumjs` 10 API
- b7e8159b hex-valid fake addresses in the Lattice test
- 1009e933 store/state test uses a real temp dir (conf 16 is ESM)
- df925b71 drop empty `@types/node-hid` stub and unused overrides; `engines.electron` 45

Intent: Run on current dependency majors. Each fix follows from one upgrade.

Files: `package.json`, `pnpm-lock.yaml`, `.babelrc.json`, `jest*.json`, `test/jest.babelTransform.cjs`, `test/jest.textEncoder.js`, `main/provider/helpers.ts`, `main/chains/*`, `main/signers/**`, `main/security/secretClipboard.ts`, tx and signer tests.

Rebase notes:
- Resolve `pnpm-lock.yaml` by regenerating (see section 1). Keep our versions in `package.json` unless upstream bumps the same package higher.
- Upstream code written for the old `@ethereumjs` or Electron APIs will compile-fail after rebase. Port it the same way.
- After rebase, run compile, bundle and the jest suites. The jest and Babel setup is ours; do not take upstream `.babelrc.json` or jest config blindly.

Upstream-PR candidate: no.
