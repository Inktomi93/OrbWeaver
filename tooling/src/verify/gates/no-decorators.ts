// Gate: no-decorators (Spine-TypeScript-and-Patterns.md §5) — a decorator is NOT erasable syntax, so the
// type-stripping runtime this repo ships on has no decorator semantics at all and the call is a runtime
// error; `erasableSyntaxOnly` does not catch them either. The subject is the Decorator NODE KIND, which is
// why this gate has no fence: every authored tree runs on the same runtime, so there is nowhere the syntax
// is legal and nothing to narrow.
//
// FAMILY: a declared SINGLETON under its own id. There is no shared `lib/` reader behind "the parser
// produced a Decorator node", and no sibling policy asks about decorators; a shared topic (erasability)
// would not be a family either.
//
// POPULATION: the declaration listed all nine named roots individually, which IS the `@authored`
// composite set (contract/population.ts POPULATION_SETS). Spelled as the set here: same admitted paths by
// definition, one fewer place for the next root to be forgotten.
// POPULATION PORT (the LEGACY port — distinct from the `@authored` re-spelling noted above, which is a
// later change): a CORRECTION. Legacy `scanRoot: () => true` admitted everything the legacy runner
// loaded; `@authored` is the nine named roots. Re-derived 2026-09-12 over the same 7,537-path
// compiler-source candidate set: 7,537 legacy vs 7,519 final, ZERO admitted only by the final and 18 only
// by legacy — root-level tool/config sources (`knip.ts`, `packages/client/vite.config.ts`,
// `packages/db/drizzle.config.ts`, `aggregator-assets.d.ts`) and `packages/showcase-plugins/**`. Those 18
// are outside `@authored` by definition, so a decorator there is now unjudged; whether the legacy runner
// ever fed them is a property of THAT runner's candidate set, which this measurement bounds, not settles.
// SETTLED 2026-09-13 (lane cb-b-header-residue): over the candidate set the legacy runner ACTUALLY loaded
// (`_shared/ts-workspace.ts#harnessGlobs` at `45743d76d^`), legacy − final = ∅ and final − legacy = ∅ — none of the
// 18 was a harness candidate (the root-level configs are outside `harnessGlobs`, and no
// `packages/showcase-plugins/src` source existed there), so the port dropped nothing. The 7,537-path compiler-source
// set above is not the legacy candidate basis.
// LEGACY SHA: (45743d76d^) — the conversion's parent.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `no-decorators` descriptor at 073520068d3305dfedbb481153cadfef6b30f847, the parent of the conversion `45743d76d`
// (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). Over the SAME 7,006 harness
// candidates at that tree (`git ls-tree` ∩ `_shared/ts-workspace.ts#harnessGlobs`), legacy `scanRoot` admits 7,006
// and final `population` admits 7,006. legacy − final = ∅. final − legacy = ∅. Controls: inside
// `packages/client/src/agent-handles/__cbbhr_in_index.ts` (virtual) admitted by both; outside
// `docs/__cbbhr_out_control.ts` (virtual) rejected by both.
// OUTSIDE-CONTROL CAVEAT (verifier cb-v-header-residue): `docs/__cbbhr_out_control.ts` is rejected by `harnessGlobs`,
// not by the legacy descriptor — which has no path predicate of its own and admits it — so it proves only that
// neither side reaches outside the harness corpus, not that the legacy filter discriminates.
import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";

export const gate = defineGate({
  id: "no-decorators",
  family: "no-decorators",
  authority: "ordinary",
  severity: "error",
  population: "@authored",
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message:
    "decorators are not erasable — tsx/node type-stripping has no decorator runtime (runtime error), and the erasableSyntaxOnly compiler flag does NOT catch them. Use function composition / zod, not decorators. See Spine-TypeScript-and-Patterns.md §5.",
  fix: "replace the decorator with function composition (wrap the value at its call site) or a zod schema. A file that provably never reaches the stripping runtime waives that occurrence with `@orb-waive no-decorators(<name>): <reason + end condition>`, where `<name>` is the DECORATOR'S OWN NAME: the report passes no token, so the sink derives the first identifier of the Decorator node's own text — the identifier just past the `@`, never the class, member or parameter being decorated (mustPass[1] pins exactly that).",
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.Decorator],
        // No guard: the visitor is kind-indexed on Decorator, so every delivered node IS the finding.
        visit: (node) => {
          ctx.report.node(node);
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "source",
      expect: { count: 1, token: "Injectable" },
      why: "decorator on class",
      files: { "packages/server/src/probe.ts": "@Injectable()\nclass Foo {}\n" },
    },
    {
      mode: "source",
      expect: { count: 1, line: 2, token: "Column" },
      why: "decorator on property",
      files: { "packages/server/src/probe.ts": "class Foo {\n  @Column()\n  id: string;\n}\n" },
    },
    {
      mode: "source",
      why: "decorators on a method, accessor, and parameter are all the same forbidden runtime syntax",
      files: {
        "packages/server/src/probe.ts":
          "class Foo {\n  @Trace()\n  method(@Inject() value: string): string { return value; }\n  @Read()\n  get current(): string { return ''; }\n  @Write()\n  set current(value: string) {}\n}\n",
      },
      expect: { count: 4, token: "Inject" },
    },
  ],
  mustPass: [
    {
      mode: "source",
      why: "no decorators",
      files: { "packages/server/src/probe.ts": "class Foo {\n  id: string;\n}\n" },
    },
    {
      mode: "source",
      files: {
        "packages/server/src/probe.ts":
          "// @orb-waive no-decorators(Injectable): the proof's stand-in reason; ends when this fixture stops flagging.\n@Injectable()\nclass Foo {}\n",
      },
      why: "POSITIONAL IDENTITY: `ctx.report.node(node)` passes no token, so the sink DERIVES one from the Decorator node's own text — the first identifier past the `@`, which is the decorator's NAME (`Injectable`), never the class it decorates. The fixture is mustFlag[0] (count 1) plus the marker line; the marker suppresses the finding that row proves this fixture produces, and it ends if that row changes",
    },
  ],
});
