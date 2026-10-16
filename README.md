# Breeze

A small family of **cleanup tools**, built clean-room from scratch. Two apps live
in this repo:

| App | Platform | What it cleans | How it stays safe |
|-----|----------|----------------|-------------------|
| [**breeze-cleaner**](breeze-cleaner/) | macOS desktop (Electron) | disk junk, large files, duplicates, privacy traces, unused apps, photo clutter | moves items to the **Trash** — reversible, never a permanent delete |
| [**breeze-fleet**](breeze-fleet/) | server / agent (Node) | stale **PostgreSQL staging databases** across many hosts | report-only by default; every drop needs an **explicit operator approval**, staging-only |

Both are dependency-light (the fleet has **zero** npm dependencies), and both are
built so the destructive path is the narrow, guarded exception — not the default.

---

## breeze-cleaner — macOS disk cleaner

A native-feeling menu-bar + window app that finds reclaimable space and lets you
clear it with one tap.

**Features**
- **Scanners:** junk/caches, large files, duplicate files (content-hashed),
  privacy traces, unused applications (sorted by how long since last used), and
  photo clutter (screenshots / near-duplicates).
- **Menu-bar monitor:** live **memory**, **CPU**, **network throughput**,
  **battery**, and **Trash size**, plus a one-tap junk clean.
- **Safe cleaning:** everything you remove goes to the macOS **Trash** and can be
  put back. The UI only ever passes opaque item ids; the main process re-verifies
  each path against an allowlist before trashing.
- Packaged as a signed `.dmg` / `.zip` for Apple Silicon.

**Run from source**
```bash
cd breeze-cleaner
npm install
npm start           # launch the app
npm run dist        # build a distributable .dmg + .zip (release/)
```

**Permissions:** macOS will ask once for access to folders it scans
(Desktop/Downloads/Documents) and for the Trash. The menu-bar Trash-size card
needs **Full Disk Access** (System Settings → Privacy & Security) to read
`~/.Trash`; without it, it safely shows 0.

> Layout, build details and the permissions model are documented in
> [`breeze-cleaner/README.md`](breeze-cleaner/README.md).

---

## breeze-fleet — staging-database cleanup fleet

Reclaims space from stale Postgres staging databases across a fleet, without ever
deleting anything on its own.

```
 ┌────────────┐   report inventory    ┌──────────┐   approve (token)   ┌──────────┐
 │   agent    │ ───────────────────▶  │   hub    │ ◀─────────────────  │ operator │
 │ (db host)  │ ◀── approved action ──│ dashboard│                     │ browser  │
 │   psql     │ ──── result ────────▶ │  + store │                     └──────────┘
 └────────────┘                       └──────────┘
```

**How it works**
1. An **agent** on each DB host inventories Postgres on an interval and reports
   cleanup **candidates** (idle staging databases, and space to reclaim).
2. An operator reviews the whole fleet in the **token-protected hub dashboard**
   and **approves** individual cleanups.
3. The agent executes approved actions — **dry-run by default**, real only when
   the agent runs with `--apply`.

**Safety model** (a drop requires *all* of these, re-checked at execution):
host is `env: "staging"` · name matches a staging allow pattern and no protect
pattern · it's a plain identifier · **no live connections** · an operator approved
*that* database · the approval says `apply` **and** the agent is in `--apply`.
`postgres`, `template0/1` and `rdsadmin` are always protected.

**Quick start**
```bash
cd breeze-fleet
npm run hub                                   # prints a dashboard URL with ?token=…
cp agent.config.example.json agent.config.json  # set pg + policy + the hub token
node agent/agent.js --config agent.config.json   # reports candidates (dry-run)
```
Open the dashboard with the printed `?token=…`, review candidates, approve a
cleanup. Add `--apply` to the agent only when you want approved drops/vacuums to
actually run. The hub binds to `127.0.0.1` by default — keep it on a trusted
network or VPN, or front it with a reverse proxy that adds your own auth.

**Run as a service:** launchd + systemd templates are in
[`breeze-fleet/deploy/`](breeze-fleet/deploy/).

> Full setup, CLI, and the per-file layout are in
> [`breeze-fleet/README.md`](breeze-fleet/README.md).

---

## Repo layout

```
breeze/
├── breeze-cleaner/   macOS Electron disk cleaner (Trash-only)
└── breeze-fleet/     Postgres staging-DB cleanup fleet (agent + token-protected hub + CLI)
```

## Development notes

- **breeze-cleaner** needs Node + npm (Electron is installed via `npm install`);
  builds are ad-hoc signed (no paid signing identity required).
- **breeze-fleet** runs on plain Node ≥ 18 with no npm install; each agent host
  needs the `psql` client.

## License

MIT.
