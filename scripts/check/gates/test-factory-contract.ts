// An exported `make*` pure builder must not accept a db param; a `seed*` persisted builder must.
import type { FunctionDeclaration } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

/** Does this `make*`/`seed*` factory violate the pure/persisted split? The node overload carries the
 *  report — this predicate only needs a boolean, never a Finding-shaped record. */
function violatesFactoryContract(func: FunctionDeclaration): boolean {
  const name = func.getName() ?? "";
  if (name.startsWith("make")) {
    return func.getParameters().some((p) => p.getName() === "db" || p.getType().getText().includes("Database"));
  }
  if (name.startsWith("seed")) {
    return !func.getParameters().some((p) => p.getName() === "db");
  }
  return false;
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
  visit: (node, _sf, ctx) => {
    if (!(node.isKind(SyntaxKind.FunctionDeclaration) && node.isExported())) {
      return;
    }
    if (violatesFactoryContract(node)) {
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
