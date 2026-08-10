# Package report cards — follow-up worklist (db · kit · ui)

> **Provenance:** 2026-08-09 owner-requested report cards. Method: every source file of each package
> read IN FULL by the orchestrator personally (no delegation) — `packages/db/src/schema/**` (28
> files, ~4.5k lines), `packages/kit/src/**` (55 files, ~8.9k lines), `packages/ui/src/**` (310
> files, ~19.6k lines). Grading lens: **one home per concept** + general quality.
>
> **Grades: db A · kit A · ui A.** Nothing below is structural — this is the complete punch list,
> including the small stuff, ordered by package then by size of the win. Each item states the
> receipt so next-week-you doesn't have to re-derive it.

## The afternoon-sized quick-win set (do these first)

1. **kit — truthiness vocabulary spelled 3×.** `user-macros.ts` `userMacroToggleDefaultsOn`
   (not-empty/false/off/0), the `{{if}}` handler in `macro/registry.ts` (~L207, identical logic
   inline), and `macro/metadata.ts` `BOOLEAN_LITERALS` (the superset with true/on/1). The
   user-macros comment literally names it "the `{{if}}` truthiness vocabulary" and then re-spells
   it. Fix: one predicate (e.g. in `macro/metadata.ts` or a tiny shared module), `{{if}}` and the
   toggle-default both call it; keep `BOOLEAN_LITERALS` derived from the same word list.
2. **kit — `isPlainObject` has a home nobody visits.** `#guards` exports it (persona + world-info
   import it), but `json-schema/index.ts` (~L54) and `json-schema/lift.ts` (~L77) each declare a
   local identical `isRecord`, and `card-frame`/`json-schema/wire-subset` inline the same
   three-clause check. Swap all four to `#guards`.
3. **ui — `avatar-stack` re-spells `initials()`, non-grapheme-safe.** `@orb/kit/initials` is "the
   ONE grapheme-safe home" minted to kill four `charAt(0)` copies (client uses it everywhere);
   `primitives/avatar-stack/avatar-stack.tsx` (~L557) rolls a fifth local copy with
   `charAt(0).toUpperCase()` — the exact surrogate-splitting bug the kit module exists to prevent
   (emoji-led names). Fix: import `initialsFor`. Also grep-check `list-row.tsx`'s "initials"
   mention (believed comment-only) while there.
4. **db — hoist `checkList()`.** The CHECK-list builder (`values.map(v => `'${v}'`).join(", ")`) is
   declared as a local function in chat.ts / rpg.ts / tag.ts / world-info.ts / automation.ts AND
   inlined as map-join consts in users / embeddings / discovery / workloads / refinery / assets /
   credentials / plugin / notifications / databank / imagery — ~15 spellings, every one citing "the
   users.ts pattern" (convention-by-copy). All change together; hoist ONE helper (e.g.
   `packages/db/src/kit/` or a `schema/_shared.ts`). Pure mechanical sweep.
5. **kit — fix the stale root barrel comment.** `packages/kit/src/index.ts` says "re-exports added
   as modules land"; 40+ modules landed, zero re-exports, because subpath exports
   (`package.json` `"./*"`) are the real convention. Rewrite the comment to "intentionally empty —
   subpath imports only" (or delete the file if the exports map allows).

## packages/db (schema) — remaining items

6. **`chats.star` vs `characters.starred` / `personas.starred`** — same concept, two spellings
   (chat.ts ~L110 vs character.ts ~L51 / persona.ts ~L35). Rename `chats.star` → `starred`.
   Pre-launch baseline-squash makes this cheap, but it IS a schema change: squash into
   `0000_baseline.sql`, announce the dev-db drop, sweep consumers (repo-grep the literal — the
   shared-value-change-owes-a-battery rule applies).
7. **Decide the `updatedAt` policy once.** `personas`/`chats`/`rpg_games`/`presets` carry it;
   `characters` does NOT (edited in place under D28; `modificationDate` is ST import provenance,
   not a write clock), and `world_books`/`world_entries` don't either. `regex_scripts` had to
   retrofit it (the X-16 comment: "the discriminator the preset list already has and this one did
   not"). Rather than rediscovering per list-view: rule it ("any user-edited-in-place entity a list
   pane sorts/discriminates gets `updated_at`, maintained by write verbs") and add the column to
   `characters` (+ world_books/world_entries if the rule says so). Same baseline-squash caveat as
   item 6.
8. **Local `satisfies`-tied tuples (weakest derive rung — no action unless contracts grows the
   tuples):** `STREAM_DELTA_KINDS` (chat.ts ~L655), `INJECTION_POSITIONS` (chat.ts ~L694),
   `NOTIFICATION_TYPES` (notifications.ts ~L34). Each is honest about why (no runtime tuple exists
   in contracts; tied by `satisfies` + test mirror). If contracts ever mints those tuples, collapse
   these first.
9. **Watchlist, explicitly NO action:** the chat variable/macro plane spans seven homes
   (`chats.variableValues` / `userMacroValues` / `runtimeVariables` / `standaloneVariableDeltas` +
   `message_variants.variableDelta` / `macroDraws` / `macroFreezes`). Every one is a distinct plane
   (config picks vs derived fold cache vs out-of-turn log vs per-variant ops vs freeze provenance)
   and each is documented — but this is the densest concept-spread in the schema. Resist home #8;
   any new variable-ish column must argue against landing in one of these seven.

## packages/kit — remaining items

10. **speaker-label emphasis alternation `(?:\*\*|\*|__|_)` spelled 4× in one file**
    (`plainLabelRe`, `leadingLabelRe`, `inlineLabelRe`, `truncateAtForeignLabel`). Same bytes,
    change together (the tolerated-emphasis set). Name the fragment once at module scope.
11. **guided ↔ content literal coupling.** `guided/index.ts`'s `OFFER_CHOICES_TEMPLATE` hand-spells
    the `:::choices` fence grammar as prose ("a line containing exactly :::choices … then ::: on
    its own") while the grammar's one home is `kit/content`'s `DIRECTIVE_FENCE_NAMES` +
    `FENCE_OPEN_RE`. If the fence syntax or name ever moves, the template goes stale silently. Fix:
    derive the fence-name literal into the template string from `DIRECTIVE_FENCE_NAMES`, or add a
    test asserting the template's instructions tokenize into a `choices` span through the
    PRODUCTION tokenizer (the probe-harness posture).
12. **Trivial re-declares — batch or leave, noted so they're known:** `DECIMAL_RADIX` in
    macro/registry.ts + macro/variables.ts + regex/index.ts; `HEX_RADIX` in image-sniff +
    png-card-chunk; `NOT_FOUND = -1` in macro/parser.ts + fix-markdown.ts; the identical private
    `metadataField` (field-isolated blob read) in persona/index.ts + world-info/index.ts (2 sites —
    at a 3rd consumer, hoist to `#guards`); the encodeURIComponent-UTF-8-bytes trick in cel
    (`utf8ByteLength`) + png-card-chunk (`utf8ToBytes`) — same idea, different outputs, fine.
13. **Accepted, keep an eye:** `kit/guided` now hosts PRODUCT PROMPT COPY (the rpg plot-steer
    templates). Cake-justified (ui renders the tuple, contracts derives the wire enum, server reads
    the templates; kit is the only shared floor) — but kit is nominally pure primitives, so any
    further prompt copy landing there should re-argue its homing.

## packages/ui — remaining items

14. **Consolidate the live-token-resolver triplet.** Three spellings of "canvas/iframe can't
    resolve `var()` → resolve concrete values via getComputedStyle, re-resolve on `data-theme`
    flip via MutationObserver, serve through `useSyncExternalStore`":
    `charts/chart/use-chart-theme.ts`, `content/sandbox-frame/use-sandbox-theme.ts` (its header
    cites the chart hook as its mirror), and `art/web-weave/web-weave.tsx`'s `resolvePalette` +
    theme MutationObserver (probe-element variant, also watches `class`/`style`). Three consumers
    changing together = the consolidation threshold. Fix: one shared resolver seam (parameterized
    on token set / expression map + observed attributes) — likely `lib/` or a `content/` shared
    module; keep each consumer's shape (ChartColors roles, sandbox tokens+font clamp, WeavePalette)
    as thin projections over it. Mind the DOM-lib-free structural-globals pattern all three use.
15. **The sin-hash lives twice.** `art/web-weave/web-weave-math.ts` `weaveJitter` opens with "the
    classic waystone sin-hash" and re-declares the identical `127.1 / 311.7 / 43758.545` constants
    that `charts/meter/waystone-geometry.ts` `jitter` owns. When the comment names the other home,
    the constants should live in it — hoist one seeded-hash helper (kit is also a candidate home:
    pure, isomorphic, two consumers across dirs).
16. **Hint-tooltip anatomy duplicated** in `primitives/field/field.tsx` and `layout/section.tsx`:
    both derive `"More info about <label>"`, both carry the accname
    sibling-not-descendant rule ("nesting it inside leaks 'More info' into the accessible name"),
    both compose Tooltip+ghost-Button+Info-icon. Two sites today — extract the shared
    `<HintTrigger>` now or at the third consumer. (Field uses `size="inline"` for the
    no-vertical-cost contract; Section still uses `size="icon"` — unifying would also resolve that
    drift.)
17. **Documented-deliberate near-pairs (no action, listed so nobody "fixes" them wrong):**
    `series-row`'s `SWATCH_FILL` vs meter's `TRACK_FILL` (comment states the ui-group-boundary
    reason); `ToolCallBlockRecord` vs contracts `ToolCallRecord` (cake-forced mirror, documented);
    waystone `WAYSTONE_PHASE_SPANS` vs the contract's `TIME_OF_DAY_RANGES` (mirror pinned by a unit
    test that imports the contract); `FULL_PERCENT`/`PERCENT`-style local consts across chart
    files (trivial); `clampFraction` in track-bar + ring-gauge (2 sites, tiny).

## What was verified GOOD (don't relitigate)

- **db:** D23 stamp-vs-derive applied uniformly; D24 no-polymorphism with the one sanctioned
  soft-ref (`audit_logs.entity_id`); D26 slot/variant split (one content home; swipe = pointer
  flip); enum tuples derived (column enum + tuple-built CHECK + test mirror, zero re-spelled
  unions found); `rpg_turn_tool_calls` refusing the same-shaped `message_variants.tool_calls`
  (same shape ≠ same concept — the mature form of one-home).
- **kit:** homing rationale stated per module (kit↔contracts tuple rule); macro subsystem's
  derived-not-duplicated axes (MACRO_FLAG_DEFS, composed `volatile`, complement registries,
  `applyVarOp`, `checkMacroArgs`, `resolveRowMacros` one atom both consumers call);
  `DEFAULT_PERSONA_NAME`; card-frame one CSP engine two arms; `projectJsonSchema` the single
  `WireReady` mint.
- **ui:** `lib/` recipe home (cn+tv one config, dual-enforced; the FOCUS_RING family with measured
  receipts); the DTCG token pipeline (one source → 3 committed artifacts, freshness-tested, seed
  coverage derived from `THEME_SCOPE_EMIT_VARS`, Oklab ΔE near-duplicate lint with measured
  epsilon 0.008 and a deliberately-empty exceptions map); the size-axis-as-variant law applied
  uniformly with twMerge-measured rationale + CT pins; per-dependency seals (tailwind-merge,
  lucide, dnd-kit, echarts, minisearch×2 sanctioned, CodeMirror, Streamdown).
