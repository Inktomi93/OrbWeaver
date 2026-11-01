---
kind: tooling
status: open
updated: 2026-10-31
priority: P3
area: tooling
---

# A deletion branch fails when a removed contract key still has literal hits in the client, plugins or e2e

## What

The change, in a sentence.

## Why

The symptom or the ruling behind it.

## Done when

The observable bar a verifier can check.

## Evidence

Sweep of the landed deletions that this check automates, run before the check exists:

- Scope: every removed `key:` line in the merges that deleted contract keys (items 1426, 1498, 1502, 0501, 1520, 1567 to 1584), plus the unmerged branch that deleted the wire keys of items 1556, 1572 and 1699, and every removed non-comment line under `packages/server/src/transport` and `packages/contracts`.
- Method: a literal `rg -w` per key across `packages/client`, `packages/showcase-plugins`, `packages/plugin-sdk`, `tests/e2e`, `tests/client`, `packages/server`, `scripts` and `tooling`. Common names (`size`, `model`, `text`, `kind`, `query`) were narrowed by reading the procedure, not by count.
- Result: no router input schema lost a key. Every removed output key and task-enum member has no live reader or sender. The `agent` provider task left the enum, and stored rows and manifests still parse through `storedProviderDefSchema` and `storedPluginManifestSchema`. No restore was needed.
- Not read per reader: server-internal service params and results that no router `.input` or `.output` names.
- The branch was unmerged at the sweep. Re-run the sweep if its contracts change before merge.

Landing evidence: filled at landing.
