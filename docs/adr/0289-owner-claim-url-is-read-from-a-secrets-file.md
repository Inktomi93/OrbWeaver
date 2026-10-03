---
kind: adr
status: active
updated: 2026-10-03
---

# The owner claim URL is read from a secrets file, never the log

## Context

Operators paste the container log into public bug reports. D258 delivers the boot owner claim code through that log: while the owner is unclaimed, every `oidc` boot logs the claim URL. Anyone who reads a pasted log before the owner signs in can claim the box. The `local` first-boot password follows the rule this decision applies: it lives in `data/secrets/initial_password`, and the entrypoint banner names the command that reads it (`docker/entrypoint.sh`).

## Decision

While the owner is unclaimed, an `oidc` boot writes the claim URL to `<DATA_DIR>/secrets/owner_claim_url` and logs only the command that reads that file: `docker compose exec orbweaver cat <path>` in a container, `cat <path>` on bare metal. No log line carries the URL or the code. The file is owner-only, written through `writeSecretFile`, which renames a private temp file over the target and never writes through an existing entry. A boot that finds the owner claimed removes the file. The callback that spends the code removes it too, so the file holds only a live code.

The verifier, the state hold and the single spend stay as D258 rules them. Only the code's SHA-256 is held, in process memory, and a restart mints a fresh code and rewrites the file.

This decision supersedes only D258's delivery: the boot logs the claim URL, and a restart logs a fresh code. It also replaces D258's boot-log residual. Every other D258 ruling remains active.

Homes: `packages/server/src/entry/boot/owner-claim.ts`, `packages/server/src/infra/crypto/secret-file.ts` and `packages/server/src/foundation/env/container.ts`. Check: `tests/server/entry/boot/owner-claim.test.ts`.

## Consequences

Accepted residual: anyone who can read `data/secrets` while the owner is unclaimed can claim the box. That directory already holds `session_secret` and `credentials_key`, so the residual adds no new reader. The claim URL can still reach a proxy access log when the owner uses it, as D258 accepts. A code that a login spends without binding still needs a restart for a new file. A box moved from `oidc` to another mode keeps a stale file whose code no process holds.

## Alternatives rejected

- Keep the URL in the log: a pasted log hands an unclaimed box to its reader.
- Serve the URL from a loopback-only route: the plain code would stay in the heap, and a same-host proxy that sends no forwarding header makes every request look loopback (D258).
- Print the code only to an interactive terminal: a container has none.
