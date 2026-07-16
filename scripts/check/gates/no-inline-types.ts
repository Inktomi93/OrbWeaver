import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

const REGEX_DATA_FORMS_STATE_LIB = /\/packages\/client\/src\/(data|forms|state|lib)\//;

// One node-anchored message (NOT the explicit-Finding overload) so `// @orb-gate-ignore no-inline-types`
// leading comments are honored — the Finding overload has no node and silently defeats suppressions.
const MESSAGE =
  "exported type/interface/zod-schema outside a type home — feature types live in the feature's contract/ (or @orb/contracts), not in a verb/service/component/substrate. Move it to contract/ and import it. See Spine-TypeScript-and-Patterns.md §7.4.";

function isTypeHome(path: string): boolean {
  if (path.includes("/contract/")) {
    return true;
  }
  if (path.endsWith("/contract.ts")) {
    return true;
  }
  if (path.includes("/packages/kit/")) {
    return true;
  }
  if (path.includes("/packages/contracts/")) {
    return true;
  }
  if (path.includes("/packages/db/")) {
    return true;
  }
  if (path.includes("/packages/ui/")) {
    return true;
  }
  if (REGEX_DATA_FORMS_STATE_LIB.test(path)) {
    return true;
  }
  if (path.includes("/server/src/kit/")) {
    return true;
  }
  if (path.includes("/tests/")) {
    return true;
  }
  if (path.includes("/scripts/")) {
    return true;
  }
  if (path.includes("/tools/")) {
    return true;
  }
  if (path.endsWith(".test.ts") || path.endsWith(".test.tsx")) {
    return true;
  }
  return false;
}

function isDomainFeature(path: string): boolean {
  return path.includes("/packages/server/src/domain/");
}

function isZodSchema(node: Node): boolean {
  if (!Node.isVariableDeclaration(node)) {
    return false;
  }
  const initializer = node.getInitializer();
  if (!(initializer && Node.isCallExpression(initializer))) {
    return false;
  }
  const expression = initializer.getExpression().getText();
  return expression === "z.object" || expression === "z.enum" || expression === "z.discriminatedUnion";
}

export const gate: GateDescriptor = {
  name: "no-inline-types",
  docRow: "Spine-TypeScript-and-Patterns.md §7.4",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: "move type to contract/ and import it",
  scanRoot: (_p) => true,
  kinds: [SyntaxKind.TypeAliasDeclaration, SyntaxKind.VariableDeclaration, SyntaxKind.InterfaceDeclaration],
  visit: (node, sf, ctx) => {
    const path = sf.getFilePath();

    if (Node.isInterfaceDeclaration(node)) {
      if (node.hasExportKeyword() && isDomainFeature(path) && !isTypeHome(path)) {
        ctx.report(node);
      }
      return;
    }

    if (isTypeHome(path)) {
      return;
    }

    if (Node.isTypeAliasDeclaration(node)) {
      if (node.hasExportKeyword()) {
        ctx.report(node);
      }
      return;
    }

    // VariableDeclaration — the export keyword lives on the enclosing VariableStatement.
    if (Node.isVariableDeclaration(node) && isZodSchema(node)) {
      const statement = node.getVariableStatement();
      if (statement?.hasExportKeyword()) {
        ctx.report(statement);
      }
    }
  },
  mustFlag: [
    {
      files: "export type Foo = string;\n",
      at: "packages/server/src/domain/x/verb.ts",
      expect: { count: 1 },
      why: "exported type in verb",
    },
    {
      files: "export interface Foo { x: string }\n",
      at: "packages/server/src/domain/x/verb.ts",
      expect: { count: 1 },
      why: "exported interface in verb",
    },
    {
      files: 'import { z } from "zod"; export const Foo = z.object({});\n',
      at: "packages/server/src/domain/x/verb.ts",
      expect: { count: 1 },
      why: "exported zod schema in verb",
    },
  ],
  mustPass: [
    {
      files: "export type Foo = string;\n",
      at: "packages/server/src/domain/x/contract/types.ts",
      why: "in contract dir",
    },
    {
      files: "type Foo = string;\n",
      at: "packages/server/src/domain/x/verb.ts",
      why: "not exported",
    },
  ],
};
