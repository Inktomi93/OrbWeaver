// Gate: registry-assembly-at-door-only (client-architecture-lockdown.md §16 G8) — `createRegistry`/
// `createContributorRegistry` may be CALLED only at the composition root (`main.tsx`) or a `compose/`
// module it imports; a call anywhere else is a feature/lib smuggling in its own private assembly. A
// mutating `register(`-named function/method is banned outright (§5 rule 1) — side-effect
// registration reintroduces import-order nondeterminism, wherever it's declared.
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

const DOOR_FILE = "packages/client/src/main.tsx";
const REGISTRY_FACTORY_NAMES = new Set(["createRegistry", "createContributorRegistry"]);

function isDoorFile(repoRelPath: string): boolean {
  return repoRelPath === DOOR_FILE || repoRelPath.includes("/compose/");
}

/** Function-VALUED declarations named exactly `register` — the banned mutating API, in every shape it
 *  could take (a class/object-literal method, or a const bound to a function/arrow). */
function isBannedRegisterDecl(node: Node): boolean {
  if (Node.isMethodDeclaration(node)) {
    return node.getName() === "register";
  }
  if (Node.isFunctionDeclaration(node)) {
    return node.getName() === "register";
  }
  if (Node.isVariableDeclaration(node)) {
    const init = node.getInitializer();
    return (
      node.getName() === "register" &&
      init !== undefined &&
      (Node.isArrowFunction(init) || Node.isFunctionExpression(init))
    );
  }
  return false;
}

export const gate: GateDescriptor = {
  name: "registry-assembly-at-door-only",
  docRow: "client-architecture-lockdown.md §16 (G8 row)",
  status: "active",
  scopeSafety: "incremental-safe",
  message:
    "createRegistry()/createContributorRegistry() may be CALLED only at the composition root " +
    "(main.tsx) or a compose/ module — every other call site is a private assembly outside the ONE " +
    "registration door (client-architecture-lockdown.md §5/§7). A mutating register()-named " +
    "function/method is banned outright (§5 rule 1) wherever it's declared.",
  fix: "move the createRegistry()/createContributorRegistry() call into main.tsx (or a compose/ module main.tsx imports); replace a register() API with an exported definition value assembled at the door.",
  scanRoot: (p) => p.startsWith("packages/client/src/"),
  kinds: [
    SyntaxKind.CallExpression,
    SyntaxKind.MethodDeclaration,
    SyntaxKind.FunctionDeclaration,
    SyntaxKind.VariableDeclaration,
  ],
  visit: (node, sf, ctx) => {
    if (Node.isCallExpression(node)) {
      const callee = node.getExpression();
      const isRegistryFactory =
        Node.isIdentifier(callee) && REGISTRY_FACTORY_NAMES.has(callee.getText());
      if (!isRegistryFactory) {
        return;
      }
      const clientRelIdx = sf.getFilePath().indexOf("packages/client/src/");
      if (!isDoorFile(sf.getFilePath().slice(clientRelIdx))) {
        ctx.report(node, { token: callee.getText(), offset: 0 });
      }
      return;
    }
    if (isBannedRegisterDecl(node)) {
      ctx.report(node, { token: "register", offset: 0 });
    }
  },
  mustFlag: [
    {
      files:
        'import { createRegistry } from "#lib";\nexport const x = createRegistry("t", ["a"], { a: 1 });\n',
      at: "packages/client/src/features/x/lib/x-section.ts",
      why: "a createRegistry( call in a feature file — a private assembly outside the door (§5/§7)",
    },
    {
      files: "export const registry = {\n  register(id: string): void {},\n};\n",
      at: "packages/client/src/lib/x.ts",
      why: "a mutating register()-named method — banned outright, wherever it's declared (§5 rule 1)",
    },
  ],
  mustPass: [
    {
      files:
        'import { createRegistry } from "#lib";\nexport const x = createRegistry("t", ["a"], { a: 1 });\n',
      at: "packages/client/src/main.tsx",
      why: "the ONE sanctioned call site — the registration door itself, passes",
    },
    {
      files:
        'import { createRegistry } from "#lib";\nexport const x = createRegistry("t", ["a"], { a: 1 });\n',
      at: "packages/client/src/compose/sections.ts",
      why: "a compose/ module (the door's own helper) — passes",
    },
  ],
};
