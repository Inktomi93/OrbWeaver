---
kind: review
status: active
updated: 2026-09-12
---

# Verifier report — the 2026-09-11/12 night conversion wave (#1584)

Lane `cb-v-night-conversions`, fresh context, READ-ONLY on tracked source. Subjects: `ff07e1302`,
`04e455f4d` (+ `b499da774`), `a0807ce47`, `e8e4d85b7`, `2241d52b8`, `5f8347dca`, `e46bc6230`.

Every number below was produced in THIS session, in the isolated worktree
`.claude/worktrees/agent-acfbcc1decf64402a` at `ee6dab949`. Nothing is quoted from a lane report or a
commit message except to name the claim under test. Every probe was a PATCHED SIBLING SCRATCH MODULE
(`tooling/src/verify/gates/cb-v-night-cut*-<id>.ts`) written and `rmSync`-ed in a `finally`; no tracked
file was mutated at any point, and `git status --short` is empty apart from this report.

## Verdicts

| commit | subject | verdict |
| - | - | - |
| `ff07e1302` | baseui-read + surface-composition (5 policies) | **CONFIRMED with caveat** — D3: an unenforced §4.1 fence whose `why` asserts a discrimination that does not exist (a FALSE PIN) |
| `04e455f4d` | four simple-visitors modules (5 policies) | **REFUTED** — D1: the retired `PROSE-OK` grammar's 15 live markers were never translated; 15 blocking `error` findings on `main` today |
| `b499da774` | test-baseline manifest regen | **CONFIRMED** for the manifest arm (the manifest row is present); `ledgers:fresh` is RED at HEAD for an unrelated reason (N1) |
| `a0807ce47` | the four CSS-census gates | **REFUTED** — D2: 4 live central `@orb-gate-ignore integer-line-boxes` markers dropped. This is #2043, but its recorded MECHANISM ("false positives on legitimate SVG-text slots") is wrong and the fix that follows from it would be wrong too |
| `e8e4d85b7` | class-token-splice + scroll-container-positioned | **CONFIRMED with caveat** — D4: `class-token-splice`'s `CLASS_ATTRIBUTE` attribute-name half is unenforced; the discriminating row was built and run in under five minutes |
| `2241d52b8` | the last two registry-definitions members | **CONFIRMED** — the `explicitCompositeRefusal` repair is a different reader, not the same refusal reclothed, and the real tree proves it |
| `5f8347dca` | five ordinary client/CT gates → seven policies | **CONFIRMED** — all seven doors bind and discriminate; the two re-cut fences red |
| `e46bc6230` | six `mustPass` rows + the missing §4.2 arm | **CONFIRMED** — three of the six re-cut red in the stated direction; the §4.2 arm alarms on a flipped position |

Two live reds NOT caused by this wave are recorded as N1/N2, with their attributing commits.

## A. The real-tree delta, per policy

### A.1 My own `pnpm -s check:structure` (worktree, one run, no `timeout` wrapper)

Slot `reports/runs/structure/agent-acfbcc1decf64402a-2697453-2026-09-12T13-00-51-191Z/`. `EXIT=1` —
the legacy product backlog, baseline by construction.

```
final policies: 237 ran · raw 2216 = waived 1177 + granted 131 + effective 908 (858 error, 50 warning)
                · 0 alarm(s) · 0 tool error(s) · 0 withheld
single-pass: ran 297/297 active gate(s) (60/60 legacy · 237/237 final) of 297 corpus file(s) — run COMPLETE
```

**The two numbers the guide asks for: `0 tool error(s)` · `0 withheld`.** Also `0 alarm(s)`, which is the
receipt that every SURVIVING marker in the corpus binds (item D's second half).

The reference slot on `main` (`main-2274575-2026-09-12T11-53-23-745Z`) reads raw 2220 / effective 912
(857 error, 55 warning). The whole delta is outside the wave (my HEAD carries `9206ea17b`, `cf38b544d`,
`ee6dab949`); **every wave policy's numbers are identical in the two runs**, which is what makes the
comparison below a measurement of the wave rather than of the tree drift.

### A.2 Per-policy RAW (`violations + waived + granted`), pre-wave → today

PRE is slot `main-152313-2026-09-12T02-44-32-393Z` (2026-09-11 20:44 local; corpus 275, legacy 103 /
final 172 — after `e46bc6230`, before `5f8347dca`). POST is my own run above (identical to main's 11:53Z
slot for every row). `main-1351072` and `main-863394` are `complete: false` with `corpusFiles: 0` and are
NOT verdicts; I did not use them.

| policy | pre (legacy) | post (final) | explained by the commit message? |
| - | -: | -: | - |
| `baseui-portal-container-seam` | 0 | 0 | yes (both-sides-zero, stated as such) |
| `baseui-state-data-attributes` | 0 | 0 | yes |
| `surface-a11y-focus` | 0 | 2 raw = 2 **waived** | yes — the two translated `@surface-focus-elsewhere` markers |
| `surface-in-a-container` | 0 | 0 | yes |
| `surface-in-a-container-health` | (new) | 0 | yes |
| `assumes-single-replica` | 0 | 0 | yes |
| `no-vanity-alias` | 0 | 0 | yes |
| `public-route-body-cap` (+ `-health`) | 0 | 0 (+ 0) | yes |
| `no-hardcoded-model-prose` | 0 | **15 raw = 15 error violations** | **NO — D1** |
| `integer-line-boxes` | 0 | **5 raw = 4 violations + 1 waived** | partly (#2043 filed; mechanism wrong — D2) |
| `motion-token-purity` | 0 | 17 raw = 17 **waived** | yes — the exemption-mechanism move, arithmetic 19 = 2 + 17 |
| `rest-transform-grid` | 0 | 0 | yes |
| `over-art-plate-arm` | 0 | 4 raw = 4 **warning** violations | yes — the declared error→warning downgrade (N3) |
| `class-token-splice` | 0 | 0 | yes |
| `scroll-container-positioned` | 0 | 0 | yes |
| `home-tile-registry-completeness` | 0 | 0 | yes |
| `no-parallel-section-map` | 0 | 0 | yes |
| `route-trpc-lifo-order` | 0 | 0 | yes |
| `state-files` | 0 | 0 | yes |
| `no-form-reset-in-autosave` (+ `-health`) | 0 | 0 (+ 0) | yes |
| `form-factory-for-multifield` | 0 | 0 | yes |
| `context-definition-shape` (+ `-health`) | 0 | 0 (+ 0) | yes |
| `no-raw-spacing-in-features` · `no-raw-typography-in-features` · `no-off-token-radius-shadow` | 0 (already final) | 0 | yes (`e46bc6230` adds rows only) |
| `registry-assembly-at-door-only` (the `2241d52b8` MERGE target) | 0 | 0 | yes |

Every nonzero cell was run down by READING its reported sites. Two of the four are defects.

## REFUTED — `04e455f4d`

### D1. `no-hardcoded-model-prose` — 15 dropped suppressions, 15 blocking errors on `main`

**Expected:** the conversion widens the population to `@authored` for ARM B and "the private `PROSE-OK`
marker retires into the central `@orb-waive` grammar". A retirement is a TRANSLATION (guide §7: marker
translation rides WITH the conversion, in the same commit).

**Actual:** the commit touched SEVEN files, all under `tooling/` and `tests/tooling/` — **not one product
file**. The legacy grammar's live markers were never translated:

```
live `PROSE-OK` markers in packages/**  (measured at HEAD)          : 16   (15 in seam files + 1 in contracts)
`@orb-waive no-hardcoded-model-prose(` markers in packages/**       :  0   (2 tree hits, both inside the gate module: `fix` prose + a fixture string)
no-hardcoded-model-prose findings on the real tree                  : 15   error, ok=false
```

The 15 findings are line-for-line the 15 marker sites (each finding sits on the line the marker guards):

| file | marker lines | finding lines |
| - | - | - |
| `packages/server/src/domain/automation/engine/analysis-arm.ts` | 481 | 482 |
| `packages/server/src/domain/automation/engine/arm-executors.ts` | 72 · 121 · 155 · 167 · 529 | 73 · 122 · 156 · 168 · 530 |
| `packages/server/src/domain/rpg/substrate/actor-ops.ts` | 316 | 317 |
| `packages/server/src/domain/rpg/substrate/actor-rekey.ts` | 73 · 77 | 74 · 78 |
| `packages/server/src/entry/compose/rpg.ts` | 267 · 305 · 1430 · 1432 · 1675 · 1677 | 268 · 306 · 1431 · 1433 · 1676 · 1678 |

**It is a LOST SUPPRESSION and not a population widening, and the legacy code proves it both ways.**
Every one of those five files is in the LEGACY population — `analysis-arm.ts`, `arm-executors.ts` and
`entry/compose/rpg.ts` are `SEAM_FILES` and the two rpg files are under the
`packages/server/src/domain/rpg/substrate/` `SEAM_PREFIX`
(`git show 04e455f4d^:tooling/src/verify/gates/no-hardcoded-model-prose.ts:20-38`). And the legacy gate
carried a two-sided STALE arm (`:255-270`: "stale `// PROSE-OK` marker guarding no live prose unit — a
loaded gun") — so its 0 findings on the pre-wave slot means every one of those 16 markers was consumed by
a LIVE unit. The widening to `@authored` adds client files; it cannot add server seam files that were
already in.

**Why every green stayed green.** The commit's floor is `check:policy-conformance` + the family test +
`gate:contract` + biome/eslint/typecheck. None of them reads the product tree. §8.6's per-file
reconciliation (`legacy = grep -c '<legacy opener>'` at the pre-conversion sha vs
`current = grep -c '@orb-waive <id>'`) would have printed `current < legacy` for five files, which is the
one shape the guide says can be a lost suppression — and the commit message carries no marker table at
all for this module.

**Fix spec.**

1. Translate all 16 markers in the same shape the wave used elsewhere:
   `// @orb-waive no-hardcoded-model-prose(<first STATIC word of the unit>): <the legacy reason verbatim> Ends when …`.
   The position is the token the policy reports — my run gives them per site: `n`, `the`×3, `needs`,
   `cannot`, `this`×5, `no`, `your`, `is`. Derive each from the finding, never from the suffix (guide §7).
2. Close the arithmetic: `16 legacy = 16 @orb-waive = 15 consumed + 1 classified`. The sixteenth
   (`packages/contracts/src/rpg/views.ts:240`) produces NO finding today — classify it DEAD and delete it,
   never invent a waiver (guide §8.6).
3. Re-run `pnpm -s check:structure` and require `no-hardcoded-model-prose` at `v=0 w=15 ok=true`.

## REFUTED — `a0807ce47`

### D2. `integer-line-boxes` — the 4 findings are DROPPED LEGACY MARKERS, not SVG false positives

\#2043 is already filed, so this is not a new row; it is a **mechanism correction**, and the mechanism
decides the fix.

**Recorded mechanism:** "dropped its 4 legacy markers and now reports 4 false positives on legitimate SVG
text slots." **Measured:** the four findings ARE the four legacy marker sites, and one of them is not SVG
at all:

```
packages/ui/src/charts/meter/variants.ts:308:47  token=text-label   (marker at :307)
packages/ui/src/charts/meter/variants.ts:310:13  token=text-micro   (marker at :309)
packages/ui/src/charts/meter/variants.ts:312:15  token=text-micro   (marker at :311)
packages/ui/src/markdown/markdown.tsx:258:89     token=text-code    (marker at :257 — inline code in PROSE, not SVG)
```

`git grep -c -E '@orb-gate-ignore integer-line-boxes' a0807ce47^ -- 'packages/**'` = **3 + 1 in two
files**; the same census at HEAD = the same 4 markers, still spelled in the RETIRED grammar, now reaching
nothing (marker routing is fenced: legacy openers reach LEGACY owners only, guide §5/§7). Current
`@orb-waive integer-line-boxes` markers in `packages/**`: **1**, and it is the CSS one the commit message
accounts for (`CSS_LINE_HEIGHT_EXEMPTIONS` → one marker; real tree `waived: 1`).

So the commit's marker reconciliation covered the module's own CSS exemption TABLE and missed the CENTRAL
`@orb-gate-ignore` markers in `.ts`/`.tsx` — the very split §7 calls "nine kinds of ignore, and each
legacy gate owns its own pass".

**Fix spec.** Translate the four in place —
`// @orb-waive integer-line-boxes(text-label|text-micro|text-code): <the legacy reason verbatim> Ends when …`
— re-run `check:structure` and require `integer-line-boxes` at `v=0 w=5`. Do NOT add an SVG-shaped
predicate fence: the policy is reporting exactly what the legacy gate reported, and the legacy answer to
these sites was a reviewed marker, not a narrowing.

**The other three CSS gates lost nothing.** `git grep` at `a0807ce47^` for
`@orb-gate-ignore (motion-token-purity|rest-transform-grid|over-art-plate-arm)` under
`packages/**`/`tests/**`/`scripts/**` returns **zero** (positive control: the same query for
`integer-line-boxes` returns the four above, so the search bites). `@over-art-plate-ok` had 0 product
sites before and after (its only hits are the gate's own test fixtures). `motion-token-purity`'s move is
clean and closed: 19 hidden = 2 carved out + 17 markers, and the real tree reads `raw 17 = waived 17`,
`0 alarms`.

## CONFIRMED with caveat — `ff07e1302`

Confirmed, all measured here: `check:policy-conformance` green over the five policies; the four ordinary
doors discriminate (§4.2 below); the two `@surface-focus-elsewhere` translations BIND on the real tree
(`surface-a11y-focus` raw 2 = waived 2, 0 alarms) and the grammar is fully retired (the only tree hits are
prose, a negative-control list in `ordinary-waiver.test.ts:159` and the family test's own assertions);
the roster rows are mechanism-shaped and every symbol they name resolves
(`lib/baseui-read.ts:336#surfaceManifestFrom`, `lib/surface-composition.ts#{managesArrivalFocus,exportedComponentAnchor}`,
`json:baseui-manifest` → `contract/resource-json.ts:45`).

### D3. `surface-in-a-container-health` — an unenforced fence whose `why` claims it is enforced

**The claim** (`surface-in-a-container-health.ts`, `mustPass[2]`'s `why`): *"Drop the `/` from the
`startsWith` and this row still passes but the previous one starts acquitting on a lookalike — which is
why both exist."*

**Measured.** Cut, in a patched sibling scratch module, anchor asserted to occur EXACTLY ONCE, DIRECTION
open (`entry.path.startsWith(\`${EXEMPT\_DIR}/\`)`→`entry.path.startsWith(\`${EXEMPT\_DIR}\`)\`, so the
fence ACQUITS more and the policy flags LESS):

```
CUT surface-in-a-container-health [drop the trailing slash] -> failures=0
```

No row dies. The reason is structural: `mustPass[1]` and `mustPass[2]` BOTH ship the real
`packages/client/src/features/app-shell/surfaces/app-shell.tsx`, so they acquit with or without the
fence, and `mustFlag[0]` ships no `app-shell*` directory at all, so it reds either way. The sentence
quoted above describes a row that does not exist.

**The discriminating row exists and took four minutes** (guide: "before recording UNFALSIFIABLE, write the
row that would discriminate and RUN it"). A lookalike-only tree with NO shell:

| fixture (`mode: "resource"`) | at tip | under the cut |
| - | -: | -: |
| `packages/client/src/features/app-shell-lookalike/surfaces/pane.tsx` + `packages/client/package.json` | **1 finding** (`packages/client/package.json:1:1`, "stale shell exemption") | **0** |

**Fix spec.** Turn `mustPass[2]` into that fixture as a `mustFlag` row (drop the `SHELL` spread from its
`files` map, add `expect: { count: 1, messageIncludes: "stale shell exemption" }`), and rewrite the `why`
to state what actually dies. Classification: **UNENFORCED**, not unfalsifiable and not mutually redundant.

Minor, not filed as a defect: `evaluate` returns silently when `manifest.name === ""`, so a client
manifest with no `name` disarms the ratchet. The declaration is read to CONSUME it; a `readyResourceValue`
read whose result is discarded would express that without an acquittal branch.

## CONFIRMED with caveat — `e8e4d85b7`

Confirmed: both policies at raw 0 on the real tree with 0 alarms; both §4.2 arms discriminate; the
`class-token-splice` conversion's use of `resolveCallableOrigin` (`:144`) is in the RESOLVING direction
with a documented `lexicalReferenceSymbol` fallback and an unresolved answer meaning "unsafe", which is
the gate's own semantics rather than the D1-class "unreadable = accusation" shape — and the real-tree 0
is the tripwire that would have shown an explosion.

### D4. `class-token-splice` — the `CLASS_ATTRIBUTE` attribute-name half is unenforced

The commit message reports "11 cuts on class-token-splice … every one reds a named row except the
bracket-aware colon splitter". The attribute-name half is not one of the eleven, or it was cut at a
coarser granularity.

**Cut** (`carrierVerdict`, DIRECTION open — any JSX attribute is treated as a class carrier, so the policy
flags MORE):

```
CUT class-token-splice [return CLASS_ATTRIBUTE.test(a.getNameNode().getText()) -> return true] -> failures=0
```

**The discriminating row** (`mustFlag[0]`'s founding fixture with `className=` changed to `title=`):

| fixture (`mode: "types"`) | at tip | under the cut |
| - | -: | -: |
| `const side = "end";`<br>`const x = <div title={\`inset-${side}-0 p-2\`} />;\` | **0 findings** | **1** (`packages/ui/src/probe.tsx:2:32`, token `side`) |

**Fix spec.** Land that fixture as a `mustPass` row on `class-token-splice` with a `why` naming the half
it pins ("`carrierVerdict` requires the JSX attribute NAME to match `/^class(Name)?$/`, not merely to be a
JSX attribute"). It is green today and red under the cut.

## CONFIRMED — `2241d52b8`

**The repair is a different reader, not the same downstream-use refusal in different clothes.** The
landing comment says `no-parallel-section-map` was found WITHHELD on every real run because
`explicitCompositeRefusal` refused a binding with an invoked member (`.includes()`), and that it was
repaired. Measured:

- `resolveAuthoredComposite` / `explicitCompositeRefusal` appear **zero** times in
  `no-parallel-section-map.ts` (only in its header, describing why the shared FACT cannot serve it). The
  vocabulary read is `readTupleDeclaration` (`lib/tuple-read.ts`), which takes a DECLARATION rather than a
  Project, so §12.3's traversal ban is not engaged and the composite-refusal path is never entered.
- The real tree agrees, and this is the part a header cannot fake — the policy files one population
  receipt per vocabulary and all four resolve at the legacy denominators:
  `CHROME_ZONES 4 · CONFIG_GROUP_IDS 13 · MODAL_SLOT_IDS 11 · SECTION_IDS 10`, `unresolved: 0`,
  `withheld: false`. A refusing reader would show `members: 0` and withhold.
- §4.1: the new module-level fence is pinned. Cut `if (!isModuleLevel(declaration))` → `if (false)`
  (DIRECTION open, the policy flags MORE): **1 failure**, the `app-shell.tsx:178`-shaped
  `Partial<Record<SectionId, …>>` accumulator row, exactly as its `why` claims.
- `home-tile-registry-completeness`: 7 members receipted, raw 0, `ok: true`; the MERGE target
  `registry-assembly-at-door-only` is raw 0 pre and post.

## CONFIRMED — `5f8347dca`

- **All seven policies are at raw 0 / `ok: true` on the real tree**, 0 alarms, 0 withheld.
- **Every ordinary door binds AND discriminates** — see §4.2 below; the three re-anchored paren-token
  doors (`route-trpc-lifo-order(page.route)`, `no-form-reset-in-autosave(reset)`,
  `form-factory-for-multifield(input)`) and the two token-less classes (`state-files(useX)`,
  `context-definition-shape(useResolved)`) all alarm with `names a dead position` when flipped.
- **The added callee fence is real.** Cut `route-trpc-lifo-order`'s
  `if (calleeText !== TEST_CALL_PREFIX && !calleeText.startsWith(...))` → `if (false)` (DIRECTION open):
  **1 failure**, and it is `mustPass`'s "declared limit, half two" row, exactly as its `why` says.
- The `-health` splits are legitimate absence verdicts: `no-form-reset-in-autosave-health`'s legacy
  ancestor (`git show b849e7add:…#modelFileViolations`, `:82-87`) reported `{ file: FACTORY_MODEL_FILE,
  line: 1 }` with a synthetic token, which is guide §3 door-failure class 2 verbatim.

## CONFIRMED — `e46bc6230`

Three of the six rows re-cut, in the stated direction, in patched sibling scratch modules:

| module | cut | result |
| - | - | - |
| `no-raw-spacing-in-features` | `jsxAttr !== undefined && …getText() === "className"` → `jsxAttr !== undefined` | **1 failure** — the `title="p-4"` row |
| `no-raw-spacing-in-features` | `callExpr !== undefined && CLASS_COMPOSERS.has(…)` → `callExpr !== undefined` | **1 failure** — the `describe("p-4 …")` row |
| `no-raw-typography-in-features` | `jsxAttr !== undefined && …getText() === "className"` → `jsxAttr !== undefined` | **1 failure** — its own attribute-identity row |

And D2's §4.2 arm: flipping `@orb-waive no-off-token-radius-shadow(rounded-lg)` to a dead position gives
`AUTHORITY ALARM [ordinary-waiver] ordinary waiver at packages/client/src/features/x/single.tsx:1:1 names
a dead position for no-off-token-radius-shadow`.

## §4.2 — every ordinary door in the wave, flipped

Twenty ordinary policies. For each, the module's own §4.2 `mustPass` marker position was replaced with
`zzDeadPos` in a patched sibling scratch module and `verifyPolicyProofs` re-run. **20 of 20 produced
exactly one failure**; the three I printed in full carry the alarm verbatim:

```
AUTHORITY ALARM [ordinary-waiver] ordinary waiver at tests/client/features/g/waived.ct.tsx:4:3 names a dead position for route-trpc-lifo-order
AUTHORITY ALARM [ordinary-waiver] ordinary waiver at packages/client/src/features/persona/waived.ts:3:3 names a dead position for no-form-reset-in-autosave
AUTHORITY ALARM [ordinary-waiver] ordinary waiver at packages/client/src/styles/waived.css:2:3 names a dead position for integer-line-boxes
```

Covered: `baseui-portal-container-seam` · `baseui-state-data-attributes` · `surface-a11y-focus` ·
`surface-in-a-container` · `assumes-single-replica` · `no-vanity-alias` · `public-route-body-cap` ·
`no-hardcoded-model-prose` · `integer-line-boxes` · `motion-token-purity` · `over-art-plate-arm` ·
`class-token-splice` · `scroll-container-positioned` · `home-tile-registry-completeness` ·
`no-parallel-section-map` · `route-trpc-lifo-order` · `state-files` · `no-form-reset-in-autosave` ·
`form-factory-for-multifield` · `context-definition-shape` (+ `no-off-token-radius-shadow` from
`e46bc6230`). The four `hard` policies have no door by construction.

## §4.1 — the fences I re-cut (8 cuts, each with its DIRECTION)

| module | fence | direction | result |
| - | - | - | - |
| `surface-in-a-container-health` | `startsWith(EXEMPT_DIR + "/")` | open (flags LESS) | **CLEAN → UNENFORCED (D3)** |
| `motion-token-purity` | `DURATION_PROPERTIES.has(...)` in the reduced-motion carve-out | open (carve-out widens to easing) | RED (`expected at least one effective finding but got 0`) |
| `no-parallel-section-map` | `isModuleLevel(declaration)` | open (flags MORE) | RED |
| `route-trpc-lifo-order` | the `test`/`test.<modifier>` callee fence | open (flags MORE) | RED |
| `class-token-splice` | `CLASS_ATTRIBUTE.test(attrName)` | open (flags MORE) | **CLEAN → UNENFORCED (D4)** |
| `no-raw-spacing-in-features` ×2, `no-raw-typography-in-features` ×1 | the two carrier-fence halves | open (flags MORE) | RED ×3 |

Method notes, because they are the guide's own false-clean rules: every anchor was asserted to occur
EXACTLY ONCE in the module before patching (a `String.replace` that lands in a header comment or a `why`
string is the commonest false clean); the patched source was written to a SIBLING scratch module in
`gates/` and imported by absolute path with a cache-busting query on the SCRATCH file (never a `?query`
re-import of the real module); neither cut family is a split, so no "which policy was driven" ambiguity
arises — where a split exists (`surface-in-a-container-health`) the cut names the `-health` policy it was
driven against.

## Grants (item C)

**No reviewed-grant row was minted by any of the seven commits, and no wave policy has
`authority: "reviewed-grant"`.** `tooling/src/verify/lib/reviewed-grants.ts` is untouched by all seven
diffs, and the post-run authorities are 16 `ordinary` + 4 `hard` (+ `over-art-plate-arm` ordinary/warning).
The whole-table grant count is unchanged at 131 granted findings and
`check:policy-conformance` reports `131 grant rows (whole table) · 0 invalid`.

**This refutes a premise in my brief** (`ff07e1302` "a grant row minted here was STALE ON ARRIVAL and
reddened mid-flight"): whatever that was, it is not in what landed. `ff07e1302`'s only exemption-shaped
artifact is the `notUnder` population root for the app-shell tier plus its `-health` ratchet — a
population fence and its liveness policy, not a grant.

## Markers (item D, §8.6)

Per retired grammar and per `@orb-gate-ignore <gate>` id, at each commit's OWN pre-conversion sha vs HEAD:

| grammar / id | legacy (pre-sha) | current | classification |
| - | -: | -: | - |
| `@surface-focus-elsewhere` (ff07e1302) | 2 | 2 `@orb-waive` | `current == legacy`, both CONSUMED on the real tree (waived 2 / 0 alarms) |
| `PROSE-OK` (04e455f4d) | 16 | **0** | **`current < legacy` × 5 files — 15 real drops + 1 DEAD, unclassified by the lane (D1)** |
| `@orb-gate-ignore integer-line-boxes` (a0807ce47) | 4 | **0** | **`current < legacy` × 2 files — 4 real drops (D2)** |
| `motion-token-purity` file `ALLOWLIST` (2 rows / 19 hidden sites) | 19 | 17 `@orb-waive` + 2 carved out | `19 = 2 + 17` closes; 17 consumed, 0 alarms |
| `integer-line-boxes` `CSS_LINE_HEIGHT_EXEMPTIONS` | 1 | 1 `@orb-waive` | clean, consumed (waived 1) |
| `@over-art-plate-ok` | 0 product sites | 0 | empty grammar deleted |
| `scroll-container-positioned` ALLOWLIST | `{}` | 0 | empty table deleted |
| `@orb-gate-ignore` for the other 17 wave ids | 0 | 0 | clean (positive control: 9 files carry `@orb-gate-ignore` at `5f8347dca^`, so the query bites) |

**Every surviving marker BINDS: `0 alarm(s)` on my whole-tree run** (a stale/dead/over-broad marker is an
authority alarm, and there are none anywhere in the corpus).

## §4.6 differentials (item E, third part)

| split | per-EXAMPLE coverage statement in a committed test? | did the legacy side EXECUTE? |
| - | - | - |
| `surface-in-a-container-health` | **no** — the module header carries a prose SUCCESSOR PROOF paragraph and the family test carries no differential arm for it | yes — the legacy `STALE_PREFIX` arm existed at `854c81c80` and the header states its exact shape |
| `public-route-body-cap-health` | **no** — commit-message statement only | not measured by me |
| `no-form-reset-in-autosave-health` | **no** — commit-message statement only | **yes**, verified: `b849e7add:…#modelFileViolations` (`:82-87`) is a real arm that reports on the health module's own fixture shape |
| `context-definition-shape-health` | **no** — commit-message statement only | not measured by me |

This is compliant with §8.8/#2000 as amended (a differential may be a commit-message statement of what it
FOUND, and each of these commits carries one), and it is short of §4.6's stronger rule for a SPLIT
("say so PER EXAMPLE in the test rather than in prose"). Recorded as a caveat rather than a defect,
because the rule the lanes were briefed against is the one they met.

## Floors, re-driven in this worktree (item B)

From `reports/test-report.json` (the published pointer of run
`agent-acfbcc1decf64402a-2689567-2026-09-12T12-59-19-991Z`), one `pnpm test:scoped` invocation over the 13
suites these commits added or touched, no worker flags:

```
Test Files  1 failed | 12 passed (13)
     Tests  1 failed | 109 passed (110)
Type Errors  no errors
```

Green: `baseui-and-surface-family.repo.int` (16) · `simple-visitors-1584` · `integer-line-boxes.int` ·
`motion-token-purity` · `class-string-literal-wave` · `registry-family` · `ordinary-client-and-ct-wave` ·
`ui-token-surface-wave-1` · `enforcement-registry-parity.int` (12, including the two-sided roster count) ·
`verify/lib/css-rules` · `verify/lib/render.int` · `verify/lib/baseui-read.int`.
Red: `over-art-plate-arm.int` — see N2.

`pnpm -s check:policy-conformance`: **`237 final policies · 2658 proof rows · 0 failure(s) · 131 grant
rows (whole table) · 0 invalid`, exit 0.**

`pnpm test:scoped tests/tooling/verify/ops/structure-mixed.suite.int.test.ts`: **5 failed / 4 passed**,
exit 1 — #2052 reproduced, not re-filed. The failure is the roster coupled site exactly as guide §8.8
describes it: the suite uses `assumes-single-replica` as its LEGACY carrier by string literal, and the
conversion made it final (`+ ✗ assumes-single-replica (1 violation) · final ordinary/error`). The id IS a
string literal in that file, so the guide's own "grep `tests/tooling/**` for the id" rule would have found
it; `04e455f4d`'s floor did not run it.

## N1–N3 — live reds and downgrades this wave did NOT cause

**N1. `pnpm -s check:ledgers-fresh` is RED at HEAD (exit 1), and the cause is `cf38b544d`, not this wave.**
`docs/reviews/caught-failure-ownership/population.json` is stale by one row —
`moved tooling/src/verify/lib/schema-fact.ts::error::3: line 545 → 561`. `cf38b544d` (today, #1584/#2005)
is the last commit to touch `schema-fact.ts`; the population ledger's last touch is `35afe3fa8`.
Regenerate with `pnpm exec node tooling/src/verify/cli.ts baseline caught-failure-population` on the
merged tree at the next barrier. (This is the ledger half of `b499da774`'s job for a different file; the
`docs/test-baseline/manifest.json` half that commit fixed is intact — `manifest` is reported `fresh`.)

**N2. `tests/tooling/verify/gates/over-art-plate-arm.int.test.ts:137` asserts `workItem: 626`; the module
says `2024`.** `a0807ce47` landed the pair consistently at 626; `17a495fb8` ("over-art-plate-arm's warning
debt pointed at a CLOSED issue", 22:04, four minutes later) changed the module's `workItem` to 2024 and
touched no test. Its floor was `check:policy-conformance` + scoped biome, neither of which runs
`tests/tooling/**`. A value change without its coupled suite — the #1983 class, one directory over.
Fix: update the assertion to 2024 in the same shape.

**N3. `a0807ce47` DOWNGRADED `over-art-plate-arm` from blocking to non-blocking, and said so.** It is now
`severity: "warning"` + `workItem` and its `*.baseline.json`, generator and debt row are deleted. On the
real tree that is **4 findings that block nothing** (`failOnWarnings: false` at `ops/structure.ts:153`).
That is the sanctioned disposition for a retiring baseline ratchet (§12.5: "unresolved debt is a warning
tied to a positive `workItem`"), and it is also a real enforcement reduction that only the roster records.
Not a defect; named so the next reader does not rediscover it as one.

## LEDGER ROWS (4 rows)

| module | wave · path:line | defect | class | state | receipt |
| - | - | - | - | - | - |
| `no-hardcoded-model-prose` | `04e455f4d` · `tooling/src/verify/gates/no-hardcoded-model-prose.ts` + 5 product files (`packages/server/src/domain/automation/engine/analysis-arm.ts:481`, `…/arm-executors.ts:72,121,155,167,529`, `packages/server/src/domain/rpg/substrate/actor-ops.ts:316`, `…/actor-rekey.ts:73,77`, `packages/server/src/entry/compose/rpg.ts:267,305,1430,1432,1675,1677`) | the retired private `PROSE-OK` grammar's 16 live markers were never translated; 15 legacy suppressions dropped and are now blocking `error` findings on `main` | lost suppression (§8.6 `current < legacy`, unclassified) | OPEN | my `check:structure` slot `agent-acfbcc1decf64402a-2697453-…`: `no-hardcoded-model-prose v=15 w=0 g=0 ok=false`; legacy population proof `git show 04e455f4d^:…:20-38`; marker census 16 → 0 |
| `integer-line-boxes` | `a0807ce47` · `packages/ui/src/charts/meter/variants.ts:307,309,311` · `packages/ui/src/markdown/markdown.tsx:257` | 4 live central `@orb-gate-ignore integer-line-boxes` markers dropped by the conversion; #2043's recorded mechanism ("SVG-text false positives") is wrong and would produce the wrong fix | lost suppression (§8.6 `current < legacy`), mechanism correction to #2043 | OPEN (#2043) | `git grep -c` at `a0807ce47^` = 4 in 2 files, at HEAD = 4 still in the RETIRED grammar, `@orb-waive` = 1 (CSS only); the 4 findings sit one line below the 4 markers |
| `surface-in-a-container-health` | `ff07e1302` · `tooling/src/verify/gates/surface-in-a-container-health.ts` (`mustPass[2]`) | the `${EXEMPT_DIR}/` prefix fence is unenforced, and the row's `why` asserts a discrimination that does not exist — a FALSE PIN | §4.1 UNENFORCED + §5b.6 | OPEN | cut (anchor asserted unique, DIRECTION open) → `failures=0`; the constructed lookalike-only fixture flags 1 at tip and 0 under the cut |
| `class-token-splice` | `e8e4d85b7` · `tooling/src/verify/gates/class-token-splice.ts:179` | the `CLASS_ATTRIBUTE` attribute-NAME half of `carrierVerdict` is pinned by no row | §4.1 UNENFORCED | OPEN | cut `return CLASS_ATTRIBUTE.test(...)` → `return true` gives `failures=0`; the `title={…}` twin of `mustFlag[0]` is 0 at tip and 1 under the cut |

## WHAT I DID NOT COVER

- **No fixture-level §4.6 replay of my own.** Every catch-parity claim in the seven commit messages
  ("legacy X / final Y over the proof file maps") is UNVERIFIED by me except where the real-tree delta or
  a receipt contradicted it. My differential arm is the real-corpus pre/post table in §A.2 only, which
  guide §4.6 rates informative only where a side is nonzero — that is four rows out of twenty-five.
- **`public-route-body-cap-health` and `context-definition-shape-health`**: I did not measure whether
  their legacy sides EXECUTE. I read the code for `no-form-reset-in-autosave-health` only.
- **§4.1 coverage is 8 cuts, not "2 per commit × 7".** `04e455f4d` and `a0807ce47` got zero of mine
  (their defects were found by the marker census instead), and no commit got a full matrix. Every count in
  a commit message's cut table (9, 11, 41, …) is unverified; two of the five modules I sampled at a
  finer granularity than the lane did came back UNENFORCED, so treat those tables as upper bounds.
- **The three refuted classes were checked by READING plus the real-tree delta, not by an exhaustive
  driver.** `resolveAuthoredComposite`/`explicitCompositeRefusal`: zero occurrences in any wave gate
  module (only `no-parallel-section-map`'s header prose). `resolveModuleMemberOrigin` /
  `resolveCallableOrigin` / `classifyProjectHomeOrigin` / `readMemberReference`: exactly ONE call site in
  the whole wave (`class-token-splice.ts:144`), read and judged in the resolving direction. No wave module
  contains a member-NAME-keyed prefilter in front of a fail-closed origin refusal. I did not audit the
  shared readers themselves, and I did not sweep `ElementAccessExpression` acquittal paths corpus-wide.
- **I did not run** `check-gates.repo.int`, `gate-ignore-grammar.repo.int`, `gate-conformance.repo.int`,
  `gate-spelling-twins.int` (orchestrator-only), `pnpm typecheck`, biome/eslint, `check:docs` beyond this
  file, `pnpm verify --push`, or any CT/e2e.
- **`e46bc6230` re-cuts are 3 of 6** (the three `no-off-token-radius-shadow` halves were not re-cut; its
  §4.2 arm was).
- **No pre-`e46bc6230` structure slot exists** (`main-1351072` is `complete: false`, `corpusFiles: 0`), so
  that commit has no real-tree before/after of its own. It adds proof rows only, and the three modules
  read 0 raw in both slots I do have.

## Proposed lessons (the orchestrator owns the memory write)

1. **A private marker grammar's retirement is a PRODUCT-FILE commit; a conversion that touches only
   `tooling/**` has not retired one.** The cheapest tell, before any census: if the commit's file list has
   no `packages/**` entry and the header says a grammar "retires into `@orb-waive`", the translation did
   not happen. Two of this wave's seven commits dropped suppressions and both have that exact shape.
2. **A gate's own exemption TABLE and the central `@orb-gate-ignore` markers naming it are two different
   populations, and a conversion owes BOTH counts.** `integer-line-boxes` reconciled its CSS table (1 → 1)
   and lost four central markers in `.ts`/`.tsx`, because nobody asked the second question. §7's "nine
   kinds of ignore" is the list; §8.6's arithmetic has to be run once per kind the module owns.
3. **A `why` that says "cut this and the OTHER row starts acquitting" is a claim about a row that must
   NOT contain the acquitting input.** `surface-in-a-container-health`'s lookalike row also shipped the
   real directory, so both rows acquitted either way. When a `why` names a sibling row as its falsifier,
   check that the sibling lacks the thing the fence is about.
4. **A conversion's own §4.1 cut table is an upper bound on enforcement, not a measurement of it** — the
   granularity the lane cut at decides the answer. Two modules whose commit messages reported "every cut
   reds a named row" had an unenforced INNER half (an attribute-name test inside a carrier predicate, a
   trailing-slash inside a prefix test) that reds nothing. Re-cut the halves, not the predicate.
