// Gate: assumes-single-replica — a module-scope mutable `new Map/Set/WeakMap/WeakSet()` accumulator
// (per-process in-memory state) must live in a file carrying an `ASSUMES(single-replica)` annotation.
// Array-literal-seeded (immutable config) is exempt, as is persistence/ (forbidden there outright).
// LIMIT: custom ring/cache classes aren't `new Map/Set` so are out of this gate's structural reach.
import type { VariableDeclaration } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

const PERSISTENCE = /\/persistence\//u;
const STATE_CTORS = new Set(["Map", "Set", "WeakMap", "WeakSet"]);
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
      files: "// ASSUMES(single-replica): per-process cache, replace with a DB seam later\nexport const cache = new Map<string, number>();\n",
      at: "packages/server/src/domain/hub/y.ts",
      why: "the same Map WITH the ASSUMES(single-replica) annotation — declared, so it passes",
    },
    {
      files: 'export const CONFIG = new Map([["a", 1], ["b", 2]]);\n',
      at: "packages/server/src/domain/hub/z.ts",
      why: "a Map seeded PURELY from an array literal — immutable config seed (the literalSeed branch), not a mutable accumulator, passes",
    },
  ],
};
