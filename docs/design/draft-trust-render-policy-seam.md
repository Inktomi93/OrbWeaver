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

## RESOLVED 2026-08-09 — ARM 1 BUILT, and the brief's mechanism was INVERTED

The #48 lane (`a6133ffe4`) built arm 1 but proved the framing below was wrong in two ways
(verified, not assumed):

1. `data` at `character-editor-surface.tsx:219` is `useSuspenseQuery(character.get)` — the **saved
   server row**, not the unsaved draft form model (`trustHtml` isn't in the card form at all).
2. `resolveRenderPolicy` is `override ?? deployment` for `trustHtml` — a deployment floor **cannot
   forbid** a card that opted in (its own docblock: "a DEFAULT, not a block", owner 2026-08-01). So
   the "previews trusted, saves untrusted" over-render below is **unreachable**.

**The real lie is the mirror image:** an `inherit` card (`trustHtml: null` — every card's default)
previews **untrusted** on a deployment whose floor *trusts*. UNDER-render, not over-render. And the
"no new wire" premise died: `/api/auth/config` served `forbidExternalMedia` but **not** `trustHtml`,
so the floor was not client-knowable.

**Fix shipped:** added `trustHtml` to `/api/auth/config` (same per-request read the CSP uses) +
`useRenderPolicyFloor` (fail-closed to the shared `SAFE_FLOOR`, now exported from
`lib/render-trust.ts` so the strict default has one spelling) + `usePreviewRenderPolicy`. Fixed
**both** sites of the class — the facet editor AND `character-hero-band.tsx:96`. Durable lesson: *a
preview surface with no server-resolved verdict must run the contract resolver, not read the raw
override column — the editor preview was answering a different question than the renderer for every
`inherit` card.*

---

## Original framing (kept for the record — mechanism was inverted; see above)

Note the exposure honestly: the preview is the editing owner previewing their OWN unsaved draft —
same principal, nothing persisted, nothing served to anyone else. The real risk is a **lying
preview**, not a leak.

Arms as originally posed: (1) client-side floor combine [BUILT, with the correction above] · (2)
full server round-trip [not needed] · (3) leave as editor-local convenience [rejected — the
under-render was a real fidelity bug worth the ~1-wire fix].

**Scout's not-covered:** other `trustHtml` render sites (hero band, appearance tab) untraced;
rpg/persona-card parallels unchecked.
