# Neo-tavern test steal list — 2026-07-09

> **RE-VERIFIED 2026-07-10 against `994318d..eb5d6b3` (the mega/mega2/auth-macro fork — 245 test
> files, +20k lines): the fork CONSUMED most of this list.** Verified DONE on disk:
> **N0** (the cold-cache `removeQueries` fix landed, `create-entity-mutation.ts` L145) · **N1**
> nearly all (injection\_trigger suite in `assemble.test.ts` · S5-1 corrupt-credential degrade —
> using the `no-test-fabrication` gate's `FABRICATION-OK` escape, in live use day one ·
> banned/groupnotmuted/hasvar-literal + the new `registry.test.ts` · WI `dr.`/dotless-ı ·
> fix-markdown tilde · guards null-proto · opening-policy cardinality lock · blank-digest parse) ·
> **N3** #1–#5 (bus-golden, at-depth-collision, cross-tenant-sweep, db-batch-atomicity,
> lineage-guard suites all exist) · **N4** (the scenario/tape/assertions harness is ported at
> `tests/support/chat/` with its acceptance proof; full turn.int conversion sweep = declared
> follow-up). The two 2026-07-09 gates (`contract-verb-presence`, `no-test-fabrication`) also
> landed with their registry rows.
>
> **STILL OPEN after the fork:** **N2 in full** (e2e is still ONE spec — the five ports incl.
> multi-tab-sync remain the largest unclaimed win) · ~~N3 #6~~ (rate-limiter inversion — the
> full-coverage sweep 2026-07-10 found the bucket-inversion failsafe test EXISTS; done) · N3 #7
> (historyTruncated/prune verify) · N1's provider-routing passthrough pin · the harness
> conversion sweep + kitchen-sink stress suite · and from test-quality-review\.md: **R1
> (`markdown/policy.ts` hostile-input suite — the P0 — still zero tests)**, R3 stats real-wire
> (engine.int still uses the recorder fake), R2 egress (superseded by the stickler finding that
> the firewall isn't installed at boot — fix the install, then the tests). Body below is the
> original record.

```
kind: work-queue (dispatch-shaped)   status: RE-VERIFIED 2026-07-10 — mostly consumed; open remainder in the banner
source: five reviewers read neo-tavern's ENTIRE test corpus (~470 files across tests/{server,
        integration,client,shared,support+harness,contract,e2e,unit,arch,scripts,db} +
        tools/st-extract + the CT rig), each grounded first in orb's Spine-Testing law, the
        tests/support inventory, and test-quality-review.md so verdicts answer "does this patch a
        known orb weakness," not nostalgia. Concepts that died in the rewrite were adjudicated
        against Core-Legacy-Migration-and-Gaps / Core-SillyTavern-Feature-Map.
headline: orb's suite is at or above neo's ceiling almost everywhere — several orb support pieces
        are literally improved ports of neo's (query-counter, CT tRPC stub, matchers). The steals
        below are the residue: one live client BUG, one harness worth porting, ~4 e2e specs,
        ~6 cross-domain property suites, and ~20 cheap esoterica test cases.
```

## N0 — a LIVE BUG, not a test steal (client session's turf — do not fix from the docs lane)

**`packages/client/src/data/create-entity-mutation.ts` (\~L133) cold-cache rollback is a no-op.**
`onError` does `setQueryData(readKey, snapshot)` unconditionally; when the mutation fired against
a never-fetched query, `snapshot === undefined` and TanStack v5 treats that as a NO-OP — the
phantom optimistic row sticks forever. Neo hit this exact bug (its V7-9), fixed it
(`removeQueries` on the cold-cache branch), and pinned it (`use-optimistic-mutation.test.ts`).
Fix: `snapshot === undefined ? client.removeQueries({queryKey}) : setQueryData(...)` + a CT case
mounting against a cold cache + a node test asserting `cancelQueries` ran BEFORE `setQueryData`
(`mock.invocationCallOrder` — neo's ordering pin; orb asserts presence, never order).

## N1 — esoterica test-case ports (mech-executor; \~20 cases, all land in EXISTING orb test files)

- **`injection_trigger` section-gating (the load-bearing one).** Implemented in orb's
  `assemble.ts` (`shouldTrigger`/`generationTypeBucket`, \~L499–515), ZERO tests. Port neo's
  `assemble-conditions.test.ts` behaviors: fires only on matching `generationType` ·
  swipe/regenerate aliasing · absent trigger ⇒ always-on · absent type ⇒ normal · AND the
  cache-safety invariant: a trigger-gated section always lands in the DYNAMIC half, never the
  cached static prefix (a regression here silently poisons the KV cache — costs tokens, not
  pixels). Lands: `tests/server/domain/chat/assembly/assemble-conditions.test.ts` (new sibling).
- **Corrupt credential metadata degrade (S5-1).** Seed a `custom_openai` row with
  malformed/missing `baseUrl`: `fetchModels` ⇒ `[]` (never fetches `undefined`),
  `inspectEndpoint` ⇒ clean `ok:false`, `resolveCredential` ⇒ typed `credential_metadata_invalid`;
  plus the well-formed inverse. Lands in the three existing credentials int tests. (Closes the
  review's "credentials fakes have no throwing arms" gap with neo's exact scenario.)
- **Macro registry:** `{{banned}}` (renders empty — registry.ts:567, zero coverage) ·
  `{{groupnotmuted}}` (muted vs unmuted cast divergence — note lowercase name) · budget
  boundaries (depth-cap with ONE warn not spam; 1.5MB ⇒ exactly 1MB + one warn) · `hasvar`
  returns the LITERAL `"true"` · curly/typographic quotes in `{{#if}}` comparators ·
  case-insensitive `{{Else}}`/`{{ELSE}}` · `addvar` no-space concat · `{{date}}`/`{{time}}`
  across a pinned day boundary (spot-check first). Lands: `tests/kit/macro/index.test.ts`.
- **World-info matching:** `escapeRegExp` on keys (`"dr."` must not match `"dru"`) +
  locale-folding cases (ß / dotless-ı). Lands: `tests/kit/world-info/index.test.ts`.
- **Kit primitives:** fix-markdown lone-tilde in ranges (`10~20°C`), snake\_case no-false-italic,
  completed-span+torn-next-open streaming tail · speaker-label doubled-label dedup
  (`"Niko: Niko: hi"`), markdown-wrapped labels (`**Niko:**`), metachar names (`"Dr. X"`) ·
  `isPlainObject(Object.create(null))` ⇒ true · `errorMessage(new Error())` ⇒ `""` · slug
  pure-punctuation/pure-whitespace ⇒ `"unnamed"`. Lands in the matching `tests/kit/*` files.
- **Contract pins:** opening-policy enum cardinality lock · `roomOverridesSchema` white-box
  `.strict()` rejection (today only tested through the wrapper) · provider-routing
  unknown-field passthrough tolerance (verify absent first).
- **Blank-digest parse:** `parseDigest("")`/`("   ")` ⇒ empty result — closes the review's
  flagged arm. Lands: memory build substrate parse test.

## N2 — e2e ports (executor; from 1 spec to \~5, zero new backend work)

Ranked; each is testid/UI adaptation of a neo spec:

1. **`chat-persistence.spec.ts`** (neo 07) — list→open→reload · rename→reload · star→reload. Pure
   UI↔DB proof, zero model cost.
2. **`multi-tab-sync.spec.ts`** (neo 11) — rename in tab A ⇒ tab B updates live via SSE. THE
   browser-level proof of the dual-device/bus-driven claim the redesign leans on; currently
   verified nowhere end-to-end.
3. **`event-sequence.spec.ts`** (neo 08) — network+console timeline pinning query→subscribe→open
   and mutation→bus→refetch ordering live.
4. **`injection-roundtrip.spec.ts`** (neo 10) — add/persist/delete/persist (verbs exist; needs
   panel testids).
5. **`smoke.spec.ts`** (neo 01/02) — healthz + SPA shell + single-user no-login; \~10 lines,
   catches boot regressions without the Agent-SDK cost the existing spec carries.

Templates recorded, NOT portable yet: SSE-reconnect (needs a minimal `/debug` probe page first —
neo's author called this regression class "the silent killer"; build the page, then port) ·
preset-switch (needs Connections-modal testids) · corpus-search (feature unbuilt).

## N3 — cross-domain property suites (executor; each a new `.suite.int.test.ts`, orb's own exemption category)

1. **Bus event-sequence GOLDEN snapshots** — pin exact per-verb sequences + payload shapes
   (turnStarted→2×messageCommitted→turnCompleted…). Orb proves durability/monotonicity, never the
   sequence itself; a reordered emit passes silently today. `tests/server/domain/chat/bus-golden.suite.int.test.ts`.
2. **Cross-source at-depth collision ordering** — persona < char-note < user-injection < WI at
   one shared depth + cross-depth stratification. Individually tested, never simultaneously.
3. **Cross-tenant IDOR sweep** — seed one-of-everything as owner, probe EVERY id-taking procedure
   as a stranger; the forcing function for "new verb forgot its owner predicate."
   `tests/server/transport/cross-tenant-sweep.suite.int.test.ts`; grows with the router.
4. **`db.batch` atomicity primitive** — force a UNIQUE violation mid-batch, assert zero partial
   rows (the "libsql/drizzle upgrade silently degrades" class).
5. **`getChatLineage` cycle-guard + 50-node depth cap** — production code has both; tests have
   neither.
6. **Rate-limiter inversion failsafe** — "throws loud, never keys 'anon'" if middleware order
   regresses.
7. VERIFY-then-port: `historyTruncated`-on-stale-cursor + bounded log pruning — confirm orb's
   durable log HAS a prune concept first (none found; may be deferred, not a gap).

Pattern (not a file): neo's kitchen-sink stress test — one preset wiring macros+regex+WI+swipes+
guided+fork through one multi-turn scenario; catches cross-feature interaction bugs unit silos
miss. Worth ONE such suite once the N4 harness exists to make it cheap.

## N4 — the harness steal (executor, M-cost; the one architectural port)

**Neo's `tests/support/harness/` scenario+tape+scripted-runner trio + assertion helpers.** A
fluent `tape().reply()/error()/rateLimit()` script builder, a FIFO scripted runner, and a
`scenario.chat(tape, opts)` driver that wires the REAL chat verbs with pre-attached
worldInfo/persona/preset/memory state through real services, plus named assertions
(`assertStaticPrefixStable`, `assertTokenTotalsConsistent`, `assertEventSequence`…). Orb's chat
int tests hand-roll fake `runTurn` per file; this makes real-wired the default shape — the
structural fix behind the fake-vs-real R3 findings AND the enabler for N3's golden/stress suites.
Lands: `tests/support/chat/` (tape/runner/assertions port near-mechanically; `scenario.ts` needs
re-derivation against orb's verb surface — no group/solo split, separate verb files). Independent
early slices if deferred: `cannedTurn` factory (S) and the two token/runner-call assertions (S).

## Ruled ALREADY-BETTER / OBSOLETE (do not re-litigate)

Already-better: query-counter (orb's IS neo's, ported) · CT tRPC stub (orb superset, +SSE) ·
matchers (cross-realm-safe) · CT providers (domain-agnostic) · composed fixture (dynamic-import
discipline) · DI frozen clock · ts-morph gates vs dep-cruiser+pin-test · regex engine (+vm ReDoS
watchdog) · WI matching (fixes neo's locale bug) · PNG/serde (independent CRC cross-check) ·
group/roster security · fork/memory/search-scope/import suites · sortable CT (keyboard+aria) ·
computed-style rigor. Obsolete: `tests/unit`+`tests/integration` DIR concepts (killed by
mirror-path §0) · app-services bundle (compose root IS the fixture) · node-localStorage shim ·
per-chat-routing tests (neo itself abandoned the design) · buddy ASCII sprites · OR live-behavior
probes · sdk-system-boundary (composition diverged) · **tools/st-extract wholesale — it's a UI
parity analyzer (jQuery→React porting), NOT data-import tooling; zero overlap with the B1 ST
data-port lane** (one sub-agent claimed otherwise; verified false).

## Dispatch note

N1 items are punchlist-grade mech work (complete specs, existing files, suite-verified). N2/N3
are executor lanes; N4 before N3's golden/stress suites saves double work. N0 belongs to the
client session. Cross-file: today's test-quality-review\.md R-rows and this list's N-rows overlap
on intent at three points (credentials throwing arms ↔ N1-S5-1; e2e thinness ↔ N2; fake-vs-real
R3 ↔ N4) — dispatch them together, not twice.
