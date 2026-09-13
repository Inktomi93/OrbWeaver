// Policy: no-inline-domain-interface (Spine-TypeScript-and-Patterns.md §7.4) — the INTERFACE half of
// `no-inline-types`, split off because it has a DIFFERENT POPULATION and the final contract gives one
// policy one population.
//
// Legacy `no-inline-types` judged an exported `interface` only when the file sat under
// `packages/server/src/domain/**` (`isDomainFeature`), while judging exported type aliases across the
// whole corpus. That is two subjects, and the narrowing is deliberate rather than accidental: a client
// component's exported prop interface is a different question from a domain feature declaring a shape
// outside its `contract/` slot. Splitting keeps BOTH arms exactly as wide as they were — the alternative
// (one policy, the wider population, a path test in the visitor) would either widen the accusation to
// every exported interface in three roots or re-home a corpus predicate inside a policy body, which the
// final design bans outright.
//
// No identity reader is involved: an exported interface is authored syntax, and `export` cannot be
// aliased, re-exported or computed into existence at the declaration site.
//
// §4.6 SPLIT DIFFERENTIAL (#2000, committed at `tests/tooling/verify/gates/split-arm-parity.test.ts`).
// LEGACY-SIDE COVERAGE: 2 of the parent's 9 examples — `no-inline-types` mustFlag[1] and mustFlag[4] —
// both reproduced at the same file. The NARROWING this split exists to preserve (an exported interface
// OUTSIDE `domain/**` is not a finding) had ZERO legacy mustPass coverage, so its rows are CONSTRUCTED;
// drop `under: ["packages/server/src/domain/**"]` and they are the rows that die (measured 2026-09-12).
// The only deltas are tool errors: a fixture holding nothing but a type HOME admits zero paths, which the
// final runtime reports rather than scanning silently. No catch changed.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `no-inline-types` descriptor at 5dd83aaa42c85c361d321fe56bf13063c93edf17, the parent of the conversion `4885cde80`;
// this module did not exist there, so it is measured against the module it was carved from, `no-inline-types` (blob
// read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). Over the SAME 7,263 harness
// candidates at that tree (`git ls-tree` ∩ `_shared/ts-workspace.ts#harnessGlobs`), legacy `scanRoot` admits 7,263
// and final `population` admits 971. legacy − final = 6,292 — every harness source outside
// `packages/server/src/domain/**` minus `contract/` dirs and `contract.ts`/test names: the legacy `scanRoot` was
// `() => true` and the interface arm returned early off `isDomainFeature`. final − legacy = ∅. Controls: inside
// `packages/server/src/domain/admin/__cbbhr_in_context.ts` (virtual) admitted by both; outside
// `docs/__cbbhr_out_control.ts` (virtual) rejected by both.
// OUTSIDE-CONTROL CAVEAT (verifier cb-v-header-residue): `docs/__cbbhr_out_control.ts` is rejected by `harnessGlobs`,
// not by the legacy descriptor — which has no path predicate of its own and admits it — so it proves only that
// neither side reaches outside the harness corpus, not that the legacy filter discriminates.
//
// FAMILY `no-inline-types` — a two-member SPLIT family (split by POPULATION), and the string is NOT backed by a
// shared `lib/` dependency: measured, this module imports nothing from `lib/`, and `no-inline-types` imports only
// corpus-wide primitives (`lib/reference-fact.ts`). §2 requires a shared canonical dependency for a multi-member
// family, so this is the `policy-family-readers` finding shape (#2187), recorded here rather than dressed as a
// reader.
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";

const MESSAGE =
  "exported interface in a server domain outside a type home — a domain-internal shape lives in that " +
  "domain's contract/ (or @orb/contracts when it crosses a boundary), never in a verb/service/persistence " +
  "module. Move it to contract/ and import it. See Spine-TypeScript-and-Patterns.md §7.4.";
const FIX =
  "move the interface to the domain's contract/ slot (or @orb/contracts) and import it. A deliberate site " +
  "is waived with `@orb-waive no-inline-domain-interface(<position>): <reason>` on the line above, where " +
  "<position> is the interface/type's own declared name.";

export const gate = defineGate({
  id: "no-inline-domain-interface",
  family: "no-inline-types",
  authority: "ordinary",
  severity: "error",
  // The legacy admitted set exactly: server domain source, minus the `contract/` type home, minus the
  // `contract.ts` single-file spelling and the test mirror clause.
  population: {
    in: ["@server"],
    under: ["packages/server/src/domain/**"],
    notUnder: ["**/contract/**"],
    notNamed: ["contract.ts", "*.test.ts", "*.test.tsx"],
  },
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.InterfaceDeclaration],
        visit: (node): void => {
          if (Node.isInterfaceDeclaration(node) && node.hasExportKeyword()) {
            const name = node.getNameNode();
            ctx.report.node(name, { token: name.getText(), offset: 0, message: MESSAGE, fix: FIX });
          }
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "source",
      files: { "packages/server/src/domain/x/verb.ts": "export interface Foo {\n  readonly x: string;\n}\n" },
      expect: { count: 1, token: "Foo" },
      why: "the founding shape — an exported interface in a verb, whose home is the domain's contract/",
    },
    {
      mode: "source",
      files: { "packages/server/src/domain/rpg/tools/apply.ts": "export interface Foo {\n  readonly x: string;\n}\n" },
      expect: { count: 1, token: "Foo" },
      why: "#408 — the deleted `/tools/` clause used to exempt this by string accident; a domain tool SUBSYSTEM is domain code and its shapes belong in the domain's contract/",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        "packages/server/src/domain/x/anchor.ts": "const local = 1;\nexport const use = (): number => local;\n",
        "packages/server/src/domain/x/contract/types.ts": "export interface Foo {\n  readonly x: string;\n}\n",
      },
      why: "the type home: a `contract/` directory is not in the population at all",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/x/anchor.ts": "const local = 1;\nexport const use = (): number => local;\n",
        "packages/server/src/domain/x/contract.ts": "export interface Foo {\n  readonly x: string;\n}\n",
        "packages/server/src/domain/x/verb.test.ts": "export interface Bar {\n  readonly y: string;\n}\n",
      },
      why: 'THE TWO `notNamed` SPELLINGS, neither of which any row reached: the SINGLE-FILE type home (`contract.ts`, the flat spelling beside the `contract/` directory the row above covers) and the TEST MIRROR (`*.test.ts`). Both carry the exact exported interface the founding `mustFlag` reports, and both are subtracted by NAME rather than by directory — the `notUnder: ["**/contract/**"]` clause reaches neither. Drop either entry and this row flags. The clean `anchor.ts` is the in-population ANCHOR: a falsifier holding only subtracted files admits zero paths and comes back a `[population]` TOOL ERROR rather than a finding',
    },
    {
      mode: "source",
      files: { "packages/server/src/domain/x/verb.ts": "interface Foo {\n  readonly x: string;\n}\nexport const use = (value: Foo): string => value.x;\n" },
      why: "an UNEXPORTED interface is file-local and has no second home to collide with",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/x/anchor.ts": "const local = 1;\nexport const use = (): number => local;\n",
        "packages/server/src/infra/network/egress.ts": "export interface Foo {\n  readonly x: string;\n}\n",
      },
      why: "THE POPULATION BOUNDARY the split preserves: infra is not a domain feature, and legacy judged an exported interface ONLY under domain/. Widening it here would have been a silent new accusation on every infra/transport/foundation module",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/x/verb.ts":
          "// @orb-waive no-inline-domain-interface(Foo): the proof's stand-in reason; ends when this fixture stops flagging.\n" +
          "export interface Foo {\n  readonly x: string;\n}\n",
      },
      why: "POSITIONAL IDENTITY: the report anchors on the interface's NAME node, so the position is the shape's own name `Foo` and not the `export`/`interface` keywords the declaration text opens with. Built on the founding mustFlag row — a ONE-finding fixture",
    },
  ],
});
