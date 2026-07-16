// An exported `make*` pure builder must not accept a db param; a `seed*` persisted builder must.
import type { FunctionDeclaration, Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";
import type { Violation } from "../harness.ts";

function checkFactoryFunction(func: FunctionDeclaration, filePath: string): Violation | null {
  const name = func.getName() ?? "";
  if (name.startsWith("make")) {
    const hasDb = func.getParameters().some((p) => p.getName() === "db" || p.getType().getText().includes("Database"));
    if (hasDb) {
      return {
        file: filePath,
        line: func.getStartLineNumber(),
        message: `Factory pure builder '${name}' must not accept a database parameter (core/Spine-Testing.md §4).`,
      };
    }
    return null;
  }
  if (name.startsWith("seed")) {
    const hasDb = func.getParameters().some((p) => p.getName() === "db");
    if (!hasDb) {
      return {
        file: filePath,
        line: func.getStartLineNumber(),
        message: `Factory persisted builder '${name}' must accept a 'db' parameter (core/Spine-Testing.md §4).`,
      };
    }
  }
  return null;
}

export const gate: GateDescriptor = {
  name: "test-factory-contract",
  docRow: "core/Spine-Testing.md §4",
  status: "active",
  scopeSafety: "incremental-safe",
  message:
    "a test factory violates the pure/persisted split — a `make*` pure builder must NOT accept a db, a `seed*` persisted builder MUST (core/Spine-Testing.md §4).",
  fix: "keep `make*` builders db-free (pure) and give `seed*` builders a `db` parameter (persisted).",
  scanRoot: (p) => p.includes("tests/support/factories/"),
  kinds: [SyntaxKind.FunctionDeclaration],
  visit: (node: Node, _sf, ctx) => {
    if (!(node.isKind(SyntaxKind.FunctionDeclaration) && node.isExported())) {
      return;
    }
    const v = checkFactoryFunction(node, "");
    if (v !== null) {
      ctx.report(node, { token: node.getName() ?? "factory", offset: 0 });
    }
  },
  mustFlag: [
    {
      files: "export function makeUser(db: unknown) {\n  return db;\n}\n",
      at: "tests/support/factories/user.ts",
      why: "a `make*` pure builder accepting a db — it must stay db-free (§4)",
    },
    {
      files: "export function seedUser() {\n  return {};\n}\n",
      at: "tests/support/factories/seed-user.ts",
      why: "a `seed*` persisted builder with NO db param — the persisted-must-have-db arm (distinct message)",
    },
  ],
  mustPass: [
    {
      files: "export function makeUser() {\n  return {};\n}\n",
      at: "tests/support/factories/user2.ts",
      why: "a `make*` pure builder with no db param — the sanctioned pure shape, passes",
    },
    {
      files: "export function seedUser(db: unknown) {\n  return db;\n}\n",
      at: "tests/support/factories/seed-user2.ts",
      why: "a `seed*` persisted builder WITH a db param — the sanctioned persisted shape, passes",
    },
  ],
};
