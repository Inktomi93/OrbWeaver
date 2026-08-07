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
import type { GateDescriptor, GateRunCtx } from "../contract.ts";

const AS_CHILD = "asChild";
const CLIENT_SRC = "packages/client/src/";
const UI_SRC = "packages/ui/src/";

const MESSAGE =
  "`asChild` is Radix's composition idiom and has no meaning in Base UI. Base UI does not read the prop, so " +
  "it renders its own element as well as the child you meant to merge into — two DOM nodes, two sets of " +
  "handlers, and a doubled accessible name, with no error anywhere. Base UI composes through `render` " +
  "instead (docs/vendor/base-ui/handbook/composition.md).";

const FIX =
  'pass the element to `render`: `<Menu.Trigger render={<Button intent="ghost" />}>Label</Menu.Trigger>`, or ' +
  "the function form `render={(props, state) => <Button {...props} data-open={state.open} />}` when the child " +
  "needs the part's state. Base UI merges its own props into the rendered element for you.";

function visit(node: Node, _sf: unknown, ctx: GateRunCtx): void {
  if (Node.isJsxAttribute(node)) {
    if (node.getNameNode().getText() === AS_CHILD) {
      ctx.report(node, { token: AS_CHILD, offset: Math.max(node.getText().indexOf(AS_CHILD), 0) });
    }
    return;
  }
  if (Node.isPropertySignature(node) && node.getName() === AS_CHILD) {
    ctx.report(node, { token: AS_CHILD, offset: Math.max(node.getText().indexOf(AS_CHILD), 0) });
  }
}

export const gate: GateDescriptor = {
  name: "baseui-render-prop-composition",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3)",
  status: "active",
  // Per-node, per-file: nothing about the verdict needs another file.
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: FIX,
  // Scanned, not scoped-out, for both packages that render components: a seal in @orb/ui and a feature in
  // @orb/client are equally able to write the prop, and a scanRoot exclusion would carry its exemption
  // silently through a move (§3).
  scanRoot: (p) => p.includes(UI_SRC) || p.includes(CLIENT_SRC),
  kinds: [SyntaxKind.JsxAttribute, SyntaxKind.PropertySignature],
  visit,

  mustFlag: [
    {
      files: 'export const G = <Menu.Trigger asChild><button type="button">x</button></Menu.Trigger>;\n',
      at: "packages/ui/src/primitives/menu/probe-menu.tsx",
      expect: { count: 1 },
      why: "the founding shape — the Radix spelling, on a PAIRED tag (the form every Radix example uses)",
    },
    {
      files: "export const G = <Menu.Trigger asChild={true} />;\n",
      at: "packages/client/src/features/x/components/x.tsx",
      expect: { count: 1 },
      why: "the SELF-CLOSING + explicit-value spelling in a FEATURE — a bare-boolean-only or self-closing-only matcher is the §5 lying-proof class, and features write JSX too",
    },
    {
      files: "export interface TriggerProps {\n  asChild?: boolean;\n}\n",
      at: "packages/ui/src/primitives/menu/probe-menu.tsx",
      expect: { count: 1 },
      why: "a seal DECLARING the prop — offering an affordance Base UI will ignore is worse than a single wrong call site, because every consumer inherits the lie",
    },
  ],
  mustPass: [
    {
      files: 'export const G = <Menu.Trigger render={<Button intent="ghost" />}>x</Menu.Trigger>;\n',
      at: "packages/ui/src/primitives/menu/probe-menu.tsx",
      why: "the remedy — Base UI's own composition seam",
    },
    {
      files: "export interface TriggerProps {\n  asChildElement?: boolean;\n}\nexport const G = <div data-as-child={1} />;\n",
      at: "packages/ui/src/primitives/menu/probe-menu.tsx",
      why: "a DECLARED LIMIT written down: the match is the EXACT prop name, not a substring — `asChildElement` and `data-as-child` are not the banned shape and a looser matcher would red them",
    },
  ],
};
