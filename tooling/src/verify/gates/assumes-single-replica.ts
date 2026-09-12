// Policy: assumes-single-replica (core/Tier-2-Foundation.md esoteric #5) — module-scope mutable per-process
// state must live in a file carrying an `ASSUMES(single-replica)` annotation. Three flagged shapes: (1) a
// `new Map/Set/WeakMap/WeakSet()`, non-literal-seeded; (2) a module-scope array accumulator later mutated
// via push/shift/splice/unshift ANYWHERE in the module; (3) a module-scope instance of a class DECLARED IN
// THE SAME FILE that carries at least one non-readonly instance field. Array-literal-seeded-and-never-mutated
// (immutable config) and all-readonly-field classes (frozen/memoized) stay silent by construction.
// persistence/ stays forbidden outright.
// LIMIT: a module-scope binding to the RETURN of an IMPORTED factory function (`createBoundedRing(...)`) is
// out of structural reach — the mutation lives inside the factory's own closure in another file. Declared,
// not guessed (mustPass row).
//
// FAMILY: singleton. No other converted policy shares this file's per-file module-state classifier (the
// ctor/array-mutator/local-class-field shapes are specific to this rule); nothing in `lib/` reads them.
// POPULATION PORT: byte-identical. Legacy `scanRoot` was `p.startsWith("packages/server/src/") &&
// !PERSISTENCE.test(\`/${p}\`)` (`PERSISTENCE = /\/persistence\//`) — every path under `@server` except one
// containing a `persistence` path segment anywhere. The final population is `{ in: ["@server"], notUnder:
// ["packages/server/src/**/persistence/**"] }`, an end-anchored glob equivalent over the same tree.
// LEGACY at 86ce80b6c (this module's content there is byte-identical to the parent it was converted from).
//
// §4.6 DIFFERENTIAL (committed at tests/tooling/verify/gates/simple-visitors-1584.test.ts): every legacy
// mustFlag/mustPass example replays byte-identically against the final policy (same finding count, same
// token shape). Population equality: `notUnder` glob vs `PERSISTENCE.test` regex agree on every corpus path
// (both admit nothing under any `persistence/` segment inside `@server`); no finding or tool-error delta.
//
// THE ORDINARY DOOR IS REAL, DRIVEN (not just claimed): the reported position is always the declaration's
// own bare identifier (`cache`/`ring`/`recorder`) — never a synthetic "new Map()" token, which is absent
// from the source whenever the constructor carries type arguments (`new Map<string, number>()`). A bare
// name is guaranteed authored text at its own offset, so it carries no paren, no newline and no solidus —
// the exact three shapes that break the ordinary door elsewhere in this program. The positive/dead-position
// pair is driven in the family test above (not merely asserted): `assumes-single-replica(cache)` suppresses
// with zero alarms, and `assumes-single-replica(nonexistent)` raises the loud `AUTHORITY ALARM … names a
// dead position` and suppresses nothing.
import type { CallExpression, ClassDeclaration, VariableDeclaration } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";

const STATE_CTORS = new Set(["Map", "Set", "WeakMap", "WeakSet"]);
const ARRAY_MUTATORS = new Set(["push", "shift", "splice", "unshift"]);
const ANNOTATION = "ASSUMES(single-replica)";

const MESSAGE =
  "module-scope mutable per-process state (a `new Map/Set/WeakMap/WeakSet()`, an array accumulator mutated " +
  "via push/shift/splice/unshift, or an instance of a locally-declared mutable-field class) is per-process " +
  "in-memory state — annotate the file with ASSUMES(single-replica) + name a DB-backed replacement seam, or " +
  "move it out of module scope (core/Tier-2-Foundation.md esoteric #5).";
const FIX =
  "annotate the file with an ASSUMES(single-replica) comment naming the DB-backed replacement seam, or move " +
  "the state out of module scope. A deliberate exception not worth annotating waives with " +
  "`@orb-waive assumes-single-replica(<position>): <reason + end condition>` — the reported position is " +
  "always the declaration's own bare identifier (the variable name), because the report passes that token " +
  "explicitly at the declaration's own offset; the WHAT (a Map, an array, a local class) is in the message.";

function flaggedCtor(decl: VariableDeclaration): string {
  const init = decl.getInitializer();
  if (init === undefined || !Node.isNewExpression(init)) {
    return "";
  }
  const ctor = init.getExpression().getText();
  if (!STATE_CTORS.has(ctor)) {
    return "";
  }
  const args = init.getArguments();
  const first = args[0];
  const literalSeed = args.length === 1 && first !== undefined && Node.isArrayLiteralExpression(first);
  return literalSeed ? "" : ctor;
}

/** Is this a module-scope array-LITERAL-initialized declaration — a CANDIDATE accumulator, pending the
 *  separate `mutatorCalls` visitor's verdict on whether it is ever pushed/shifted/spliced/unshifted. */
function isArrayLiteralCandidate(decl: VariableDeclaration): boolean {
  const init = decl.getInitializer();
  return init !== undefined && Node.isArrayLiteralExpression(init);
}

/** `varName.push(...)` / `.shift(...)` / `.splice(...)` / `.unshift(...)` — a per-file mutator-call fact
 *  collected by its OWN visitor (no `getDescendantsOfKind` inside a gate module). A bare identifier match
 *  (no alias/reassignment tracking) is the same conservatism the STATE_CTORS check already accepts. */
function mutatedArrayName(node: CallExpression): string {
  const callee = node.getExpression();
  if (!Node.isPropertyAccessExpression(callee)) {
    return "";
  }
  if (!ARRAY_MUTATORS.has(callee.getName())) {
    return "";
  }
  const receiver = callee.getExpression();
  return Node.isIdentifier(receiver) ? receiver.getText() : "";
}

/** A class declared IN THIS FILE holds mutable per-instance state iff it has at least one property that is
 *  not `readonly` — a frozen/memoized class (every field `readonly`) is presumed pure and stays silent. */
function classHoldsMutableState(cls: ClassDeclaration): boolean {
  return cls.getProperties().some((p) => !p.hasModifier(SyntaxKind.ReadonlyKeyword));
}

function flaggedClassInstance(decl: VariableDeclaration): string {
  const init = decl.getInitializer();
  if (init === undefined || !Node.isNewExpression(init)) {
    return "";
  }
  const ctorExpr = init.getExpression();
  if (!Node.isIdentifier(ctorExpr)) {
    return "";
  }
  const ctorName = ctorExpr.getText();
  if (STATE_CTORS.has(ctorName)) {
    return ""; // already covered by flaggedCtor
  }
  const cls = decl.getSourceFile().getClass(ctorName);
  if (cls === undefined) {
    return ""; // not a locally-declared class — imported classes are out of this policy's reach (see LIMIT)
  }
  return classHoldsMutableState(cls) ? ctorName : "";
}

function isModuleScope(decl: VariableDeclaration): boolean {
  const stmt = decl.getFirstAncestorByKind(SyntaxKind.VariableStatement);
  return stmt !== undefined && Node.isSourceFile(stmt.getParent());
}

function ctorDetail(ctor: string): string {
  return STATE_CTORS.has(ctor)
    ? `a module-scope mutable \`new ${ctor}()\``
    : `a module-scope instance of a locally-declared class (\`${ctor}\`) with a non-readonly field`;
}

export const gate = defineGate({
  id: "assumes-single-replica",
  family: "assumes-single-replica",
  authority: "ordinary",
  severity: "error",
  population: { in: ["@server"], notUnder: ["packages/server/src/**/persistence/**"] },
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    interface ArrayCandidate {
      readonly node: VariableDeclaration;
      readonly name: string;
    }
    const arrayCandidates = new Map<string, ArrayCandidate[]>();
    const mutatedNames = new Map<string, Set<string>>();

    // The reported position is ALWAYS the declaration's own bare name node: it is guaranteed authored text
    // at that exact offset (unlike a synthetic "new Map()" token, which is absent from the source whenever
    // the constructor carries type arguments, e.g. `new Map<string, number>()`). The WHAT lives in the
    // message, never the position (guide §3's `report.node` rule).
    const report = (node: VariableDeclaration, detail: string): void => {
      const nameNode = node.getNameNode();
      ctx.report.node(node, { token: nameNode.getText(), offset: nameNode.getStart() - node.getStart(), message: `${MESSAGE} ${detail}.`, fix: FIX });
    };

    return {
      visitors: [
        {
          kinds: [SyntaxKind.VariableDeclaration],
          visit: (node, sourceFile) => {
            if (!(Node.isVariableDeclaration(node) && isModuleScope(node))) {
              return;
            }
            const ctor = flaggedCtor(node) || flaggedClassInstance(node);
            if (ctor !== "") {
              if (!sourceFile.getFullText().includes(ANNOTATION)) {
                report(node, ctorDetail(ctor));
              }
              return;
            }
            if (isArrayLiteralCandidate(node)) {
              const key = sourceFile.getFilePath();
              const list = arrayCandidates.get(key) ?? [];
              list.push({ node, name: node.getName() });
              arrayCandidates.set(key, list);
            }
          },
        },
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node, sourceFile) => {
            if (!Node.isCallExpression(node)) {
              return;
            }
            const name = mutatedArrayName(node);
            if (name === "") {
              return;
            }
            const key = sourceFile.getFilePath();
            const names = mutatedNames.get(key) ?? new Set<string>();
            names.add(name);
            mutatedNames.set(key, names);
          },
        },
      ],
      evaluate: () => {
        const reportMutatedArrays = (candidates: readonly ArrayCandidate[], names: ReadonlySet<string>): void => {
          for (const candidate of candidates) {
            if (names.has(candidate.name)) {
              report(candidate.node, "a module-scope array accumulator mutated via push/shift/splice/unshift");
            }
          }
        };
        for (const [path, candidates] of arrayCandidates) {
          const names = mutatedNames.get(path);
          const first = candidates[0];
          const annotated = first !== undefined && first.node.getSourceFile().getFullText().includes(ANNOTATION);
          if (names !== undefined && !annotated) {
            reportMutatedArrays(candidates, names);
          }
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "source",
      files: { "packages/server/src/domain/hub/x.ts": "export const cache = new Map<string, number>();\n" },
      expect: { count: 1, token: "cache" },
      why: "a module-scope mutable new Map() with no ASSUMES(single-replica) — per-process state (esoteric #5)",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/hub/ring.ts":
          "export const ring: number[] = [];\nexport function record(n: number): void {\n  ring.push(n);\n  if (ring.length > 100) {\n    ring.shift();\n  }\n}\n",
      },
      expect: { count: 1, token: "ring", messageIncludes: "push/shift/splice/unshift" },
      why: "a module-scope array accumulator (ring) mutated via push/shift elsewhere in the module, no ASSUMES(single-replica) — the domain/rpg/trace.ts shape, this time module-scope",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/hub/recorder.ts":
          "class Recorder {\n  private count = 0;\n  bump(): void {\n    this.count += 1;\n  }\n}\nexport const recorder = new Recorder();\n",
      },
      expect: { count: 1, token: "recorder", messageIncludes: "locally-declared" },
      why: "a module-scope instance of a class DECLARED IN THIS FILE with a non-readonly field — the TraceRing shape, no ASSUMES(single-replica)",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        "packages/server/src/domain/hub/waived.ts":
          "// @orb-waive assumes-single-replica(cache): the proof's stand-in reason; ends when this fixture stops flagging.\nexport const cache = new Map<string, number>();\n",
      },
      why: "THE IDENTITY ARM (§4.2): the twin of mustFlag[0], producing exactly one finding, waived by the one central marker at the position this policy actually reports (the bare declared name `cache`)",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/hub/y.ts":
          "// ASSUMES(single-replica): per-process cache, replace with a DB seam later\nexport const cache = new Map<string, number>();\n",
      },
      why: "the same Map WITH the ASSUMES(single-replica) annotation — declared, so it passes",
    },
    {
      mode: "source",
      files: { "packages/server/src/domain/hub/z.ts": 'export const CONFIG = new Map([["a", 1], ["b", 2]]);\n' },
      why: "a Map seeded PURELY from an array literal — immutable config seed (the literalSeed branch), not a mutable accumulator, passes",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/hub/lookup.ts":
          'export const LOOKUP = ["a", "b", "c"];\nexport function has(x: string): boolean {\n  return LOOKUP.includes(x);\n}\n',
      },
      why: "a module-scope array LITERAL that is only ever READ (no push/shift/splice/unshift anywhere in the module) — a frozen lookup table, not an accumulator, passes",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/hub/frozen.ts":
          "class Frozen {\n  private readonly a = 1;\n  get(): number {\n    return this.a;\n  }\n}\nexport const frozen = new Frozen();\n",
      },
      why: "a module-scope instance of a locally-declared class whose ONLY field is `readonly` — a memoized/pure value, not mutable state, passes",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/hub/aring.ts":
          "// ASSUMES(single-replica): per-process ring, replace with a DB seam later\nexport const ring: number[] = [];\nexport function record(n: number): void {\n  ring.push(n);\n}\n",
      },
      why: "the array-accumulator shape WITH the ASSUMES(single-replica) annotation — declared, passes",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/hub/arecorder.ts":
          "// ASSUMES(single-replica): per-process recorder, replace with a DB seam later\nclass Recorder {\n  private count = 0;\n  bump(): void {\n    this.count += 1;\n  }\n}\nexport const recorder = new Recorder();\n",
      },
      why: "the local-class-instance shape WITH the ASSUMES(single-replica) annotation — declared, passes",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/hub/factory.ts":
          'import { createBoundedRing } from "@orb/kit/bounded-ring";\nexport const ring = createBoundedRing<string>(10);\n',
      },
      why: "the DECLARED LIMIT: a module-scope binding to an IMPORTED factory call's return (createBoundedRing) — the mutation lives in the factory's own closure in another module, out of this policy's structural reach; passes silently (not a false pass — a real, named, still-open blind spot)",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/persistence/store/x.ts": "export const cache = new Map<string, number>();\n",
        // In-population anchor: a run whose ONLY admitted path sits inside the subtraction tool-errors
        // ([population] — zero paths admitted) instead of proving the fence, so a second, unrelated,
        // clean file inside `@server` (outside `persistence/`) keeps the population non-empty.
        "packages/server/src/domain/hub/anchor.ts": "export const ANCHOR = true;\n",
      },
      why: "THE POPULATION FENCE, pinned: a `persistence/` path segment is subtracted from `@server` outright, so the identical unmutated-annotation Map here is not a finding — deleting the `notUnder` narrowing leaves every other row green; this is the row that dies without it",
    },
  ],
});
