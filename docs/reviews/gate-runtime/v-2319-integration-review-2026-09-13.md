---
kind: review
status: active
updated: 2026-09-13
---

# #2319 replay checkpoint independent integration review

> [!NOTE]
> **HISTORICAL rider (2026-09-18).** `b1e5e3e30` retired `tests/tooling/verify/gates/registry-definitions-legacy-replay.test.ts`
> — the frozen-legacy-replay differential class this review examined no longer exists; the declared
> `mustFlag`/`mustPass` proof rows, checked through `structure:policy-conformance`
> (`tests/tooling/verify/ops/policy-conformance.test.ts`), superseded it as the live oracle. This review's
> verdict and row counts are preserved as dated record of the pre-retirement replay state.

## Verdict

**REFUTED** at `7cad620a95ee04908ec99067b3257fd2836ac0b0` by one confirmed proof defect. The checkpoint covers all **51** frozen examples assigned to its five tabled modules and the later continuation repairs C1–C3 are present, but `modal-body-not-placeholder` row 1 classifies and observes the wrong semantic relationship. This is a source-only verdict; I did not run tests while the primary's heavy check occupied the box.

This verdict is bounded to the three-file checkpoint based on `1ef220c201621e34ebf8a2b6a4da5a22893d5384` through `164dac031`, `a39f39a61`, `b072f59fa`, and `7cad620a9`. It is not a verdict on the unchanged shared replay harness, the held #2333/Q06 security work, the four remaining assigned registry modules, either split module, the ledger integration, or whole #2319 completion.

## Confirmed defect

### R-2319-1 — modal-body imported-definition row hides an arm change behind an anchor-move label

`MODAL_ROWS[1]` in `tests/tooling/verify/gates/registry-definitions-legacy-replay.test.ts` declares:

- frozen result: the legacy **unreadable definition** refusal for imported `def`;
- final-on-twin result: only the policy id, file, line, token and the first 46 message characters;
- classification: `anchor-move`, successor `xModal`.

The frozen descriptor at `f5b222e10` cannot resolve the imported initializer and reports its fail-closed unreadable-definition arm. The completed twin supplies both the canonical `ModalDefinition` and canonical `SectionPlaceholder`, so the final reader resolves the imported object and reports the **Placeholder body** arm. This is the same semantic shape that the modal-registry table correctly classifies as `stronger-reader`: the final reader reaches and judges an object the legacy reader could not.

The test cannot detect the error because this first table uses `label`, whose message component is `message.slice(0, 46)`. Both final arms share exactly the 46-character prefix `a ModalDefinition is unreadable or dishonest: `. The expected string therefore remains green if the final row reports `Unreadable definition` rather than `Placeholder body`. Its `anchor-move` checker only requires a changed full label, and `successor: "xModal"` proves only that some finding kept that subject token. It never proves which arm fired.

Expected: assert the final arm explicitly, for example by using the closed `armLabel` vocabulary already used by every later table; classify the semantic change as `stronger-reader` with successor `Placeholder body`; separately state that the token/line also moved, with the line delta attributed to the twin prepend. Actual: prefix-only observation and `anchor-move` turn the final reader's semantic upgrade into an unverified claim.

The sibling `MODAL_ROWS[0]` founding direct-literal case remains an anchor move: both engines can read the object and catch the placeholder body, while only its position representation changes.

## Population derivation and table completeness

I derived the assigned population directly from the five frozen descriptors' ordered `mustFlag + mustPass` arrays:

| Frozen module/base | mustFlag | mustPass | Total | Checkpoint table |
| - | -: | -: | -: | -: |
| `modal-body-not-placeholder@f5b222e10` | 2 | 4 | 6 | 6 |
| `modal-registry-completeness@f5b222e10` | 8 | 5 | 13 | 13 |
| `placeholder-copy-registry@f5b222e10` | 5 | 3 | 8 | 8 |
| `chrome-registry-completeness@577d03d63` | 7 | 8 | 15 | 15 |
| `home-tile-registry-completeness@614b2cb55` | 6 | 3 | 9 | 9 |
| **Total** | **28** | **23** | **51** | **51** |

Each driver derives examples through `legacyScenarios`, which concatenates frozen `mustFlag` then `mustPass`, and asserts the frozen count equals the table length. The 51 count is therefore a closed source-derived manifest, not the incoming estimate.

For the generic four tables, every row asserts legacy findings/population/tool errors on original bytes, named final withholding on original bytes, unlined legacy inertness of the completed twin, twin-alone absence/refusal, final findings/population/tool errors, and a checked classification or exact unclassified reason. The modal-body table asserts the same axes, but R-2319-1 shows its finding label is too weak for row 1's arm claim.

## C1–C3 repairs

The three prior source-review findings are repaired in the immutable checkpoint:

- C1: `verdictViolations` accepts only exact equality with `UNCLASSIFIED-POPULATION-UNADMITTABLE`; arbitrary `UNCLASSIFIED-*` spellings no longer pass.
- C2: recipe step 4 now derives delivery from the legacy bytes, repoints an existing unresolved import, prepends only where no import exists, records the resulting line delta, and requires other reader prerequisites before classification.
- C3: modal-registry `mustPass[2]` adds the canonical opener module, repoints `#state`, expects zero findings and errors, and classifies `vacuous-both-zero`. The incomplete twin is retained as a separate positive prerequisite control, so an unresolved import cannot impersonate a stronger reader.

## Chrome and home continuation

The 15 chrome rows follow the frozen seven flags and eight passes in order. Five flag rows preserve catches with explicit final arm labels and position changes. The imported-definition row is correctly `stronger-reader` and names `Definition outside its home`. The renamed-zone example preserves both named original denominators and has a constructed adjacent member isolating `CHROME_ZONES`; the two assembler examples remain population-unadmittable while adjacent real entries prove the subject boundary.

The nine home rows follow the frozen six flags and three passes in order. Its dormant cases distinguish empty reason, absent teaser, and forbidden action using the final arm detail. The anti-god-map flag and legal-door pass contain no tile subject, remain explicitly population-unadmittable in the tile owner, and are driven separately through `registry-assembly-at-door-only` with the canonical factory declaration, legacy inertness, no tool errors, a feature-site finding, and a clean `main.tsx` result.

I found no missing prerequisite masquerading as a stronger-reader claim in these continuation rows. The chrome imported-definition stronger-reader result is supported by a resolved shared target and its own-home check. Home makes no stronger-reader classification.

## Report and ledger integrity

The report keeps the earlier measurement narrative as dated history and then states that the three open sub-chunk-2 rows were resolved in §5d.7. Its continuation section explicitly names the imported commits, the three repaired review findings, the four next modules, and that this checkpoint is not #2319 or program completion.

The complete `## LEDGER ROWS (11 rows)` block at `7cad620a9` is byte-identical to the block at `1ef220c20`: 26 lines, 13,177 bytes, SHA-256 `a52a51b19fd6cd9ea6ae215d60851edcaf5ebbb9e150b3477d5e435502e03c`. The new reviewer report separately carries its three C rows as repaired findings; it does not rewrite the original eleven.

## Scope and limitations

The exact checkpoint manifest is:

1. `tests/tooling/verify/gates/registry-definitions-legacy-replay.test.ts`
2. `docs/reviews/gate-runtime/x-legacy-replay-2026-09-13.md`
3. `docs/reviews/gate-runtime/v-2319-continuation-review-2026-09-13.md`

I read all three files in full, the five frozen descriptors in full, the corresponding final owners and assembly successor in full, and the shared helper sections governing scenario ordering, replay outputs, classifications, frozen loading, and in-memory execution. No files, commits, tests, board state, or ledger state were changed.

The reported test, lint, typecheck, structure and planted-control runs remain author/previous-reviewer receipts. This review neither reproduces nor rejects those runtime results. After R-2319-1 is repaired, the checkpoint needs fresh independent review of that exact changed row and its report text before acceptance.

## Warm repair verdict for R-2319-1

The current uncommitted repair is **CONFIRMED**. It changes both modal-body final expectations from the
shared 46-character message prefix to the closed `armLabel` vocabulary and names `Placeholder body` exactly. The
direct-literal founding row remains `anchor-move`; the imported-definition row is now `stronger-reader` with
`successor: "Placeholder body"`, matching the frozen reader's unreadable-initializer limit and the final reader's
resolved-object behavior.

The added discriminating control holds the arm identity rather than only the count or carrier. It keeps file, line and
token equal while replacing the imported `def` initializer with an unresolved `buildModal()` call. The completed
import reports `Placeholder body`; the builder reports `Unreadable definition`; the old `label` deliberately aliases
those results; and the checked stronger-reader successor rejects the wrong arm. `FINAL_ARMS` now contains the exact
placeholder detail, so an unknown final arm still throws. The original six modal-body rows remain present; this repair
adds one discriminator and changes no frozen example count.

The primary's complete receipts corroborate that proof: focused replay passed 13/13
(`/tmp/codex-2319-c4-green.log`); the planted final-side builder cut failed exactly the imported row's final-arm
expectation while 12 tests passed (`/tmp/codex-2319-c4-wrong-arm-red.log`); the restored seven-importer floor passed
7 files / 50 tests (`/tmp/codex-2319-c4-seven.log`); ESLint and Biome completed without remaining diagnostics; and
both `tooling/tsconfig.json` and root `tsconfig.json` passed (`/tmp/codex-2319-c4-types.log`). I read these complete
logs but did not execute the commands, so they are author receipts rather than independent runtime evidence. The
repair is tracked by #2338 (`codex-replay-continuation`).

## LEDGER ROWS (1 row)

| id | class | module | what | state |
| - | - | - | - | - |
| R-2319-1 / #2338 | proof-blind | registry-definitions-legacy-replay.test.ts | Imported modal-body example observes only a common prefix and misclassifies the final resolved placeholder arm as an anchor move. | **REPAIRED** — source independently confirmed; focused, planted-control, importer-floor, lint and typecheck author receipts corroborate it. |
