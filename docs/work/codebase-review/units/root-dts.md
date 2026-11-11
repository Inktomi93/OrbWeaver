# Unit: root-dts

Band S. Path: `aggregator-assets.d.ts`, `platform.d.ts`, `platform-iso.d.ts`,
`platform-node.d.ts`, `reset.d.ts` (142 lines; `eslint-plugins.d.ts` was reviewed under
root-lint-configs). All five read in full; every load claim in the headers proved or disproved
against the current tree, the installed toolchain, and the positive-control suite.

## Sweeps

- Liveness: `getOrInsert` has 16 production/tooling call sites (stats, boot, unwired);
  `Error.isError` in the polyfill entry tests; `structuredClone` used at
  `packages/contracts/src/rpg/extraction.ts:173`; `WebAssembly.*` types consumed by
  `packages/server/src/infra/plugin-host/module.ts` and the client ui-guest worker;
  `HeadersInit`/`RequestCredentials` consumed by `tests/tooling/platform-host-types.test.ts`.
  No dead ambient declarations.
- Positive control: `tests/tooling/platform-host-types.test.ts` compiles planted ISO/Node/browser
  sources against the real world tsconfigs and proves `omitHome` refuters (deleting
  `platform-iso.d.ts`/`platform-node.d.ts` restores the exact missing-type diagnostic). Ran
  green 9/9 before and after the in-unit comment edits
  (`pnpm vitest run --config=vitest.config.ts tests/tooling/platform-host-types.test.ts`).
- Lib-catchup probe with the repo's own compiler (`pnpm exec tsc`, 7.1.0-beta): under the repo's
  real base tuple `["es2025","esnext.disposable","esnext.temporal"]` (tsconfig.base.json:38) all
  four augmented surfaces are still absent (TS2550 × 4, hint "change lib to es2026"); under
  `lib:["esnext"]` all four are IN-LIB. `structuredClone` is absent from pure `esnext` (TS2304)
  — the ISO declaration stays load-bearing.
- ts-reset truthing: the `.` export of `@total-typescript/ts-reset@0.6.1` is
  `dist/recommended.d.ts`, whose reference list covers every surface the header claims
  (fetch/filter-boolean/json-parse/array-includes/index-of/map/set). Header list honest.
- `whatwg-url` resolves via the TS `@types/<name>` fallback (`@types/whatwg-url` pinned at
  pnpm-workspace.yaml:66, root devDep package.json:112; the package itself is not installed —
  type-only import, zero runtime edge). Not a finding.

## Findings

- \[P2] platform.d.ts:1-3 (pre-sweep) — the header's premise "TypeScript's libs do not ship
  these yet … the duplicate-declaration error at that moment is the reminder" is doubly false
  under the pinned toolchain: tsc 7.1.0-beta ships all four surfaces at `lib` `es2026`/`esnext`
  (probed with the repo's own binary), so the libs HAVE caught up and only the base `lib` tuple
  (es2025) keeps the declarations needed; and the stated reminder cannot fire for the
  method-style members — merged interface methods become overloads without error, so an es2026
  bump would silently keep four dead blocks and four `biome-ignore` suppressions alive.
  Direction: bump `lib` toward es2026 (tsconfig.base.json:38) and delete the Map/WeakMap/Error/
  Iterator blocks plus the four suppressions in one change, keeping `structuredClone`; the
  variance story below stays worth a sentence in the commit message, not the file.
- \[P3] reset.d.ts:8-10 — the mechanism claim is wrong: "pulled into EVERY package's compilation
  via tsconfig.base.json's `include`" — tsconfig.base.json has no `include` at all (`files: []`,
  line 83, and its line-4 comment says that is deliberate). The real mechanism is twelve package
  tsconfigs each listing `../../reset.d.ts` explicitly (receipts: packages/kit/tsconfig.json:6
  and 11 siblings). A new package that forgets the line silently compiles without the reset, and
  an author trusting this header would look at the base and think it is covered. Direction:
  re-point the sentence at the per-package `include` lists.
- \[P3] aggregator-assets.d.ts:6 — the worked example is false: no code imports
  `katex/dist/katex.min.css` as a TS module; `packages/ui/src/markdown/math.ts:4` imports
  `./katex.css`, and the katex-package specifier is a CSS `@import` inside that file
  (packages/ui/src/markdown/katex.css:5), which TS never resolves. The declaration is still
  needed for `import "./katex.css"`; the example cited is not the case that reds. Direction:
  cite `math.ts`'s `import "./katex.css"`. Scope claims otherwise verified true (listed in
  tsconfig.node.json's include, absent from base, ui's css-modules.d.ts exists).
- \[P3] FIXED platform.d.ts:1-15 — date stamps ("probe 2026-08-03", "measured, 2026-08-03") and
  line-number cites violated the comment law; `rebuild-from-canon.ts:586` was already dead
  (file is 377 lines) and `export-chat.ts:58,59` survived only by luck (the lines still hold the
  branded-key Maps). Rewritten to name the two sites by path without line numbers, and the
  header premise corrected to the tuple-relative truth ("the repo's `lib` tuple does not ship
  them") with the merge-overload caveat documented; positive-control suite re-run green.

## Verdict

reviewed (4: one P2, three P3, one fixed in-unit). This unit is the thesis in miniature with a
twist: the declarations are all live and the area has the best positive-control test found so
far (omit-home refuters against real world configs), but three of five headers mis-describe
their own mechanism or example, and the one file that predicted its own death built a trigger
that structurally cannot fire. The old "trust me the probe still holds" posture is exactly the
rot class this sweep exists for; the `lib` bump is a contained triage item.
