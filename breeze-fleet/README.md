# Breeze Fleet

Fleet-wide cleanup of stale **PostgreSQL staging databases**. Agents run on your
database hosts, scan on an interval, and **report** cleanup candidates to a
central hub. An operator reviews the fleet in a **token-protected** dashboard and
**approves** individual cleanups; only then does the agent execute — **dry-run by
default**, with staging-only guardrails.

Nothing is deleted automatically. Every destructive action requires an explicit,
per-database human approval recorded on the hub.

```
 ┌────────────┐   report inventory    ┌──────────┐   approve (token) ┌──────────┐
 │  agent     │ ───────────────────▶  │   hub    │ ◀───────────────  │ operator │
 │ (db host)  │ ◀─── approved action ─│ dashboard│                   │ browser  │
 │  psql      │ ──── result ────────▶ │  + store │                   └──────────┘
 └────────────┘                       └──────────┘
```

## What it cleans

- **Drop stale staging databases** — databases whose names match your staging
  patterns, that have no live connections, and whose transaction counters have
  not moved for `idleDays`.
- **Reclaim space** — run `VACUUM (ANALYZE)` on a staging database (non-destructive).

## Safety model

Dropping a database is irreversible. A drop requires **all** of these, re-checked
on the agent at execution time (`lib/dbsafety.js`):

1. the host is configured `env: "staging"`;
2. the database name matches an **allow** pattern and no **protect** pattern, and
   is a plain identifier (so it can be safely quoted) — `postgres`, `template0/1`
   and `rdsadmin` are always protected;
3. the database has **no active backends**;
4. an operator approved that specific database on the hub; and
5. the approval says `apply` **and** the agent was started with apply enabled.

Absent any of these it is a no-op (or a dry-run that only prints the SQL).

## Requirements

- Node.js ≥ 18 (no npm dependencies).
- `psql` on each agent host, with a role that can read `pg_database` /
  `pg_stat_*` and (for execution) `DROP DATABASE` / `VACUUM`.

## Run the hub

```bash
npm run hub            # prints the dashboard URL with ?token=…
```

Optionally set `BREEZE_TOKEN`, `BREEZE_HUB_BIND` and `BREEZE_HUB_PORT` first
(see `.env.example`):

```bash
cp .env.example .env
set -a; . ./.env; set +a
npm run hub
```

The hub stores state in `~/.breeze-fleet/`, auto-generates a shared token (unless
`BREEZE_TOKEN` is set), and prints it. Agents authenticate with that token, and
operators open the dashboard at `/?token=<token>`. The hub binds to `127.0.0.1`
by default — keep it on a trusted network or VPN, or front it with a reverse
proxy that adds your own authentication.

## Run an agent (on each DB host)

```bash
cp agent.config.example.json agent.config.json   # edit pg + policy + token
node agent/agent.js --config agent.config.json            # dry-run, reports only
node agent/agent.js --config agent.config.json --apply    # allow approved executions
node agent/agent.js --config agent.config.json --once     # single cycle (cron-friendly)
```

`apply` can also come from `BREEZE_APPLY=1`. Postgres connection values may be set
in the config `pg` block or via standard `PG*` environment variables.

## CLI client

```bash
export BREEZE_HUB=http://127.0.0.1:47700 BREEZE_TOKEN=…   # shared hub token
node cli/breeze-fleet.js hosts
node cli/breeze-fleet.js candidates
node cli/breeze-fleet.js approve <hostId> <db> drop dry
node cli/breeze-fleet.js actions
```

## Reclaim space (VACUUM)

Every staging database has a **Vacuum** action in the dashboard (and `approve … vacuum`
in the CLI). It runs `VACUUM (ANALYZE)` — non-destructive, online — to reclaim bloat.
Like drop, it previews in dry mode and executes only when the agent runs with `--apply`.

## Run as a service

Templates are in `deploy/`:

- **Linux (systemd):** `deploy/breeze-fleet-agent.service`, `deploy/breeze-fleet-hub.service`
  — put hub secrets in `/etc/breeze-fleet/hub.env` (chmod 600), then
  `systemctl enable --now breeze-fleet-agent`.
- **macOS (launchd):** `deploy/com.breeze.fleet.agent.plist` →
  `/Library/LaunchDaemons/`, then `launchctl load -w …`.

Both default to report-only; add `--apply` to the agent's start command only when
approved actions should actually execute.

## Layout

```
lib/dbsafety.js     staging allow/protect gate (the only thing that authorizes a drop)
lib/pg.js           psql wrapper: inventory + validated DROP / VACUUM
lib/candidates.js   idle/candidate scoring from reported history
hub/hub.js          collector, approval workflow, dashboard server
hub/public/         browser dashboard
agent/agent.js      host agent: report + execute approved actions
cli/breeze-fleet.js CLI client for the hub
```
