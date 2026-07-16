import { SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

const MESSAGE =
  "layout-context prop (compact/inDrawer/isSheet/density) — the container model replaces these: the surface queries @container (axis 1), density is the data-density attribute axis. See core/UI-Architecture-and-Layout.md §4/§4b.";

const BANNED_PROPS = new Set(["compact", "inDrawer", "isSheet", "density"]);

export const gate: GateDescriptor = {
  name: "no-layout-context-props",
  docRow: "UI-Gates-and-Lessons.md §8 / D42 / D43",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: "use @container / data-density attribute instead",
  scanRoot: (p) => p.includes("packages/client/src/") || p.includes("packages/ui/src/"),
  kinds: [SyntaxKind.JsxAttribute],
  visit: (node, _sf, ctx) => {
    const name = node.getFirstChildByKind(SyntaxKind.Identifier)?.getText();
    if (name && BANNED_PROPS.has(name)) {
      ctx.report(node);
    }
  },
  mustFlag: [
    {
      files: "export const G = <EntityCard compact={true} />;\n",
      at: "packages/client/src/features/x/x.tsx",
      expect: { count: 1 },
      why: "compact prop",
    },
    {
      files: "export const G = <EntityCard inDrawer />;\n",
      at: "packages/client/src/features/x/x.tsx",
      expect: { count: 1 },
      why: "inDrawer prop",
    },
  ],
  mustPass: [
    {
      files: 'export const G = <EntityCard data-density="compact" />;\n',
      at: "packages/client/src/features/x/x.tsx",
      why: "data attribute is allowed",
    },
  ],
};
