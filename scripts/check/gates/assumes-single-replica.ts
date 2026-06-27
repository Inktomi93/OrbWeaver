// Gate: assumes-single-replica (tiers/foundation.md esoteric #5, ENFORCEMENT.md) — module-scope mutable
// in-memory state (a per-process registry/cache/counter) is the orbweaver v1 single-replica stance, and
// every such site must DECLARE it with an `ASSUMES(single-replica)` annotation (so the multi-replica
// replacement seam is findable). This gate enforces the common, machine-detectable form: a module-scope
// `new Map/Set/WeakMap/WeakSet()` that is a MUTABLE accumulator (NOT seeded purely from an array literal,
// which is immutable config like `INSTRUMENTED_METHODS`) must live in a file carrying the annotation.
// EXEMPT: `persistence/` (the persistence-no-in-memory-state grit forbids Map/Set there outright) + tests.
// LIMIT (by convention + review, not this gate): custom ring/cache CLASSES (LineRing/TraceRing) carry the
// file-level annotation too — they aren't `new Map/Set`, so they're out of this gate's structural reach.
import type { SourceFile, VariableDeclaration } from "ts-morph";
import { Node } from "ts-morph";
import type { Check, Violation } from "../harness.ts";

const SERVER_SRC = "/packages/server/src/";
const PERSISTENCE = /\/persistence\//;
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
          message: `module-scope mutable \`new ${ctor}()\` is per-process in-memory state — annotate the file with ASSUMES(single-replica) + name a DB-backed replacement seam, or move it out of module scope (tiers/foundation.md esoteric #5).`,
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
