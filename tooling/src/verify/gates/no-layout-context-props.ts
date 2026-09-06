// Direct JSX attribute spellings are the policy subject on any client/ui component, including member tags.
// Spread-provided props are deliberately unresolved and outside this syntax-only detector.
import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";

const MESSAGE =
  "layout-context prop (compact/inDrawer/isSheet/density) — the container model replaces these: the surface queries @container (axis 1), density is the data-density attribute axis. See core/UI-Architecture-and-Layout.md §4/§4b.";

const BANNED_PROPS = new Set(["compact", "inDrawer", "isSheet", "density"]);

export const gate = defineGate({
  id: "no-layout-context-props",
  family: "no-layout-context-props",
  authority: "ordinary",
  severity: "error",
  population: ["@client", "@ui"],
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: "use @container / data-density attribute instead",
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.JsxAttribute],
        visit: (node) => {
          const name = node.getFirstChildByKind(SyntaxKind.Identifier)?.getText();
          if (name !== undefined && BANNED_PROPS.has(name)) {
            ctx.report.node(node);
          }
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "source",
      files: { "packages/client/src/features/x/x.tsx": "export const G = <EntityCard compact={true} />;\n" },
      expect: { count: 1 },
      why: "compact prop",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/x/x.tsx": "export const G = <EntityCard inDrawer />;\n" },
      expect: { count: 1 },
      why: "inDrawer prop",
    },
    {
      mode: "source",
      files: { "packages/ui/src/proof.tsx": 'export const G = <Cards.EntityCard isSheet density="compact" />;\n' },
      expect: { count: 2 },
      why: "direct banned attributes remain equivalent on a member component and in the ui root",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: { "packages/client/src/features/x/x.tsx": 'export const G = <EntityCard data-density="compact" />;\n' },
      why: "data attribute is allowed",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/x/spread.tsx": "export const G = <EntityCard {...{ compact: true }} />;\n" },
      why: "a JSX spread is the declared unresolved limit of the direct-attribute syntax policy",
    },
  ],
});
