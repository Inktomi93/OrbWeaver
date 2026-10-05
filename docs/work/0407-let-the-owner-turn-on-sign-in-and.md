---
kind: work
status: open
updated: 2026-10-05
priority: P3
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

Owner ruling: env stays a working source of truth; Settings is added beside it, never replaces it. Define precedence explicitly (env pins win, or Settings overrides, decided against Spine-Config-and-Serialization.md) and show the source in the UI.

Owner ruling (refines the one above): changing the setting writes the env, not a separate settings store. There is no env file watcher today; the mechanism is: Settings writes the keys to an env file in the data volume (persistent in Docker, where compose env_file is only read at container start), boot loads it (foundation/env/index.ts already parses .env with node:util parseEnv), and the existing owner restart (admin.restart, supervisor respawn) applies it. Define the precedence between process env from compose, the data-volume env file and .env against Spine-Config-and-Serialization.md so a Settings change is not silently shadowed by a compose default; show where each value comes from in the UI.

Platform scope: one mechanism on every platform. Settings writes an env file under DATA_DIR (persistent and writable on Docker and on bare metal Linux, macOS and Windows), never the hand-edited .env. Bare metal already respawns from a re-read env on RESTART_EXIT_CODE (tooling/src/stack/ops/start.ts:14, lib/supervisor.ts); Docker gets the same through the server boot load. Atomic write by temp file plus rename with a short retry for Windows file locks; 0600 where the OS supports it, skipped on Windows; CRLF-safe. Tests cover the write, the precedence and a restart re-read on each layout.

Owner ruling (supersedes the env-writing scope above for launch): the full Settings-writes-env flow is post-launch because of the lockout risk, live session invalidation during sharing, and precedence against compose defaults; it needs a preflight (password or issuer exists), a rollback path and a way back in. Pre-launch ships the read-only helper instead, tracked as its own item.
