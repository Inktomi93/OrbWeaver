---
kind: adr
status: active
updated: 2026-09-23
---

# The reliable structured-output extraction mode is deleted

## Context

Split off [ADR 0112](0112-the-hosted-extraction-fold-amends-d108-s-delivery.md), whose owner-ruled deletion of the `reliable` mode pushed it over the 8 KiB ADR cap. The live three-case run (spike §4f–§4h) measured `reliable` worst on the exact field its grammar guardrail existed to secure (`hpDelta` 0/12, `removeCondition` 2/15) while `cheap` led.

## Decision

**\[AMENDED, owner ruling — `reliable` IS DELETED]:** the delivery axis is now TWO members — `config.extractionMode ∈ {folded (born default), cheap}`. The dedicated structured-output MODE is gone whole: the live three-case run (spike §4f–§4h) measured it WORST on the exact field its grammar guardrail existed to secure (`hpDelta` 0/12, `removeCondition` 2/15) while `cheap` led — the accuracy case was accurate on paper only. Pre-launch NO-LEGACY: no shim, no deprecation case; a stored blob carrying the superseded value is HEALED to the default at rpg's ONE parse-on-read seam (`persistence/games.ts`, scoped to that single field — every other corrupt field still throws loud), and the contract schema REFUSES it so the write door cannot accept it. The structured-output VEHICLE survives — it is no longer a mode but a capability-keyed path: the agent-sdk degrade INSIDE `runToolRound` (that wire carries no `tools[]`) and the host `resyncFromStory` rebuild, both gated by the new `hasStructuredWriter(capability)` beside `deriveTrackersReadOnly` (which now has no structured row). SUPERSEDES on this point: D108's `{reliable, cheap}` fork + its `reliable → capability.output.structured` readonly axis, D109-1's `reliable (default)`, and this entry's own (4) `LIVE_AT_COMMIT` triple + (6) six-site list. **Coupled sites for a delivery-mode member are now 5, all Record-dispatched → tsc-total:** contracts tuple · `readonly-axis` `HAS_WRITE_PATH` · flush `POST_COMMIT_ROUND` + `POST_COMMIT_PATH` · client `EXTRACTION_CONSEQUENCE` + `LIVE_AT_COMMIT` (`= {cheap:false, folded:true}`). The picker copy is the owner's framing: folded = default/recommended, cheap = "recommended for local models".

## Consequences

`config.extractionMode` is a two-member axis: `{folded (born default), cheap}`. A stored blob carrying the superseded value heals to the default at rpg's one parse-on-read seam; the contract schema refuses it at the write door. The structured-output vehicle survives as a capability-keyed path (`hasStructuredWriter`), not a mode. Coupled sites for a delivery-mode member drop from six to five.

## Alternatives rejected

Keep `reliable` as a deprecated third member with a shim (rejected: pre-launch NO-LEGACY — no stored blob predates this decision that the healing path cannot cover).
