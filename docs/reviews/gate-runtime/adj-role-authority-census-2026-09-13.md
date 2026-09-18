---
kind: review
status: active
updated: 2026-09-13
---

# `two-class-role-authority` declared-limit census

## Verdict

**CONFIRMED CURRENT TRUTH; no defect.** At requested baseline `a0f648df2ebdd1491690355e2a5e7ff333fb2b6d`, each of the three classes named by the gate header has **0 current production instances** in the gate's real eligible population:

| Header class | Exact counted shape | Production count |
| - | - | -: |
| Hoisted boolean const | an on-axis `role ===/!== <PARTICIPANT_ROLES member>` comparison inside a `const` initializer, whose identifier is later used (through parens / `!` / `&&` / `\|\|`) as an `if` condition with a direct throwing branch | **0** |
| Guard inversion | an on-axis participant-role comparison is the `if` condition, a direct branch returns, neither branch directly throws, and the immediately following sibling statement throws | **0** |
| Throwing switch case | `switch (<role read>)` is on the participant-role axis and a `case` for `"host"` or `"member"` directly throws | **0** |

The zero-instance sentence at `tooling/src/verify/gates/two-class-role-authority.ts:24-28` is therefore current, not stale. This audit found no security defect to file or fix.

The shared checkout advanced from the requested `a0f648df2` while other authorized lanes integrated work. The final observed `HEAD` was `83215b81625a89ce70fccafb04770e4d3459ee92`; this comparison was empty:

```sh
git diff --name-status a0f648df2ebdd1491690355e2a5e7ff333fb2b6d..83215b81625a89ce70fccafb04770e4d3459ee92 -- \
  packages/server/src/domain packages/contracts/src/identity \
  tooling/src/verify/gates/two-class-role-authority.ts \
  tooling/src/verify/lib/role-vocabulary.ts \
  tooling/src/verify/lib/tuple-vocabulary-fact.ts \
  tooling/src/verify/lib/reference-fact.ts
```

Thus the measured source and evaluator inputs are byte-identical to the requested baseline over this audit's complete scope.

## What the production gate actually measures

- The authoritative law splits role reads by what the verdict does: enforcement decisions belong in `can()`/a cited domain chokepoint; data projections remain principal-free (`docs/architecture/core/Core-Path-Registry.md:329-333`, D121-A; `docs/architecture/core/Spine-Identity-and-Auth.md` §2c).
- The gate header names the three omitted classes and makes the zero-instance claim at `tooling/src/verify/gates/two-class-role-authority.ts:24-28`.
- The production population is exactly `{ in: ["@server"], under: ["packages/server/src/domain/**"] }`, with type analysis and entire-population execution (`two-class-role-authority.ts:119-128`).
- The production visitor only receives binary expressions; `readRoleComparison` must recognize a strict equality/inequality involving a read named `role`, and `isEnforcementPosition` requires that comparison (through parens / `!` / `&&` / `\|\|`) to be the condition of an `if` whose then or else branch directly throws (`two-class-role-authority.ts:68-116`, `:134-143`).
- `readRoleComparison` uses `readStaticString`, so const string aliases are included; `readAxisVerdict` uses the TypeScript type of the role read and fails closed for `any`, plain `string`, and supersets while acquitting closed foreign unions (`tooling/src/verify/lib/role-vocabulary.ts:29-117`).
- The vocabulary comes from the exported tuple fact, is bound to the contracts identity home, and withholds the policy when absent/unresolved (`two-class-role-authority.ts:146-151`; `tooling/src/verify/lib/tuple-vocabulary-fact.ts:109-168`). The production tuple is `PARTICIPANT_ROLES = ["host", "member"]` (`packages/contracts/src/identity/index.ts:74-75`).
- The three designed omissions have committed `mustPass` rows: switch at `two-class-role-authority.ts:285-294`, guard inversion at `:345-354`, and hoisted const at `:355-364`. Those rows prove the current reader deliberately does not flag the shapes. They do **not** prove the live tree has no instances; that missing corpus census is what this audit supplied.
- The family test runs all policy proof rows and separately pins reviewed-grant identity/liveness (`tests/tooling/verify/gates/home-server-family.suite.test.ts:60-75`, `:174-214`, `:276-288`). It likewise does not enumerate live instances of the omitted classes.

## Production named-gate drive

Exact command:

```sh
pnpm check:structure --check two-class-role-authority
```

Result, read both from full command output and its emitted artifact `reports/runs/structure/main-764833-2026-09-13T08-05-47-868Z/check-structure.json`:

- selected run complete; 1/1 requested final policy ran;
- declared and effective source population: **1,148**, resources: **0**;
- vocabulary receipt: `PARTICIPANT_ROLES`, **2 members**, unresolved **0**;
- raw findings: **3**; reviewed-grant findings: **3**; effective findings: **0**;
- authority alarms: **0**; policy/fact/tool errors: **0**; withheld policies: **0**.

The three current findings are each consumed exactly once by the central grants:

1. `two-class-role-authority:admin-guard-can-seam` -> `packages/server/src/domain/admin/guard.ts:35`;
2. `two-class-role-authority:chat-nominee-target` -> `packages/server/src/domain/chat/verbs/participants.ts:1017`;
3. `two-class-role-authority:chat-participant-shape` -> `packages/server/src/domain/chat/persistence/participant.ts:99`.

Grant declarations and reasons are at `tooling/src/verify/lib/reviewed-grants.ts:1781-1804`. The gate also correctly does not flag the nonthrowing behavior branch at `participants.ts:985`.

This selected drive is a verdict for this gate only, not a whole-corpus verdict. No whole battery was run.

## Exact live class census

Execution form:

```sh
pnpm exec tsx -e '<in-memory ts-morph census program>'
```

The inline program performed these exact operations in one process:

1. `new Project({ tsConfigFilePath: "packages/server/tsconfig.json" })`;
2. selected source files whose normalized absolute path starts with `<repo>/packages/server/src/domain/` and ends with `.ts`;
3. asserted that selection contained **1,148 files**, equal to the production gate's emitted effective population;
4. for every binary expression, called the production `readRoleComparison` and `readAxisVerdict` helpers with the live two-member vocabulary, then classified the hoisted and inversion shapes using the gate's exact `throws` depth and exact condition-root plumbing;
5. for every switch statement, used the production `readMemberReference`, `readStaticString`, and `readAxisVerdict` helpers, then required a direct throwing case for a vocabulary member;
6. counted and retained `file`, `line`, and source text for every match.

Machine result:

```json
{
  "eligibleSourceFiles": 1148,
  "counts": {
    "hoistedBooleanConst": 0,
    "guardInversion": 0,
    "throwingSwitchCase": 0
  },
  "sites": {
    "hoisted": [],
    "inverted": [],
    "switched": []
  }
}
```

### Planted controls

The same process added three source files to the ts-morph `Project` only (using `project.createSourceFile`; it never called `save()` and wrote no filesystem path). Each used a local `"host" | "member"` role type and exactly the gate's committed omitted-shape fixture. Re-running the identical census produced:

```json
{
  "counts": {
    "hoistedBooleanConst": 1,
    "guardInversion": 1,
    "throwingSwitchCase": 1
  },
  "delta": {
    "hoistedBooleanConst": 1,
    "guardInversion": 1,
    "throwingSwitchCase": 1
  }
}
```

The recorded control sites were precisely:

- `packages/server/src/domain/__codex_control__/hoisted.ts`: `const isHost = role === "host"; if (!isHost) { throw ... }`;
- `packages/server/src/domain/__codex_control__/inverted.ts`: `if (role === "host") { return; } throw ...`;
- `packages/server/src/domain/__codex_control__/switched.ts`: `switch (role) { case "member": throw ... }`.

A fourth in-memory direct enforcement control (`if (role !== "host") { throw ... }`) was passed through the actual imported `gate` and `runPolicyPass`. The policy owner returned **4 raw findings** (the three real grants plus the control); authority reconciliation returned the three real granted findings and one effective finding at `packages/server/src/domain/__codex_control__/direct.ts`, with policy/fact errors both empty. That proves the shipped reader/evaluator was live against the relevant participant-role enforcement class. The isolated direct call intentionally supplied only this gate as `knownPolicies`, so the global ordinary-waiver coordinator also emitted unrelated unknown-policy alarms; those do not affect the policy owner's raw finding and are not used as an authority-reconciliation verdict. The named production drive above is the authoritative alarm/grant result.

No control file ever existed on disk. `find packages/server/src/domain -path '*__codex_control__*' -print` returned nothing.

## Independent corroboration

Structural direct-spelling scan (each invocation reported `scannedFileCount=1148, skippedFileCount=0` and no matches):

```sh
ast-grep run -p 'const $X = $OBJ.role === "host"' -l ts packages/server/src/domain --inspect summary
ast-grep run -p 'const $X = $OBJ.role !== "host"' -l ts packages/server/src/domain --inspect summary
ast-grep run -p 'const $X = role === "host"' -l ts packages/server/src/domain --inspect summary
ast-grep run -p 'const $X = role !== "host"' -l ts packages/server/src/domain --inspect summary
```

Multiline literal-superset scans over `packages/server/src/domain --glob '*.ts'` found zero guard-inversion candidates and zero throwing-switch candidates. The hoisted regex reported one apparent hit at `packages/server/src/domain/rpg/verbs/promote-actor.ts:71-73`; full-source inspection rejected it because the declaration is `const minted = await ctx.promoteToCharacter(...)` and the role comparison exists only in a comment. This illustrates why the type-aware ts-morph census, rather than regex, owns the exact count.

`rg --stats` reported 1,141 files searched rather than the gate's 1,148 admitted files, so these regex scans are corroboration only and are not used for the denominator or the absence verdict.

## Security interpretation and limits

If any count were nonzero, the header would be stale and the site would be a current unmeasured enforcement encoding capable of bypassing the one-kernel authority rule. No such site exists in the declared three shapes at this revision.

This result is deliberately bounded to the three shapes the header names and the production population the gate declares. It does not claim that every conceivable participant-role enforcement encoding is absent (for example, a helper-returned boolean, a ternary that later selects a refusal, or a deeply nested control-flow equivalent); those are outside this header claim and were not treated as defects by inference.

No tracked source, test, documentation, grant, catalog, ledger, board item, or Git state was changed by this lane. The only authored artifact is this report under `/tmp`.
