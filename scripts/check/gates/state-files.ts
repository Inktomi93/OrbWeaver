// Gate: state-files (UI-Architecture-and-Layout.md §5, §2.1 state/) — the gated-Zustand discipline for
// packages/client/src/state/*.ts (the flat store tier, direct children only): one create( per file, ≤10
// top-level fields, no exported set/getState/store handle. dep-cruiser can't see call-shape or
// object-literal arity; this ts-morph gate can. Three arms: one-mint-per-file, field-cap (past 10
// fields a store is doing multiple jobs), no-exported-handle (callers go through intent-named actions + narrow read hooks, never a raw handle across a module boundary).
import type { ObjectLiteralExpression, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { Finding, GateDescriptor, GateRunCtx } from "../contract.ts";
import type { Violation } from "../harness.ts";

// The flat state tier — direct children only (a path with a further "/" after this prefix is nested).
const STATE_DIR = "/packages/client/src/state/";
const MINT_CALLEES = new Set([
  "create",
  "createStore",
  "createGatedStore",
  "createEntityDraftStore",
]);
const MAX_FIELDS = 10;

// A direct child of state/ (no extra path segment): `.../state/chat-stream.ts` yes,
// `.../state/bound/x.ts` no. index.ts is a barrel (no store).
function flatStateRel(path: string): string | undefined {
  const idx = path.indexOf(STATE_DIR);
  if (idx === -1) {
    return;
  }
  const rest = path.slice(idx + STATE_DIR.length);
  if (rest.includes("/") || rest === "index.ts") {
    return;
  }
  return `packages/client/src/state/${rest}`;
}

// The leftmost identifier name of a CallExpression's callee — `create<T>()` → "create",
// `createGatedStore(...)` → "createGatedStore". A wrapped application `create<T>()(...)` has a
// CallExpression callee (not an identifier) at the OUTER call, so the mint is counted exactly once.
function calleeName(call: Node): string | undefined {
  if (!Node.isCallExpression(call)) {
    return;
  }
  const callee = call.getExpression();
  return Node.isIdentifier(callee) ? callee.getText() : undefined;
}

function isMintCall(call: Node): boolean {
  const name = calleeName(call);
  return name !== undefined && MINT_CALLEES.has(name);
}

// Unwrap `(): T => ({...})` / `() => { return {...} }` to the returned object literal, if any.
function returnedObjectLiteral(fn: Node): ObjectLiteralExpression | undefined {
  if (!(Node.isArrowFunction(fn) || Node.isFunctionExpression(fn))) {
    return;
  }
  const body = fn.getBody();
  if (Node.isParenthesizedExpression(body)) {
    const inner = body.getExpression();
    return Node.isObjectLiteralExpression(inner) ? inner : undefined;
  }
  if (Node.isObjectLiteralExpression(body)) {
    return body;
  }
  if (!Node.isBlock(body)) {
    return;
  }
  const ret = body.getStatements().find((s) => Node.isReturnStatement(s));
  const expr = ret !== undefined && Node.isReturnStatement(ret) ? ret.getExpression() : undefined;
  return expr !== undefined && Node.isObjectLiteralExpression(expr) ? expr : undefined;
}

// The state initializer object literal a mint call declares — a direct arrow/fn argument returning an
// object literal (createGatedStore(name, () => ({...})); createStore()(persist(() => ({...})))).
function initializerObjectLiteral(call: Node): ObjectLiteralExpression | undefined {
  if (!Node.isCallExpression(call)) {
    return;
  }
  return call
    .getArguments()
    .map((arg) => returnedObjectLiteral(arg))
    .find((lit) => lit !== undefined);
}

// Does an initializer expression wrap (possibly through the `create<T>()(...)` application form) a
// store-minting call? Walks the callee spine.
function initWrapsMint(init: Node): boolean {
  let cursor: Node | undefined = init;
  while (cursor !== undefined && Node.isCallExpression(cursor)) {
    if (isMintCall(cursor)) {
      return true;
    }
    cursor = cursor.getExpression();
  }
  return false;
}

// The line of an exported `const x = <mint>(...)` — the handle escaping its module — or undefined.
function exportedHandleLine(sf: SourceFile): number | undefined {
  const init = sf
    .getVariableStatements()
    .filter((stmt) => stmt.isExported())
    .flatMap((stmt) => stmt.getDeclarations())
    .map((decl) => decl.getInitializer())
    .find((i) => i !== undefined && initWrapsMint(i));
  return init?.getStartLineNumber();
}

function checkFieldCap(call: Node, rel: string, out: Violation[]): void {
  const lit = initializerObjectLiteral(call);
  if (lit === undefined) {
    return;
  }
  const count = lit.getProperties().length;
  if (count > MAX_FIELDS) {
    out.push({
      file: rel,
      line: lit.getStartLineNumber(),
      message: `state store declares ${count} top-level fields (cap ${MAX_FIELDS}) — a store past ${MAX_FIELDS} fields is doing multiple jobs; split it (UI-Architecture-and-Layout.md §5).`,
    });
  }
}

function scanFile(sf: SourceFile, rel: string, out: Violation[]): void {
  let mintCount = 0;
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (!isMintCall(call)) {
      continue;
    }
    mintCount += 1;
    checkFieldCap(call, rel, out);
  }
  if (mintCount > 1) {
    out.push({
      file: rel,
      line: 0,
      message: `${mintCount} store-minting calls in one file — one store per file (create/createStore/createGatedStore/createEntityDraftStore); split them (UI-Architecture-and-Layout.md §5).`,
    });
  }
  const handleLine = exportedHandleLine(sf);
  if (handleLine !== undefined) {
    out.push({
      file: rel,
      line: handleLine,
      message:
        "the minted store handle is exported — never expose raw set/getState across a module boundary; export intent-named actions + narrow read hooks instead (UI-Architecture-and-Layout.md §5).",
    });
  }
}

// Three arms: the field-cap (per mint) + the mint-count (>1, file-level) + the exported-handle (file-level).
const HANDLE_MESSAGE =
  "the minted store handle is exported — never expose raw set/getState across a module boundary; export intent-named actions + narrow read hooks instead (UI-Architecture-and-Layout.md §5).";

function fileLevelFinding(rel: string, line: number, message: string, token: string): Finding {
  return { file: rel, line, column: 0, message, token };
}

/** Name the arm a legacy state-files violation belongs to (for the grouped output's token). */
function armToken(message: string): string {
  if (message.startsWith("state store declares")) {
    return "field-cap";
  }
  return message === HANDLE_MESSAGE ? "exported-handle" : "one-mint-per-file";
}

export const gate: GateDescriptor = {
  name: "state-files",
  docRow: "UI-Architecture-and-Layout.md §5 (§2.1 state/)",
  status: "active",
  scopeSafety: "incremental-safe",
  message: HANDLE_MESSAGE,
  fix: "one store-minting call per file, ≤10 top-level fields, and never export the raw handle — expose intent-named actions + narrow read hooks.",
  scanRoot: (p) => flatStateRel(`/${p}`) !== undefined,
  visitFile: (sf, ctx: GateRunCtx) => {
    const rel = flatStateRel(sf.getFilePath());
    if (rel === undefined) {
      return;
    }
    const violations: Violation[] = [];
    scanFile(sf, rel, violations);
    // scanFile emits legacy-shaped {file,line,message} triples; re-emit them as findings. The mint-count
    // arm uses line 0 (file-level); the field-cap + handle arms carry real node lines. The token names the
    // arm so the grouped output distinguishes them.
    for (const v of violations) {
      ctx.report(fileLevelFinding(v.file, v.line, v.message, armToken(v.message)));
    }
  },
  mustFlag: [
    {
      files:
        "declare const create: (f: () => unknown) => unknown;\nexport const useA = create(() => ({}));\nexport const useB = create(() => ({}));\n",
      at: "packages/client/src/state/grab-bag.ts",
      why: "two store-minting calls in one file — the grab-bag store smell §5 forbids (one store per file)",
    },
    {
      // rule 2: >10 top-level fields in the initializer object literal.
      files:
        'const useX = createGatedStore("x", () => ({ f0: 0, f1: 0, f2: 0, f3: 0, f4: 0, f5: 0, f6: 0, f7: 0, f8: 0, f9: 0, f10: 0 }));\nexport const v = () => useX();\n',
      at: "packages/client/src/state/big.ts",
      expect: { messageIncludes: "top-level fields" },
      why: "rule 2: a store initializer with 11 top-level fields — past the ≤10 cap, split it",
    },
    {
      // rule 3: an exported minted store handle escaping its module.
      files: 'export const useX = createGatedStore("x", () => ({ n: 0 }));\n',
      at: "packages/client/src/state/leak.ts",
      expect: { messageIncludes: "minted store handle is exported" },
      why: "rule 3: an exported minted store handle — never expose raw set/getState across a module boundary",
    },
    {
      // rule 3: the wrapped create<T>()(...) application form is caught too.
      files: "export const s = create<{ n: number }>()(() => ({ n: 0 }));\n",
      at: "packages/client/src/state/wrapped.ts",
      expect: { messageIncludes: "minted store handle is exported" },
      why: "rule 3: a wrapped exported handle (create<T>()(...) application form) is caught too",
    },
  ],
  mustPass: [
    {
      files:
        "declare const create: (f: () => unknown) => unknown;\nconst useOne = create(() => ({}));\n",
      at: "packages/client/src/state/one.ts",
      why: "one mint, handle NOT exported, small initializer — the sanctioned single-store shape, passes",
    },
    {
      // rule 2 boundary: exactly 10 fields passes (the cap is >10).
      files:
        'const useX = createGatedStore("x", () => ({ f0: 0, f1: 0, f2: 0, f3: 0, f4: 0, f5: 0, f6: 0, f7: 0, f8: 0, f9: 0 }));\nexport const v = () => useX();\n',
      at: "packages/client/src/state/edge.ts",
      why: "rule 2 boundary: exactly 10 fields is at the cap (cap is >10) — passes",
    },
    {
      // scope: nested state buckets + index.ts + non-state files are not the flat store tier.
      files: {
        "packages/client/src/state/sub/nested.ts":
          'export const useX = createGatedStore("x", () => ({ n: 0 }));\n',
        "packages/client/src/state/index.ts":
          'export const useX = createGatedStore("x", () => ({ n: 0 }));\n',
        "packages/client/src/data/x.ts":
          'export const useX = createGatedStore("x", () => ({ n: 0 }));\n',
      },
      why: "scope: nested state buckets + index.ts barrel + non-state files are out of the flat tier — passes",
    },
  ],
};
