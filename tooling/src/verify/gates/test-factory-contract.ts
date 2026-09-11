// An exported function-declaration `make*` pure builder must not accept a db param; a `seed*` persisted
// builder must. Exported arrow factories are deliberately outside this syntax contract.
import type { FunctionDeclaration } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";

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

export const gate = defineGate({
  id: "test-factory-contract",
  family: "test-factory-contract",
  authority: "ordinary",
  severity: "error",
  population: {
    in: ["@client", "@ui", "@server", "@db", "@contracts", "@kit", "@tooling", "@tests", "@scripts"],
    under: ["tests/support/factories/**", "**/tests/support/factories/**"],
  },
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message:
    "a test factory violates the pure/persisted split — a `make*` pure builder must NOT accept a db, a `seed*` persisted builder MUST (core/Spine-Testing.md §4).",
  fix: "keep `make*` builders db-free (pure) and give `seed*` builders a `db` parameter (persisted).",
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.FunctionDeclaration],
        visit: (node) => {
          const func = node.asKind(SyntaxKind.FunctionDeclaration);
          if (func === undefined || !func.isExported()) {
            return;
          }
          if (violatesFactoryContract(func)) {
            const name = func.getName() ?? "factory";
            ctx.report.node(func, { token: name, offset: func.getText().indexOf(name) });
          }
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "source",
      files: { "tests/support/factories/user.ts": "export function makeUser(db: unknown) {\n  return db;\n}\n" },
      expect: { count: 1, token: "makeUser" },
      why: "a `make*` pure builder accepting a db — it must stay db-free (§4)",
    },
    {
      mode: "source",
      files: { "tests/support/factories/seed-user.ts": "export function seedUser() {\n  return {};\n}\n" },
      expect: { count: 1, token: "seedUser" },
      why: "a `seed*` persisted builder with NO db param — the persisted-must-have-db arm (distinct message)",
    },
    {
      mode: "source",
      files: {
        "tooling/src/example/tests/support/factories/nested.ts":
          "interface Database {}\nexport function makeNested(connection: Database) {\n  return connection;\n}\n",
      },
      expect: { count: 1, line: 2, token: "makeNested" },
      why: "a nested authored factory and a non-db parameter whose Database type still violates the pure make contract",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: { "tests/support/factories/user2.ts": "export function makeUser() {\n  return {};\n}\n" },
      why: "a `make*` pure builder with no db param — the sanctioned pure shape, passes",
    },
    {
      mode: "source",
      files: { "tests/support/factories/seed-user2.ts": "export function seedUser(db: unknown) {\n  return db;\n}\n" },
      why: "a `seed*` persisted builder WITH a db param — the sanctioned persisted shape, passes",
    },
    {
      mode: "source",
      files: {
        "tests/support/factories/arrows.ts": "export const makeUser = (db: unknown) => db;\nexport const seedUser = () => ({});\n",
      },
      why: "arrow factories are the declared limit of the function-declaration-only policy",
    },
  ],
});
