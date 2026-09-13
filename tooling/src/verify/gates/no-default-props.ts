// Gate: no-default-props (React modernization) — `defaultProps` is deprecated; use default parameters in
// the component signature instead (UI-Architecture-and-Layout.md). Comment-SAFE: the walk subscribes to
// PropertyAccessExpression nodes and reads the member name, never file text, so a comment can neither
// hide nor fake a violation. Singleton family — no other policy reads this member vocabulary.
//
// POPULATION PORT: the legacy `scanRoot` matched `p.startsWith("packages/client/src")` (no trailing
// slash), which would also admit a hypothetical sibling directory literally named
// "packages/client/srcXYZ/…"; the final `@client`/`@ui`/`@server` roots are slash-anchored
// ("packages/client/src/"). No real path on the tree exercises that difference — an intentional
// correction, not a behavior change.
// FAMILY: a declared SINGLETON under its own id (the sentence above says so in prose; stated as a field
// here so a §5b.5 census reads it). No other policy reads the `defaultProps` member vocabulary.
// LEGACY SHA: (61aa46279^) — the conversion's parent.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `no-default-props` descriptor at 644785bf211affac516d38c955d275ce45fc09b0, the parent of the conversion `61aa46279`
// (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). Over the SAME 7,368 harness
// candidates at that tree (`git ls-tree` ∩ `_shared/ts-workspace.ts#harnessGlobs`), legacy `scanRoot` admits 3,178
// and final `population` admits 3,178. legacy − final = ∅. final − legacy = ∅. Controls: inside
// `packages/client/src/agent-handles/__cbbhr_in_index.ts` (virtual) admitted by both; outside
// `packages/contracts/src/assets/__cbbhr_out_index.ts` (virtual) rejected by both.
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";

const TOKEN = "defaultProps";
const MESSAGE = "defaultProps is deprecated in modern React — use default parameters in the component signature instead. (UI-Architecture-and-Layout.md)";

export const gate = defineGate({
  id: "no-default-props",
  family: "no-default-props",
  authority: "ordinary",
  severity: "error",
  population: ["@client", "@ui", "@server"],
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix:
    "move default values to the function signature. A deliberate site is waived with `@orb-waive " +
    "no-default-props(<position>): <reason>` on the line above, where <position> is the literal `defaultProps`.",
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.PropertyAccessExpression],
        visit: (node) => {
          if (!Node.isPropertyAccessExpression(node) || node.getName() !== TOKEN) {
            return;
          }
          const nameNode = node.getNameNode();
          ctx.report.node(nameNode, { token: TOKEN, offset: 0 });
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "source",
      files: { "packages/ui/src/MyComponent.tsx": "const MyComponent = (props: any) => <div />;\nMyComponent.defaultProps = { id: 1 };\n" },
      expect: { count: 1, token: TOKEN },
      why: "defaultProps assignment is banned — the founding shape",
    },
    {
      mode: "source",
      files: { "packages/server/src/report.ts": "export const d = MyComponent.defaultProps;\n" },
      expect: { count: 1, token: TOKEN },
      why: "a READ of defaultProps (not just an assignment) — the gate matches the member name on any access, not only a write, and the @server root is in population too",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: { "packages/ui/src/MyComponent.tsx": "const MyComponent = ({ id = 1 }) => <div />;\n" },
      why: "default parameter instead of defaultProps",
    },
    {
      mode: "source",
      files: { "packages/ui/src/Other.tsx": "const x = MyComponent.defaultProp;\n" },
      why: "declared limit: a same-prefix member name (`defaultProp`, no trailing s) is a different property entirely",
    },
  ],
});
