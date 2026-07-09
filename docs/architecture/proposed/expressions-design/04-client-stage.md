---
kind: spec
status: active
updated: 2026-07-03
---

# 04 — The Client Stage (v1 single-sprite holder) + Management UI

> **Status: COMMITTED (D49 item 4) — prescriptive design; the ledger D-entry wins on any conflict.**
> The Phase-6 client half: event → swap, what the client may and may not compute, blob resolution,
> the swipe cache. ST evidence: `#expression-holder`/`setImage` crossfade — one-line cite. The
> group multi-sprite VN layer stays deferred (committed §8 reject list); background rendering is
> the D44 theme-token shell slot (committed `expressions.md` §5 — not re-covered here).

---

## 1. The stage (v1 shape)

ONE sprite holder in the chat view flank (the `#expression-holder` successor — a `features/`
component in the client slice, using the `@orb/ui` primitives per D54's surface→primitive map).
It renders the sprite of **the most recently classified speaker** — in a solo chat that is the
character; in a group chat the holder follows whoever spoke last (Q5, committed: single holder,
no VN multi-sprite layer). *(Rejected for v1: per-roster-member holders — that is the deferred VN
layer by another name.)*

## 2. Data flow (event → swap)

```
chat bus subscription (the existing SSE stream — no new stream)
  → { type:"expression", chatId, characterId, messageId, variantId, label }
  → drop if chatId ≠ open chat
  → drop if (messageId, variantId) is not the currently DISPLAYED variant of that message  (swipe race — 02 §4)
  → cache.set(variantId, { characterId, label })                                            (§3)
  → spriteMap ← listSprites(characterId) via the standard query layer (cached, bus-invalidated)
  → src ← spriteMap[label]  (guaranteed present: the server closed the classify set over actual
       sprites, 02 §3 step 4 — a miss is a bug, log + keep current sprite)
  → crossfade holder to blobUrl(src)
```

**Crossfade posture (one line):** a two-layer CSS opacity crossfade (~300ms, `prefers-reduced-motion`
honored) — no animation library; ST's clone-fade `setImage` is the ancestor.

**Blob resolution:** the sprite's `AssetRef` renders via `blobUrl(hash)` from
`@orb/contracts/assets` with the `?w=` variant ladder (`snapBlobWidth` rungs — assets.md); the
holder requests the rung nearest its rendered width, webp. The blob route serves it under the
owner-or-member gate (01 §6).

## 3. The swipe cache (client-side, session-scoped)

A `Map<VariantId, {characterId, label}>` fed by every accepted event. On swipe (variant pointer
change), the client looks the target variant up: hit → swap instantly (swipe-BACK correctness for
free); miss → **keep the current sprite** (no re-classify request). WHY: classify results are
deliberately not persisted (02 §4 — presentation state); a session cache covers the overwhelmingly
common swipe-within-session case at zero server cost. *(Rejected: a re-classify-on-swipe-miss
verb — a user paging through old variants would fire LLM spend per keypress; rejected: persisting
labels per variant — a schema column for cosmetics.)* **Criterion to revisit:** if stale-on-reload
sprites (cache lost on refresh → stage holds `neutral`/last until the next turn) draw real
complaints, persist the label onto `message_variants` metadata then — additive.

On chat open / reload the holder starts EMPTY (or the character's `neutral` sprite if present —
pick neutral; an empty box is uglier) until the first classified turn.

## 4. What the client MAY NOT compute (the enforcement line)

- **No classification client-side** — no label inference, no snap logic, no prompt calls (the
  committed §8 reject: "classify is a server-side shaper against the user's resolved credential").
  The client consumes `label` strings from the bus, period.
- **No sprite-set derivation** — `listSprites` is the only source of the label→asset map.
- Enforcer: `@orb/client` imports from `@orb/contracts/expressions` types only — no snap/labels
  substrate exists in any browser-reachable package (`snapToLabel` lives in the server domain;
  resolve-time physics, the rpg-design/08 "no game math in the client" pattern).

## 5. The management UI (pre-Phase-5-independent per the committed §7, ships with the Phase-6 client)

The character editor gains a **sprite grid**: one tile per label (seed labels suggested, custom
label input validated by `expressionLabelSchema` client-side + server re-parse), each tile = upload
(the standard `assets` upload path, kind `"sprite"`) → `setSprite`, or remove → `removeSprite`.

**The empty state is the B1 payoff:** zero sprites renders a "Generate expression sprites" CTA
(label multi-select, default the curated 8, style prompt field) → `generateSpriteSheet` → progress
via the existing workloads SSE surface → grid fills on completion (bus/query invalidation). The
un-sliced sheet (03 §6) is shown once for review. This is what turns the Q3 early-out from
"feature is dead for non-artists" into a one-click onboarding step.

## 6. Test plan (this doc's slice — full plan in 05)

- **Swipe race:** event for a non-displayed variant → dropped, no swap.
- **Swipe-back:** cached variant → instant swap; uncached → current sprite held.
- **Label-miss guard:** event label absent from spriteMap → logged, no crash, no swap.
- **Reduced motion:** crossfade collapses to instant swap.
- **Empty state:** zero sprites → CTA rendered; ≥1 sprite → grid rendered.
