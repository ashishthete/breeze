# Breeze Cleaner

A real, working macOS disk-cleanup app built with Electron. It scans the live
filesystem and reclaims space by moving junk to the Trash — never by deleting
permanently.

This is an original, clean-room app. It is inspired by the general category of
Mac cleaners but contains none of any other product's code, assets, or branding.

## Run it

```bash
cd breeze-cleaner
npm install      # downloads Electron (~100 MB) the first time
npm start
```

macOS may ask once for permission to read Downloads/Desktop and to control
System Events (to list login items). Grant it and the scans fill in.

## What it does

- **Overview** — live disk donut from `df`, a Smart Scan that runs every module.
- **System Junk** — user caches, logs, and developer leftovers (Xcode
  DerivedData, npm/pnpm caches, etc.).
- **Large & Old Files** — big files in Downloads, Desktop, and Movies.
- **Duplicate Finder** — byte-identical copies, verified by content hash (SHA-1
  of the file head), grouped so one original is always kept.
- **Privacy** — browser caches that rebuild on next launch.
- **Photo Manager** — finds screenshots (via Spotlight), byte-identical
  duplicate photos (content-hash verified), and visually similar photos
  (perceptual hashing) in Pictures, Desktop, Downloads, and Documents, with
  thumbnails. The managed Photos library is never scanned or touched. Only
  screenshots and exact duplicates are pre-selected; similar photos are a
  suggestion you choose from.
- **App Uninstaller** — removes an app plus its support/cache/preference/
  container leftovers.
  Apps are sorted longest-unused first, each tagged with how long since it was
  last opened (from Spotlight), with an "Unused only" filter to focus on the
  apps you have stopped using.
- **Menu-bar monitor** — a broom icon lives in the menu bar; click it for a
  live popover showing memory, CPU, network up/down and battery, plus a one-tap
  junk scan-and-clean. It is read-only telemetry (aggregate OS counters only)
  except the junk clean, which uses the same Trash-only safety path. The app
  keeps running in the menu bar after you close the main window.
- **Startup Items** and **Memory** — read-only in this version (they report
  real data from launch agents / login items and `vm_stat`).

## Safety model

Cleaning is the only destructive path, and it is deliberately boxed in:

1. **Trash, not delete.** Every removal uses Electron's `shell.trashItem`, so
   items go to the macOS Trash and can be restored with Put Back. Nothing is
   erased.
2. **Allowlist gate.** The main process keeps the authoritative id→path map.
   The renderer only ever passes opaque ids, never paths. Before trashing,
   every path must pass `assertCleanable` (or `assertUninstallable` for the
   uninstaller): it must sit strictly inside a known cleanable root, must exist,
   must not be a symlink, and must not be a protected name (`.ssh`, `.gnupg`,
   Keychains, `.git`) or a core Apple app.
3. **Dry run.** Toggle "Dry run" to preview exactly what would be trashed and
   how much it frees, without touching anything.
4. **Hardened renderer.** `contextIsolation: true`, `nodeIntegration: false`,
   `sandbox: true`. The UI has no filesystem access; it talks to the main
   process over a small, named IPC surface defined in `preload.js`.

## Build a distributable

```bash
npm run dist     # builds release/Breeze Cleaner-<version>-arm64.dmg (+ .zip)
npm run pack     # unpacked .app only, into release/mac-arm64/ (faster)
```

The build is **unsigned** (no Developer ID on this machine). macOS Gatekeeper
will warn on first open. To run it: right-click the app and choose **Open**, or
clear the quarantine flag:

```bash
xattr -cr "/Applications/Breeze Cleaner.app"
```

To ship it properly, add an Apple Developer ID and set `mac.identity` in
`package.json`, then notarize. The build already targets `arm64`; add an `x64`
or `universal` entry under `mac.target` for Intel Macs.

Perceptual similar-photo matching uses ImageMagick (`magick`). The app resolves
it from Homebrew/MacPorts locations at runtime; if it is not installed, the
Photo Manager still finds screenshots and exact duplicates and just skips the
"similar" suggestions.

## Permissions (grant once, not every run)

macOS stores folder and automation permissions in its privacy database (TCC),
keyed to the app's **code signature**. An unsigned app has no stable identity,
so macOS re-prompts. Breeze is ad-hoc signed with a fixed identifier
(`com.breeze.cleaner`) — done automatically on every build by
`build/afterPack.js` — so you grant Downloads/Desktop/Documents and login-item
access once and macOS remembers it across launches.

No app can skip that first prompt; that is a macOS security boundary.

The ad-hoc signature is stable for a given build, but its hash changes when you
rebuild, so a fresh build prompts once more. For permissions that survive
rebuilds too, sign with a self-signed certificate you reuse:

```bash
# one time: create a self-signed code-signing cert named "Breeze Dev" in Keychain
# then sign each build with it instead of ad-hoc:
codesign --force --deep --sign "Breeze Dev" --identifier com.breeze.cleaner \
  "/Applications/Breeze Cleaner.app"
```

If macOS still re-prompts after a reinstall, reset Breeze's entries with
`tccutil reset All com.breeze.cleaner` and grant again.

## Layout

```
main.js            Electron main process + the single clean (trash) handler + thumbnails
preload.js         contextBridge: the only API the UI can call
lib/safety.js      allowlist roots and the assertCleanable / assertUninstallable / assertPhotoRemovable gates
lib/scanner.js     all real filesystem scanning + the id→path registry
lib/stats.js       live read-only system telemetry for the menu-bar widget
renderer/          index.html + renderer.js (main UI), tray.html + tray.js (menu-bar popover)
build/icon.icns    app icon
release/           built .dmg / .zip / .app (after npm run dist)
```
