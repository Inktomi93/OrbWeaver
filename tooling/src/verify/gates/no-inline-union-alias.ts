// Policy: no-inline-union-alias (docs/law/Spine-TypeScript-and-Patterns.md §7.5) — an inline string-literal union
// TYPE ALIAS of 3 or more members is re-spelling an axis; declare it once as an `as const` tuple and derive the union.
// This is arm A of the union-axis family. It judges each alias alone, so it runs over any selection (a staged
// commit included). Arm B, `no-inline-union-redecl`, compares against tuples homed anywhere in the tree and stays
// whole-only. The report anchors on the alias name, the exact slice a waiver marker can hold.
import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { firstAnchor } from "../lib/caught-failure.ts";
import { ALIAS_MIN_MEMBERS, inlineUnionAlias } from "../lib/union-axis.ts";

const MESSAGE =
  "a string-union AXIS is declared ONCE as an `as const` tuple and the union derived — never re-spelled inline (Spine-TypeScript-and-Patterns.md §7.5).";
const ALIAS_MESSAGE =
  `an inline string-literal union TYPE ALIAS of ${String(ALIAS_MIN_MEMBERS)} or more members: declare the axis once as ` +
  "`export const X = [...] as const` and derive `(typeof X)[number]` (Spine-TypeScript-and-Patterns.md §7.5).";
const FIX =
  "home the axis in one `as const` tuple and derive from it — `(typeof X)[number]` for a type. A deliberate occurrence waives with " +
  "`@orb-waive no-inline-union-alias(<alias name>): <reason + end condition>`.";

export const gate = defineGate({
  id: "no-inline-union-alias",
  family: "union-axis",
  authority: "ordinary",
  severity: "error",
  population: { in: ["@authored"], notUnder: ["tooling/src/verify/gates/**"] },
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.TypeAliasDeclaration],
        visit: (node): void => {
          const alias = inlineUnionAlias(node);
          if (alias === undefined) {
            return;
          }
          const anchor = firstAnchor(alias.alias, [alias.nameNode]);
          const position = anchor === undefined ? {} : { token: anchor.token, offset: anchor.offset };
          ctx.report.node(alias.alias, { ...position, message: ALIAS_MESSAGE, fix: FIX });
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "source",
      files: { "packages/contracts/src/x.ts": "export type Mode = 'a' | 'b' | 'c';\n" },
      expect: { count: 1, token: "Mode", messageIncludes: "TYPE ALIAS" },
      why: "the founding row — an inline string-union type alias of 3 or more members. The position is the ALIAS NAME, an authored slice; a synthetic token would throw under `report.node`",
    },
    {
      mode: "source",
      files: { "tooling/src/verify/lib/reader.ts": 'export type ReaderVerdict = "reads" | "other" | "unreadable";\n' },
      expect: { count: 1, token: "ReaderVerdict", messageIncludes: "TYPE ALIAS" },
      why: "the shape tooling readers kept re-spelling (reads / other / unreadable); it is under tooling deliberately, because that is where the re-spelling happened and where a lane would otherwise assume the policy does not look",
    },
    {
      mode: "source",
      files: {
        "packages/contracts/src/alias-home.ts": "export const ALIAS_AXIS = ['a', 'b', 'c'] as const;\n",
        "packages/server/src/alias-respell.ts": "export type Reuse = 'a' | 'b' | 'c';\n",
      },
      expect: { count: 1, token: "Reuse" },
      why: "an alias whose members also match a homed tuple is still this policy's subject; the re-spell policy skips it so the site has one finding and one waiver door",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: { "packages/contracts/src/y.ts": "export type NodeEnv = 'development' | 'production';\n" },
      why: "the 3-member floor: a 2-member one-off alias is not an axis. Drop the floor to 2 and this row dies",
    },
    {
      mode: "source",
      files: { "packages/contracts/src/mixed.ts": "export type Mixed = 'a' | 'b' | 3;\n" },
      why: "string-only: a union carrying a numeric member is not a string axis",
    },
    {
      mode: "source",
      files: {
        "packages/contracts/src/waived-alias.ts":
          "// @orb-waive no-inline-union-alias(Mode): the proof's stand-in reason; ends when this fixture stops flagging.\nexport type Mode = 'a' | 'b' | 'c';\n",
      },
      why: "the waiver binds to the alias name, the exact slice the report anchors on",
    },
    {
      mode: "source",
      files: {
        "tooling/src/verify/gates/example-policy.ts": "export type G = 'a' | 'b' | 'c';\n",
        "packages/contracts/src/fence-home.ts": "export const FENCE_AXIS = ['a', 'b', 'c'] as const;\n",
      },
      why: "the gate-directory subtraction: every gate module's proof fixtures re-spell axes by design, so the corpus must not report its own rows. The contracts file keeps the population non-empty so a dead subtraction shows as a finding, not a tool error",
    },
  ],
});
