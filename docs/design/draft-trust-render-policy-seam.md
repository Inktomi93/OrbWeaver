# DRAFT-TRUST render-policy seam — decision brief

> Scout-reconstructed 2026-08-09 (lane #51, receipts verified in-lane). The standing board item
> "DRAFT-TRUST server render-policy seam (architecture call)" — item #6 on every owables list since
> 2026-08-03 — posed as a decidable fork. No recorded lean exists in any board era (checked -03/-07/-08/-09).

## What the seam is

Character content (greetings, description, prose) carries a `trustHtml` flag gating whether raw HTML
is sanitized-and-stripped or rendered trusted. The original board framing (history 2026-08-08:1987):
*"drafts run the untrusted floor (strip `<i>`/`<b>`), committed `trustHtml` renders them; needs a
'what render policy would this card get' server seam."*

## Live state (evidence ladder)

- **The committed-content seam is REAL and top-rung:** `resolveRenderPolicy`
  (`packages/contracts/src/chat/roster.ts:142`) — tighten-only combine of deployment floor × card
  override — called live at compose (`server/src/entry/compose/chat.ts:874`) and re-derived at the
  card-frame HTTP boundary (`entry/http/card-frame.ts:117-145`), with `security-headers.ts:22`
  depending on its tighten-only contract (owner ruling 2026-08-01). Tested:
  `tests/contracts/chat/roster.contract.test.ts:151-192`.
- **The gap is at EDIT time:** the character editor's greeting preview renders
  `trusted={data.trustHtml === true}` (`client/src/features/character/surfaces/character-editor-surface.tsx:219`)
  where `data` is the in-memory UNSAVED draft form model. `resolveRenderPolicy` is never called on
  this path — the "server seam" the ticket names does not exist; only client-trusts-the-draft exists.

## The fork

Should the editor's live preview of an unsaved draft resolve render policy the way committed content
does, or keep trusting the draft's own `trustHtml` field for preview purposes?

Note the exposure honestly: the preview is the editing owner previewing their OWN unsaved draft —
same principal, nothing persisted, nothing served to anyone else. The real risk is a **lying
preview**, not a leak: on a deployment whose floor forbids trusted HTML, the preview renders
trusted while the saved card never will.

## Arms

1. **Client-side floor combine (the lite server-seam).** `resolveRenderPolicy` lives in CONTRACTS —
   importable client-side. Combine the known deployment floor with the draft's flag in the preview;
   no new wire, one call site, one test asserting drafts preview at-floor. Fixes the lying-preview
   without a round-trip.
2. **Full server round-trip** ("what policy would this card get") — mirrors card-frame exactly, but
   buys nothing over arm 1 unless policy inputs exist that the client can't know (none found).
3. **Leave as editor-local convenience** — zero cost; the board row closes as "preview is
   same-principal, boundary holds at read time"; a reviewer must keep re-confirming that.

**Scout's not-covered:** other `trustHtml` render sites (hero band, appearance tab) untraced;
rpg/persona-card parallels unchecked.
