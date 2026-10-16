// @subject tooling/src/floor/code-facts/schema-configuration.ts
// @subject tooling/src/floor/code-facts/schema-configuration-codec.ts
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { Node } from "ts-morph";
import { Project, SyntaxKind } from "ts-morph";
import { captureSchemaConfiguration } from "../../../../tooling/src/floor/code-facts/schema-configuration.ts";
import { encodeSchemaConfiguration, replaySchemaConfiguration } from "../../../../tooling/src/floor/code-facts/schema-configuration-codec.ts";
import type { InventorySpan } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import { schemaConfigurationWireSchema } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";

function anchors(): { readonly span: (node: Node) => InventorySpan; readonly replay: (span: InventorySpan) => Node } {
  const nodes = new Map<string, Node>();
  return {
    span: (node: Node): InventorySpan => {
      const span = { file: node.getSourceFile().getFilePath(), start: node.getStart(), end: node.getEnd(), kind: node.getKind() };
      nodes.set(JSON.stringify(span), node);
      return span;
    },
    replay: (span: InventorySpan): Node => {
      const node = nodes.get(JSON.stringify(span));
      if (node === undefined) {
        throw new Error("unadmitted schema configuration span");
      }
      return node;
    },
  };
}

test("configuration preserves ordered overrides and native imported/local spread observations independently of field readability", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile(
    "/config.ts",
    "import {KINDS} from '@orb/contracts/vocabulary';const BASE=['local'] as const;const EXTRA=[...KINDS,...BASE,'extra'] as const;const config={enum:['old'],...{enum:KINDS},enum:((EXTRA) as readonly string[])};",
  );
  const input = captureSchemaConfiguration(source.getVariableDeclarationOrThrow("config").getInitializerOrThrow());
  const codec = anchors();
  const wire = encodeSchemaConfiguration(input, codec.span);
  const result = replaySchemaConfiguration(schemaConfigurationWireSchema.parse(JSON.parse(JSON.stringify(wire))), codec.replay);
  expect(result).toEqual(input);
  expect(result.entries.kind).toBe("resolved");
  if (result.entries.kind !== "resolved") {
    throw new Error(result.entries.detail);
  }
  expect(result.entries.value.map(({ name, value }) => [name, value.getText()])).toEqual([
    ["enum", "['old']"],
    ["enum", "KINDS"],
    ["enum", "((EXTRA) as readonly string[])"],
  ]);
  expect(result.values.map(({ node }) => node.getText())).toEqual([
    "['old']",
    "'old'",
    "KINDS",
    "((EXTRA) as readonly string[])",
    "EXTRA",
    "KINDS",
    "BASE",
    "'local'",
    "'extra'",
  ]);
  expect(new Set(result.values.filter(({ node }) => node.getText() === "KINDS").map(({ node }) => node.getStart())).size).toBe(2);
  expect(result.values.find(({ node }) => node.getText() === "KINDS")?.module).toMatchObject({
    kind: "resolved",
    value: { moduleSpecifier: "@orb/contracts/vocabulary", exportedName: "KINDS" },
  });
  expect(result.values.find(({ node }) => node.getText() === "EXTRA")?.authored.value.kind).toBe("unresolved");
  expect(result.values.find(({ node }) => node.getText() === "BASE")?.stable).toMatchObject({
    kind: "resolved",
    value: source.getVariableDeclarationOrThrow("BASE").getInitializerOrThrow().getFirstDescendantByKindOrThrow(SyntaxKind.ArrayLiteralExpression),
  });
});

test("configuration field refusal stays distinct from an absent config or a ready empty object", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile(
    "/refusal.ts",
    "declare function build():object;const dynamic=build();const malformed={[42]:'value'};const empty={};",
  );
  for (const name of ["dynamic", "malformed"]) {
    const input = captureSchemaConfiguration(source.getVariableDeclarationOrThrow(name).getInitializerOrThrow());
    expect(input.entries.kind).toBe("unresolved");
    expect(input.values).toEqual([]);
    const codec = anchors();
    expect(replaySchemaConfiguration(encodeSchemaConfiguration(input, codec.span), codec.replay)).toEqual(input);
  }
  const empty = captureSchemaConfiguration(source.getVariableDeclarationOrThrow("empty").getInitializerOrThrow());
  expect(empty.entries).toMatchObject({ kind: "resolved", value: [] });
  expect(empty.values).toEqual([]);
});

test("configuration graph refuses missing, duplicated and orphaned native value coverage", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile("/coverage.ts", "const BASE=['one'] as const;const config={enum:[...BASE,'two']};");
  const input = captureSchemaConfiguration(source.getVariableDeclarationOrThrow("config").getInitializerOrThrow());
  const codec = anchors();
  const wire = encodeSchemaConfiguration(input, codec.span);
  const first = wire.values[0];
  if (first === undefined) {
    throw new Error("configuration graph fixture did not produce native values");
  }
  expect(() => replaySchemaConfiguration({ ...wire, values: wire.values.slice(0, -1) }, codec.replay)).toThrow("incomplete");
  expect(schemaConfigurationWireSchema.safeParse({ ...wire, values: wire.values.slice(0, -1) }).success).toBe(false);
  expect(() => replaySchemaConfiguration({ ...wire, values: [...wire.values, first] }, codec.replay)).toThrow("ambiguous");
  expect(schemaConfigurationWireSchema.safeParse({ ...wire, values: [...wire.values, first] }).success).toBe(false);
  expect(() => replaySchemaConfiguration({ ...wire, entries: { kind: "resolved", value: [], trace: wire.entries.trace } }, codec.replay)).toThrow("foreign");
  expect(schemaConfigurationWireSchema.safeParse({ ...wire, entries: { kind: "resolved", value: [], trace: wire.entries.trace } }).success).toBe(false);
});
