// Gate: registry-context-via-mint (derive-modernization-audit.md §W3, G26 — the registry-context mint
// sealed). The four registries (section/modal/settings-pane/chrome) share one byte-identical context+
// read-hook+provider trio over a `Registry`/`ContributorRegistry` value; `createRegistryContext`
// (packages/client/src/lib/create-registry-context.tsx) is its ONE home + the ONLY sanctioned
// createContext-over-a-registry site. A hand-rolled `createContext<XRegistry | null>(null)` anywhere ELSE
// in the client re-grows the trio that drifts — the D72 raw-path door this gate closes in the mint's wave.
import type { CallExpression } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

const CLIENT_SRC = "packages/client/src/";
const MINT_HOME = "packages/client/src/lib/create-registry-context.tsx";
// The type-arg text of a hand registry context: `Registry<…>`, `ContributorRegistry<…>`, or a `*Registry`
// alias (SectionRegistry/ModalRegistry/ChromeRegistry/SettingsPaneRegistry). `Registry\b` matches the raw
// generic instantiation AND every alias suffix; the mint's own `R | null` type-param carries no match.
const REGISTRY_TYPE_RE = /Registry\b/u;

const MESSAGE =
  "a `createContext` typed over a registry lives outside the createRegistryContext mint — a hand-rolled registry context+provider trio drifts from the ONE shape. Use `createRegistryContext<R>(name)` from #lib (packages/client/src/lib/create-registry-context.tsx). (derive-modernization-audit.md §W3, G26; D72 — a machine ships WITH its seal.)";

/** A `createContext(...)` / `X.createContext(...)` call (React's context constructor). */
function isCreateContextCall(call: CallExpression): boolean {
  const callee = call.getExpression();
  if (Node.isIdentifier(callee)) {
    return callee.getText() === "createContext";
  }
  return Node.isPropertyAccessExpression(callee) && callee.getName() === "createContext";
}

export const gate: GateDescriptor = {
  name: "registry-context-via-mint",
  docRow: "proposed/derive-modernization-audit.md §W3 (G26)",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: "replace the hand `createContext<XRegistry | null>(null)` + its Provider with a `createRegistryContext<XRegistry>(name)` mint call from #lib.",
  scanRoot: (p) => p.startsWith(CLIENT_SRC) && p !== MINT_HOME,
  kinds: [SyntaxKind.CallExpression],
  visit: (node, _sf, ctx) => {
    if (!Node.isCallExpression(node)) {
      return;
    }
    if (!isCreateContextCall(node)) {
      return;
    }
    const typeArg = node.getTypeArguments().find((t) => REGISTRY_TYPE_RE.test(t.getText()));
    if (typeArg !== undefined) {
      ctx.report(typeArg);
    }
  },
  mustFlag: [
    {
      files: "export const C = createContext<Registry<string, number> | null>(null);\n",
      at: "packages/client/src/state/g-registry-context.ts",
      why: "a hand createContext typed over the raw `Registry<…>` — the direct re-rot of the sealed trio",
    },
    {
      files: "type SectionRegistry = { readonly get: (id: string) => number };\nexport const C = createContext<SectionRegistry | null>(null);\n",
      at: "packages/client/src/state/g2-registry-context.ts",
      why: "the ALIAS form (`SectionRegistry`) — the historical hand shape the mint replaced, caught too",
    },
  ],
  mustPass: [
    {
      files: "export const C = createContext<Registry<string, number> | null>(null);\n",
      at: MINT_HOME,
      why: "the mint's own home is the ONE sanctioned createContext-over-a-registry site — scanRoot excludes it",
    },
    {
      files: "export const C = createContext<string | null>(null);\n",
      at: "packages/client/src/features/chat/hooks/x-context.tsx",
      why: "a non-registry context (a plain value type) is untouched — only `*Registry` type args bite",
    },
    {
      files:
        'declare function createRegistryContext<R>(name: string): unknown;\nexport const c = createRegistryContext<{ readonly get: (id: string) => number }>("x");\n',
      at: "packages/client/src/state/g3-registry-context.ts",
      why: "a createRegistryContext MINT call (not a createContext) is the fix — never flagged",
    },
    {
      files: "export function make<R>(): unknown {\n  return createContext<R | null>(null);\n}\n",
      at: "packages/client/src/state/g4.ts",
      why: "a `createContext<R | null>` over a type PARAM (the mint's own shape) carries no `Registry` — passes",
    },
  ],
};
