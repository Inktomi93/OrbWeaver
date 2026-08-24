// Gate: assumes-single-replica — module-scope mutable per-process state must live in a file carrying an
// `ASSUMES(single-replica)` annotation. Three flagged shapes, widened 2026-08-24 (#645) past the original
// `new Map/Set/WeakMap/WeakSet()`-only reach: (1) that constructor set, non-literal-seeded; (2) a
// module-scope array accumulator later mutated via push/shift/splice/unshift ANYWHERE in the module
// (the domain/rpg/trace.ts ring shape, when it is module-scope rather than factory-local); (3) a
// module-scope instance of a class DECLARED IN THE SAME FILE that carries at least one non-readonly
// instance field (the `TraceRing` shape — mutation is inferred from the field, not walked per-method, to
// stay a single structural pass). Array-literal-seeded-and-never-mutated (immutable config) and
// all-readonly-field classes (frozen/memoized) stay silent by construction — proof in mustPass.
// persistence/ stays forbidden outright (unchanged).
// LIMIT (re-derived 2026-08-24, was stale): a module-scope binding to the RETURN of an IMPORTED factory
// function (`export const logRing = createBoundedRing(...)` from `@orb/kit/bounded-ring`) is still out
// of structural reach — the mutation lives inside the factory's own closure in another file, not as an
// AST shape this module exposes. Declared, not guessed: 2 real instances on the tree today
// (`foundation/observability/logger.ts` logRing/requestRing, `foundation/observability/debug/wire-capture.ts`
// ring/outcomeRing) — both already carry the annotation by author discipline, not by this gate's reach.
import type { ClassDeclaration, VariableDeclaration } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract/gate.ts";

const PERSISTENCE = /\/persistence\//u;
const STATE_CTORS = new Set(["Map", "Set", "WeakMap", "WeakSet"]);
const ARRAY_MUTATORS = new Set(["push", "shift", "splice", "unshift"]);
const ANNOTATION = "ASSUMES(single-replica)";

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

/** `varName.push(...)` / `.shift(...)` / `.splice(...)` / `.unshift(...)` ANYWHERE in the file — module
 *  functions mutating a module-scope array are exactly the per-process accumulator shape (§ above). A
 *  bare identifier match (no alias/reassignment tracking) is the same conservatism `nullable-column-inequality`
 *  and `assumes-single-replica`'s own STATE_CTORS check already accept. */
function arrayIsMutated(decl: VariableDeclaration, varName: string): boolean {
  const sf = decl.getSourceFile();
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const callee = call.getExpression();
    if (!Node.isPropertyAccessExpression(callee)) {
      continue;
    }
    if (callee.getExpression().getText() === varName && ARRAY_MUTATORS.has(callee.getName())) {
      return true;
    }
  }
  return false;
}

function flaggedArray(decl: VariableDeclaration): string {
  const init = decl.getInitializer();
  if (init === undefined || !Node.isArrayLiteralExpression(init)) {
    return "";
  }
  const name = decl.getName();
  return arrayIsMutated(decl, name) ? "array" : "";
}

/** A class declared IN THIS FILE holds mutable per-instance state iff it has at least one property that
 *  is not `readonly` — a frozen/memoized class (every field `readonly`) is presumed pure and stays
 *  silent, matching the false-RED discipline this gate has always carried for array/Map literals. */
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
    return ""; // not a locally-declared class — imported classes are out of this gate's reach (see LIMIT)
  }
  return classHoldsMutableState(cls) ? ctorName : "";
}

const annotationMemo = new Map<string, boolean>();

function isModuleScope(decl: VariableDeclaration): boolean {
  const stmt = decl.getFirstAncestorByKind(SyntaxKind.VariableStatement);
  return stmt !== undefined && Node.isSourceFile(stmt.getParent());
}

export const gate: GateDescriptor = {
  name: "assumes-single-replica",
  docRow: "core/Tier-2-Foundation.md esoteric #5 (Core-Laws-and-Precedents.md)",
  status: "active",
  scopeSafety: "incremental-safe",
  message:
    "module-scope mutable per-process state (a `new Map/Set/WeakMap/WeakSet()`, an array accumulator mutated via push/shift/splice/unshift, or an instance of a locally-declared mutable-field class) is per-process in-memory state — annotate the file with ASSUMES(single-replica) + name a DB-backed replacement seam, or move it out of module scope (core/Tier-2-Foundation.md esoteric #5).",
  fix: "annotate the file with an ASSUMES(single-replica) comment naming the DB-backed replacement seam, or move the state out of module scope.",
  scanRoot: (p) => p.includes("packages/server/src/") && !PERSISTENCE.test(`/${p}`),
  kinds: [SyntaxKind.VariableDeclaration],
  begin: () => {
    annotationMemo.clear();
  },
  visit: (node, sf, ctx) => {
    if (!(Node.isVariableDeclaration(node) && isModuleScope(node))) {
      return;
    }
    const token = flaggedCtor(node) || flaggedArray(node) || flaggedClassInstance(node);
    if (token === "") {
      return;
    }
    const key = sf.getFilePath();
    let annotated = annotationMemo.get(key);
    if (annotated === undefined) {
      annotated = sf.getFullText().includes(ANNOTATION);
      annotationMemo.set(key, annotated);
    }
    if (!annotated) {
      ctx.report(node, { token: token === "array" ? `${node.getName()}[]` : `new ${token}()`, offset: 0 });
    }
  },
  mustFlag: [
    {
      files: "export const cache = new Map<string, number>();\n",
      at: "packages/server/src/domain/hub/x.ts",
      why: "a module-scope mutable new Map() with no ASSUMES(single-replica) — per-process state (esoteric #5)",
    },
    {
      files:
        "export const ring: number[] = [];\nexport function record(n: number): void {\n  ring.push(n);\n  if (ring.length > 100) {\n    ring.shift();\n  }\n}\n",
      at: "packages/server/src/domain/hub/ring.ts",
      expect: { messageIncludes: "push/shift/splice/unshift" },
      why: "a module-scope array accumulator (ring) mutated via push/shift elsewhere in the module, no ASSUMES(single-replica) — the domain/rpg/trace.ts shape, this time module-scope (widened 2026-08-24, #645)",
    },
    {
      files: "class Recorder {\n  private count = 0;\n  bump(): void {\n    this.count += 1;\n  }\n}\nexport const recorder = new Recorder();\n",
      at: "packages/server/src/domain/hub/recorder.ts",
      expect: { messageIncludes: "locally-declared" },
      why: "a module-scope instance of a class DECLARED IN THIS FILE with a non-readonly field — the TraceRing shape, no ASSUMES(single-replica) (widened 2026-08-24, #645)",
    },
  ],
  mustPass: [
    {
      files: "// ASSUMES(single-replica): per-process cache, replace with a DB seam later\nexport const cache = new Map<string, number>();\n",
      at: "packages/server/src/domain/hub/y.ts",
      why: "the same Map WITH the ASSUMES(single-replica) annotation — declared, so it passes",
    },
    {
      files: 'export const CONFIG = new Map([["a", 1], ["b", 2]]);\n',
      at: "packages/server/src/domain/hub/z.ts",
      why: "a Map seeded PURELY from an array literal — immutable config seed (the literalSeed branch), not a mutable accumulator, passes",
    },
    {
      files: 'export const LOOKUP = ["a", "b", "c"];\nexport function has(x: string): boolean {\n  return LOOKUP.includes(x);\n}\n',
      at: "packages/server/src/domain/hub/lookup.ts",
      why: "a module-scope array LITERAL that is only ever READ (no push/shift/splice/unshift anywhere in the module) — a frozen lookup table, not an accumulator, passes",
    },
    {
      files: "class Frozen {\n  private readonly a = 1;\n  get(): number {\n    return this.a;\n  }\n}\nexport const frozen = new Frozen();\n",
      at: "packages/server/src/domain/hub/frozen.ts",
      why: "a module-scope instance of a locally-declared class whose ONLY field is `readonly` — a memoized/pure value, not mutable state, passes",
    },
    {
      files:
        "// ASSUMES(single-replica): per-process ring, replace with a DB seam later\nexport const ring: number[] = [];\nexport function record(n: number): void {\n  ring.push(n);\n}\n",
      at: "packages/server/src/domain/hub/aring.ts",
      why: "the array-accumulator shape WITH the ASSUMES(single-replica) annotation — declared, passes",
    },
    {
      files:
        "// ASSUMES(single-replica): per-process recorder, replace with a DB seam later\nclass Recorder {\n  private count = 0;\n  bump(): void {\n    this.count += 1;\n  }\n}\nexport const recorder = new Recorder();\n",
      at: "packages/server/src/domain/hub/arecorder.ts",
      why: "the local-class-instance shape WITH the ASSUMES(single-replica) annotation — declared, passes",
    },
    {
      files: 'import { createBoundedRing } from "@orb/kit/bounded-ring";\nexport const ring = createBoundedRing<string>(10);\n',
      at: "packages/server/src/domain/hub/factory.ts",
      why: "the DECLARED LIMIT: a module-scope binding to an IMPORTED factory call's return (createBoundedRing) — the mutation lives in the factory's own closure in another module, out of this gate's structural reach; passes silently (not a false pass — a real, named, still-open blind spot)",
    },
  ],
};
