// An exported function-declaration `make*` pure builder must not accept a db param; a `seed*` persisted
// builder must. Exported arrow factories are deliberately outside this function-declaration contract.
//
// TWO ARMS, TWO MESSAGES (#1954, 2026-09-11). The two halves of the split fail for OPPOSITE reasons — a
// `make*` took a db it must not have, a `seed*` lacks a db it must have — and until now both emitted one
// shared sentence while the `seed*` proof row's `why` claimed a "(distinct message)" that did not exist.
// The claim is now true rather than deleted: each arm carries its own per-finding message, so the
// diagnostic tells an author which direction to move, and the proof rows discriminate the arms with
// `messageIncludes` instead of asserting a property nothing could catch.
//
// ANALYSIS IS `types`, NOT `syntax` (corrected 2026-09-11). The PURE arm decides by the parameter's
// RESOLVED type (`getType().getText()`), which reaches the Project's checker. `analysis: "syntax"` fences
// only `ctx.checker()` (`policy-pass-context.ts:243`), so the old declaration was honest about nothing and
// taught the next lane that a type read is free under `syntax`. Declaring it costs one word and no
// behaviour: `analysis` gates the checker accessor and the proof `mode`, nothing else.
//
// FAMILY: SINGLETON under its own id. There is NO shared `lib/` reader — it reads the parameter list of a
// delivered FunctionDeclaration and nothing else — and no other policy judges the test-factory vocabulary
// (`tests/support/factories/**` appears in no other gate module).
// POPULATION PORT: the legacy `scanRoot: (p) => p.includes("tests/support/factories/")` (45743d76d^) ports
// to `under: ["tests/support/factories/**", "**/tests/support/factories/**"]` across every named root — the
// first glob is the repo-root factories tree, the second is the nested authored case the third mustFlag row
// pins (`tooling/src/example/tests/support/factories/nested.ts`). Together they admit exactly the substring
// match the legacy predicate did.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `test-factory-contract` descriptor at 073520068d3305dfedbb481153cadfef6b30f847, the parent of the conversion
// `45743d76d` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). Over the SAME
// 7,006 harness candidates at that tree (`git ls-tree` ∩ `_shared/ts-workspace.ts#harnessGlobs`), legacy `scanRoot`
// admits 11 and final `population` admits 11. legacy − final = ∅. final − legacy = ∅. Controls: inside
// `tests/support/factories/__cbbhr_in_anth-wire.ts` (virtual) admitted by both; outside
// `packages/client/src/agent-handles/__cbbhr_out_index.ts` (virtual) rejected by both.
import type { FunctionDeclaration } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";

const MESSAGE_SHARED_TAIL = " (core/Spine-Testing.md §4).";
const MESSAGE_PURE = "a `make*` PURE builder accepts a db — a pure builder must stay db-free; persistence belongs to a `seed*` builder" + MESSAGE_SHARED_TAIL;
const MESSAGE_PERSISTED =
  "a `seed*` PERSISTED builder has no `db` parameter — a persisted builder must take one; a db-free builder belongs under the `make*` prefix" +
  MESSAGE_SHARED_TAIL;

/** Which half of the pure/persisted split this `make*`/`seed*` factory breaks, or `undefined` when it is
 *  conformant (or neither prefix). The arms fail for opposite reasons, so each returns its own message. */
function factoryContractMessage(func: FunctionDeclaration): string | undefined {
  const name = func.getName() ?? "";
  if (name.startsWith("make")) {
    // The PURE arm rejects a db by NAME or by TYPE — a `connection: Database` is still a db.
    return func.getParameters().some((p) => p.getName() === "db" || p.getType().getText().includes("Database")) ? MESSAGE_PURE : undefined;
  }
  // The PERSISTED arm requires the parameter by NAME (`db`), which is the contract's spelling.
  return name.startsWith("seed") && !func.getParameters().some((p) => p.getName() === "db") ? MESSAGE_PERSISTED : undefined;
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
  analysis: "types",
  execution: "selected-files",
  facts: [],
  resources: [],
  message:
    "a test factory violates the pure/persisted split — a `make*` pure builder must NOT accept a db, a `seed*` persisted builder MUST (core/Spine-Testing.md §4).",
  fix: "keep `make*` builders db-free (pure) and give `seed*` builders a `db` parameter (persisted). For a deliberate exception, write an adjacent `@orb-waive test-factory-contract(<position>): <why + end condition>` — the position is the FACTORY'S OWN NAME (`makeUser`, `seedUser`), not the `db` parameter the message names.",
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.FunctionDeclaration],
        visit: (node) => {
          const func = node.asKind(SyntaxKind.FunctionDeclaration);
          if (func === undefined || !func.isExported()) {
            return;
          }
          const message = factoryContractMessage(func);
          if (message !== undefined) {
            const name = func.getName() ?? "factory";
            ctx.report.node(func, { token: name, offset: func.getText().indexOf(name), message });
          }
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "types",
      files: { "tests/support/factories/user.ts": "export function makeUser(db: unknown) {\n  return db;\n}\n" },
      expect: { count: 1, token: "makeUser", messageIncludes: "PURE builder accepts a db" },
      why: "a `make*` pure builder accepting a db — it must stay db-free (§4), and the PURE arm's own message says so",
    },
    {
      mode: "types",
      files: { "tests/support/factories/seed-user.ts": "export function seedUser() {\n  return {};\n}\n" },
      expect: { count: 1, token: "seedUser", messageIncludes: "PERSISTED builder has no `db` parameter" },
      why: "a `seed*` persisted builder with NO db param — the persisted-must-have-db arm, pinned by the message the OTHER arm cannot emit (#1954: the parenthetical used to promise a distinctness that did not exist)",
    },
    {
      mode: "types",
      files: {
        "tooling/src/example/tests/support/factories/nested.ts":
          "interface Database {}\nexport function makeNested(connection: Database) {\n  return connection;\n}\n",
      },
      expect: { count: 1, line: 2, token: "makeNested", messageIncludes: "PURE builder accepts a db" },
      why: "a nested authored factory and a non-db parameter whose Database type still violates the pure make contract — a TYPE-matched db is still the PURE arm, not the persisted one",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: { "tests/support/factories/user2.ts": "export function makeUser() {\n  return {};\n}\n" },
      why: "a `make*` pure builder with no db param — the sanctioned pure shape, passes",
    },
    {
      mode: "types",
      files: { "tests/support/factories/seed-user2.ts": "export function seedUser(db: unknown) {\n  return db;\n}\n" },
      why: "a `seed*` persisted builder WITH a db param — the sanctioned persisted shape, passes",
    },
    {
      mode: "types",
      files: {
        "tests/support/factories/arrows.ts": "export const makeUser = (db: unknown) => db;\nexport const seedUser = () => ({});\n",
      },
      why: "arrow factories are the declared limit of the function-declaration-only policy",
    },
    {
      mode: "types",
      files: {
        "tests/support/factories/user3.ts":
          "// @orb-waive test-factory-contract(makeUser): pinned identity arm; ends when this builder sheds its db.\nexport function makeUser(db: unknown) {\n  return db;\n}\n",
      },
      why: "THE IDENTITY ARM (§4.2): the twin of the PURE-arm mustFlag row, which produces EXACTLY ONE finding, waived at the position this policy reports — the factory's own name, which the module supplies explicitly because the derived token of an exported declaration would be the keyword `export` and every finding in the family would share it",
    },
    {
      mode: "types",
      files: {
        "tests/support/factories/user4.ts": "export function makeUser() {\n  return {};\n}\n",
        "packages/client/src/features/x/lib/factories.ts": "export function makeProduct(db: unknown) {\n  return db;\n}\n",
      },
      why: "THE POPULATION FENCE, pinned: the `tests/support/factories/**` narrowing is the whole subject — the pure/persisted split is a TEST-FACTORY contract, and a product function named `make*` that takes a db is ordinary code. Dropping the `under` clause flags this file and REDS this row",
    },
  ],
});
