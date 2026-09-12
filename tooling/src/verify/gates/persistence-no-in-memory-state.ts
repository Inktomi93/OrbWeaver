// Core-0-Architecture-and-Structure.md §7: `persistence/` is QUERIES-ONLY — in-memory state (caches,
// registries) belongs in a named subsystem, not the query layer. The subject is the AMBIENT GLOBAL
// collection constructor, resolved through the shared global-origin reader: a local `class Map` and an
// imported `Map` implementation are different constructors and pass, while `globalThis.Map` and an
// immutable alias of the global are the same one. A constructor SPELLED like a global whose binding the
// checker cannot resolve at all is fail-closed. DECLARED LIMITS live in the mustPass rows.
//
// THE THIRD ANSWER (#944, repaired #2041) — and the repair is a CORRECTION, not an addition. The arm was
// `declarationOf(callee).kind === "unresolved"`, which no fixture could ever reach: the conformance harness
// builds its virtual project with ts-morph's `useInMemoryFileSystem`, which LOADS the default lib files, so
// a bare `Map` always binds `declare var Map` and always took the ambient arm. The row that advertised the
// arm (`unbound.ts`, "with no ambient library loaded the checker binds no declaration for `Map` at all")
// was therefore green through the ORDINARY verdict, and a `throw` planted in the fail-closed branch red
// nothing. Worse, the predicate ACQUITTED the one shape it existed for: `import { Map } from "./missing.ts"`
// binds an ImportSpecifier, so `declarationOf` answered "resolved" and an unreadable door named `Map` walked
// straight through. The arm now asks the shared module-member reader and routes its refusal through
// `classifyOriginRefusal`: a resolvable import is a different constructor and passes, a local class is a
// different constructor and passes, and only a door with no reachable target is reported.
import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { classifyOriginRefusal } from "../lib/origin-verdict.ts";
import { readMemberReference, resolveGlobalMemberOrigin, resolveModuleMemberOrigin } from "../lib/reference-fact.ts";

const IN_MEMORY_GLOBALS = new Set(["Map", "Set", "WeakMap", "WeakSet"]);

const MESSAGE =
  "an ambient Map/Set/WeakMap/WeakSet is constructed in a `persistence/` file — persistence is QUERIES-ONLY; " +
  "in-memory state (caches, registries) belongs in a named subsystem, not the query layer " +
  "(Core-0-Architecture-and-Structure.md §7).";

const FIX =
  "move the collection into the subsystem that owns the state. For a genuine QUERY-LOCAL lookup — an index " +
  "over the row set this call just returned, which does not survive the call — attach " +
  "`@orb-waive persistence-no-in-memory-state(<the reported constructor>): <why it is call-local, and what " +
  "would end it>` to that exact occurrence.";

/** THE FAIL-CLOSED THIRD ANSWER (#944), a SEPARATE text rather than a `${MESSAGE} …` suffix: the unreadable
 *  arm reports the same single finding under the same token as the ambient verdict and differs ONLY in
 *  message, so a shared prefix would leave both arms unpinnable in either direction (guide §4.1). */
const UNREADABLE =
  "a collection constructor spelled like an ambient global enters through a door with no reachable target, so whether it is the runtime's own Map/Set/WeakMap/WeakSet CANNOT be established. Reported rather than admitted by a broken door: the spelling alone is not the identity.";

/** Legacy `scanRoot` was `p.includes("/persistence/") && !p.includes(".test.") && !p.startsWith("tests/")`;
 *  the nine authored roots under any `persistence/` directory, minus the test tree and every `*.test.*`
 *  basename, is the same admitted set. Nested authored `tests/` roots stay in by design. */
const PERSISTENCE_POPULATION = {
  in: ["@authored"],
  under: ["**/persistence/**"],
  notUnder: ["tests/**"],
  notNamed: ["*.test.*"],
} as const;

/** The constructor name a `new X()` / `new ns.X()` expression SPELLS, used only as the candidate gate: the
 *  verdict below is decided by the resolved global origin, never by this string. */
function spelledConstructor(expression: MorphNode): { readonly name: string; readonly anchor: MorphNode } | null {
  if (Node.isIdentifier(expression)) {
    return IN_MEMORY_GLOBALS.has(expression.getText()) ? { name: expression.getText(), anchor: expression } : null;
  }
  if (!(Node.isPropertyAccessExpression(expression) || Node.isElementAccessExpression(expression))) {
    return null;
  }
  const member = readMemberReference(expression);
  return member.kind === "resolved" && IN_MEMORY_GLOBALS.has(member.value.name) ? { name: member.value.name, anchor: member.value.nameNode } : null;
}

export const gate = defineGate({
  id: "persistence-no-in-memory-state",
  family: "persistence-no-in-memory-state",
  authority: "ordinary",
  severity: "error",
  population: PERSISTENCE_POPULATION,
  analysis: "types",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.NewExpression],
        visit: (node) => {
          if (!Node.isNewExpression(node)) {
            return;
          }
          const callee = node.getExpression();
          const spelled = spelledConstructor(callee);
          if (spelled === null) {
            return;
          }
          const origin = resolveGlobalMemberOrigin(callee);
          if (origin.kind === "resolved") {
            // `globalThis.Map` collapses onto the bare global by construction, so both spellings arrive as
            // the same `globalName` with an empty member path.
            if (origin.value.globalName === spelled.name && origin.value.memberPath.length === 0) {
              ctx.report.node(spelled.anchor, { token: spelled.name, offset: spelled.anchor.getText().indexOf(spelled.name) });
            }
            return;
          }
          // NOT AMBIENT. A constructor that resolves to a DECLARATION — a local class, an imported
          // implementation — is a different constructor and is acquitted; that is the identity claim. A
          // constructor with NO reachable declaration is unprovable, and the spelling is fail-closed.
          const moduleOrigin = resolveModuleMemberOrigin(callee);
          if (moduleOrigin.kind !== "unresolved") {
            return;
          }
          if (classifyOriginRefusal(moduleOrigin.reason, callee) === "unreadable") {
            ctx.report.node(spelled.anchor, { token: spelled.name, offset: spelled.anchor.getText().indexOf(spelled.name), message: UNREADABLE });
          }
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "types",
      files: {
        "node_modules/typescript/lib/lib.es5.d.ts":
          "interface Map<K, V> { get(key: K): V | undefined }\ninterface MapConstructor { new <K, V>(): Map<K, V> }\ndeclare var Map: MapConstructor;\ninterface Set<T> { has(value: T): boolean }\ninterface SetConstructor { new <T>(): Set<T> }\ndeclare var Set: SetConstructor;\ndeclare var globalThis: { Map: MapConstructor; Set: SetConstructor };\n",
        "packages/server/src/domain/feature/persistence/x.ts": "export const cache = new Map<string, string>();\n",
      },
      expect: { count: 1, token: "Map" },
      why: "the founding shape — a `Map` cache constructed in the query layer, which is state the persistence tier is not allowed to own",
    },
    {
      mode: "types",
      files: {
        "node_modules/typescript/lib/lib.es5.d.ts":
          "interface Set<T> { has(value: T): boolean }\ninterface SetConstructor { new <T>(): Set<T> }\ndeclare var Set: SetConstructor;\n",
        "packages/server/src/domain/feature/persistence/y.ts": "export const seen = new Set<string>();\n",
      },
      expect: { count: 1, token: "Set" },
      why: "the `Set` half of the same rule — the four ambient collections are one subject",
    },
    {
      mode: "types",
      files: {
        "node_modules/typescript/lib/lib.es5.d.ts":
          "interface Map<K, V> { get(key: K): V | undefined }\ninterface MapConstructor { new <K, V>(): Map<K, V> }\ndeclare var Map: MapConstructor;\ndeclare var globalThis: { Map: MapConstructor };\n",
        "packages/server/src/domain/feature/persistence/global.ts": "export const cache = new globalThis.Map<string, string>();\n",
      },
      expect: { count: 1, token: "Map" },
      why: '`globalThis.Map` is the SAME ambient constructor — the legacy `getExpression().getText() === "Map"` comparison was offered the text `globalThis.Map` and answered no, a silent green',
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/feature/persistence/unreadable-door.ts":
          'import { Map } from "./missing.ts";\nexport const cache = new Map<string, string>();\n',
      },
      expect: { count: 1, token: "Map", messageIncludes: "CANNOT be established" },
      why: "THE FAIL-CLOSED THIRD ANSWER (#944), and this row REPLACES a green-for-the-wrong-reason one (#2041). Its predecessor was a bare `new Map()` whose `why` claimed 'no ambient library is loaded' — but the conformance harness builds its project with ts-morph's `useInMemoryFileSystem`, which loads the default lib files, so `Map` bound `declare var Map` and the row was passing through the ORDINARY arm; a `throw` planted in the fail-closed branch red nothing at all. The genuine unreadable shape is an import DOOR that names the global's spelling and resolves to nothing: the specifier is still a module-alias declaration, `bindsProvenNonModuleDeclaration` is false, and the refusal fails closed. The OLD predicate acquitted exactly this — it asked only whether a declaration existed, and an ImportSpecifier is one",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "node_modules/typescript/lib/lib.es5.d.ts":
          "interface Map<K, V> { get(key: K): V | undefined }\ninterface MapConstructor { new <K, V>(): Map<K, V> }\ndeclare var Map: MapConstructor;\n",
        "packages/server/src/domain/feature/persistence/alias.ts": "const Store = Map;\nexport const cache = new Store<string, string>();\n",
      },
      why: "DECLARED LIMIT — an immutable alias of the global resolves through the shared reader, but the candidate gate is the SPELLED name, so `new Store()` is not offered. Closing it means resolving a global origin on every `new` in the population",
    },
    {
      mode: "types",
      files: {
        "node_modules/typescript/lib/lib.es5.d.ts":
          "interface Map<K, V> { get(key: K): V | undefined }\ninterface MapConstructor { new <K, V>(): Map<K, V> }\ndeclare var Map: MapConstructor;\n",
        "packages/server/src/domain/feature/logic.ts": "export const cache = new Map<string, string>();\n",
        "packages/server/src/domain/feature/persistence/quiet.ts": "export const quiet = 1;\n",
      },
      why: "the same construction OUTSIDE `persistence/` is ordinary code — a named subsystem is exactly where this state belongs",
    },
    {
      mode: "types",
      files: {
        "node_modules/typescript/lib/lib.es5.d.ts":
          "interface Map<K, V> { get(key: K): V | undefined }\ninterface MapConstructor { new <K, V>(): Map<K, V> }\ndeclare var Map: MapConstructor;\n",
        "packages/server/src/domain/feature/persistence/local-class.ts":
          'class Map {\n  readonly label = "a row-shape helper that happens to be named Map";\n}\nexport const helper = new Map();\n',
      },
      why: "THE IDENTITY COUNTERFACTUAL — a LOCAL class named `Map`, constructed in a persistence file, with the ambient library loaded in the same project. Everything the legacy text comparison keyed on matches; only the resolved origin separates them, and deleting the global-origin check turns this row red",
    },
    {
      mode: "types",
      files: {
        "node_modules/typescript/lib/lib.es5.d.ts":
          "interface Map<K, V> { get(key: K): V | undefined }\ninterface MapConstructor { new <K, V>(): Map<K, V> }\ndeclare var Map: MapConstructor;\n",
        "packages/server/src/domain/feature/lib/ordered-map.ts": "export class Map {\n  readonly ordered = true;\n}\n",
        "packages/server/src/domain/feature/persistence/imported.ts": 'import { Map } from "../lib/ordered-map.ts";\nexport const helper = new Map();\n',
      },
      why: "an IMPORTED implementation named `Map` is a module member, not the ambient global — the second half of the same counterfactual, and the shape a hand-rolled ordered map actually takes",
    },
    {
      mode: "types",
      files: {
        "node_modules/typescript/lib/lib.es5.d.ts":
          "interface Map<K, V> { get(key: K): V | undefined }\ninterface MapConstructor { new <K, V>(): Map<K, V> }\ndeclare var Map: MapConstructor;\n",
        "packages/server/src/domain/feature/persistence/waived.ts":
          "// @orb-waive persistence-no-in-memory-state(Map): query-local lookup map over the row set this query just returned; ends if it outlives the call.\nexport function index(rows: readonly { readonly id: string }[]): Map<string, string> {\n  return new Map(rows.map((row) => [row.id, row.id]));\n}\n",
      },
      why: "the ONE central positioned waiver naming the exact reported constructor — this is the exact translation the 42 live `@orb-gate-ignore persistence-no-in-memory-state` markers took",
    },
    {
      mode: "types",
      files: {
        "node_modules/typescript/lib/lib.es5.d.ts":
          "interface Map<K, V> { get(key: K): V | undefined }\ninterface MapConstructor { new <K, V>(): Map<K, V> }\ndeclare var Map: MapConstructor;\n",
        "packages/server/src/domain/feature/persistence/x.test.ts": "export const cache = new Map<string, string>();\n",
        "packages/server/src/domain/feature/persistence/quiet.ts": "export const quiet = 1;\n",
      },
      why: "a co-located `*.test.*` file is outside the population — tests build in-memory fixtures by design",
    },
  ],
});
