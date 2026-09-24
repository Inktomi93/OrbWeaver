---
kind: work
status: open
updated: 2026-09-24
priority: P3
area: tooling
---

# Close the small follow-ups from the fold and copy work

## What

Close three small follow-ups. (1) scripts/probes/rpg-extraction/card-teach-probe.ts, local-8b-vehicles.ts and steer-probe-real.ts call buildLiteReminder without frameLiteReminder, so they measure an unframed reminder. (2) packages/server/src/infra/network/egress.ts still uses node:net isIP; use the one IP parser in @orb/kit/ip. (3) The invite dialog puts Revoke on its own line even at desktop width because the row is just under the ListRow breakpoint; decide the dialog width or the breakpoint.

## Why

The probes must measure what production sends, IP parsing has one home, and the invite row should not stack at desktop width without a reason.

## Done when

The probes frame the reminder, egress uses @orb/kit/ip with its tests passing, and the Revoke row is settled with a snap at 1440 and 360.

## Evidence

Filled at landing: what ran and where its output is.
