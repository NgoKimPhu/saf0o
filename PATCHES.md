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

## 22. Copy button on account rows

Commit: the `saf0o: add a copy button to account rows` commit.

Intent: Each row in the account dropdown has a copy button beside it that copies the address without switching accounts.
It uses the existing `tray:clipboardData` channel. The row is wrapped in `.accountDrawerRow` because a button cannot nest in a button.

Files: `app/tray/AccountSelector/AccountController/index.js`, `app/tray/AccountSelector/style/index.styl`, test.

Rebase notes: Upstream tests that query the row button by name need an anchored regex, such as `/^Garden/`.

Upstream-PR candidate: maybe.

## 23. Ask dapp access after an account switch

Commit: the `saf0o: ask dapp access after an account switch` commit.

Intent: Switching to an account a connected dapp has no permission for made `accountsChanged` and `eth_accounts` return `[]`,
so dapps failed sign-in with "No accounts found". `provider.requestAccessAfterAccountSwitch()` now opens the normal access
prompt for subscribed origins that hold a permission on another account but not on the new one. Dapps never connected get no
prompt. Revocations do not re-prompt: only `accounts.setSigner` calls it.

Files: `main/provider/index.ts`, `main/accounts/index.ts`, `test/main/provider/index.test.js`.

Rebase notes: none.

Upstream-PR candidate: no.

## 24. Net the gas fee out of the native balance preview

Commit: the `saf0o: net the gas fee out of the native balance preview` commit.

Intent: The prestate trace charges the full gas limit before its "pre" balance, so the sender's diff held only the unused-gas
refund. A swap that moves no BNB showed `+0.000005 BNB`. `parseNativeBalanceChanges` now subtracts `gas * price` of the traced
call from the sender, so the row reads swap flows minus the fee. Measured on dRPC BSC: a gas price of 0 gave a delta of 0, and
5 gwei gave exactly the refund.

Files: `main/transaction/simulation.ts`, `test/main/transaction/simulation.test.js`.

Rebase notes: A node whose tracer rebuilds "pre" before the gas charge would count the fee twice. Re-check on a new RPC provider.

Upstream-PR candidate: no.

## 25. Control tabs on one line, Back on every tab, Apps with access opens Connected apps

Commit: the `saf0o: one-line control tabs, Back on every tab, Apps with access opens Connected apps` commit.

Intent: The five dash tabs stack in a column and Back shows only on Connected apps. The tabs now sit in one row without icons
("Connected apps" reads "Apps"), Accounts, Networks, Settings and Apps all show Back, and the wallet's "Apps with access" title and
"View all app access" row open the Connected apps page.

Files: `app/dash/Command/index.js`, `app/dash/ControlNavigation/index.js`, `app/dash/Main/style/index.styl`,
`app/tray/Account/Permissions/DappsPreview/index.js`, `app/tray/Account/style/account.styl`, and their tests.

Rebase notes: The tray expanded list (`DappsExpanded`) is no longer reachable from the preview.

Upstream-PR candidate: no.

## 26. Remember a declined app connection per account

Commit: the `saf0o: remember a declined app connection per account` commit.

Intent: Decline on an account-access request had no memory, so an app could prompt again at once. The access request now has
"Remember my decision for this account". It stores `main.blockedApps[account][originId]`, and `requestOriginAccess` then rejects
that account and app with 4001 and no prompt. The app's Connected apps page lists the blocks with Remove, and can add one by hand
for an account without access. Removing an account drops its blocks.

Files: `main/api/origins.ts`, `main/accounts/Account/index.ts`, `main/accounts/index.ts`, `main/application.ts`,
`main/ipc/schemas.ts` (`tray:giveAccess` takes a third argument, `blockApp`, `unblockApp`), `main/store/actions/index.js`,
`main/store/state/index.ts`, `app/tray/Footer/index.js`, `app/dash/Dapps/DappDetails/index.js`, and their tests.

Rebase notes: A block applies only when no existing grant covers the request. A manual block does not revoke an existing grant.

Upstream-PR candidate: no.

## 27. EIP-7702 batching foundation (Ambire delegate)

Commits: `saf0o: allowlist EIP-7702 batching delegates`, `saf0o: generalize EIP-7702 authorization signing`,
`saf0o: encode Ambire account calls`.

Intent: Lay the ground for atomic batches and extra account keys through an EIP-7702 delegation to AmbireAccount7702
(`0x5A7FC11397E9a8AD41BF10bf13F22B0a63f96f6d`). `main/eip7702/delegates.ts` allowlists that delegate and its runtime code hash
on chains 1, 10, 56, 100, 8453 and 42161. A new `eip7702-upgrade-v1` request signs a self-sent type-4 tx that delegates to an
allowlisted contract and carries call data. The hot signer worker signs it through `signEip7702Authorization` and re-checks the
allowlist itself. `main/eip7702/ambire.ts` encodes `executeBySender`, `setAddrPrivilege` and `privileges`.

Files: `main/eip7702/{delegates,authorization,ambire,index}.ts`, `main/transaction/eip7702.ts` (appended upgrade functions),
`main/signers/hot/{HotSigner/index,HotSigner/worker,RingSigner/worker,SeedSigner/worker}.js`, and their tests.

Rebase notes: The revoke code in `main/transaction/eip7702.ts` is upstream's and stays untouched. The upgrade code sits at the
end of that file, plus one `isAllowedDelegate` import. Add a chain to the allowlist only after checking the delegate's code hash
on that chain.

Upstream-PR candidate: no.

## 28. Atomic wallet_sendCalls through the Ambire delegation

Commits: `saf0o: atomic wallet_sendCalls through Ambire delegation`, `saf0o: show atomic batches in the approval and status
views`.

Intent: EIP-5792 batches ran only sequentially. `wallet_getCapabilities` now reports atomic `supported` for an account delegated
to the allowlisted AmbireAccount7702 with a matching delegate code hash, and `ready` for a codeless Ring or Seed account on an
allowlisted chain. A supported batch runs as one self-call to `executeBySender`. A ready batch asks for native consent, then
sends one type-4 transaction that delegates and runs the batch. A declined required upgrade answers 5750. A contract creation
or an unsupported account answers 5760 when atomicity is required, else runs sequentially. The review keeps the decoded calls,
so risk checks, simulation and the approval list stay per call. The upgrade simulation and gas estimate apply the delegation as
a state override, and the gas limit adds the 25000 authorization cost. Signing re-reads the account code and aborts if it changed.

Files: `main/provider/walletCallAtomic.ts` (new), `main/provider/{index,walletCalls,walletCallAdmission,walletCallBatches,
walletCallPreparedExecution,walletCallStatusView}.ts`, `main/accounts/{index,types}.ts`, `main/accounts/Account/index.ts`,
`main/transaction/simulation.ts` (`stateOverrides`), `main/store/state/types/walletCallBatch.ts`, `main/windows/nav/breadcrumb.ts`,
`app/tray/Footer/index.js`, `app/tray/Account/Requests/{index,WalletCallsRequest/index}.js`,
`app/tray/Account/WalletCallsStatus/index.js`, and their tests.

Rebase notes: `parseSendCalls` no longer throws 5760; the provider decides after reading the account code. The batch `atomic`
field is `z.boolean()`, so stored rows with `false` still parse. An atomic batch records `callCount: 1`. `sendWalletCalls`
and `getWalletCallCapabilities` are async, and the `await` edits in `test/main/provider/index.test.js` will conflict with
upstream test changes. The code re-check sits in `revalidateBeforeCall`, because `assertBeforeSign` is synchronous.

Upstream-PR candidate: no.

## 29. Ambire account keys (EIP-7702)

Commits: `saf0o: manage Ambire account keys`, `saf0o: clear Ambire keys before revoke`, `saf0o: discover Ambire keys on chain
before revoke`, `saf0o: confirm, not refuse, a revoke with an incomplete key history`.

Intent: Let an account delegated to the allowlisted AmbireAccount7702 add and remove extra keys. Each change is a self-call
`setAddrPrivilege` (to = from = account) sent through the normal transaction approval with the internal origin. Adding a key
first passes a native `confirmSensitiveAction` that says the key gets full control. Added keys use privilege `0x…01`
(ambire-common `standardSigningOnlyPriv`); remove writes zero. Keys added in saf0o are stored in `main.ambireKeys[account][chainId]`
(default on read, no migration). Keys added by any wallet are discovered from the account's own
`LogPrivilegeChanged(address indexed addr, bytes32 priv)` logs (under EIP-7702 the account emits them): `eth_getLogs` over the
full range first; on any failure, a chunked scan from the newest block down (2,000-block chunks, at most 100). `getAmbireKeys`
returns `discovery: 'complete' | 'incomplete'` and marks each key `external` when saf0o did not add it; the dash labels those
"Added outside Saf0o" and warns on an incomplete history. The owner and the 4337 entry point are skipped, because
`AmbireAccount7702.privileges` hardcodes both. Live status comes from `privileges(addr)`. Because Ambire storage survives a
revoke, main refuses the revoke while any stored or discovered key reads nonzero, when queued and again on approval. An
incomplete history asks through the native dialog when the revoke is queued, rather than refusing: range-limited public RPCs
never return the full history, and revoking is itself protective. The dash offers one transaction that zeroes all active keys
(`executeBySender` for several). The revoke request warns that keys added by any wallet return if the account delegates to
the same contract again.

Files: `main/eip7702/keys.ts`, `app/dash/Accounts/AmbireKeys.js` (new); `main/rpc/index.js`, `main/ipc/rpcSchemas.ts`,
`resources/bridge/roles.ts`, `main/store/{state/index.ts,actions/index.js}`, `app/dash/Accounts/DelegationRevocation.js`,
`app/dash/index.styl`, `app/tray/Account/Requests/Eip7702RevokeRequest/index.js`, `scripts/qualification/ui/{policy,state-fixture}.cjs`,
and their tests.

Rebase notes: In `main/rpc/index.js` the token-approval revocation deps moved into a shared `internalTransactions` object
(same body and indentation), which `AmbireKeys` reuses. `requestEip7702Revocation` runs `ambireKeys.assertRevocable(…, 'confirm')`
first; the `eip7702Revoke` branch of `approveRequest` is async and runs `assertRevocable(…, 'allow')` before
`accounts.approveEip7702Revocation`. RPC schemas sit in a separate `ambireKeyRpcSchemas` block (the `getAmbireKeys` result
carries `discovery` and per-key `external`); roles in a separate dash-only `ambireKeyRpcMethods` set. `main/accounts/index.ts`
is untouched.

Upstream-PR candidate: no.

## 30. EIP-7702 batching follow-ups

Commits: `saf0o: open the signer panel before a wallet-call batch signs`, `saf0o: record token approvals inside atomic
batches`, `saf0o: price the EIP-7702 upgrade's OP-stack L1 fee as type 4`.

Intent: Three fixes to entries 27-29. Wallet-call approval now runs `signerCompatibility` first, like transactions do, so
a locked signer opens its panel instead of failing the batch. Approval observation records each inner call of an atomic
batch under the wrapper's hash (`submittedApprovalTransactions`). On OP-stack chains the upgrade batch is priced as the
type-4 transaction it signs: `estimateL1GasCost` takes an `authorizationDelegate` and adds one authorization with an
incompressible placeholder signature, so the GasPriceOracle (Fjord FastLZ) sees the real size.

Files: `app/tray/Footer/index.js`, `main/provider/{index,walletCallAtomic}.ts`, `main/chains/optimism.ts`, and their tests.

Rebase notes: `Footer.approve` gates only `walletCalls` requests. `walletCallsL1Fees` takes the atomic mode as a third
argument; only the preflight call passes it.

Upstream-PR candidate: the signer check and the L1 fee change, no; they depend on the batching patches.

## 31. EIP-7702 batching security fixes

Commits: `saf0o: reject wallet_sendCalls calls to the sending account`, `saf0o: reject app self-calls with data in
eth_sendTransaction`, `saf0o: recheck inner call code before signing an atomic batch`, `saf0o: run zero-address calls outside
the atomic wrapper`, `saf0o: name the app and limit the account upgrade dialog`.

Intent: AmbireAccount7702 `setAddrPrivilege` only requires msg.sender == the account, and any call from the account to itself
meets that. A dapp could plant a full-control key through an inner call to the account in `wallet_sendCalls`, or through a plain
`eth_sendTransaction` to self, and nested self-calls (`executeBySelf`, `executeBySender`, `tryCatch`) hide calls from review.
`wallet_sendCalls` now answers -32602 for any call to the sending account in both modes, and the atomic wrapper encoder checks
again. `eth_sendTransaction` answers -32602 for an app transaction to `from` with non-empty data, for every account; only the
internal origin is exempt, because entry 29's key changes and revoke-clear use it. Atomic signing rechecks the sender and every
inner target against the evidence reviewed over the inner calls, in delegated mode (before, every batch whose call 0 did not
target the account aborted with "Delegation changed") and in upgrade mode (before, nothing was rechecked). A zero-address call
is not wrappable, because `executeBatch` skips it: 5760 when atomicity is required, else sequential. The upgrade dialog names
the app, allows one open dialog per origin (a concurrent request counts as declined), and rechecks the origin's account
permission after the dialog.

Files: `main/provider/{walletCalls,walletCallAtomic,index}.ts`, `main/accounts/Account/index.ts`, and their tests.

Rebase notes: `assertNoSelfCalls` runs in `sendWalletCalls` and in the atomic branch of `walletCallsExecutionCalls` only; the
sequential branch stays open for managed sweep's native leg. The `eth_sendTransaction` guard sits just before `fillTransaction`,
after the managed-origin checks; it exempts only `originIdForName(SAF0O_INTERNAL_ORIGIN)`. `Account.signTransaction` branches on
`reviewed.atomicCalls`; the upgrade recheck sits in the provider's `signTransactionForAccount` override. New provider state:
`pendingUpgradeOrigins`. The wallet-call boundary fixture in `test/main/provider/index.test.js` targets `0x5555…`, not the account.

Upstream-PR candidate: no.

## 32. EIP-7702 on Trezor

Commits: `saf0o: sign EIP-7702 delegations with Trezor`, `saf0o: allow Trezor network definitions host`, `saf0o: revoke
EIP-7702 delegation from a Trezor account`, `saf0o: upgrade a Trezor account to Ambire from the dash`.

Intent: Trezor firmware 2.12.5+ signs a self-sent type-4 tx with empty data, zero value and one authorization. The Trezor
signer gains `signEip7702Revoke` and `signEip7702Authorization` and re-inspects the returned tx. The revoke flow accepts a
ready Trezor. The dash offers Upgrade to smart account for a codeless Trezor account on chains where the firmware whitelists
Ambire (1, 100, 8453, 42161); the request reuses the `eip7702Revoke` flow with a `delegate` field. `hasSoftwareSigner` stays
Ring/Seed only, so `wallet_sendCalls` keeps codeless Trezor accounts unsupported. The egress guard allows `data.trezor.io`
so Connect can fetch signed network definitions (Gnosis is not built in). Privacy cost: Connect also fetches `token-<to>.dat`
for every Trezor transaction with data. Drop that commit to keep destinations private; Gnosis then fails.

Files: `main/signers/trezor/{eip7702,bridge}.ts`, `main/signers/trezor/Trezor/index.ts`, `main/eip7702/{upgrade,revoke,delegates}.ts`,
`main/accounts/{index,types}.ts`, `main/egress/index.ts`, `main/rpc/index.js`, `main/ipc/rpcSchemas.ts`,
`main/operationLifecycle/{projection,reconciler}.ts`, `main/activity/index.ts`, `main/store/state/types/{activity,operationLifecycle}.ts`,
`resources/bridge/roles.ts`, `app/dash/Accounts/DelegationRevocation.js`, `app/tray/Account/{Account.js,Activity/index.js,Requests/index.js,Requests/Eip7702RevokeRequest/index.js}`,
`app/tray/Footer/index.js`, and their tests.

Rebase notes: `getEip7702UpgradeEligibility` and `requestEip7702Upgrade` sit in the `ambireKeyRpcMethods` set (dash only).
The Trezor Ambire chain list sits next to the delegate allowlist in `main/eip7702/delegates.ts`.

Upstream-PR candidate: the Trezor revoke, yes; the rest depends on the batching patches.

## 33. EIP-7702 batching on more chains, EIP-1559 fees on Arbitrum

Commit: `saf0o: enable EIP-7702 batching on every verified chain`.

Intent: upstream kept Arbitrum (42161) on legacy fees because it charges no priority fee. Its txs were then type 0, so the
Ambire upgrade (type 4, which needs EIP-1559 fees) failed before signing. Arbitrum now samples fee history like other
chains. The delegate allowlist adds Polygon (137), Monad (143), Robinhood Chain (4663) and Base Sepolia (84532). On
2026-11-27, `eth_getCode` showed the pinned Ambire code hash on each. A type-4 tx from an unfunded key got "insufficient
funds" on 143, 4663, 84532 and 42161, so those nodes parse type 4. The Polygon type-4 probe hit DNS failures in the
sandbox; Polygon enabled EIP-7702 in its Bhilai hardfork. Fantom (250) rejects type 4 and stays legacy. Sepolia stays off
because it was not probed.

Files: `main/chains/policy.ts`, `main/eip7702/delegates.ts`, and their tests.

Rebase notes: if upstream edits `LEGACY_FEE_CHAIN_IDS`, keep 42161 out of it.

Upstream-PR candidate: the Arbitrum fee change, yes.

## 34. ETH received in the batch preview

Commit: `saf0o: show ETH moves in the wallet-call batch preview`.

Intent: a batch swap that pays out native ETH (the router unwraps WETH) showed only the token sent. The batch
`eth_simulateV1` now sets `traceTransfers: true`. The node reports ETH moves as Transfer logs from the ERC-7528 address
`0xeeee…eeee`. `parseSimulatedCall` moves these logs into `nativeTransfers`, keeping them out of token effects.
`balancePreview` nets them for the account. A batch without traced moves still falls back to the call values. An RPC that
answers -32602 gets one retry without the field. Probed 2026-11-27: publicnode Ethereum, OP, BSC, Gnosis, Base, Arbitrum
and Robinhood trace ETH moves; rpc.monad.xyz has no `eth_simulateV1`.

Files: `main/transaction/{simulation,balancePreview}.ts`, and their tests.

Upstream-PR candidate: yes, depends on the wallet-call batch preview.

## 35. Action cards in the wallet-call batch review

Commit: `saf0o: show recognized actions per call in the batch review`.

Intent: batch calls showed the View data blocks inline (a 78-digit approval amount, hex boxes). `revealWalletCallDetails`
now also runs `reveal.recog` per call into `req.callActions`, under the same staleness check as `callDetails`. The batch
review renders each action with the single-tx `TxAction` card, read-only, because editing an approval would change reviewed
calldata. The raw allowance and token-effect blocks move under the call's Details.

Files: `main/accounts/{types,Account/index}.ts`, `app/tray/Account/Requests/WalletCallsRequest/index.js`, and their tests.

Upstream-PR candidate: yes.

## 36. Account upgrade inside the batch review

Commit: `saf0o: ask for the Ambire upgrade inside the batch review`.

Intent: the upgrade asked through a native OS dialog before the review, which the owner found out of place. This patch is
an owner-approved exception to the AGENTS.md rule that rare actions use the native dialog.

- A ready account's batch is admitted as `atomic: 'upgrade'` without asking.
- The review adds a managed approval `approveAccountUpgrade` naming the delegate address. Claim refuses until it is accepted.
- An app that sets `atomicRequired: false` also gets "Run as separate transactions instead" (`runWalletCallsSeparately`).
  The provider switches the ledger record to `atomic: false` with one transaction per call, which works only before any
  transaction is reserved. The Account then drops the approval and re-prepares and re-simulates without the delegation
  override. Claim evidence binds the prepared transactions, so a stale screen cannot approve the other mode.
- `ReviewAcknowledgements` lists the upgrade approval first, next to the upgrade notice; risk approvals follow.
- A declined review answers 4001; the dialog-era 5750 is gone. `pendingUpgradeOrigins` is removed with the dialog.

Files: `main/provider/{index,walletCallAtomic,walletCallBatches}.ts`, `main/accounts/{index,Account/index}.ts`,
`main/rpc/index.js`, `main/ipc/rpcSchemas.ts`, `resources/constants/index.ts`,
`app/tray/Account/Requests/WalletCallsRequest/index.js`, and their tests.

Rebase notes: `ApprovalType.AccountUpgrade` extends the upstream enum and the RPC schema enum.

Upstream-PR candidate: no, it depends on the Ambire patches.

## 37. Per-call balance changes in the batch review

Commit: `saf0o: show each batch call its own balance changes`.

Intent: a swap call inside a batch showed no token or $ rows of its own; only the batch total did. `syncBalancePreview`
now also nets each call (its token effects and traced ETH moves) into `balancePreview.calls`, priced with the same DefiLlama
quotes. It prices every asset any call moves, including a token that nets to zero over the batch. `BalancePreview` gains a
`compact` mode (rows only, group label "Call balance changes"), rendered under each call.

Files: `main/transaction/balancePreview.ts`, `resources/Components/BalancePreview/index.jsx`,
`app/tray/Account/Requests/WalletCallsRequest/index.js`, and their tests.

Layout follow-up (`saf0o: tighten the batch call rows`): the call row is one column, with the call number inline before
the name. Before, a 42px number column and an unused 142px column squeezed the body and wrapped "Details ›". The method name
(`approve`, `swap`) is a chip, apart from the word "call".

Upstream-PR candidate: yes, with the batch preview.
