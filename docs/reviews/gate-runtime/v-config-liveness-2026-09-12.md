---
kind: review
status: active
updated: 2026-09-12
---

# cb-v-config-liveness — the config-liveness conversion wave (`97e68be91`, `46594b5d3`)

Fresh-context verification of the four policies landed by `97e68be91` (`biome-grant-liveness`,
`biome-grant-liveness-health`, `tsconfig-entry-liveness`, `tsconfig-entry-liveness-health`), the ten central
reviewed grants that replaced their gate-local tables, the deleted biome rule-liveness arm, the
`contract/policy-scope.ts` + `lib/policy-program-membership.ts` exposure, and `46594b5d3`'s roster count.
Every number below came out of a run in this session, in worktree `agent-acd81ff0aa4195b63` at `007c8b837`.

## Verdict per policy

| policy | verdict | the receipt that decided it |
| - | - | - |
| `biome-grant-liveness` | **CONFIRMED with defects** | conformance green through the production dispatcher; all four of its narrowings die under a cut (C1, C2, C3, C5 below); its one grant is consumed exactly once on the real tree. Defects L2, L3, L4, L5, L6 are legibility/coverage rows, none of which falsifies a shipped verdict |
| `biome-grant-liveness-health` | **CONFIRMED** | its anchor narrowing dies under a cut (C5); its single `mustFlag` carries `count` with a stated reason for the bare count; it reads the sibling's classifier rather than a copy |
| `tsconfig-entry-liveness` | **CONFIRMED** | conformance green; four narrowings die under cuts (C6, C7, C8, C9); nine grants consumed exactly once each; my own independently planted dead exclude + dead glob in a NON-ROOT config both flag and their live twins are silent |
| `tsconfig-entry-liveness-health` | **REFUTED** | a tracked roster member the `authored-text` door REFUSES is silently dropped from the subject set of BOTH siblings, and the tripwire whose declared job is *"a `tsconfig*.json` in the roster did not parse. Fail LOUD"* reports nothing. Reproduced, mechanism pinned, and the fix proven — row **L1** |

`46594b5d3` (the roster count) — **CONFIRMED**. Re-derived with the two-sided instrument, not a grep, and with
a planted positive control in the failing direction.

### L1, stated precisely (the refutation)

`readTsconfigRoster` (`tooling/src/verify/lib/config-grant-rows.ts:87`) is

```ts
const corpus = readyResourceValue(resources.authoredText(roster));
return corpus.files.map((file) => readCompilerConfigEntries(file.path, file.text));
```

`AuthoredTextCorpus` is a TOTAL partition — `files` **plus** `refusals`
(`tooling/src/verify/contract/resource-text.ts:18-21,39-42`) — and this reader discards `refusals`. A roster
member that refuses (`missing | empty | unresolved | malformed | unacquired`; the symlink class of #1947 and a
zero-byte tracked config are both in it) therefore never reaches `readCompilerConfigEntries`.

- **Input:** a resource fixture whose files are `{"tsconfig.json": "", "packages/client/src/live.ts": "…"}` —
  a tracked but EMPTY root config.
- **Expected:** the `-health` UNPARSEABLE arm fires. `readCompilerConfigEntries("tsconfig.json", "")` returns
  `{"status":"unparseable","reason":"config root is not a JSON object"}` (driven directly), so the arm WOULD
  fire if the text reached it.
- **Actual:** `verifyPolicyProofs` reports `expected at least one effective finding but got 0`. Same result with
  a readable root config beside a tracked empty `packages/client/tsconfig.json`.
- **Mechanism proof + fix proof:** folding `corpus.refusals` in as
  `{status:"unparseable", config: refusal.path, reason}` in a scratch sibling module makes the SAME fixture
  produce the "did not parse" finding — `failures=0`.
- **Why it is worse than one missed arm:** if EVERY roster member refuses, `roster.length !== 0` so
  `readTsconfigRoster`'s empty-roster THROW does not fire, `candidates === 0` so the `>= 30` NO-ROWS anchor does
  not fire, and both policies print a clean ✓ over a roster nothing read.
- **Why it is not a declared limit:** the module declares exactly this branch UNFALSIFIABLE at
  `tooling/src/verify/gates/tsconfig-entry-liveness-health.ts:33-36` — *"There is no fixture that reaches such a
  branch"* — on the argument that the roster derives from `tracked-files` so the two doors cannot disagree. Git
  membership and authored-text readability are different predicates; the fixture took under five minutes. Guide
  §4.1: *"UNFALSIFIABLE is a claim you owe a constructed fixture attempt, not an argument."*

## What I drove, and the exact commands

All from `env -C`-equivalent inside the worktree; scratch logs under this session's scratchpad.

1. `pnpm test:scoped tests/tooling/verify/gates/grant-liveness-family.test.ts tests/tooling/verify/gates/biome-grant-liveness.int.test.ts tests/tooling/verify/gates/tsconfig-entry-liveness.int.test.ts tests/tooling/verify/lib/policy-program-membership.test.ts`
   → exit 0, **4 files / 25 tests passed**.
2. `pnpm check:structure` (the serialized structure leg, GO given by the orchestrator) → exit 1 (baseline red),
   `0 tool error(s)` · `0 withheld` · `0 alarm(s)`, corpus `300/300 (54 legacy · 246 final)`, final pass
   `raw 1680 = waived 1197 + granted 206 + effective 277`. Per-policy RAW: `biome-grant-liveness` 1 → granted 1,
   effective 0; `biome-grant-liveness-health` 0; `tsconfig-entry-liveness` 9 → granted 9, effective 0;
   `tsconfig-entry-liveness-health` 0.
3. **`expect` census** over every `mustFlag` row of the four policies, printed from the loaded modules: 13 rows,
   **13 carry `expect` and all 13 carry `count`**; 6 add `token`, 5 add `messageIncludes`, 2 add `line`.
4. **Real-tree grant drive** (`runPolicyPass` over the worktree root with `reviewedGrantsFor([...])`):
   `toolErrors []`, all four owners `success`, `effective 0`, `alarms []`, and
   `reviewedGrantConsumption` = **ten rows, every one `count: 1`** —
   `biome-grant-liveness:catalog-tmp`, `tsconfig-entry-liveness:{g-fixture-file, g-fixture-tree, node-modules,
   scripts-cts, scripts-mts, scripts-tsx, st-goldens-runtime, tests-cts, tests-iso-helpers}`. One-to-one by
   measurement, not by reading `processReviewed`.
5. **Stale-grant positive control on the real tree:** adding one fabricated grant
   (`packages/nowhere/**/*.ts`) yields exactly `{"kind":"stale-reviewed-grant","grantId":"probe:never-matches",
   "message":"reviewed grant was unused after a complete owner run"}`. That is what makes the `alarms: []` in
   step 4 evidence rather than silence.
6. **§4.1 cut battery, twelve cuts.** Each patched a SCRATCH SIBLING module in the same directory (never a
   `?query` re-import, never the real file), asserted its anchor occurs **exactly once** in the file and refused
   otherwise, and named the POLICY it drove — the split-family rule. Results:

| cut | driven policy | rows died |
| - | - | -: |
| C1 `trackedPathOracle` DIRECTORY arm | `biome-grant-liveness` | 1 (`mustPass[3]`) |
| C2 negation-prefix filter | `biome-grant-liveness` | 1 (`mustPass[1]`) |
| C3 `groupGrantRows` collapse | `biome-grant-liveness` | 1 (`mustFlag[3]`, the §4.7 invented row) |
| **C4 `overrides`-only read, widened to top-level `files.includes`** | `biome-grant-liveness` | **0 — see L3** |
| C5 `REAL_CONFIG_MIN_INCLUDES` anchor | `biome-grant-liveness-health` | 1 (`mustPass[0]`) |
| C6 `rootedEntry` config-dir resolution | `tsconfig-entry-liveness` | 2 |
| C7 TEMPLATE partition | `tsconfig-entry-liveness` | 1 (`mustFlag[3]`) |
| C8 `groupGrantRows` collapse | `tsconfig-entry-liveness` | 1 (`mustFlag[4]`) |
| C9 `trackedPathOracle` DIRECTORY arm | `tsconfig-entry-liveness` | 1 |
| C10 `REAL_CONFIG_MIN_CANDIDATES` anchor | `tsconfig-entry-liveness-health` | 2 |
| C11 whole-roster unparseable loop → root only | `tsconfig-entry-liveness-health` | 1 (`mustFlag[2]`, the §4.7 invented row) |
| C12 exact liveness filter (harness control) | `tsconfig-entry-liveness` | 5 |

C12 is the harness's own positive control: the cut reaches the code and the rows can die.
7\. **§4.2 does not apply and §4.3 does.** Both grant-carrying halves are `authority: "reviewed-grant"`, not
`ordinary`, so there is no waiver position to flip; the brief's "positive identity arm for each ordinary half"
has no subject here. The §4.3 substitute is present and I ran it: `grant-liveness-family.test.ts`'s three arms
(intended grant consumed once and licensing; wrong operation → finding stays effective + alarm; renamed subject
→ stale) all pass, and step 5 is my own independent version of the third.
8\. **Independent plants (brief item 4).** A dead file-exact exclude and a dead glob in a NON-ROOT config
(`packages/db/tsconfig.json`: `exclude: ["src/vanished.ts", "nowhere/**/*.ts"]`) produce exactly 2 findings;
the live twins (`["src/live.ts", "src/**/*.ts"]`) are silent. `failures=0` in both directions.
9\. **Arm six.** `tooling/src/verify/lib/biome-rule-liveness.ts` does not exist; `judgeRuleLiveness` occurs on the
tree exactly once, inside the new module's own header prose; the only `biome-rule-liveness` string hits are two
review documents. Across the four modules and `lib/config-grant-rows.ts` there is **no `node:fs`, no
`node:child_process`, no `execFile`/`spawn`/`writeFile`/`readFile`/`existsSync`/`readdir`, and no
`new Project`** — the only runtime import outside the contract/lib set is `node:path`'s `posix`. The successor
is board row **#2074**, OPEN, titled *"biome grant rule-liveness is UNPOLICED since arm six was deleted
(97e68be91): build the successor verify OP on the static tier"*; `#2074` appears on the tree only in the law
doc, not in the module (an observation, not a row).
10\. **Contract coupling (brief item 4, first half).** `git show 97e68be91 -- contract/policy-scope.ts
    lib/policy-program-membership.ts` is **additive only** — no existing line is modified in either file, so no
pre-existing consumer is coupled. The new names (`COMPILER_CONFIG_FIELDS`, `CompilerConfigField`,
`CompilerConfigEntry`, `CompilerConfigEntries`, `readCompilerConfigEntries`, `compilerConfigRoster`) resolve to
exactly six files: the two changed sources, `lib/config-grant-rows.ts`, `gates/tsconfig-entry-liveness.ts`, and
the two tests. `TSCONFIG_RE` is the SAME regex `readCompilerPrograms` already used (`:21`, read at `:249` and
`:309`), so the roster is not a second spelling.
11\. **`__g_` planter rows (brief item 5).** The −20 in `tests/tooling/check-gates.repo.int.test.ts` is the removal
of the two `UNFIXTURABLE_GATES` entries plus their prose — required, because a converted policy left in that
set fails the suite's two-sided arm (the same reason `runner-config-path-liveness` was removed an hour
earlier). No proof row was retired there. Retired LEGACY arms, per module: DEAD-exact and dead-glob carried;
MISSING/UNPARSEABLE-CONFIG and CORPUS-BLIND replaced by population-phase tool errors and pinned; NO-ROWS moved
to the `-health` sibling; stale-EXEMPT/stale-RATIFIED replaced by the central zero-consumption alarm;
`CONFIG_DIR_BUDGET` replaced by the TEMPLATE arm + a grant door; MISSING-CONFIG (tsconfig) named as dropped
with its reason. **The one retired arm with neither a successor nor an honest "dropped" is DEAD-CITE — see
L5.** Field parity holds: legacy read `include`+`exclude` only, and so does `readCompilerConfigEntries`.
12\. **§4.6 differential.** The commit message states it (`check:structure` before/after both effective 216,
identical failing-gate set, corpus 297→299), which satisfies §8.8's "or state what it found". Substantively
this is the §4.6 **category-5 exemption-mechanism move**, whose falsifier is *"did every hidden site become
exactly ONE live, consumed row"* — answered by step 4: eleven legacy rows (1 biome `EXEMPT` + 1 biome
`RATIFIED` naming the SAME subject, collapsed by design, + 9 tsconfig) → ten grants → ten findings → ten
consumptions → zero effective → zero alarms.
13\. **Marker census (brief item 6).** `@orb-gate-ignore` naming either id: **0 on the tree, 0 at
`97e68be91^`** (`git grep` on the parent tree). Corpus control: the same pattern without the id filter matches
**120 files**, so the search is live; planted control: a synthetic
`// @orb-gate-ignore tsconfig-entry-liveness: planted control` line is matched by the anchored predicate.
`@orb-waive` naming either id: 0. So `0 = 0 = 0` is confirmed, and neither gate owned a private grammar.
14\. **The roster count (`46594b5d3`).** `pnpm test:scoped
    tests/tooling/verify/gates/enforcement-registry-parity.int.test.ts` → 12/12, exit 0. Positive control: with
the count line edited to `301` in a `cp`-backed copy of the roster, the same suite fails and the instrument
names the answer itself — *"declares "301 registered gates" but there are 300 active gate modules (54
status:"active" legacy descriptors + 246 final defineGate policies)"*. Restored from the backup; the tracked
file is byte-identical. My independent `check:structure` agrees: `300/300 (54 legacy · 246 final)`. Note the
54/246 split differs from the 55/245 quoted in `46594b5d3`'s message — a later conversion moved one module
across the partition; the TOTAL, which is what the line states, is unchanged.
15\. **`pnpm gate:contract`** → exit 1 (the corpus-wide legacy baseline) with **zero lines naming any of the four
modules**.
16\. **Roster port re-derivation.** `git ls-files | grep -E '(^|/)tsconfig[^/]*\.json$'` → **14** configs, matching
both the header's claim and the `authored-text#1: 14 resource(s)` the structure run printed for the pair. The
"strictly broader by construction" claim holds: the roster is a filter over the tracked inventory, not a
three-directory walk.
17\. **The `-health` absent-anchor fallback** (not claimed by any shipped row): a NO-ROWS fixture whose roster
carries only `packages/client/tsconfig.json` and no root config reports 1 finding through `subjectAnchor`
rather than throwing. Verified working; no row owed.

## LEDGER ROWS (6 rows)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| `tsconfig-entry-liveness-health` | cb-v-config-liveness L1 · `tooling/src/verify/lib/config-grant-rows.ts:87` | `readTsconfigRoster` maps only `corpus.files` and DISCARDS `corpus.refusals`, so a tracked roster member the `authored-text` door refuses (empty / unresolved / malformed / the #1947 symlink class) is silently dropped from BOTH siblings' subject set; the tripwire whose job is "did not parse — fail LOUD" reports nothing, and if every member refuses the empty-roster throw and the `>= 30` NO-ROWS anchor both stay quiet, printing a clean ✓ over an unread roster. The branch is declared UNFALSIFIABLE at `tsconfig-entry-liveness-health.ts:33-36` and a five-minute fixture reaches it | §4.1 narrowing | **OPEN** | fold `corpus.refusals` into `readTsconfigRoster`'s return as `{status:"unparseable", config: refusal.path, reason}` (proven: the same tracked-empty-config fixture then reds) and land a `mustFlag` row on `-health` carrying that fixture |
| `biome-grant-liveness` | cb-v-config-liveness L2 · `tooling/src/verify/gates/biome-grant-liveness.ts:140` | the same unread-refusal shape one notch milder: `corpus.files.find(…)?.text ?? ""` silently substitutes empty text when the `authored-text` door refuses `biome.json`, so every finding loses its line identity and anchors at line 1 with no refusal — the `json` resource having resolved means the config is real, so the degradation is invisible | other (unread resource refusal) | **OPEN** | refuse loudly (or throw) when `authoredText([CONFIG_REL])` returns a refusal for the config, rather than falling back to `""` |
| `biome-grant-liveness` | cb-v-config-liveness L3 · `tooling/src/verify/lib/config-grant-rows.ts:135` | `overrideIncludes` reads only `overrides[].includes`, excluding the top-level `files.includes` list — a real narrowing (the legacy header declared it; the converted header no longer mentions it) that NO proof row enforces. Measured: widening the read in a scratch sibling killed **0** rows (C4), while a planted fixture carrying a dead path in `files.includes` is silent at tip and REDS under the same widening — so the classification is UNENFORCED, not unfalsifiable | §4.1 narrowing | **OPEN** | add a `mustPass` row whose `biome.json` carries a dead path in the TOP-LEVEL `files.includes` beside a live override entry, and restate the fence in the module header |
| `biome-grant-liveness` | cb-v-config-liveness L4 · `tooling/src/verify/gates/biome-grant-liveness.ts:1` | the header records FAMILY, readers and AUTHORITY but carries **no POPULATION PORT line and no legacy SHA**, which §5b.5 requires and which its own twin `tsconfig-entry-liveness.ts:41-45` supplies; both `-health` siblings are likewise SHA-less | §5b.5 header | **OPEN** | add the population-port paragraph (legacy `scanRoot: () => false` + repo-root `biome.json` → `{ of: "none" }` + the `json`/`tracked-files`/`authored-text` declarations) and the pre-conversion SHA `97e68be91^` to all four headers |
| `biome-grant-liveness` | cb-v-config-liveness L5 · `tooling/src/verify/gates/biome-grant-liveness.ts:29` | the header names `dangling-refs` as where a moved grant justification is still caught. It is not: `dangling-refs` arm 1 opens ONLY `tooling/src/verify/gates/*.ts`, reads only the `gate` object's `docRow`/`message`/`fix`, and tokenizes only `*.md` (`dangling-refs.ts:166,181-200`); arms 2-5 are markdown corpora. `lib/reviewed-grants.ts` is in no arm's population, so the retired DEAD-CITE property is unpoliced OUTRIGHT, not "held elsewhere" | §4.6 differential | **OPEN** | correct the sentence to state the property is unpoliced and file its successor (a citation check over `reviewed-grants.ts`'s `why`/`endsWhen` prose), the same way arm six got #2074 |
| `biome-grant-liveness` | cb-v-config-liveness L6 · `tests/tooling/verify/gates/biome-grant-liveness.int.test.ts:47` | the module header (`:36-37`) claims an empty tracked corpus refuses as a runtime tool error, and the int test pins only MISSING and UNPARSEABLE — the twin `tsconfig-entry-liveness.int.test.ts` pins its corpus-blind successor and this one does not, so the legacy CORPUS-BLIND arm's successor is asserted by nothing | §4.5 pin | **OPEN** | add the "an EMPTY TRACKED CORPUS refuses at the population phase" arm to `biome-grant-liveness.int.test.ts`, mirroring `tsconfig-entry-liveness.int.test.ts` |

## WHAT I DID NOT COVER

- **A fixture-level §4.6 replay.** I did not extract the pre-conversion descriptors and drive them through the
  legacy `runPass` over each proof's own file map. My differential evidence is the category-5 grant reconciliation
  (step 12) plus the commit's own before/after structure statement, not a per-example legacy/final finding table.
- **`pnpm check:policy-conformance` whole-corpus.** I ran the four policies' rows through `verifyPolicyProofs`
  directly and through the family test; I did not re-run the commit's `241 policies / 2713 rows / 141 grants`
  figures.
- **The other three `grant-liveness` members.** `depcruise-grant-liveness`, `eslint-grant-liveness` and
  `runner-config-path-liveness` were run only as part of the family conformance arm; I did not audit them.
- **Whether L1's refusal states are reachable on the CURRENT tree.** All 14 tracked configs read cleanly today
  (`authored-text#1: 14 resource(s)`, zero refusals in the structure run). L1 is a blindness hole proven by
  construction, not a live miss.
- **`pnpm typecheck`, biome and eslint over the landed files.** The commit names them; I did not re-run them, and
  the four modules are `gate:contract`-clean in my own run.
- **The board.** I filed nothing and touched no `work:item` row; the six rows above are the orchestrator's to
  append and to file.
- **A brief-premise correction, recorded rather than acted on:** the brief says "82 grant rows in
  `lib/reviewed-grants.ts`". The diff is **+82 LINES = 10 grant rows** (1 biome + 9 tsconfig), which is also what
  the module headers and `reviewedGrantsFor` say. Everything above is measured against the ten.
