// Direct JSX attribute spellings are the policy subject on any client/ui component, including member tags.
// Spread-provided props are deliberately unresolved and outside this syntax-only detector.
//
// FAMILY: a declared SINGLETON under its own id. The banned vocabulary is four prop names owned by this
// policy alone; no sibling reads them and there is no shared `lib/` computation behind an attribute-name
// test, so there is nothing to name but itself.
//
// POPULATION PORT: byte-identical to the legacy `@client` + `@ui` scan roots — the two packages that author
// JSX. The root fence is a NARROWING, so mustPass[2] places the same attribute in `@server` and proves it
// bites; without that row, deleting the fence would only ever ADD findings at sites no row visits.
// LEGACY SHA: (45743d76d^) — the conversion's parent.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `no-layout-context-props` descriptor at 073520068d3305dfedbb481153cadfef6b30f847, the parent of the conversion
// `45743d76d` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). Over the SAME
// 7,006 harness candidates at that tree (`git ls-tree` ∩ `_shared/ts-workspace.ts#harnessGlobs`), legacy `scanRoot`
// admits 1,647 and final `population` admits 1,647. legacy − final = ∅. final − legacy = ∅. Controls: inside
// `packages/client/src/agent-handles/__cbbhr_in_index.ts` (virtual) admitted by both; outside
// `packages/contracts/src/assets/__cbbhr_out_index.ts` (virtual) rejected by both.
import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";

const MESSAGE =
  "layout-context prop (compact/inDrawer/isSheet/density) — the container model replaces these: the surface queries @container (axis 1), density is the data-density attribute axis. See docs/law/UI-Architecture-and-Layout.md §4/§4b.";

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
  fix: "use @container (axis 1) or the data-density attribute instead. A deliberate occurrence waives with `@orb-waive no-layout-context-props(<prop>): <reason + end condition>`, where `<prop>` is the BANNED PROP NAME: the report passes no token, so the sink derives the first identifier of the JsxAttribute's own text, which is always the attribute name — never the component tag and never the value.",
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
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/clean.tsx": "export const Clean = () => <div />;\n",
        "packages/server/src/transport/render.tsx": "export const G = <EntityCard compact={true} />;\n",
      },
      why: "THE POPULATION FENCE, pinned: the identical attribute in `@server` is NOT a finding, because the container/density model is a client-and-ui law. Deleting the root fence leaves every other row green — this is the only row that dies without it. The clean client file keeps the selection non-empty so the row measures the fence and not an empty population",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/waived.tsx":
          "// @orb-waive no-layout-context-props(compact): the proof's stand-in reason; ends when this fixture stops flagging.\nexport const G = <EntityCard compact={true} />;\n",
      },
      why: "POSITIONAL IDENTITY: the report passes no token, so the sink DERIVES the first identifier of the JsxAttribute's own text — the PROP NAME (`compact`), never the component tag `EntityCard` (which is outside the attribute node) and never the value. The fixture is mustFlag[0] (count 1) plus the marker line, so exactly ONE occurrence exists for the one marker to consume, and the arm ends if that row changes",
    },
  ],
});
