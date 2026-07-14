---
kind: spec
status: active
updated: 2026-07-03
---

# 05 — Build Plan: E1–E5 (sizes, dependencies, checkpoints, tests)

> **Status: COMMITTED (D49 item 4) — prescriptive design; the ledger D-entry wins on any conflict.**
> Honest sizing: S ≈ ≤half a day of agent work, M ≈ a day, L ≈ multi-day with an integration risk.
> Green-to-commit applies per chunk (`pnpm check` + `pnpm test`).

---

## The dependency graph

```
E1 (contracts)──► E2 (schema + CRUD) ──► E3 (classify + hook)     [Phase-5-gated: needs chat's turn lifecycle]
                        │            └─► E4 (sheet workload)      [Phase-7: needs domain/imagery + workloads + infra/image ops]
                        └───────────────► E5 (client)             [Phase 6: E5a management UI; E5b stage needs E3's event]
```

E1+E2 are pre-Phase-5 independent (the committed §7 sequencing, unchanged). E3 cannot land before
chat exists. E4 additionally waits on the committed `domain/imagery` leaf (being built from
`../imagery-design/`) and the two new `infra/image` ops. E5b is last.

## E1 — contracts + tuples (S) — ✓ LANDED 2026-07-09

> `@orb/contracts/expressions` (labels + verb schemas + `CharacterSpriteView`), `"sprite"` in
> `ASSET_KINDS` (CHECK regen), the `expression` `ChatBusEvent` member (+ replay guard + `chat_events`
> CHECK regen + the `bus-coverage` DEFERRED entry + the client reducer/invalidation no-op arms), and the
> `expressions-sprite-sheet` `WorkloadKind` + stub runner all rode the regenerated `0000_baseline`. The
> `character_sprites` DDL (E2's schema half) landed with it; the E2 CRUD leaf + the avatar-ref registry
> entry still trail (the registry itself is FLAG[PD-26], not yet built — a breadcrumb was left in
> `domain/assets/service.ts`).


**Build:** `@orb/contracts/expressions` (the `EXPRESSION_LABELS` tuple, `expressionLabelSchema`,
all verb zod schemas, `CharacterSpriteView` — 01 §2) · add `"sprite"` to `ASSET_KINDS`
(regenerates the assets CHECK into the baseline — 01 §3) · add the `expression` member to
`ChatBusEvent` + regenerate the replay guard + `chat_events_type_check` (02 §4) · reserve
`"expressions-sprite-sheet"` in `WorkloadKind` with a stub runner (the D58 `reconcile-world-state`
precedent — keeps `exhaustive-dispatch` green until E4).

**Checkpoint:** `pnpm check` green; the tuple↔CHECK mirror tests pass (assets kind CHECK contains
`sprite`; chat replay guard exhaustive over the widened union).
**Tests:** schema goldens for `expressionLabelSchema` (01 §9 normalization set);
`generateSpriteSheetSchema` bounds (0 labels, 9 labels, 601-char style → reject).

## E2 — db schema + the domain leaf, CRUD only (M)

**Build:** `@orb/db/schema/expressions.ts` (01 §4, rides `0000_baseline`) · the 8-slot leaf with
`set/list/remove/reap` verbs + persistence + `substrate/labels.ts` · the avatar-ref registry entry
for `character_sprites.assetId` **and the registry coverage-test predicate widening** (01 §4 — the
silent-GC seam) · the `character.remove` → `reapIfOrphan` injection wiring · the blob-route
membership-exception extension (01 §6) · tRPC router slice (thin, front-door only).

**Checkpoint:** a character can get/list/lose sprites end-to-end through tRPC; GC test suite still
green with sprite refs live.
**Tests (01 §9):** FK cascades both directions · composite-PK upsert-replace · D23 no-ownerId pin ·
registry coverage failure-mode (remove the entry → the introspection test goes red) · visibility
matrix (owner / member / member-of-other-chat / stranger) · reap returns exact ids, idempotent.

## E3 — classify + the post-turn hook (M; Phase-5-gated)

**Build:** the `classifyTurn` shaper in `infra/providers` (prompt template + `responseFormat`
attach on `output.structured` — 02 §2) · `substrate/snap.ts` · `verbs/on-turn-completed.ts` (the
02 §3 order) · the `readTurn` op on chat's front door + the `emitChatEvent` wiring · the optional
`expressions.onTurnCompleted` op on `ChatContext` (null-op default) ·
`UserSettings.expressions.autoClassify` (additive namespace, default false).

**Checkpoint:** with the toggle ON and a sprited character, a live turn emits exactly one
`expression` event; with the op unwired, the chat test suite is byte-identical.
**Tests (02 §6):** the snap goldens (the load-bearing pure suite — every rule in 02 §2.3 gets a
case) · the null-op byte-identity pin (dep-cruiser rule `chat-no-expressions` + the contract test)
· failure-swallow (shaper throws → no event, turn intact) · early-out order (settings-off does not
read canon) · structured vs plain request shape · fallback (`null` snap → neutral-if-present →
else silence).

## E4 — the sprite-sheet workload (L; Phase-7, after imagery)

**Build:** `infra/image` `sliceGrid` + `matteFlood` (the flood-fill core in `@orb/server/kit`) ·
`createLocalLightMatte` on the local-light backend (the `MatteModelOp`, RMBG weights via the
shared model cache — 03 §4.1) · `substrate/sheet-prompt.ts` · `verbs/generate-sprite-sheet.ts`
(enqueue + matte-arm resolution, 03 §4.3) + `verbs/run-sprite-sheet-job.ts` (the pass, 03 §3.3) ·
replace the E1 stub runner with the real thin runner + `WorkloadRunnerEnv.expressions` sub-env ·
the injected imagery/assets/getCard/matteModel ops on `ExpressionsContext`.

**Checkpoint (the integration risk lives here):** against a REAL image provider, one job takes a
sprite-less character to an 8-sprite set reviewable in the DB; BOTH matte arms are reviewed at
this checkpoint (model quality + CPU latency per cell; flood halo/fringe — 03 §4's defaults are
tuned HERE, on real outputs, before E5 ships the CTA).
**Tests (03 §8):** compiler + geometry goldens (synthetic marker PNG) · matte arm resolution
(explicit > wired-model > flood; wired-but-failing model op fails the job, no silent mixed-arm
set) · matte tolerance edges ·
atomic-last failure injection · upsert-replace · single-active conflict · runner/params/result
exhaustiveness pins. Provider calls are mocked in CI (the `GeneratedPicture` fixture); the real-
provider pass is the manual checkpoint.

## E5 — client (M; Phase 6; E5b after E3)

**Build:** **E5a** the management sprite grid + upload + custom-label input + the generation CTA
(wired to E4's verb; hidden with a "generation unavailable" state when the deploy lacks imagery —
`ExpressionsNotConfiguredError` mapping) · **E5b** the stage holder (event handling, swipe cache,
crossfade, blob ladder — doc 04).

**Checkpoint:** the full loop in a browser: generate → grid fills → toggle classify on → chat →
the stage moves.
**Tests (04 §6):** swipe race/back · label-miss guard · reduced-motion · empty-state CTA ·
client-side schema parity (labels validated before the round-trip).

## The hard parts (name them so nobody discovers them mid-chunk)

1. **The registry predicate widening (E2)** — touching assets' coverage test is cross-domain; do it
   WITH the assets owner's test conventions, not around them.
2. **The byte-identity pin (E3)** — the fixture must cover assembled request AND persisted rows AND
   event stream; a pin that only diffs the prompt misses an accidental row write.
3. **Matte quality (E4)** — the one genuinely empirical unknown (03 §4). Both arms are DESIGNED;
   the checkpoint tunes defaults (RMBG latency on CPU, flood tolerance) on evidence, not vibes —
   it no longer gates a design fork.
4. **The swipe race (E5b)** — the variant-key drop rule is easy to skip because it "works" without
   it in solo testing; the test is the guard.
