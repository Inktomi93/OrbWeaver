// Gate: assumes-single-replica (core/Tier-2-Foundation.md esoteric #5, Core-Laws-and-Precedents.md) — module-scope mutable
// in-memory state (a per-process registry/cache/counter) is the orbweaver v1 single-replica stance, and
// every such site must DECLARE it with an `ASSUMES(single-replica)` annotation (so the multi-replica
// replacement seam is findable). This gate enforces the common, machine-detectable form: a module-scope
// `new Map/Set/WeakMap/WeakSet()` that is a MUTABLE accumulator (NOT seeded purely from an array literal,
// which is immutable config like `INSTRUMENTED_METHODS`) must live in a file carrying the annotation.
// EXEMPT: `persistence/` (the persistence-no-in-memory-state grit forbids Map/Set there outright) + tests.
// LIMIT (by convention + review, not this gate): custom ring/cache CLASSES (LineRing/TraceRing) carry the
// file-level annotation too — they aren't `new Map/Set`, so they're out of this gate's structural reach.
import type { SourceFile, VariableDeclaration } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";
import type { Check, Violation } from "../harness.ts";

const SERVER_SRC = "/packages/server/src/";
const PERSISTENCE = /\/persistence\//u;
const STATE_CTORS = new Set(["Map", "Set", "WeakMap", "WeakSet"]);
const ANNOTATION = "ASSUMES(single-replica)";

function relPath(root: string, abs: string): string {
  return abs.startsWith(root) ? abs.slice(root.length + 1) : abs;
}

// The ctor name of a module-scope MUTABLE-accumulator `new Map/Set/WeakMap/WeakSet(...)`, else "".
// A sole array-literal arg = an immutable config seed → "" (not flagged).
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
  const literalSeed =
    args.length === 1 && first !== undefined && Node.isArrayLiteralExpression(first);
  return literalSeed ? "" : ctor;
}

function scan(sf: SourceFile, root: string, out: Violation[]): void {
  for (const stmt of sf.getVariableStatements()) {
    for (const decl of stmt.getDeclarations()) {
      const ctor = flaggedCtor(decl);
      if (ctor !== "") {
        out.push({
          file: relPath(root, sf.getFilePath()),
          line: stmt.getStartLineNumber(),
          message: `module-scope mutable \`new ${ctor}()\` is per-process in-memory state — annotate the file with ASSUMES(single-replica) + name a DB-backed replacement seam, or move it out of module scope (core/Tier-2-Foundation.md esoteric #5).`,
        });
      }
    }
  }
}

export const assumesSingleReplica: Check = {
  name: "assumes-single-replica",
  run: ({ root, project }): Violation[] => {
    const violations: Violation[] = [];
    for (const sf of project.getSourceFiles()) {
      const path = sf.getFilePath();
      if (!path.includes(SERVER_SRC) || PERSISTENCE.test(path)) {
        continue;
      }
      if (sf.getFullText().includes(ANNOTATION)) {
        continue;
      }
      scan(sf, root, violations);
    }
    return violations;
  },
};

// ── SINGLE-PASS CONTRACT FORM (§1.2, §8.1 batch (b)) ──────────────────────────────────────────────
// The legacy predicate as a VariableDeclaration subscription: a MODULE-SCOPE mutable `new Map/Set/…`
// accumulator in a server-src file that lacks the ASSUMES(single-replica) annotation. scanRoot mirrors
// the legacy filter (server-src ∧ ¬persistence); the per-file annotation guard is a `getFullText`
// include, checked per file in visit. Module-scope is enforced by requiring the declaration's
// VariableStatement to be a direct SourceFile child (the legacy `getVariableStatements()` reach).
// Per-occurrence. Kept ALONGSIDE the legacy Check.
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
    "module-scope mutable `new Map/Set/WeakMap/WeakSet()` is per-process in-memory state — annotate the file with ASSUMES(single-replica) + name a DB-backed replacement seam, or move it out of module scope (core/Tier-2-Foundation.md esoteric #5).",
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
    const ctor = flaggedCtor(node);
    if (ctor === "") {
      return;
    }
    const key = sf.getFilePath();
    let annotated = annotationMemo.get(key);
    if (annotated === undefined) {
      annotated = sf.getFullText().includes(ANNOTATION);
      annotationMemo.set(key, annotated);
    }
    if (!annotated) {
      ctx.report(node, { token: `new ${ctor}()`, offset: 0 });
    }
  },
  mustFlag: [
    {
      files: "export const cache = new Map<string, number>();\n",
      at: "packages/server/src/domain/hub/x.ts",
      why: "a module-scope mutable new Map() with no ASSUMES(single-replica) — per-process state (esoteric #5)",
    },
  ],
  mustPass: [
    {
      files:
        "// ASSUMES(single-replica): per-process cache, replace with a DB seam later\nexport const cache = new Map<string, number>();\n",
      at: "packages/server/src/domain/hub/y.ts",
      why: "the same Map WITH the ASSUMES(single-replica) annotation — declared, so it passes",
    },
  ],
};
