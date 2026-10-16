# Breeze

Two related cleanup tools in one repo.

## [`breeze-cleaner/`](breeze-cleaner/) — macOS desktop cleaner

An original, clean-room macOS disk-cleanup app (Electron). Scans junk, large
files, duplicates, privacy traces, unused apps and photo clutter, and moves what
you pick to the **Trash** (reversible — never a permanent delete). Includes a
menu-bar monitor (memory, CPU, network, battery, Trash size) and one-tap junk
cleanup. Packaged as a signed `.dmg` for Apple Silicon.

## [`breeze-fleet/`](breeze-fleet/) — staging-database cleanup fleet

A server/agent system for reclaiming space from stale **PostgreSQL staging
databases** across many hosts. Agents report cleanup candidates on an interval; a
human reviews the fleet and approves individual cleanups in a **Microsoft Entra
SSO** dashboard; agents then execute — **dry-run by default**, behind a
staging-only safety gate. Nothing is deleted without an explicit per-database
human approval.

See each subfolder's `README.md` for setup.
