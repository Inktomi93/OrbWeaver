// A Zod field in an id-named position cannot remain a raw string unless the exact occurrence is waived.
import type { CallExpression, Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { ID_BRAND_HOME } from "../lib/id-brand.ts";
import { idCastProofModule } from "./_proof/id-brand.ts";

const MESSAGE = "an id-named Zod field is a raw string — use `typeIdSchema(ID_PREFIX.x)` or `brandedId<T>()` so the validated output preserves identity.";

function memberReceiver(node: MorphNode): MorphNode | undefined {
  const callee = Node.isCallExpression(node) ? node.getExpression() : node;
  return Node.isPropertyAccessExpression(callee) || Node.isElementAccessExpression(callee) ? callee.getExpression() : undefined;
}

function builderRoot(node: MorphNode): CallExpression | null {
  let current = node;
  while (Node.isCallExpression(current)) {
    const receiver = memberReceiver(current);
    if (!Node.isCallExpression(receiver)) {
      return current;
    }
    current = receiver;
  }
  return null;
}

function isZodString(root: CallExpression): boolean {
  const callee = root.getExpression();
  if (Node.isIdentifier(callee)) {
    return (callee.getSymbol()?.getDeclarations() ?? []).some(
      (declaration) =>
        Node.isImportSpecifier(declaration) && declaration.getName() === "string" && declaration.getImportDeclaration().getModuleSpecifierValue() === "zod",
    );
  }
  if (!(Node.isPropertyAccessExpression(callee) || Node.isElementAccessExpression(callee))) {
    return false;
  }
  const name = Node.isPropertyAccessExpression(callee) ? callee.getName() : callee.getArgumentExpression()?.getText().replaceAll(/["']/gu, "");
  const receiver = callee.getExpression();
  if (name !== "string" || !Node.isIdentifier(receiver)) {
    return false;
  }
  return (receiver.getSymbol()?.getDeclarations() ?? []).some((declaration) => {
    if (Node.isImportSpecifier(declaration)) {
      return declaration.getName() === "z" && declaration.getImportDeclaration().getModuleSpecifierValue() === "zod";
    }
    return Node.isNamespaceImport(declaration) && declaration.getFirstAncestorByKind(SyntaxKind.ImportDeclaration)?.getModuleSpecifierValue() === "zod";
  });
}

function idProperty(node: MorphNode): { readonly name: string; readonly nameNode: MorphNode; readonly initializer: MorphNode } | null {
  if (!Node.isPropertyAssignment(node)) {
    return null;
  }
  const nameNode = node.getNameNode();
  const initializer = node.getInitializer();
  const name = Node.isIdentifier(nameNode) || Node.isStringLiteral(nameNode) ? nameNode.getText().replaceAll(/["']/gu, "") : "";
  return name.endsWith("Id") && initializer !== undefined ? { name, nameNode, initializer } : null;
}

export const gate = defineGate({
  id: "no-raw-id",
  family: "id-brand-flow",
  authority: "ordinary",
  severity: "error",
  population: "@authored",
  analysis: "types",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: "use the canonical kit id schema. For a foreign, polymorphic, or deliberately lenient id-shaped string, attach `@orb-waive no-raw-id(<field>): <reason + end condition>` to that exact property.",
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.PropertyAssignment],
        visit: (node) => {
          const property = idProperty(node);
          const root = property === null ? null : builderRoot(property.initializer);
          if (property !== null && root !== null && isZodString(root)) {
            ctx.report.node(property.nameNode, { token: property.name, offset: 0 });
          }
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "types",
      files: { "packages/contracts/src/x.ts": 'import { z } from "zod";\nexport const schema = z.object({ userId: z.string() });\n' },
      expect: { count: 1, token: "userId" },
      why: "a raw id field loses its brand",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/x.ts":
          'import { z as schema } from "zod";\nexport const value = schema.object({ chatId: schema.string().nullable().optional() });\n',
      },
      expect: { count: 1, token: "chatId" },
      why: "Zod aliases and wrapper chains cannot hide the raw string root",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        [ID_BRAND_HOME]: idCastProofModule("export function typeIdSchema(_prefix: string): unknown { return {}; }\n"),
        "packages/contracts/src/x.ts": 'import { typeIdSchema } from "../../../kit/src/ids/index";\nexport const schema = { userId: typeIdSchema("user") };\n',
      },
      why: "the canonical validating schema carries branded output",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/x.ts": "const z = { string: () => ({}) };\nexport const schema = { userId: z.string() };\n",
      },
      why: "a local same-named builder is not Zod evidence",
    },
    {
      mode: "types",
      files: { "packages/contracts/src/x.ts": 'import { z } from "zod";\nexport const schema = z.object({ username: z.string() });\n' },
      why: "ordinary strings with no id position are untouched",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/x.ts":
          'import { z } from "zod";\nexport const schema = z.object({\n  // @orb-waive no-raw-id(requestId): an upstream correlation id; ends if it becomes an Orb entity.\n  requestId: z.string(),\n});\n',
      },
      why: "a foreign id-shaped string uses the one central positioned waiver",
    },
  ],
});
