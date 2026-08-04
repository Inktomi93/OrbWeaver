---
kind: review
status: active
updated: 2026-08-03
---

# Archive rescue audit — FINAL / VERIFYING pass (lines 2130–3515 re-read, all TAIL rows re-verified)

> **Charge (owner, 2026-08-03):** *"if it needs follow up it goes on the board, otherwise it gets
> forgotten."* This is the THIRD pass over `docs/history/retro-workboard-2026-08-03.md`.
>
> **Its dispatch premise died on contact and the orchestrator confirmed the correction.** The brief
> said lines 2130–3515 were unread. They were not — lane ARCHIVE2 read them and its ten rows are
> live on the board. The board contradicted itself: the TAIL section header says ARCHIVE2 covered
> 2130–3515, while a separate COVERAGE-GAP bullet still described the FIRST lane's 1–2130 as the
> whole story. Re-scoped by agreement to the job that was actually worth doing: **be the second
> reader and the VERIFIER**, because a range that produced three-of-five wrong rows for the original
> grep pass has no business being trusted to one reader — and several ARCHIVE2 rows were asserted
> from the DOCUMENT's own citation rather than a fresh check (the board flags T-11 as exactly that).
>
> **Method.** Full line-by-line read of 2130–3515 (100%), then every boardable claim re-derived
> against TODAY's tree. Presence/absence claims run `pnpm ast` (`scripts/codemods/ast.ts`, the
> repo's resolution-based instrument) **plus** a second independent engine (`/usr/bin/grep -a
> --exclude-dir=node_modules`), and every absence is stated only where a POSITIVE CONTROL on the
> same instrument returned hits. No claim here rests on one pattern.

## Headline

| | count |
|---|---|
| ARCHIVE2 board rows re-verified | **10 of 10** |
| … CONFIRMED still open (row stands) | **4** |
| … **DEAD — delete the row** (already built / structurally impossible) | **3** |
| … **materially WRONG — rewrite the row** (scope or evidence stale) | **2** |
| … owner-parked, no code verdict possible | **1** |
| ARCHIVE2 "refused to guess" rows settled | **2 of 2** (one deleted, one narrowed) |
| ARCHIVE2 flagged-UNVERIFIED tail settled | **2 of 3** (third needs a side-eye dispatch) |
| NEW residue ARCHIVE2's read missed | **2 boardable** (+ 6 candidates verified CLOSED) |

**Three board rows are dead and two are wrong.** That is a 50% defect rate in a section the board
presents as verified — the same rate the original grep pass hit, on a different lane, which is the
whole argument for this pass. `ZOD-STAGE-D-OWNER-GATE` in particular is **fully built on all three
arms** and would have burned a dispatched lane exactly like CP-DROPPED-WARN did tonight.

---

## A. Re-verification of the 10 boarded TAIL rows

| Row | Verdict | Receipt (today's tree) |
|---|---|---|
| **SQUARE-GLYPH-BUTTON-SWEEP** | **STANDS** | `scripts/check/gates/ui-size-via-variant.ts:75-86` — `DEBT_BASELINE` holds exactly 14 across 9 `features/rpg` files (1+1+1+4+1+1+2+2+1); the header at `:24-27` still records it as re-opened and unpaid. |
| **ICON-SEAL-DOORWAYS** | **STANDS** | `pnpm ast ident` → `LucideProvider` / `iconNode` / `fillRule` / `vectorEffect` = **no results**, all four. POSITIVE CONTROL on the same instrument: `ident absoluteStrokeWidth` → 1 hit (`packages/ui/src/primitives/icons/icon.tsx:93`), so the search ran. Second engine: `/usr/bin/grep -rn` over `packages/ui/src` + `packages/client/src` for all four literals (incl. the CSS spellings `vector-effect` / `fill-rule`) → exit 1. |
| **AMBIENT-NONE-AFFORDANCE** | **STANDS** (sharper) | `packages/client/src/components/tracker-blocks/ambient-strip.tsx:100-118` — the open picker is a bare `vocab.map(...)` with no clear entry; `:42-47` binds `timeOfDay`→`TIME_OF_DAY` (6 labels, `packages/contracts/src/rpg/ambient.ts:75`) and `weather`→`RPG_WEATHER_TYPES` (`:29`, = kit `WEATHER_TYPES`), neither carrying an unset member. **Sharper than the board says:** the REST state already renders `—` for empty (`:68-69`), so the surface can DISPLAY unset but can never RETURN to it — the affordance gap is one-way, which is the cheap fix hint. |
| **MACRO-CAST-GUIDES-FORK** | **STANDS** | `/usr/bin/grep -n "appearance\|outfit\|thoughts" packages/server/src/domain/rpg/chat-ops/macro-view.ts` → exit 1 (file present, 186 lines). Second method: `ast-grep run -p 'appearance' -l ts packages/server/src/domain/rpg/` → **scannedFileCount=68**, the only hits are `tools/apply.ts:281,291`. The cast projection genuinely omits all three; the owner fork was never posed. |
| **TRACKER-GRANT-EDITOR** (T-11 — the row the board itself flags as never re-grepped) | **STANDS — now firmly** | `pnpm ast ident trackerGrants` → 39 hits / 19 files, **zero in `packages/client`**; `ident trackerRevokes` → 40 hits / 21 files, **zero in `packages/client`** (both instruments returned hits elsewhere, so neither is a silent zero). Server + tests only. Strengthener the archive didn't have: `tests/server/entry/boot/seed-demo-chats.int.test.ts:227` asserts a seeded `trackerRevokes: ["hp","stamina"]` — the field gates real shipped behaviour, so "the explicit-list-only ruling is a dead letter without an editor" is literally true today. |
| **ZOD-STAGE-D-OWNER-GATE** | **⛔ DEAD — DELETE** | All THREE arms are built. **stringbool:** `packages/server/src/foundation/env/index.ts:138` — `z.stringbool({ truthy: ["true"], falsy: ["false"], case: "sensitive" })`, exactly F5's pinned-params recommendation. **hostname:** `packages/contracts/src/plugin/manifest.ts:62` — `const netHostSchema = z.hostname();`, with `:37-52` documenting the 2026-08-02 replacement of the `NET_HOST_RE` charset regex and its probe receipts; `NET_HOST_RE` no longer exists. **strip-observability:** `packages/kit/src/json-schema/index.ts:17-20` states the resolution verbatim (*"The residual silence is closed by OBSERVABILITY, not by strictness"*) and it is WIRED — `strippedToolCallKeys` + `logStrippedKeys` at `packages/server/src/entry/compose/rpg.ts:660,754`, event `rpg.extraction.stripped`, `stripped` field declared at `packages/contracts/src/rpg/extraction.ts:510`, 7 assertions in `tests/contracts/rpg/extraction.contract.test.ts`. Nothing to pose. |
| **WORKLOADS-LABEL-RENAME** | **⛔ DEAD — DELETE** | Method 1: `/usr/bin/grep -rn -F "workloads.subscribe cross-feature"` over `packages` + `tests` → **exit 1**. Method 2: read all three NAMED sites — `rpg-choice-echo.tsx:7` and `use-rpg-mutations.ts:177,223` now cite *"lockdown §12"*, not the retired label; and `chat-options-menu.ts` no longer exists (it is `.tsx`) with zero `cross-feature`/`workloads` mentions at all. The rename already happened. |
| **IMPORT-SETTINGS-WRITE-GUARD** | **⛔ DEAD — DELETE (phantom, structurally impossible)** | The "write guard" being bypassed is `coherentRoutingPatch`, and `packages/server/src/domain/settings/verbs/update-user-settings-section.ts:36` applies it **only when `section === "routing"`**. `routing` is explicitly FENCED OUT of the portable set: `packages/server/src/kit/serde/user-settings/index.ts:33` — *"Fenced out: routing (connection config), seeds/profile/theme entity-id refs, groupDefaults, onboarding, workloads, regex, schemaVersion"* — and `:48` types it shut (`PortableUserSettings = Pick<UserSettings, ShareSafeSettingsNamespace>`). An import CANNOT carry a routing patch, so there is no guard to lift. **I also chased and dismissed an adjacent suspicion before filing it:** `import-user-settings.ts` never fires `ctx.onEmbedModelChanged()` (which `update-user-settings-section.ts:59-61` does), but the embed model ids live under `config.routing.roleDefaults` (`:18-23`) — also fenced out — so there is no reindex gap either. |
| **DOCLAW-RPG-REFS-FORK** | **⚠ REWRITE — scope is ~28× the board's** | The count is right (`grep -c "§" entry/compose/rpg.ts` → 41 lines / 42 occurrences, all in comments) and the conflict is real and verbatim: `docs/architecture/core/Documentation-Law.md:114` — *"**No doc citations in comments** — no D-numbers, no §-refs, no doc filenames. The ONE exception: `FLAG[PD-n]` (gate-reconciled)."* **But the row frames this as one file.** Tree-wide: **1,151 source files carry 4,066 `§` occurrences** across `packages/**/*.{ts,tsx}`. `compose/rpg.ts` is ~1% of the violation. This is not an S-sized file fix — it is either a ONE-LINE carve-out in Documentation-Law or an L-sized tree-wide campaign, and boarding it as "sweep rpg.ts" would produce a lane that fixes 1% and reports done. |
| **EMBER-VOCAB-SWEEP** | **⚠ REWRITE — cited evidence is stale AND the row carries a token hazard** | All three cited sites are **already fixed** (smalls#3's ember/jobs prose sweep): `rpg-hud.tsx` has zero `ember` (the only `-ember` matches are `membership`/`member`); `rpg-context-section.ct.tsx` is 2,580 lines with its ember hits at `:807,:836`, not the cited `:1604`; and the *"ember state colour"* CT title returns exit 1 across `tests` + `packages`. **The class survives far wider** (~45 sites: `preset/components/knob-row.tsx:146`, `section-row.tsx:11,46`, `actions-view.tsx:132`, `app-shell/surfaces/shell.css:152,349,368,419,683`, `character-facet-row.tsx:4,40`, `rail.ct.tsx:42,58,61,74`, `app-shell.ct.tsx:1211,1247,1251`, …). **⚠ HAZARD the row must carry:** `--color-sky-ember` / `--color-sky-ember-deep` are LEGITIMATE SHIPPED TOKENS — the Waystone atmospheric palette (`packages/ui/src/charts/meter/waystone-treatment.ts:163-190`, `waystone-geometry.ts:127,149`, pinned by `tests/ui/content/theme-scope/token-classification.suite.test.ts:103-104` and asserted by name in `tests/ui/charts/meter/waystone-treatment.test.ts`). A lane dispatched on "rename ember → accent" that does not know this will break the sky palette. |
| **AGENT-1-PROGRAM** | **STANDS (owner-parked; no code verdict possible)** | The archive is self-consistent that this is scoped-not-dispatched (`:3372-3384`, and `:2746-2747` *"REMAINING OWNER-GATED: … AGENT-1 (parked on word)"*). Its five arms are product decisions, not code presence — nothing a tree check can settle. Correctly on the board; it is waiting on the owner, not rotting. |

---

## B. The two rows ARCHIVE2 explicitly REFUSED to guess on — both settled

### B-1. `SM7-STRICT-RESIDUE` — **SETTLED: real, live, and now precisely located**

The prior pass could not find it because the path moved out of `backends/`: it is
**`packages/server/src/infra/providers/vllm/engine/chat-completion.ts:96-103`** (was
`backends/vllm/engine/chat-completion.ts:116`). The second builder survives and emits

```
response_format: { type: "json_schema", json_schema: { name, schema } }   // no `strict`
```

while the sibling surface builder — same wire family — wraps with `strictByDefault`
(`vllm/surfaces/chat.ts:137,147-149`). **This is not cosmetic.** The chat surface's own header states
the rationale verbatim (`vllm/surfaces/chat.ts:143-146`):

> *"vLLM is the opposite case: its `response_format` is GUIDED DECODING, an enforcing wire where
> strict is the whole point — an 8B skips optional fields unless the compiled grammar requires the
> shape."*

Reach: the engine builder's ONE production caller is `vllm/surfaces/summarize.ts:82`, which backs two
roles — `createVllmSummarize` passes `responseFormat: undefined` (`:163`, branch dead), and
**`createVllmStructured` passes a real one (`:180`)**. So the `structured` PROVIDER_ROLE's guided
schema goes on the wire WITHOUT the strictness the `chat` role gets by default, on the exact wire
where the tree says strictness is load-bearing. This matches `[[xgrammar-enforced-schema-is-the-populate-lever]]`.

**Honest limit:** I verified the ASYMMETRY and the tree's own stated rationale. I did NOT verify
vLLM's server-side semantics of `strict` inside `json_schema` on the non-streaming
`/v1/chat/completions` path, and I ran no live probe. What would settle the remaining question: one
live `structured`-role call against the local fleet with and without `strict`, comparing whether
optional fields are populated.

### B-2. `SSE-STARVATION-PIN` — **SETTLED: the instrument EXISTS; only the LIVE assertion is missing → NARROW the row**

The route and its unit pins are built, contradicting "could not find it":

- `packages/server/src/foundation/observability/debug/routes.ts:217` — `app.get("/api/_debug/stream/sockets", …)`, injected counter declared at `:155`.
- `packages/server/src/transport/trpc/stream/socket-registry.ts:130` — the read seam.
- `tests/server/foundation/observability/debug/index.test.ts` — header at `:5-7` names it verbatim as *"the STARVATION REGRESSION PIN"*, with a 4-test `describe` at `:68-111` (whole-process count, `?userId=` narrowing, 401 on the gate, 404 when unwired). Plus `tests/server/entry/app.test.ts:111`.

What is genuinely absent is the LIVE assertion of spec §12's numbers (1 per tab · 2 across tabs · a
game chat adds ZERO). Two methods: (1) `/usr/bin/grep -rn "stream/sockets\|socketsFor\|one socket
per tab\|one-socket" tests/e2e` → **exit 1**; (2) enumerated all six `tests/e2e` files mentioning
"socket" and read every socket line — `support/sse.ts` and `multi-tab-room-sync.spec.ts` build raw
per-caller SSE consumers to assert FRAMES, and none fetches the debug route. Those numbers were
measured by HAND (workboard `:2981-2983`) and never pinned. **Row survives, narrowed and now
buildable.**

---

## C. ARCHIVE2's own flagged-UNVERIFIED tail

| Item | Verdict |
|---|---|
| `refEnumerationLines` active-conditions coverage (R5b(a)) | **⛔ BUILT — delete.** `packages/server/src/entry/compose/rpg.ts:591-596` carries the block with an inline comment naming R5b(a)/R5a: `` `Currently-active conditions (removeCondition must name EXACTLY one of these): ${refs.conditionNames.join(", ")}.` ``. |
| The two contradictory `#16 engine wake` mentions | **⛔ ALREADY RECONCILED ON THE BOARD — delete.** In-document: `:3357` ("still open") sits in the earlier PROBES layer; `:2822-2824` is the LATER record — *"ENGINE PASS: 6/6 arms PASS live … RESIDUAL owner-authorized: the VRAM-refusal drill needs a real GPU hog"*. The current board already encodes exactly this at `docs/retro-workboard.md:744` (VRAM-refusal drill as an owner item) and `:771` (*"pass beyond the 6/6 arms already proven, and the VRAM drill it depends on"*). Nothing to add. |
| The six UNREACHED side-eye items (waystone-compact · impersonate+1 · scene-lightbox · Status max-edit · F9/F10 · stats-Recompute) | **NEEDS A SIDE-EYE DISPATCH — not settleable from source.** Every one is a rendered-state question against a model-populated game; no code check distinguishes "absorbed by a later round" from "still unswept". Per the orchestrator's instruction I am naming it rather than guessing. |

---

## D. NEW residue — candidates ARCHIVE2's read missed

ARCHIVE2 classified the compaction-handoff blocks (2220–2530, 2530–2930) as *"chronological noise"*.
They are not: they are where owner FORKS and named-not-built follow-ups were parked in prose. I
pulled 12 candidates from there and verified each. **Six turned out CLOSED** (recorded in §E so
nobody re-checks). Two are boardable:

| # | Finding | Location | Evidence |
|---|---|---|---|
| **G-1** | **Stale probe corpora — an OWNER CALL that was raised and never answered:** *"FLAGGED stale probe artifacts (hpDelta in run-coverage.mjs / native-wire-probe.mjs / real-cheap-toolround.json — already stale at merge-base with 13 pre-existing retired symbols): OWNER CALL whether probe corpora are maintained or archived."* | workboard `:2332-2334` | `hpDelta` is RETIRED from product code — `pnpm ast ident hpDelta` → 15 hits in 5 files, **all tests**, and `tests/server/entry/compose/rpg.int.test.ts:1480` asserts `party.properties?.hpDelta` is `undefined`. It survives extensively across `scripts/probes/**` (`rpg-extraction/SPEC-coverage.md:6,63,74,85`, + ~50KB of further hits) as live-looking vocabulary. Nobody re-probing from these corpora would know the schema moved. Not on the board under any spelling. |
| **G-2** | **`@orb-gate-ignore` reason-audit + six-case probe** — the board records this as owed but buries it inside a prose bullet on a LANDED item, where the graduation check will not see it: *"⚠ OWED — THE SIX-CASE PROBE WAS NEVER RUN … the §5 probe … and the §4.3a two-guarded-things-on-one-line case are unproven. Also unverified: whether tightening surfaced any PREVIOUSLY-SILENT violation … and an audit of the 24 rewritten reasons for any that paper over a real defect."* | `docs/retro-workboard.md:690-696` | Already live on the board as PROSE only, with no `- [ ]` row. This is precisely the failure class the HISTORY-GRADUATION rule names (four docs graduated carrying live obligations, every survivor a PROSE TAIL). **Flagged for the orchestrator as a formatting fix on its own board, not a new obligation** — it needs a checkbox row or it dies at the next archive sweep. |

---

## E. Blocks and candidates that yielded ZERO (recorded so nobody re-reads them)

**Blocks (lines 2130–3515), read in full, no still-open row:**

1. **ORCHESTRATOR QUICK-ONBOARD + lesson-banking prose (2130–2220)** — process notes; no obligations. (Concurs with ARCHIVE2.)
2. **PRESET wave detail blocks (2565–2870)** — P0–P5 / V1 / V2 / B1–B4 / FIX-ALL all self-recorded complete; D1–D7 ruled. (Concurs.)
3. **THE QUEUE closeout ledgers (2966–3120)** — SSE S0–S5 (D118), HUD-HOME H0–H4 (D119), SET-SEAMS S0–S6 (D120), WORKLOADS stage-E all closed; its ONE named residue (the workloads label) is DEAD per §A. (Concurs, with the label row corrected.)
4. **OWNER DECISIONS — ALL RULED (3118–3134)** — self-labelled none-pending; spot-checked two against the tree, both built. (Concurs.)
5. **PROBES / OPTIONAL (3344–3357)** — F4/F4a/F5/OR-5/OR-7 all struck MEASURED; F4-CACHE-VOLATILITY built (ARCHIVE2's T-20 receipt re-read and accepted); the `#16`/D22 line resolved in §C.
6. **DISCUSSION PILE (3359–3436)** — every item owner-labelled riffing/parked/by-design. (Concurs.)
7. **STANDING FACTS + POSTURE (3437–3485)** — posture and instrument reference; no obligations.
8. **LANDED — the 08-01 ledger (3486–3515)** — closed-day history; no open items possible by construction. (Concurs.)

**Individual candidates pulled from the handoff prose and verified CLOSED — do not re-board:**

| Candidate | Source | Why closed |
|---|---|---|
| **START-1** — `startChat({opening:"generate"})` non-atomic, orphaned chat + lying toast | `:2972-2975` | BUILT exactly as prescribed. `packages/server/src/domain/chat/verbs/start-chat.ts:14-15` — *"The `generate` opening is the ONE part of this verb that is NOT atomic with the room … it is DEGRADED-NOT-BROKEN: its failure comes back as `openingFailure` DATA"*. |
| **maxBudgetUsd / D6 owner fork** ("verify the wire enforces budgets, then editor-or-delete") | `:2495-2496`, `:2839` | RULED and executed as DELETE. `pnpm ast ident maxBudgetUsd` → 3 hits in 2 files; the only source hit is `packages/contracts/src/preset/index.ts:1223` — `const { maxBudgetUsd: _retired, ...rest }`, a stored-value stripper. |
| **NumberField-vs-native owner design call** (4 feature sites render raw `Input type="number"`) | `:2868-2870` | MIGRATED. Method 1: `grep -rn 'type="number"' packages/client/src` → zero. Method 2: `pnpm ast jsx NumberField` → 34 usages in 10 files (instrument returns hits, so not a silent zero); the three named files no longer exist under those paths — the admin surfaces moved to `features/user-admin/components/*`. |
| **GM-tab game-macros EDITOR** ("small follow-up; read end + write arm landed") | `:3408`, `:3165-3168` | BUILT. `packages/client/src/features/rpg/components/rpg-game-macros.tsx` (8 `userMacros` references), alongside `components/user-macro-editor-dialog.tsx`. |
| **D117 deferrals** (two-lane worker + `workloads.lane` column, durable progress, poison-row surface) | `:2251-2253` | Superseded IN-DOCUMENT by `:3096-3112` — *"ALL LANDED + MERGED (`bea2851c`) … **WORKLOADS = FULLY DONE including review + fixes**"*, incl. Q4 stats.reconcile. |
| **Theme-radius knob narrowing** (owner eyeball: reaches ELEVATED islands only) | `:2850-2852` | RULED in the same document at `:2862` — *"OWNER RULINGS: theme-radius narrowing FINE as-is"*. |
| **Rendered-clip CT audit** (proposed, undispatched — "owner call") | `:2903-2904` | RULED at `:2878` — *"Rendered-clip CT audit: owner declined — dropped."* |

---

## F. BOARD PATCH — paste-ready

### F.1 DELETE these three rows outright (verified built / impossible)

```
- ZOD-STAGE-D-OWNER-GATE      → all three arms BUILT (env/index.ts:138 · plugin/manifest.ts:62 ·
                                 compose/rpg.ts:660,754). Nothing to pose to the owner.
- WORKLOADS-LABEL-RENAME      → the retired label is gone from all three named sites; the literal
                                 returns zero across packages+tests. Rename already happened.
- IMPORT-SETTINGS-WRITE-GUARD → PHANTOM. `routing` is fenced out of SHARE_SAFE_SETTINGS_NAMESPACES
                                 and out of the PortableUserSettings type, so an import can never
                                 carry the patch the guard guards.
```

Also delete from the **"⚑ ARCHIVE2's own UNVERIFIED tail"** bullet: `refEnumerationLines`
(built, `compose/rpg.ts:591-596`) and the two `#16 engine wake` mentions (already reconciled on this
board at `:744` + `:771`). Leave the six UNREACHED side-eye items — they need a side-eye dispatch.

### F.2 REPLACE these two rows (current text is materially wrong)

```
- [ ] **DOCLAW-SECTION-REFS-FORK** (S to DECIDE, L if swept) — Documentation-Law:114 bans §-refs in
      comments outright ("no D-numbers, no §-refs, no doc filenames"; sole exception FLAG[PD-n]).
      The violation is NOT one file: **1,151 source files carry 4,066 `§` occurrences** across
      packages/**/*.{ts,tsx} (compose/rpg.ts's 42 is ~1%). Pose the fork: write the carve-out
      rationale into Documentation-Law (one line), or accept an L-sized tree-wide campaign.
      Do NOT dispatch this as "sweep rpg.ts" — that fixes 1% and reports done.
- [ ] **EMBER-VOCAB-SWEEP** (S) — the owner's 08-02 ruling ("ember is a THEME, not a design
      constant") is unswept, but the three CITED sites are already FIXED (rpg-hud.tsx has zero;
      rpg-context-section.ct.tsx's hits are at :807/:836 not :1604; the "ember state colour" CT
      title is gone). The class survives at ~45 sites — knob-row.tsx:146, section-row.tsx:11,46,
      actions-view.tsx:132, shell.css:152/349/368/419/683, character-facet-row.tsx:4,40,
      rail.ct.tsx:42/58/61/74, app-shell.ct.tsx:1211/1247/1251.
      ⚠ HAZARD FOR THE LANE: `--color-sky-ember` / `--color-sky-ember-deep` are LIVE SHIPPED TOKENS
      (the Waystone atmospheric palette — waystone-treatment.ts:163-190, pinned by name in
      tests/ui/content/theme-scope/token-classification.suite.test.ts:103-104). Renaming those
      breaks the sky. Sweep the PROSE only.
```

### F.3 REPLACE the two "refused to guess" rows with settled ones

```
- [ ] **VLLM-STRUCTURED-STRICT** (S, was SM7-STRICT-RESIDUE — now SETTLED and LOCATED) — the vLLM
      `structured` role's guided-decoding schema goes on the wire with NO `strict`, while the `chat`
      role gets `strict:true` by default on the same wire.
      Builder: providers/vllm/engine/chat-completion.ts:96-103 (the old cited backends/vllm/ path
      was restructured — that is why the prior pass could not find it).
      Sibling that DOES set it: providers/vllm/surfaces/chat.ts:137 via strictByDefault(:147-149),
      whose own header (:143-146) argues strictness is "the whole point" here because "an 8B skips
      optional fields unless the compiled grammar requires the shape".
      Reach: engine caller = surfaces/summarize.ts:82; createVllmSummarize passes undefined (:163,
      dead branch) but **createVllmStructured passes a real responseFormat (:180)** — the branch is
      live for the `structured` PROVIDER_ROLE.
      Matches [[xgrammar-enforced-schema-is-the-populate-lever]]. NOT yet verified: vLLM's
      server-side semantics of `strict` on this path — one live structured call with/without it
      settles whether this is a behaviour fix or a consistency fix.
- [ ] **SSE-SOCKET-COUNT-E2E** (S, was SSE-STARVATION-PIN — now SETTLED and NARROWED) — the
      instrument EXISTS and is unit-pinned (route foundation/observability/debug/routes.ts:217;
      4 tests at tests/server/foundation/observability/debug/index.test.ts:68-111, whose header
      calls it "the STARVATION REGRESSION PIN"). What is missing is the LIVE assertion of spec §12's
      numbers — 1 socket/tab, 2 across tabs, a GAME chat adds ZERO — which were measured BY HAND
      (workboard:2981-2983) and never pinned. Zero e2e spec fetches the route (two methods).
      Build: one e2e spec that hits /api/_debug/stream/sockets and asserts 1/2/0.
```

### F.4 ADD this row (new residue, not tracked under any spelling)

```
- [ ] **PROBE-CORPORA-CALL** (S, owner-call) — an owner call raised 08-02 and never answered:
      are the probe corpora MAINTAINED or ARCHIVED? `hpDelta` is retired from product code
      (`pnpm ast ident hpDelta` → 15 hits, ALL tests; rpg.int.test.ts:1480 asserts it undefined)
      but survives all over scripts/probes/** as live-looking vocabulary
      (rpg-extraction/SPEC-coverage.md:6,63,74,85 + ~50KB more). Anyone re-probing from these
      corpora scores against a schema that moved. Source: workboard:2332-2334.
```

### F.5 ONE FORMATTING FIX ON YOUR OWN BOARD (not a new obligation)

`docs/retro-workboard.md:690-696` carries the `@orb-gate-ignore` owed work — the never-run six-case
probe, the §4.3a two-guarded-things case, the "did tightening surface a previously-silent violation"
question, and the audit of the 24 rewritten reasons — **as a prose bullet under a ✅ LANDED item,
with no `- [ ]` row.** That is exactly the shape the HISTORY-GRADUATION rule says gets lost when a
block is archived (the graduation check reads findings TABLES, not paragraphs). Give it a checkbox
row before this section graduates.

### F.6 Rows re-verified and CONFIRMED — no action, leave as written

`SQUARE-GLYPH-BUTTON-SWEEP` · `ICON-SEAL-DOORWAYS` · `AMBIENT-NONE-AFFORDANCE` ·
`MACRO-CAST-GUIDES-FORK` · `TRACKER-GRANT-EDITOR` · `AGENT-1-PROGRAM` (owner-parked).

---

## G. Coverage, and what I refused to guess on

**Coverage: lines 2130–3515 of 3515 — 100% of the assigned range, read line by line**, plus a full
re-verification of the 10 rows the prior pass derived from it, plus the 2 rows the first pass
refused, plus the 3 items the second pass flagged unverified.

**Verification floor run:** `pnpm check:docs` + `pnpm check:structure` (this lane writes docs only).
**Playwright CT: NONE apply** — this lane touched no component, no story, and no test file.

**Refused, with what would settle each:**

1. **The six UNREACHED side-eye items** (waystone-compact live · impersonate +1 · scene-lightbox ·
   Status max-edit · F9/F10 · stats-Recompute render). Rendered-state questions on a
   model-populated game; no source check separates "a later round absorbed it" from "still
   unswept". **Settles with:** one scoped side-eye dispatch naming these six specifically, against
   a model-populated game (`[[seeded-data-never-verification]]` applies).
2. **Whether `VLLM-STRUCTURED-STRICT` is a BEHAVIOUR fix or a CONSISTENCY fix.** I proved the
   asymmetry and quoted the tree's own rationale; I did not prove vLLM changes the compiled grammar
   on `strict`. **Settles with:** one live `structured`-role call against the local fleet with and
   without `strict`, comparing optional-field population.

**Instrument note worth banking (it cost me two probes and is a silent-zero generator):**
a **bare JSX-attribute pattern is not matchable in ast-grep** — `ast-grep run -p 'absoluteStrokeWidth'`
and `-p 'absoluteStrokeWidth={$V}'` BOTH returned zero at `scannedFileCount=99` against a file that
demonstrably contains `absoluteStrokeWidth={true}` (`packages/ui/src/primitives/icons/icon.tsx:93`).
Only a full-element pattern matches. Every failure mode there is a silent zero, which is exactly the
shape that produces a false absence claim. **`pnpm ast ident <name>` is the right instrument for a
name-presence question in this repo** — it found the same symbol immediately and it prints a hit
count you can sanity-check against a positive control.
