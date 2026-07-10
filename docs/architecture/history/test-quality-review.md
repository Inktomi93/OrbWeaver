# Test-quality fleet review — 2026-07-09

> **RETIRED to history/ 2026-07-10 — WORK DONE.** The six-reviewer fleet review + the full-coverage
> provenance matrix (874/874 files, §7) are landed; R1–R8 shipped across `6dad440`/`b6da9af`
> (R1 policy P0, R2/R7 egress+OIDC, R3 real-wires, W2a firewall table, R8 provenance trivia). Kept
> as the resolved record + the provenance exemplars (drift-gate, parity oracles, non-vacuity
> controls) worth citing. Open residue when retired: R2's frozen-env branches, the 12 keyed-cred
> fabrication files (baseline ratchets them down over time).

```
kind: review report (findings + dispatch queue)   status: reviewed, fixes unbuilt
method: six section reviewers over the whole tests/ tree (chat domain · 23 other domains ·
        infra/entry/transport · client+contracts · ui/kit node-lane · db/support/tooling+config),
        each grounded in Spine-Testing.md + the annotated vitest.config + the mock-doctrine gate.
        Lenses: fake-when-real-exists · thoroughness · vitest-4 practices · the support machinery
        itself. Companions: test-support-dry-punchlist.md (the DRY/type-safety work queue — its
        §5 fabrication census and §1–4 DRY items are NOT re-reported here).
```

## 0. Verdict

The test tree is in genuinely strong shape: **zero live `vi.mock` sites repo-wide** (the doctrine
holds at perfect compliance — prior "2 files"/"4 files" counts were a gate-test fixture literal
plus explanatory comments), the support machinery is sound (factories are contract-valid BY TYPE —
full `$inferSelect` rows, a factory cannot omit a required column; `freshDb` is genuinely fresh;
the custom matchers cannot false-pass), the vitest-4.1.9 config is fully modern with zero
deprecated shapes, and authority-gate negative-path coverage is excellent where it matters most.
The findings below are the exceptions, severity-ordered.

## 1. SECURITY coverage holes (P0/P1 — route fixes through `security-executor`)

- **P0 — `packages/ui/src/markdown/policy.ts` has ZERO tests.** This is the untrusted-content
  XSS/exfiltration gate: `untrustedUrlTransform` (blocks `javascript:`/`data:`/`vbscript:` URIs +
  the D21 anti-tracking-pixel host allowlist) and the two-tier element allowlist
  (`TIER_A_ELEMENTS` / `TIER_A_UNTRUSTED_ELEMENTS`, `img` dropped for untrusted) are pure,
  trivially testable, and unexercised anywhere (node or Playwright). Every surface AROUND it
  (clamp, isSafeColor, neutralizeMacros) has hostile-input tests; the front door has none.
- **P1 — the egress/SSRF cluster (`tests/server/infra/network/egress.test.ts`):** (a) no test
  proves a redirect hop to `127.0.0.1`/private space is blocked — the classic SSRF-via-redirect
  path on the wrapper built for avatar-by-URL/webhook fetches (`followRedirects` re-enters
  `fetch()` per hop and leans on the undici dispatcher, which is not wired in the vitest env);
  (b) `installEgressFirewall` itself is wholly untested (DNS-lookup wiring, the OIDC-issuer
  carve-out, `securityEvent` emission on block); (c) `readCapped` at-cap and cap-crossing-chunk
  boundaries unpinned; (d) the `EGRESS_ALLOWLIST`/`TRUSTED_PRIVATE_RANGES` CSV env parsing
  untested; (e) `safeFetch` abort propagation untested (its sibling backends all test theirs).
- **P1 — OIDC full-mode:** `modes/oidc.test.ts` covers `verifyPkceState` only — token exchange /
  JWKS verification / issuer-mismatch rejection appear untested in the tier (verify no other
  mirror covers it before writing).

## 2. FAKE-WHEN-REAL-EXISTS (the consolidated inventory)

The doctrine held: no too-deep fakes, no fake db/crypto/clock anywhere, all provider/network/SDK
boundaries correctly faked. Four real findings:

- **`applyStatsDelta` recorded, never run (11 sites, chat `_support.ts`).** Every chat test
  asserts the computed `StatsDelta` SHAPE; none lets a turn flow through the REAL
  `stats/write/apply-delta.ts` (a pure, zero-coupling batch fn — the cheapest real swap in the
  repo) and asserts the resulting rollup rows. The apply≡reconcile drift invariant its own header
  calls load-bearing is untested from chat's real call sites. Fix: ONE end-to-end case in
  `engine.int.test.ts` with the real fn + row assertions.
- **character → tag: `attachCardTag` recording stub.** `bulk-add-card-tag.int.test.ts` asserts
  fake call args, never queries `tags`/`character_tags`. Production compose binds the REAL
  `tag.attachCardTagByName` over the same db. Fix: wire the real tag service for one asserting
  test per case.
- **persona → chat: `requireChatAuthorOrHost`/`setChatActivePersona` as trivial resolves** in all
  6 `set-active.int.test.ts` tests — a broken authority gate or persona write on chat's side is
  invisible from persona's tree. Fix: wire the real chat fns (compose already binds them) for at
  least the happy + refused pair.
- **openrouter runner family (\~6 files): SHAPE-DRIFT RISK.** Hand-rolled SDK stream-chunk objects
  with no runtime parse between fake and `reshapeChatStreamChunk` — an `@openrouter/sdk` bump
  that renames a chunk field desyncs the fixtures silently. Fix: one `.contract.test.ts`
  round-tripping a realistic SDK chunk at the shape boundary. (The openai-compat and custom-byo
  siblings fake at `fetch` and feed real SSE bytes through the real parser — the correct pattern;
  the openrouter family fakes one layer inside the SDK client instead.)

GRAY-but-watched: workloads' 8-op `fakeEnv` (fine while runners stay thin dispatch wrappers —
recheck if runner logic grows); import's all-six-ops fake (its tests are about parse/flatten
logic, callees have first-party coverage); the repo-wide `audit` recording-fake convention.

## 3. Doctrine / doc drift (cheap fixes, docs-are-law repo)

- **~~Spine-Testing.md §3 misdescribes the clock.~~ \[DONE 2026-07-10]** Rewrote §3 to the real mechanism
  (plain injected `{now, advance, frozenAt}` DI object from `support/clock.ts`; no Luxon/`vi.useFakeTimers`).
  Also added the NON-VACUITY CONTROL paragraph (exemplars: db-batch-atomicity.suite, touch-target-floor.suite).
- **~~`isSafeColor`'s "bare named colors" comment is a shape-check in reality~~ \[DONE 2026-07-10]** Fixed the
  comment in `packages/kit/src/safe-color/index.ts` to tell the truth (letters-SHAPE gate, not an allowlist;
  unknown words are browser-invalid + harmless) — behavior UNCHANGED — and pinned it with a new test case
  (`notacolorxx`/`rebeccapurple` pass; `not-a-color`/`color1` rejected).
- **`test-mock-doctrine` gate alias hole** — `vi.mock("@orb/...")` slips the path check; nothing
  exploits it today (zero live vi.mock sites). One-line fix + a negative-space self-test (rider
  already sent to the gates lane).

## 4. Presence-gate blind spots (three found today; one already being fixed)

1. **Interface-level verbs** — `test-presence` is file-mirror-based; Service-interface methods
   without a dedicated verbs/ file slip it. The `contract-verb-presence` gate (built 2026-07-09)
   closes this — and its calibrated detection CORRECTED the punchlist's count: only TWO verbs are
   genuinely untested (`chat.getRoomOverridesForChat`, `discovery.themes`); the other eight were
   dot-anchored-grep false negatives (real tests call verb closures bare or via `create<Verb>`
   factories). The replay verbs the redesign leans on ARE tested.
2. **~~`@orb/contracts/imagery`~~ \[DONE 2026-07-10]** Root cause: `test-presence` blanket-`continue`d on
   EVERY `index.ts` (barrel exemption), but contracts co-locate their schemas IN `index.ts` — so whole
   contract domains were silently exempt (imagery slipped; the other \~29 have tests only by author diligence).
   Fixed: the index.ts skip now applies ONLY to server barrels; a schema-bearing contracts `index.ts` is
   presence-gated (verified all 30 contract domains still green). Added the missing
   `tests/contracts/imagery/index.contract.test.ts` (5 tests) + a gate self-test fixture.
3. **~~`workloads/runners/`~~ \[DONE 2026-07-10]** Added a `runners/` arm to `test-presence` with a
   SHAPE-based stub exemption (a runner that only `report({...})`s + returns `{ deferred: true }` and never
   touches `ctx.env` is inert → exempt UNTIL filled in; adding a real `ctx.env.*` call drops the exemption
   and forces a test). Chose shape-detection over a static DEFERRED list so the 16 current stubs need no
   allowlist and can't go stale. Gate green against the real tree + a non-stub self-test fixture fires.

## 5. Thoroughness gaps (the non-security tail, ranked)

- Chat: memory build/recall lack `summarize`-throws / embeddings-store-rejects degrade cases;
  blank-digest-text formatter arm unpinned; backfill mint test is recorder-only.
- kit/guided: the **empty-input arm is untested** — the exact arm the chat-tab redesign's
  wand-gate-drop depends on (`kit/guided/index.ts` L51–68 does NOT no-op today; the redesign spec
  already mandates the guard + test — write it once, satisfy both).
- credentials/discovery/buddy/export `_support` fakes have no rejecting/throwing arms (provider
  throw vs unhealthy-result classification untested where the real op can throw).
- db/schema: `audit.int.test.ts` (3 tests) and `rate-limit.int.test.ts` (5) are thin vs siblings
  (8–16) — audit is compliance-relevant, rate-limit bugs are boundary bugs; worth one pass each.
- client/state: cross-factory store-name collision path untested (gated/persisted/draft factories
  likely share one registry).
- streaming-tail repair (`repairStreamingTail`): no hostile-tag negative case pinning the
  "sanitize is downstream" assumption.
- e2e: one happy-path spec total; no error-path proof of life (acceptable per the on-demand lane
  doctrine — recorded, not urgent).

## 6. Vitest-4 practices (small; mostly clean)

Config is fully modern (projects + `extends: true` everywhere, v8 coverage with the v4-required
explicit `include`, no deprecated shapes; the stryker config's documented drop of tests/tooling
means gate files get zero mutation coverage — a known, accepted blind spot). Test-side: redundant
`afterEach(vi.unstubAllEnvs/Globals)` in \~4 files duplicating root config (harmless; fix
opportunistically, not as a sweep); one local `vi.useFakeTimers` (idle-timeout test) is legitimate;
no `.concurrent` hazards, no floating promises, frozen-clock DI followed consistently.

## 7. Assertion-provenance matrix (2026-07-10 — "does our code use our own code, or inline its own version?")

Owner's question, audited three ways. **Mechanical tier:** cross-corpus jscpd (packages+tests in
one run, 40-token floor, 1,776 clones) found **ZERO clones crossing the tests↔packages boundary**;
the shadow-symbol scan (4,313 prod exports vs every test-local declaration) found 19 hits / 4
symbols, all benign (the `seedOwner` name-collision → W1f; `cardOf` builds literals where prod
projects rows). **Semantic tier — FULL COVERAGE (2026-07-10): every one of the 874 test files was
read line-by-line** (12 flat agents, disjoint manifests, union verified = the whole tree; per-file
ledgers archived per slice) — classifying every expectation's provenance as LITERAL ·
ROUNDTRIP/INVARIANT · INDEPENDENT-REFERENCE · REBUILT (private re-implementation, drift risk) ·
TAUTOLOGY (expected computed by the code under test).

**Verdict: the tree already follows "real code drives, never decides."** Setup/execution goes
through real db/verbs/services; expectations are overwhelmingly hand-derived literals (often with
the arithmetic shown in comments) or genuine invariants/roundtrips. **REBUILT: zero confirmed**
(every scout claim died on verification — e.g. shape.test.ts's "rebuilt squash" was an input
fixture; fork's `ownedCard` is an injected-fake predicate, kept). **TAUTOLOGY: three, all
trivial:** `engine/result.test.ts` (proves 3-line builders return what they're programmed to —
hollow; delete or convert to a shape-contract pin) · workloads' `ACTIVE_WORKLOAD_STATUSES`
self-equal assertion (a doc-assertion that can't fail — convert to a comment) · soft: compaction's
summary-echo half-assertion (adjacent real checks carry the test). The two db/schema enum-mirror
"tautologies" are deliberate contract-sync pins — correct, keep.

**Exemplars the house should keep citing** (the pattern the owner's instinct points at, done
right): the stats **drift-gate suite** (one canon through TWO independent production writers —
live deltas vs full rebuild — byte-identical rollups demanded; its comments credit it with
catching F6/F7/F8) · the **parity oracles** (`macro-identity.suite`, `pipeline-breakpoint.parity`
— two real implementations cross-checked, divergences annotated) · the **png CRC-32 independent
reference** (different construction, self-verified against the published check value before being
trusted). These are "rewriting the logic again" as a WEAPON — deliberately not-in-lockstep so
divergence screams.

**Full-coverage additions (the sweep's complete new-finding list — three items across 874
files):** two TAUTOLOGIES in `tests/server/domain/embeddings/contract/params.contract.test.ts`
(L44–86, L88–118 — the `DigestStoreParams`/`SegmentStoreParams` "shape pin" blocks assert fields
of a hand-built literal against itself, no production call in the loop; the same file's
SOURCE\_KINDS/TEXT\_LENSES constant checks are clean) · one mitigated REBUILT in
`tests/ui/content/theme-scope/palette-contrast.suite.test.ts` (L74–83 hand-mirrors clamp.ts's
derivation formula shape; drift is fenced by `clamp.test.ts`'s byte-exact output pin — annotate,
don't rewrite). Positive signal worth recording: the newest suites (cross-tenant IDOR sweep,
drift-gate, batch-atomicity, touch-target-floor) were independently graded exemplary, several
carrying explicit NON-VACUITY controls (a positive control proving the guard path fires before
the negative assert is trusted) — that control pattern is worth naming in Spine-Testing when its
clock paragraph gets fixed (§3).

**Total fix list (tiny):** R8 — **\[DONE 2026-07-10 except the workloads item — see note]**
`result.test.ts` REPINNED to the TurnOutcome discriminant contract (opposite `aborted` arms · committed
clears the reason · by-reference passthrough), not a structural echo; the `as unknown as MessageView`
fabrication dropped (baseline entry removed). The two embeddings shape-pin tautologies (L44–118) DELETED —
`StoreParams` is a pure TS interface union with NO zod schema to parse through, so the write shape is already
`tsc`-enforced at every producer; the clean SOURCE\_KINDS/TEXT\_LENSES constant checks kept. Three annotation
comments ADDED (pair-cosine CSLS · smart-arbitrate looseness · palette-contrast formula mirror).
**Workloads `ACTIVE_WORKLOAD_STATUSES` — NOT converted (reviewer premise was wrong):** the assertion
`expect([...ACTIVE_WORKLOAD_STATUSES]).toEqual(["queued","running","cancelling"])` compares the imported
const against a HAND-TYPED literal — it CAN fail if the tuple changes/reorders. It is a genuine
independent-literal pin, identical in kind to the un-flagged `WORKLOAD_STATUSES` mirror two lines above it,
NOT a can't-fail self-equal. Deleting it would remove real regression coverage, so it was left intact.

## 8. Dispatch queue

| # | Item | Lane |
| - | - | - |
| R1 | markdown/policy hostile-input suite (P0) | security-executor |
| R2 | egress/SSRF cluster tests (redirect-to-private · installEgressFirewall · cap boundaries · CSV parsing · abort) | security-executor |
| R3 | the four fake-vs-real fixes (§2: stats end-to-end, character→tag real wire, persona→chat real wire, openrouter chunk contract test) | executor |
| R4 | ~~doc drift fixes (§3: Spine-Testing clock, isSafeColor comment+test)~~ **DONE 2026-07-10** | mech-executor |
| R5 | ~~presence blind spots (§4: imagery contract test + gate-arm verify, runners/ scan arm)~~ **DONE 2026-07-10** | executor |
| R6 | thoroughness tail (§5) — bundle per tree | mech-executor / executor |
| R7 | OIDC full-mode coverage verify-then-write | security-executor |
| R8 | ~~provenance fixes (§7: result.test.ts tautology · embeddings shape-pins · 3 annotation comments)~~ **DONE 2026-07-10** (workloads item declined — valid literal pin, see §7 note) | mech-executor |

The mock-doctrine alias fix rode the gates lane (landed). R1/R2 are the only urgent rows.
