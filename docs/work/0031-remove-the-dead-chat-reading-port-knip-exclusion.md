---
kind: tooling
status: done
updated: 2026-09-23
priority: P3
area: verify
evidence: f28bc2f11ab321e1ed5bb9f25e69e492eb7dc4fc
---

# Remove the dead chat-reading-port knip exclusion and gate literal knip negatives on file existence

## What

In knip.ts, remove the `!src/features/chat/lib/chat-reading-port.ts!` entry from the packages/client `project` list. Also remove the comment block above it that justifies the exclusion and names the chat-controls-band CT spec as its enforcer. Then add a check to the verify tooling. The check reads the resolved knip config. For every negative `entry`, `project` or `ignore` pattern that is a literal path (no glob wildcard characters), it requires the path, resolved against its workspace root, to be a git-tracked file. If the file is missing, the check reports that pattern by workspace and fails. Wildcard exclusions stay out of scope. An example is the gitignored `scripts/probes/st-goldens/sillytavern-runtime/**` runtime, which does not exist in worktrees or clean clones.

## Why

The exclusion was added to hide one file that has no production importer. That file has since been deleted, but the exclusion row and its comment are still in knip.ts. They now describe a file and an enforcer that no longer exist. Knip's config-hint check does not report a negative pattern that matches nothing. If a file is ever recreated or moved to that path, it would be excluded from knip's production view with no signal.

## Done when

The string `chat-reading-port` does not appear anywhere in knip.ts. The knip stage of `pnpm verify` passes. A committed test under tests/tooling covers the new check in both directions. The negative case plants a literal negative pattern whose path is not a tracked file and asserts that the check fails and names that pattern. The positive case plants a literal negative pattern pointing at a real tracked file and asserts the check passes. The test also shows that the wildcard `sillytavern-runtime/**` exclusion does not trip the check when that directory is absent.

## Evidence

Filled at landing: what ran and where its output is.
