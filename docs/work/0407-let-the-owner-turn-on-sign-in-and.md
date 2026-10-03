---
kind: work
status: open
updated: 2026-10-02
priority: P2
area: auth
---

# Let the owner turn on sign-in and Start sharing from Settings without editing env

## What

Build an owner-only Settings action that enables sign-in and sharing without environment-file edits. First supersede the conflicting D255 auth-mode ruling and define persisted boot behavior for native and container installs.

## Why

The owner explicitly wants the sharing setup to remain in the app.

## Done when

Prove persisted mode selection and restart recovery under the native launcher and a disposable container volume. Preserve password and seating confirmation, and refuse OIDC and forwarded-header modes. Require independent security and rendered review.

## Evidence

Delegated source audit: `/tmp/claude-launch-punchlist/items.json`, proposal `19 + ruling: Start sharing reachable from Settings without env edits`. The report contains exact source paths, coupled tests and independent skeptic findings. Runtime and implementation acceptance remain required.

Owner ruling (2026-10-03): env stays a working source of truth; Settings is added beside it, never replaces it. Define precedence explicitly (env pins win, or Settings overrides, decided against Spine-Config-and-Serialization.md) and show the source in the UI.

Owner ruling (2026-10-03, refines the one above): changing the setting writes the env, not a separate settings store. There is no env file watcher today; the mechanism is: Settings writes the keys to an env file in the data volume (persistent in Docker, where compose env_file is only read at container start), boot loads it (foundation/env/index.ts already parses .env with node:util parseEnv), and the existing owner restart (admin.restart, supervisor respawn) applies it. Define the precedence between process env from compose, the data-volume env file and .env against Spine-Config-and-Serialization.md so a Settings change is not silently shadowed by a compose default; show where each value comes from in the UI.
