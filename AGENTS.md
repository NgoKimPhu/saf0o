# AGENTS.md: saf0o desktop

saf0o is a personal fork of the Electron wallet jorphex/wren, rebranded throughout. The browser extension lives in a separate
repo, `saf0o-companion` (see its AGENTS.md). Read `PATCHES.md` before you change anything that upstream also owns.

## Layout

- `main/`: Electron main process (TypeScript). It holds the store (`main/store`), signers, IPC, windows (`main/windows`) and
  the provider (`main/provider`).
- `app/`: renderers, one per window: `tray` (wallet panel), `dash`, `dapp`, `onboard`. Parcel bundles each into `bundle/`.
- `resources/`: code shared by the renderers.
  - `resources/bridge`: the renderer↔main bridge. `roles.ts` allowlists which channels each renderer role may send. A new
    IPC call from a renderer needs an entry there.
  - `resources/domain`: pure logic.
  - `resources/Components`, `resources/Hooks`: shared React code.
- `test/` mirrors the source tree. `compiled/`, `bundle/` and `dist/` are build output.

## Fork model

- `upstream` = pristine upstream. `main` = upstream plus a stack of commits with the subject prefix `saf0o:`.
- git rerere is on. `PATCHES.md` lists every patch and the rebase rules.
- The rebrand is generated: `node scripts/rebrand-saf0o.mjs` rewrites the upstream name, in all three casings, to
  saf0o/Saf0o/SAF0O in contents and paths, then runs prettier on the touched files.
  - On an upstream rebase: drop the generated commit, rebase, re-run the script, then re-apply the fallout commit. Never
    hand-merge the rename.
  - The script leaves its `KEEP` strings verbatim (upstream credit, third-party token names, upstream store URLs). It also
    skips the files matched by `SKIP_FILE`.
  - In new tracked files, write the upstream name only as `jorphex/wren`. The script rewrites any other occurrence.
- Protocol strings carry the brand. Change them in lockstep with the companion:
  - The auth domains `saf0o-companion-auth-v3\0` and `saf0o-native-request-v3\0`.
  - The shared fixture `test/fixtures/peerAuth/v3-transcript.json`, kept byte-identical to the companion's copy.
  - Origin UUIDv5 ids, which are derived from the name.

## Toolchain

- Node 24.18.1. pnpm 10.23 with `node-linker=hoisted` and `ignore-scripts`. Electron 45.
- Dependency changes need the owner's approval, and every new package gets scanned before install. Never run
  `pnpm add` or `pnpm install` on your own.
- In a worktree, symlink `node_modules` to the main checkout. Never commit the symlink.
- `main/` is also a directory, so `git log main` is ambiguous. Write `git log refs/heads/main --` or `main --`.

## Build and test

| What                                                              | Command                                                                                                                                                              |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Compile `main/` to `compiled/`                                    | `pnpm run compile`                                                                                                                                                   |
| Renderer bundles (Parcel) plus verification                       | `pnpm run bundle`                                                                                                                                                    |
| Main-process jest                                                 | `node --experimental-vm-modules ./node_modules/jest/bin/jest.js --runInBand --env=node <paths>`                                                                      |
| Renderer jest (`test/app`, `test/resources/{Components,Hooks}`)   | the same, with `--env=jsdom --testTimeout=1500`                                                                                                                      |
| Resources jest                                                    | `--env=node --roots=test/resources --testPathIgnorePatterns /Components/ /Hooks/`                                                                                    |
| Script tests                                                      | `node --test test/scripts/*.mjs`. Node 24 rejects a directory argument, so pass globs.                                                                               |
| Lint and format                                                   | `node_modules/.bin/eslint <files>`, `node_modules/.bin/prettier --check <files>`                                                                                     |
| Windows build, unpacked, from any host                            | `pnpm run package:windows:dir:x64`                                                                                                                                   |
| Main-process bundle (Parcel, `compiled/main` → `compiled-bundle`) | `pnpm run bundle:main`. Only Windows packaging uses it. Externals and path-loaded entries: `scripts/bundle-main.mjs`, guarded by `test/scripts/main-bundle.test.mjs` |

- App icons: replace `asset/brand/saf0o-app-icon-master.png`, then run `pnpm run brand:generate` (it needs Electron). In the sandbox the
  brand sheet and X header render blank, so `git restore` those two files.
- Companion icons: `node scripts/generate-companion-icons.mjs <companion checkout>` after the master changes.
- Main-process tests write under `$HOME`. Set `HOME` to a scratch directory in a sandbox.
- With no Electron binary or no network, a few `test/main` suites fail for environment reasons only: `worker`,
  `trezor/bridge` (also flaky under load; passes alone), `dapps/cache`, `contractVerification/artifactIntake`,
  `windows/glideSentinel`.
- Any other failing suite is real. `ipc/inventory`, `ipc/schemas`, `provider/index` and `signers/hot/*` were once written
  off as noise. All were real regressions: the transparency slider shipped broken, and ring-signer unlock failed, so
  imported keys were never saved.
- Before you write off a suite, read its failure message. A failure in a listed suite can still be real.
- Tests that touch `document` under `test/resources` (outside `Components/` and `Hooks/`) need a
  `/** @jest-environment jsdom */` docblock, because that suite runs with `--env=node`.
- `scripts/prepare-package.mjs` records a build identity and requires a clean tree. Commit first, then package.
- Offline packaging needs `COREPACK_HOME` pointing at a populated corepack cache. Append
  `-c.electronDist=<dir holding electron-v45.3.3-win32-x64.zip>` to the Windows script. Do not put `--` before it: pnpm 10
  passes the `--` through, electron-builder then ignores the flag and tries to download Electron.
- The Windows dir build sets `signAndEditExecutable=false`. The result is unsigned and keeps the default Electron icon.
  It needs no Wine. `-c.win.signExecutable=false` (resource editing, so the exe icon) fails offline: electron-builder downloads rcedit
  from github.com.
- The local install sets the exe icon afterwards instead: `~/.cache/saf0o-check/install-win.sh` runs a pinned
  `rcedit-x64.exe` v2.0.0 (electron/rcedit, sha256-checked) natively through WSL interop on an `.ico` built from
  `build/icons/icon.png`.

## Quirks that bit earlier sessions

- **Bundler-only bugs:** jest resolves packages differently from Parcel. hotkeys-js 4 has a `browser` field pointing at
  an export-less global build. Parcel picked it and broke the shortcut editor at runtime, while jest stayed green. The fix
  is the `alias` block in `package.json`. Cover such bugs with a Parcel-level test, as `test/scripts/hotkeys-bundle.test.mjs`
  does.
- **Electron 45 APIs:** `clipboard.readText()` returns a Promise. Check `node_modules/electron/electron.d.ts` rather than
  memory or a stale worktree.
- **Renderer crashes:** `RecoveryBoundary` wraps the tray and dash roots and offers "Reload UI". The tray menu has "Reload
  UI" too. It reloads renderers only, so the unlock state survives because it lives in main. Errors log only a category,
  on purpose: messages can carry account data.
- **Store defaults:** new settings get their default on read (see `interfaceScale`, `windowTransparency`), so they need no
  migration. Changing an existing default does not touch stored profiles unless you add a migration.
- **Panel width:** set in two places, `shellMainTargetWidth` in `main/windows/shellGeometry.ts` and `shellWidth` in
  `app/tray/index.styl`. A test fails if they differ.
- **Global shortcut:** `main/keyboardShortcuts` only logs a failed registration. The user gets no warning.
- **Extension origins:** the Chromium companion id is pinned through the manifest `key` and listed in
  `main/api/extensionIds.ts`. Firefox ids differ per install, so any `moz-extension://` origin is accepted and pairing is
  the trust step.
- **OS signer protection:** needs a keyring (libsecret or kwallet on Linux, DPAPI on Windows). WSL has none, so it is
  unavailable there.
- **Ledger:** needs the node-hid native binding, which this install does not build.
- **Prettier:** the longer brand name pushes lines past the print width. Run prettier on anything the rebrand touches.

## Conventions

- One topic per commit, subject prefix `saf0o: `. Each commit carries a test that fails without the change and encodes why.
- Keep diffs surgical. Prefer new files or data entries over edits to upstream logic, because they rebase more easily.
- Push only `main`, and only with the owner's approval. Never push `upstream` or other branches.
- Local builds for the owner replace the previous one in place: the unpacked Windows app goes to `%USERPROFILE%\Saf0o`,
  and the companion `.xpi` sits in the same folder. Re-copy the `.xpi` after you replace the folder.
  Keep an old build only when asked. Windows locks a running exe, so the app must be closed before the copy.
  - From WSL, check with `/mnt/c/Windows/System32/tasklist.exe`. `tasklist.exe` is not on the WSL PATH, and a check that
    hides errors always reports "not running".
  - Copy into a staging folder first, then swap. A plain `rm -rf` of the old folder while the app runs deletes the unlocked
    files and leaves a broken install.
- Destructive or rare user actions (disable signer protection, profile restore) go through the native confirmation in
  `main/windows/dialog`.
