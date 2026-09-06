// Gate: baseui-render-prop-composition — composition happens through Base UI's `render` prop. `asChild`
// (Radix's idiom) does not exist in Base UI: it is silently ignored as an unknown prop, so the element it
// was meant to replace renders ANYWAY and the wrapper it was meant to merge into renders too — a duplicated
// DOM node, duplicated event handlers, and an accessible name that reads twice. Nothing errors; it just
// quietly renders wrong, which is why it needs a gate rather than a code review.
//
// TWO SPELLINGS, both banned: the JSX attribute (`<Menu.Trigger asChild>`) and a props-interface member
// named `asChild` (a seal offering the prop is a promise it cannot keep).
//
// MEASURED AT LANDING: zero live sites in packages/ui and packages/client — an honest zero, which makes this
// a ratchet against reintroduction, and reintroduction is a live risk precisely because every Radix example
// on the internet spells composition this way.
//
// DELIBERATELY NOT DUPLICATED HERE (§10 — never mirror an enabled rule): the OTHER Radix composition
// workaround, `React.cloneElement`, is already banned tree-wide by `no-legacy-react-api`. Adding a second
// owner for that shape would be maintenance with no extra bite.
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";

const AS_CHILD = "asChild";

const MESSAGE =
  "`asChild` is Radix's composition idiom and has no meaning in Base UI. Base UI does not read the prop, so " +
  "it renders its own element as well as the child you meant to merge into — two DOM nodes, two sets of " +
  "handlers, and a doubled accessible name, with no error anywhere. Base UI composes through `render` " +
  "instead (docs/vendor/base-ui/handbook/composition.md).";

const FIX =
  'pass the element to `render`: `<Menu.Trigger render={<Button intent="ghost" />}>Label</Menu.Trigger>`, or ' +
  "the function form `render={(props, state) => <Button {...props} data-open={state.open} />}` when the child " +
  "needs the part's state. Base UI merges its own props into the rendered element for you.";

export const gate = defineGate({
  id: "baseui-render-prop-composition",
  family: "baseui-render-prop-composition",
  authority: "ordinary",
  severity: "error",
  population: ["@client", "@ui"],
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.JsxAttribute, SyntaxKind.PropertySignature],
        visit: (node) => {
          if (Node.isJsxAttribute(node)) {
            if (node.getNameNode().getText() === AS_CHILD) {
              ctx.report.node(node, { token: AS_CHILD, offset: Math.max(node.getText().indexOf(AS_CHILD), 0) });
            }
            return;
          }
          if (Node.isPropertySignature(node) && node.getName() === AS_CHILD) {
            ctx.report.node(node, { token: AS_CHILD, offset: Math.max(node.getText().indexOf(AS_CHILD), 0) });
          }
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "source",
      files: { "packages/ui/src/primitives/menu/probe-menu.tsx": 'export const G = <Menu.Trigger asChild><button type="button">x</button></Menu.Trigger>;\n' },
      expect: { count: 1 },
      why: "the founding shape — the Radix spelling, on a PAIRED tag (the form every Radix example uses)",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/x/components/x.tsx": "export const G = <Menu.Trigger asChild={true} />;\n" },
      expect: { count: 1 },
      why: "the SELF-CLOSING + explicit-value spelling in a FEATURE — a bare-boolean-only or self-closing-only matcher is the §5 lying-proof class, and features write JSX too",
    },
    {
      mode: "source",
      files: { "packages/ui/src/primitives/menu/probe-menu.tsx": "export interface TriggerProps {\n  asChild?: boolean;\n}\n" },
      expect: { count: 1 },
      why: "a seal DECLARING the prop — offering an affordance Base UI will ignore is worse than a single wrong call site, because every consumer inherits the lie",
    },
    {
      mode: "source",
      files: { "packages/ui/src/primitives/menu/member.tsx": "export const G = <Base.Menu.Trigger asChild />;\n" },
      why: "component identity is deliberately irrelevant: a namespace/member JSX tag carrying the exact banned attribute still flags",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: { "packages/ui/src/primitives/menu/probe-menu.tsx": 'export const G = <Menu.Trigger render={<Button intent="ghost" />}>x</Menu.Trigger>;\n' },
      why: "the remedy — Base UI's own composition seam",
    },
    {
      mode: "source",
      files: {
        "packages/ui/src/primitives/menu/probe-menu.tsx":
          "export interface TriggerProps {\n  asChildElement?: boolean;\n}\nexport const G = <div data-as-child={1} />;\n",
      },
      why: "a DECLARED LIMIT written down: the match is the EXACT prop name, not a substring — `asChildElement` and `data-as-child` are not the banned shape and a looser matcher would red them",
    },
    {
      mode: "source",
      files: { "packages/ui/src/primitives/menu/spread.tsx": "declare const props: object;\nexport const G = <Menu.Trigger {...props} />;\n" },
      why: "declared limit: syntax-only policy cannot infer whether a JSX spread supplies asChild",
    },
    {
      mode: "source",
      files: {
        "packages/ui/src/primitives/menu/inherited.ts":
          'import type { RadixProps } from "radix";\nexport interface TriggerProps extends RadixProps {}\nexport type OtherTriggerProps = RadixProps & { render?: unknown };\n',
      },
      why: "declared limit: inherited and intersection-provided props have no local asChild PropertySignature for this syntax policy to report",
    },
  ],
});
