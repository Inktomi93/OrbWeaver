// @subject tooling/src/verify/ops/policy-conformance.ts
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { resolveTypeIdentityChain } from "@orb/tooling/floor/code-facts/type-member-origin";
import type { Node } from "ts-morph";
import { Project, SyntaxKind } from "ts-morph";
import { vi } from "vitest";
import type { InventoryInvocationPlan, InventorySpan } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import { mapTypeObservationDemand } from "../../../../tooling/src/floor/code-facts/type-observations-codec.ts";
import { TYPE_OBSERVATION_PROFILE } from "../../../../tooling/src/floor/code-facts/type-observations-contract.ts";
import { readTypeObservations } from "../../../../tooling/src/floor/code-facts/type-observations-read.ts";
import { nodeTypeSelector } from "../../../../tooling/src/floor/code-facts/type-projection-contract.ts";
import { defineGate } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate } from "../../../../tooling/src/verify/gates/owner-scoped-reads.ts";
import { readDrizzleClientCall } from "../../../../tooling/src/verify/lib/drizzle-client-call.ts";
import { isolatedTypeFacts, verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";

const QUERY = "packages/server/src/domain/character/persistence/queries.ts";
const SCHEMA = {
  "packages/db/src/schema/character.ts":
    'import { sqliteTable, text } from "drizzle-orm/sqlite-core"; export const characters = sqliteTable("characters", {id: text("id").primaryKey(), ownerId: text("owner_id").notNull()});',
};
const HEAD = 'import { and, eq } from "drizzle-orm"; import { characters } from "@orb/db";';
const INITIAL_SCHEMA = {
  "packages/db/src/schema/character.ts": SCHEMA["packages/db/src/schema/character.ts"].replace(
    'ownerId: text("owner_id").notNull()',
    'ownerId: text("owner_id").notNull(), retired: text("retired")',
  ),
};

test("isolated type captures reuse only the registered anchor and plan while retaining epoch and session refusals", async () => {
  const invocation = await import("../../../../tooling/src/floor/compiler/invocation-evidence-extract.ts");
  const capture = vi.spyOn(invocation, "captureInvocationEvidence");
  try {
    for (const changedSource of ["source", "related"] as const) {
      capture.mockClear();
      const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, strict: true } });
      const source = project.createSourceFile("/input.ts", "export declare const value:string;");
      const related = project.createSourceFile("/related.ts", "export interface Related {id:string}");
      const value = source.getVariableDeclarationOrThrow("value");
      const span = (node: Node): InventorySpan => ({
        file: node.getSourceFile().getFilePath(),
        start: node.getStart(),
        end: node.getEnd(),
        kind: node.getKind(),
      });
      const plan: InventoryInvocationPlan = {
        mode: "types",
        facets: [],
        arguments: [],
        typeObservations: mapTypeObservationDemand(
          { profile: TYPE_OBSERVATION_PROFILE, sources: [source, related], nodes: [], questions: [{ kind: "primitive-flags", nodes: [value] }] },
          span,
        ),
      };
      const otherPlan: InventoryInvocationPlan = {
        ...plan,
        typeObservations: { ...plan.typeObservations, profile: TYPE_OBSERVATION_PROFILE, sources: [span(source)], nodes: [] },
      };
      const foreign = new Project({ useInMemoryFileSystem: true }).createSourceFile(source.getFilePath(), source.getFullText());
      using session = isolatedTypeFacts(project);
      session.request("owner", { kind: "invocation-evidence", nodes: [source, related], plan });
      session.request("owner", { kind: "invocation-evidence", nodes: [source], plan: otherPlan });
      session.request("foreign", { kind: "invocation-evidence", nodes: [foreign], plan });
      expect(() => session.invocationEvidence("owner", [source], plan)).toThrow("must be sealed");
      session.seal(new Set(["owner", "foreign"]));
      const first = session.invocationEvidence("owner", [source, related], plan).get(source);
      if (first?.typeObservations === undefined) {
        throw new Error("the registered native type capture must be delivered");
      }
      expect(readTypeObservations(first.typeObservations).primitiveFlags(nodeTypeSelector(value)).string).toBe(true);
      const cloned = structuredClone(plan);
      expect(session.invocationEvidence("owner", [source, related], cloned).get(source)).toBe(first);
      expect(session.invocationEvidence("owner", [source], plan).get(source)).toBe(first);
      expect(capture).toHaveBeenCalledTimes(1);
      const otherAnchor = session.invocationEvidence("owner", [related, source], plan);
      expect(otherAnchor.get(source)).toBe(otherAnchor.get(related));
      expect(otherAnchor.get(source)).not.toBe(first);
      expect(session.invocationEvidence("owner", [source], otherPlan).get(source)).not.toBe(first);
      expect(capture).toHaveBeenCalledTimes(3);
      expect(() => session.invocationEvidence("wrong-owner", [source], plan)).toThrow("not registered");
      expect(() =>
        session.invocationEvidence("owner", [source], {
          ...plan,
          typeObservations: { ...cloned.typeObservations, profile: TYPE_OBSERVATION_PROFILE, sources: [], nodes: [] },
        }),
      ).toThrow("not registered");
      expect(() => session.invocationEvidence("foreign", [foreign], plan)).toThrow("outside its captured fixture");
      expect(() => session.request("owner", { kind: "invocation-evidence", nodes: [source], plan })).toThrow("sealed");
      expect(capture).toHaveBeenCalledTimes(3);
      const stale = changedSource === "source" ? source : related;
      stale.replaceWithText(`${stale.getFullText()}\nexport const changed=1;`);
      expect(() => session.invocationEvidence("owner", [source], plan)).toThrow(/epoch|forgotten/u);
      expect(capture).toHaveBeenCalledTimes(3);
      session[Symbol.dispose]();
      expect(() => session.invocationEvidence("owner", [source], plan)).toThrow("disposed");
    }
  } finally {
    capture.mockRestore();
  }
});

test("the canonical types fixture binds actual schema/client origins without a production Db alias", () => {
  let observed = 0;
  let priorDbDeclaration: object | undefined;
  const aliases: { readonly project: Project; readonly path: string }[] = [];
  const checked = defineGate({
    ...gate,
    create: (context: Parameters<typeof gate.create>[0]) => {
      const implementation = gate.create(context);
      return {
        ...implementation,
        evaluate: () => {
          const source = context.sourceFile(QUERY);
          const project = source.getProject();
          expect(project.getPreEmitDiagnostics().map((diagnostic) => diagnostic.getMessageText())).toEqual([]);
          const column = source.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression).find((node) => node.getText() === "characters.ownerId");
          const from = source.getDescendantsOfKind(SyntaxKind.CallExpression).find((node) => node.getExpression().getText().endsWith(".from"));
          if (column === undefined || from === undefined) {
            throw new Error("the real owned-column and read anchor must exist");
          }
          const identity = resolveTypeIdentityChain(column);
          expect(column.getType().isAny()).toBe(false);
          expect(
            identity.kind === "resolved" &&
              identity.value.some(
                (origin) =>
                  origin.name === "SQLiteColumn" &&
                  origin.declarations.every((declaration) => declaration.getSourceFile().getFilePath().includes("/drizzle-orm/")),
              ),
          ).toBe(true);
          expect(readDrizzleClientCall(from).kind).toBe("drizzle");
          const table = source.getImportDeclarationOrThrow("@orb/db").getNamedImports()[0];
          expect(table?.getType().getProperty("retired") !== undefined).toBe(observed === 0);
          const db = source.getDescendantsOfKind(SyntaxKind.Identifier).find((node) => node.getText() === "Db");
          const declarations = db?.getSymbol()?.getDeclarations() ?? [];
          expect(declarations).toHaveLength(1);
          const dbDeclaration = declarations[0];
          if (dbDeclaration === undefined) {
            throw new Error("the fixture Db alias must be declared");
          }
          expect(dbDeclaration.compilerNode).not.toBe(priorDbDeclaration);
          priorDbDeclaration = dbDeclaration.compilerNode;
          aliases.push({ project, path: dbDeclaration.getSourceFile().getFilePath() });
          expect(
            declarations.every(
              (declaration) =>
                declaration.getSourceFile().getFilePath().startsWith(source.getFilePath().slice(0, -QUERY.length)) &&
                !declaration.getSourceFile().getFilePath().includes("/packages/"),
            ),
          ).toBe(true);
          observed += 1;
          implementation.evaluate();
        },
      };
    },
    mustFlag: [
      {
        mode: "types" as const,
        files: {
          ...INITIAL_SCHEMA,
          [QUERY]: `${HEAD} export async function read(db: Db, id: string, ownerId: string) { return await db.select({ownerId: characters.ownerId}).from(characters).where(eq(characters.id, id)); }`,
        },
        expect: { count: 1, messageIncludes: "by-id READ" },
        why: "a genuine native by-id query still needs its owner",
      },
    ],
    mustPass: [
      {
        mode: "types" as const,
        files: {
          ...SCHEMA,
          [QUERY]: `${HEAD} export async function read(db: Db, id: string, ownerId: string) { return await db.select({ownerId: characters.ownerId}).from(characters).where(and(eq(characters.id, id), eq(characters.ownerId, ownerId))); }`,
        },
        why: "a genuine native owner predicate admits the exact owned query",
      },
    ],
  });
  expect(verifyPolicyProofs([checked])).toEqual([]);
  expect(observed).toBe(2);
  for (const { project, path } of aliases) {
    expect(project.getSourceFile(path)).toBeUndefined();
  }
});
