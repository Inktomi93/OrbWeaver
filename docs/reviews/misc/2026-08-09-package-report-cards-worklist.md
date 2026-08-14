# Package report cards — follow-up worklist (db · kit · ui)

> **Provenance:** 2026-08-09 owner-requested report cards. Method: every source file of each package
> read IN FULL by the orchestrator personally (no delegation) — `packages/db/src/schema/**` (28
> files, \~4.5k lines), `packages/kit/src/**` (55 files, \~8.9k lines), `packages/ui/src/**` (310
> files, \~19.6k lines). Grading lens: **one home per concept** + general quality.
>
> **Grades: db A · kit A · ui A.** Nothing below is structural — this is the complete punch list,
> including the small stuff, ordered by package then by size of the win. Each item states the
> receipt so next-week-you doesn't have to re-derive it.
>
> **Graduation status (2026-08-14, the four-commit drain lane + the held items-6/7 leg):** all 16
> action items are closed. 1-5, 10-11 landed on `03a7a06dd`/`7896e7655`; 14-16 landed on `e73ad2029`
> (item 14 partial by design — see its status note below); the whole-tree drain (db-structure/
> gate-modernization/suppressions/ui-primitive-structure) landed on `8eca945c7`; 6-7 (the two
> owner-ruled renames, held behind R0's baseline squash) landed in this commit. 8/9/12/13/17 were
> always no-action (documented-deliberate or below-threshold) and stay that way.

## The afternoon-sized quick-win set (do these first)

1. **kit — truthiness vocabulary spelled 3×.** `user-macros.ts` `userMacroToggleDefaultsOn`
   (not-empty/false/off/0), the `{{if}}` handler in `macro/registry.ts` (\~L207, identical logic
   inline), and `macro/metadata.ts` `BOOLEAN_LITERALS` (the superset with true/on/1). The
   user-macros comment literally names it "the `{{if}}` truthiness vocabulary" and then re-spells
   it. Fix: one predicate (e.g. in `macro/metadata.ts` or a tiny shared module), `{{if}}` and the
   toggle-default both call it; keep `BOOLEAN_LITERALS` derived from the same word list.
   **STATUS: DONE (`03a7a06dd`).**
2. **kit — `isPlainObject` has a home nobody visits.** `#guards` exports it (persona + world-info
   import it), but `json-schema/index.ts` (\~L54) and `json-schema/lift.ts` (\~L77) each declare a
   local identical `isRecord`, and `card-frame`/`json-schema/wire-subset` inline the same
   three-clause check. Swap all four to `#guards`.
   **STATUS: DONE (`03a7a06dd`).**
3. **ui — `avatar-stack` re-spells `initials()`, non-grapheme-safe.** `@orb/kit/initials` is "the
   ONE grapheme-safe home" minted to kill four `charAt(0)` copies (client uses it everywhere);
   `primitives/avatar-stack/avatar-stack.tsx` (\~L557) rolls a fifth local copy with
   `charAt(0).toUpperCase()` — the exact surrogate-splitting bug the kit module exists to prevent
   (emoji-led names). Fix: import `initialsFor`. Also grep-check `list-row.tsx`'s "initials"
   mention (believed comment-only) while there.
   **STATUS: DONE (`03a7a06dd`).** `list-row.tsx`'s mention confirmed comment-only, no action.
   CT-proved in the `8eca945c7` drain pass (`avatar-stack.ct.tsx`, never run until then).
4. **db — hoist `checkList()`.** The CHECK-list builder (`values.map(v => `'${v}'`).join(", ")`) is
   declared as a local function in chat.ts / rpg.ts / tag.ts / world-info.ts / automation.ts AND
   inlined as map-join consts in users / embeddings / discovery / workloads / refinery / assets /
   credentials / plugin / notifications / databank / imagery — \~15 spellings, every one citing "the
   users.ts pattern" (convention-by-copy). All change together; hoist ONE helper (e.g.
   `packages/db/src/kit/` or a `schema/_shared.ts`). Pure mechanical sweep.
   **STATUS: DONE.** Landed first at `schema/_shared.ts` (`03a7a06dd`), then RE-HOMED to
   `packages/db/src/kit/check-list.ts` (`8eca945c7`) — the db-structure gate reds a helper file
   inside `schema/` (producer-names-the-schema + barrel-re-export apply to everything there); the
   kit dir's own small-module + barrel convention is the correct home.
5. **kit — fix the stale root barrel comment.** `packages/kit/src/index.ts` says "re-exports added
   as modules land"; 40+ modules landed, zero re-exports, because subpath exports
   (`package.json` `"./*"`) are the real convention. Rewrite the comment to "intentionally empty —
   subpath imports only" (or delete the file if the exports map allows).
   **STATUS: DONE (`03a7a06dd`).**

## packages/db (schema) — remaining items

6. **`chats.star` vs `characters.starred` / `personas.starred`** — same concept, two spellings
   (chat.ts \~L110 vs character.ts \~L51 / persona.ts \~L35). Rename `chats.star` → `starred`.
   Pre-launch baseline-squash makes this cheap, but it IS a schema change: squash into
   `0000_baseline.sql`, announce the dev-db drop, sweep consumers (repo-grep the literal — the
   shared-value-change-owes-a-battery rule applies).
   **STATUS: DONE (2026-08-14).** Owner-ruled: rename EVERYWHERE, including the chat-bundle
   export/import on-disk wire key (pre-launch, no back-compat shim) — the RPC mutation NAME
   `chat.star` stays (it names the VERB, not the field; matches `archive`'s
   `archived: z.boolean()` precedent). Renamed the column + every consumer (contracts
   `starChatSchema`/bulk-import, server chat verbs/persistence/substrate/contract/serde/transport,
   client hooks/components) and every test fixture that carried the literal. Baseline squashed in
   the same commit (see item 7's status for the squash receipt — one squash covers both).
7. **Decide the `updatedAt` policy once.** `personas`/`chats`/`rpg_games`/`presets` carry it;
   `characters` does NOT (edited in place under D28; `modificationDate` is ST import provenance,
   not a write clock), and `world_books`/`world_entries` don't either. `regex_scripts` had to
   retrofit it (the X-16 comment: "the discriminator the preset list already has and this one did
   not"). Rather than rediscovering per list-view: rule it ("any user-edited-in-place entity a list
   pane sorts/discriminates gets `updated_at`, maintained by write verbs") and add the column to
   `characters` (+ world\_books/world\_entries if the rule says so). Same baseline-squash caveat as
   item 6.
   **STATUS: DONE (2026-08-14).** Ruled: yes to all three (`characters`, `world_books`,
   `world_entries`), matching the X-16 rule verbatim. Column added to all three tables; every
   update verb wired to stamp it from the injected clock (`character` update/restore/bulk-archive;
   `world-info` book-update/entry-update/upsert-entries/reorder/backfill-titles/bulk-import-write).
   Baseline regenerated via the mv-then-verify form (never `rm -rf`) on the rebased tree —
   `check:db-baseline` + `drizzle-kit check` both green, R0's `started_at` column confirmed still
   present in the regenerated baseline. **Next stack boot wipes the dev db** (the baseline-hash
   mismatch auto-wipe `Tier-1-DB.md` documents — already true since R0's squash, unchanged by this
   one).
8. **Local `satisfies`-tied tuples (weakest derive rung — no action unless contracts grows the
   tuples):** `STREAM_DELTA_KINDS` (chat.ts \~L655), `INJECTION_POSITIONS` (chat.ts \~L694),
   `NOTIFICATION_TYPES` (notifications.ts \~L34). Each is honest about why (no runtime tuple exists
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
    **STATUS: DONE (`7896e7655`).**
11. **guided ↔ content literal coupling.** `guided/index.ts`'s `OFFER_CHOICES_TEMPLATE` hand-spells
    the `:::choices` fence grammar as prose ("a line containing exactly :::choices … then ::: on
    its own") while the grammar's one home is `kit/content`'s `DIRECTIVE_FENCE_NAMES` +
    `FENCE_OPEN_RE`. If the fence syntax or name ever moves, the template goes stale silently. Fix:
    derive the fence-name literal into the template string from `DIRECTIVE_FENCE_NAMES`, or add a
    test asserting the template's instructions tokenize into a `choices` span through the
    PRODUCTION tokenizer (the probe-harness posture).
    **STATUS: DONE (`7896e7655`).** Derived via a `satisfies`-tied `CHOICES_FENCE_NAME` const —
    a renamed/dropped fence now fails `tsc` instead of leaving stale prose.
12. **Trivial re-declares — batch or leave, noted so they're known:** `DECIMAL_RADIX` in
    macro/registry.ts + macro/variables.ts + regex/index.ts; `HEX_RADIX` in image-sniff +
    png-card-chunk; `NOT_FOUND = -1` in macro/parser.ts + fix-markdown.ts; the identical private
    `metadataField` (field-isolated blob read) in persona/index.ts + world-info/index.ts (2 sites —
    at a 3rd consumer, hoist to `#guards`); the encodeURIComponent-UTF-8-bytes trick in cel
    (`utf8ByteLength`) + png-card-chunk (`utf8ToBytes`) — same idea, different outputs, fine.
    **STATUS: NO ACTION (re-verified `7896e7655`) — the worklist's own ruling, still true.**
13. **Accepted, keep an eye:** `kit/guided` now hosts PRODUCT PROMPT COPY (the rpg plot-steer
    templates). Cake-justified (ui renders the tuple, contracts derives the wire enum, server reads
    the templates; kit is the only shared floor) — but kit is nominally pure primitives, so any
    further prompt copy landing there should re-argue its homing.
    **STATUS: NO ACTION — accepted as-is, watch on future prompt-copy additions.**

## packages/ui — remaining items

14. **Consolidate the live-token-resolver triplet.** ~~Three spellings~~ **TRUTH-REPAIRED
    (2026-08-14): TWO of three** share "canvas/iframe can't resolve `var()` → resolve concrete
    values via getComputedStyle, re-resolve on `data-theme` flip via MutationObserver, serve
    through `useSyncExternalStore`, using the DOM-lib-free structural-globals pattern (no `dom`
    lib in the node typecheck program)": `charts/chart/use-chart-theme.ts` and
    `content/sandbox-frame/use-sandbox-theme.ts` (its header cites the chart hook as its mirror).
    `art/web-weave/web-weave.tsx`'s `resolvePalette` does NOT share that pattern — grepped for it
    on the real tree and found zero hits. Its technique differs on two independent axes: it
    resolves arbitrary `color-mix()` CSS **expressions** via a probe element's computed style
    (not a plain custom-property read via `getPropertyValue`), and it runs inside a
    guaranteed-client canvas `useEffect` (never SSR, so it needs none of the structural-globals
    SSR-safety casting the other two carry). Fix: one shared resolver seam (parameterized on token
    set / expression map + observed attributes) — likely `lib/` or a `content/` shared module;
    keep each consumer's shape (ChartColors roles, sandbox tokens+font clamp, WeavePalette) as thin
    projections over it. ~~Mind the DOM-lib-free structural-globals pattern all three use.~~
    **STATUS: DONE, partial by design (`e73ad2029`).** Consolidated the two genuinely-identical
    spellings into `packages/ui/src/lib/live-token-resolver.ts` (`createLiveTokenStore` +
    `resolveCssVar`); left `web-weave.tsx`'s `resolvePalette` unconsolidated rather than force a
    real behavior/technique change into an animation-critical canvas path — flagged as a deviation
    with the receipt above, accepted by the orchestrator. CT-proved via
    `chart.ct.tsx`/`sandbox-frame.ct.tsx`/`web-weave.ct.tsx`/`weave-veil.ct.tsx`.
15. **The sin-hash lives twice.** `art/web-weave/web-weave-math.ts` `weaveJitter` opens with "the
    classic waystone sin-hash" and re-declares the identical `127.1 / 311.7 / 43758.545` constants
    that `charts/meter/waystone-geometry.ts` `jitter` owns. When the comment names the other home,
    the constants should live in it — hoist one seeded-hash helper (kit is also a candidate home:
    pure, isomorphic, two consumers across dirs).
    **STATUS: DONE (`e73ad2029`).** Hoisted to `packages/ui/src/lib/sin-hash.ts` (`sinHash(a, b,
    seed = 0)`) — both consumers are `@orb/ui`-internal, so `ui/lib` (not kit) is the simpler home;
    no cross-package consumer exists to justify promoting it further up the cake.
16. **Hint-tooltip anatomy duplicated** in `primitives/field/field.tsx` and `layout/section.tsx`:
    both derive `"More info about <label>"`, both carry the accname
    sibling-not-descendant rule ("nesting it inside leaks 'More info' into the accessible name"),
    both compose Tooltip+ghost-Button+Info-icon. Two sites today — extract the shared
    `<HintTrigger>` now or at the third consumer. (Field uses `size="inline"` for the
    no-vertical-cost contract; Section still uses `size="icon"` — unifying would also resolve that
    drift.)
    **STATUS: DONE (`e73ad2029`).** Extracted `packages/ui/src/primitives/hint-trigger/` (full
    §13.7 primitive trio + CT: `tests/ui/primitives/hint-trigger/hint-trigger.ct.tsx`, both
    call-site anatomies + the accname sibling-not-descendant proof). The Field-"inline"-vs-
    Section-"icon" size drift was deliberately NOT unified — that is a rendered-height change
    outside a mechanical-dedup pass's scope, noted inline at the Section call site for whoever
    picks it up.
17. **Documented-deliberate near-pairs (no action, listed so nobody "fixes" them wrong):**
    `series-row`'s `SWATCH_FILL` vs meter's `TRACK_FILL` (comment states the ui-group-boundary
    reason); `ToolCallBlockRecord` vs contracts `ToolCallRecord` (cake-forced mirror, documented);
    waystone `WAYSTONE_PHASE_SPANS` vs the contract's `TIME_OF_DAY_RANGES` (mirror pinned by a unit
    test that imports the contract); `FULL_PERCENT`/`PERCENT`-style local consts across chart
    files (trivial); `clampFraction` in track-bar + ring-gauge (2 sites, tiny).
    **STATUS: NO ACTION — the worklist's own ruling, unrevisited.**

## What was verified GOOD (don't relitigate)

- **db:** D23 stamp-vs-derive applied uniformly; D24 no-polymorphism with the one sanctioned
  soft-ref (`audit_logs.entity_id`); D26 slot/variant split (one content home; swipe = pointer
  flip); enum tuples derived (column enum + tuple-built CHECK + test mirror, zero re-spelled
  unions found); `rpg_turn_tool_calls` refusing the same-shaped `message_variants.tool_calls`
  (same shape ≠ same concept — the mature form of one-home).
- **kit:** homing rationale stated per module (kit↔contracts tuple rule); macro subsystem's
  derived-not-duplicated axes (MACRO\_FLAG\_DEFS, composed `volatile`, complement registries,
  `applyVarOp`, `checkMacroArgs`, `resolveRowMacros` one atom both consumers call);
  `DEFAULT_PERSONA_NAME`; card-frame one CSP engine two arms; `projectJsonSchema` the single
  `WireReady` mint.
- **ui:** `lib/` recipe home (cn+tv one config, dual-enforced; the FOCUS\_RING family with measured
  receipts); the DTCG token pipeline (one source → 3 committed artifacts, freshness-tested, seed
  coverage derived from `THEME_SCOPE_EMIT_VARS`, Oklab ΔE near-duplicate lint with measured
  epsilon 0.008 and a deliberately-empty exceptions map); the size-axis-as-variant law applied
  uniformly with twMerge-measured rationale + CT pins; per-dependency seals (tailwind-merge,
  lucide, dnd-kit, echarts, minisearch×2 sanctioned, CodeMirror, Streamdown).
