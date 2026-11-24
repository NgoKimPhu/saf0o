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
- d3962445 jest on `@swc/jest` instead of Babel
- 9d6e209a bump dependencies to latest (min age 3d)
- 7b04c9f5 drop the Babel toolchain; keep `@babel/parser` for the IPC inventory test
- 5ddb9b29 conf 16 with an object-only path setter in `PersistStore` (dot-prop 10 made numeric segments array indexes)
- c1d0576c eslint 10 with `@eslint-react/eslint-plugin` (eslint-plugin-react stops at eslint 9)

Intent: Run on current dependency majors. Each fix follows from one upgrade.

Files: `package.json`, `pnpm-lock.yaml`, `jest*.json`, `main/store/persist/index.ts`, `test/jest.textEncoder.js`, `main/provider/helpers.ts`, `main/chains/*`, `main/signers/**`, `main/security/secretClipboard.ts`, tx and signer tests.

Rebase notes:

- Resolve `pnpm-lock.yaml` by regenerating (see section 1). Keep our versions in `package.json` unless upstream bumps the same package higher.
- Upstream code written for the old `@ethereumjs` or Electron APIs will compile-fail after rebase. Port it the same way.
- After rebase, run compile, bundle and the jest suites. The jest setup is ours: it transforms with `@swc/jest`, not Babel. Do not take upstream `.babelrc.json` or jest config blindly; SWC hoists only `jest.mock` calls, so a mock factory must not read a `const` declared below the imports.

Upstream-PR candidate: no.

## 11. Test, lint and quit fixes

Commits: `saf0o: stub signed-tx verification in provider broadcast tests`, `saf0o: lint: ...`,
`saf0o: wait for async clipboard clear on quit (Electron 45)`.

Intent: Keep the provider tests on fake signed bytes (verification has its own test file). Clear a copied
secret before quit now that Electron 45 `clipboard.readText` is async.

Upstream-PR candidate: yes for the clipboard fix (upstream is on Electron 42 today).

## 12. Native confirmation for sensitive settings

Commit: `saf0o: native confirmation before disabling signer protection or replacing the profile`.

Intent: The renderer sends fixed consent strings, which a compromised renderer could send too. Main now
shows its own dialog (Cancel by default) before turning off OS signer protection or staging a profile restore.

Files: `main/windows/dialog/index.ts`, `main/application.ts`.

Upstream-PR candidate: yes.

## 13. Fork identity and rebrand to saf0o

Commits, in order:

- `saf0o: fork identity: ...` and `saf0o: user-data folder saf0o, ...`: repository NgoKimPhu/saf0o, app id
  `io.github.ngokimphu.saf0o`, profile folder `saf0o`, instance lock `.saf0o-instance`.
- `saf0o: add rebrand script ...` and `saf0o: rebrand script reformats ...`: `scripts/rebrand-saf0o.mjs`.
- `saf0o: rebrand Wren -> saf0o (generated: node scripts/rebrand-saf0o.mjs)`: pure script output.
- `saf0o: rebrand fallout: ...`: hand fixes the script cannot make (auth transcript fixture, deploy origin id).
- `saf0o: pin our companion extension id ...`: allowlist `dkbkgeampccigheoijopoaeneajeenhm`, companion links.

Intent: Rename the product, protocol identifiers (`saf0o-companion-auth`, `x-saf0o-native-proof`,
`saf0o:permissionScope`), CSS tokens, files and the executable. The saf0o-companion fork carries the same
rename, so the two stay in lockstep. CHANGELOG, release notes, upstream credit and third-party token
names keep "Wren".

Rebase notes: Never merge the generated commit. Instead:

1. `git rebase -i upstream`, drop the generated commit, resolve the rest.
2. Run `node scripts/rebrand-saf0o.mjs` (needs `node_modules` for prettier), commit with the same subject.
3. Re-apply the fallout commit; if it conflicts, redo it by hand.
4. Run the tests. The auth fixture `test/fixtures/peerAuth/v3-transcript.json` must stay identical to
   saf0o-companion `test/fixtures/saf0o-companion-auth-v3.json`.

Upstream-PR candidate: no.

## 14. Rebrand restyle

Commits: the `saf0o:` restyle series from the policy alignment through 2fed66ea (tokens, palette, motion, nav, review
rhythm, tx footer, copy).

Intent: One token set in `resources/base.styl` (type 12-24 px, radius 5/8/10/14, 4 px spacing, motion 120/180/240 ms on
one curve), the logo palette everywhere, aligned review screens, shorter copy. New rules sit in `saf0o-*.styl` files where possible.

Rebase notes: Touches about 63 upstream style files by hand, not by script. On conflict keep upstream structure and
re-apply our token values. `test/resources/theme/{tokens,motion,logoPalette}.test.js` and the UI harness policy
(`pnpm run qualify:ui`) catch drift.

## 15. Outbound connection allowlist

Commit: the `saf0o: outbound connection allowlist` commit.

Intent: Defend against exfiltration by a compromised dependency. Main-process Node sockets and the default Electron session
are checked against an allowlist (services, RPC presets, custom RPCs, custom Lattice relay, env-set IPFS endpoints,
loopback). Enforce by default; `SAF0O_EGRESS=log` only logs. Session image requests pass, because token logos come from
any logoURI host. Hot-signer workers refuse every non-loopback connection.

Files: `main/egress/*` (new), first-line imports in `main/index.ts`, `main/application.ts` (after `store`),
`main/externalData/balances/worker.ts`, `main/signers/hot/HotSigner/worker.js`, `test/main/egress/*`.

Rebase notes: Keep `./egress/install` the first import of `main/index.ts`. A new upstream service host needs an entry in
`staticHosts`, or it logs as unlisted.

Upstream-PR candidate: maybe.

## 16. Simulation through dRPC

Commit: the `saf0o: simulate through dRPC` commit.

Intent: Most RPCs lack `debug_traceCall`, so the review lost native (ETH) balance changes. Simulation calls now go to
`lb.drpc.org` with imported keys, tried in rotation. A key that reports code 10 (balance used up) or 429 cools down for an
hour or 30 s. A key that reports code 4 (invalid or expired) is skipped the same way. The keyless endpoint is the last dRPC attempt,
but dRPC now rejects it with code 4. When dRPC cannot answer, and for chains it does not serve, the configured RPC runs.
The review shows why native changes are missing when the trace does not run.

A failed execution check shows its RPC reason in the "Execution Check Failed" dialog and logs it
(`transaction simulation failed`). `redactRpcReason` strips URLs and key-like tokens and caps the text at 160 characters.
`eth_call` and the traces raise a fee cap under the execution block's base fee to that base fee (`buildEthCall`), because
the base fee can pass the cap while the review is open. The fee fields stay in the call.

Privacy: the pending request, including the sending account, goes to dRPC. Keys live in the profile store in plaintext
(`main.simulationRpcKeys`), like custom RPC URLs, and are imported in Settings. The log never records a key or URL.

Files: `main/transaction/simulationRpc.ts` (new), `viaSimulationRpc` wrapped around `send` at five simulation call sites in
`main/accounts/Account/index.ts` and `main/provider/index.ts`, `setSimulationRpcKeys` in store and IPC schemas,
`lb.drpc.org` in `main/egress`, a Settings block in `app/dash/Settings` (Advanced tab, under the Etherscan key).

Rebase notes: A new upstream simulation call site needs the same wrapper. Signing-time code checks stay on the configured RPC.

Upstream-PR candidate: no.

## 17. Token import from Alchemy

Commit: the `saf0o: import tokens from Alchemy` commit.

Intent: Discover an account's ERC-20 holdings once and add the ones the user ticks as custom tokens. The main process calls
Alchemy's Portfolio API (`tokens/by-address`) with plain `fetch`, one chunk of five networks at a time. Nothing is
pre-ticked. Tokens already tracked (default list, custom, known) and the default list's blacklist are hidden. Name and
symbol are stripped of control and bidi characters and capped. Save reads token metadata from the last preview in main, so
the renderer only names chain id and address.

Privacy: the account address goes to `api.g.alchemy.com`. The API key lives in the OS keyring file
`.alchemy-api-key.json` (same store as the Etherscan key), is excluded from backups, never reaches the renderer and never
appears in logs or results. The key is entered in Settings → Advanced (the Etherscan key component, reused through props);
the import panel only points there. Without a keyring (WSL) the dashboard says so and offers no key field.

Values: the request asks for prices; the preview sorts by USD value (highest first), shows it, and offers Select all and
Select above $x. Tokens without a price sort last.

Files: `main/tokenImport/*` (new), `createApiKeyStore` factory and `createAlchemyApiKeyStore` in
`main/contractVerification/credentialStorage.ts`, five `tokenImport:*` channels in `main/ipc/schemas.ts`,
`resources/bridge/{protocol.js,roles.ts}` and `main/application.ts`, `api.g.alchemy.com` in `main/egress`,
`app/dash/Tokens/ImportTokens` (new) mounted in `CustomTokens`, `app/dash/Settings/ContractVerificationCredential` (props).
`app/dash/index.styl` limits the text cursor to text inputs.

Rebase notes: `credentialStorage.ts` is upstream's. The Etherscan constants became `ETHERSCAN_SPEC` and the schemas became
`wrapperSchema(spec)` and `payloadSchema(spec)`. Keep the `createEtherscanApiKeyStore` signature.

Upstream-PR candidate: no.

## 18. Legacy gas price predictor

Commit: the `saf0o: predict legacy gas price from block history` commit.

Intent: Chains without a fee market (Arbitrum, Fantom) use `eth_gasPrice`, which the base fee can pass before the
transaction lands. `GasPricePredictor` tracks the per-block price change with a smoothed trend and a smoothed variance,
projects 2 blocks ahead and adds 2 standard deviations. The buffer is at least 0.5% and at most 25%. Its state lives on
`ChainConnection`, because `GasMonitor` is new for every block. `getGasPrices` still returns the raw price.

Files: `main/transaction/gasPricePredictor.ts` (new), the legacy branch of `_createBlockMonitor` in `main/chains/index.js`.

Rebase notes: Keep the predictor call in the branch where no fee market loads.

Upstream-PR candidate: maybe.

## 19. Transaction recheck pacing

Commit: the `saf0o: recheck a submitted tx` and `saf0o: pace transaction rechecks` commits.

Intent: The lifecycle runtime checked a new transaction once, before an Arbitrum block could include it, then waited for
the 15 s sweep. The UI stayed on "Submitted". While the operation is `submitted` or `reorged`, `reconcile` now retries for
20 s of wall time. The delay is the chain's cached block time, clamped to 250 ms to 5 s, or 1 s with no sample.
`main/chains/blockTime.ts` keeps the cache in memory. It averages over spans of at least 10 s of header time, because
headers have 1 s resolution. A chain has no sample for about 10 s after start.

Files: `main/chains/blockTime.ts` (new), `main/operationLifecycle/runtime.ts`, `recordBlock` call in the `data` handler of
`main/chains/index.js`.

Rebase notes: Keep the `recordBlock` call in the block monitor `data` handler.

Upstream-PR candidate: maybe.

## 20. Save contract from the review

Commit: the `saf0o: save the called contract to Contacts` commit.

Intent: A "Save contract" button on the Contract row of a transaction request adds the contract to Contacts through the
existing `addressBook:save` channel. It shows only for contracts not in Contacts. The name is `Contract 0x12345678`, not the
reputation label, because remote labels are attacker-chosen. Wallet-calls requests do not have the button.

Files: `app/tray/Account/Requests/TransactionRequest/TxRecipient/index.js`.

Rebase notes: none.

Upstream-PR candidate: no.

## 21. Add a network from chainlist.org

Commit: the `saf0o: add a network by chain id from chainlist.org` commit.

Intent: The add-network form has a "Look up on chainlist.org" Chain ID input. Main fetches `chainlist.org/rpcs.json` once per
session through the `chains:lookup` channel (dash only) and returns bounded data: HTTPS RPCs without key placeholders or
credentials, least-tracking first, at most 5, plus the first HTTPS explorer. The form fills its fields. It is hidden for dapp
requests. The user reviews the fields before adding.

Files: `main/chains/lookup.ts`, `main/application.ts`, `main/ipc/schemas.ts`, `resources/bridge/{index.js,protocol.js,roles.ts}`,
`app/dash/Chains/Chain/ChainNew/index.js`, tests.

Rebase notes: The `chains:lookup` entry sits next to `tray:addChain` in each registry.

Upstream-PR candidate: no.
