---
kind: work
status: open
updated: 2026-09-24
priority: P3
area: data
---

# Close the data-layout low findings

## What

Close three low findings from the data-layout reviews. (1) The DATABASE_URL remedy in the migration refusal names the key but not the value; print file:<root>/orbweaver.db. (2) The warn line after a keyfile kept by an explicit key says the layout does not name it; say which key keeps it. (3) A single-user Docker volume switched to local mode during the upgrade keeps the legacy session secret silently while the entrypoint mints a new one, so pending invites peppered with the old secret stop matching. Warn when a legacy session secret is left beside a new one.

## Why

Operator-facing messages should give a working remedy, and a silent pepper change breaks live invites.

## Done when

Each case has a test on the refusal or warn shape, never on its wording.

## Evidence

Filled at landing: what ran and where its output is.
