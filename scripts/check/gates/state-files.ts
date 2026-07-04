// Gate: state-files (docs/architecture/core/UI-Architecture-and-Layout.md §5 + §2.1 state/) — the
// gated-Zustand discipline for packages/client/src/state/*.ts (the FLAT store tier). §5: "Gated by
// state:files: one create( per file, ≤10 top-level fields, no exported set/getState/store handle."
// dep-cruiser can't see call-shape or object-literal arity; this ts-morph gate can. Scans ONLY the
// flat direct children of state/ (nested buckets are a different tier).
//
//   1. one-mint-per-file — ≤1 store-minting call (createGatedStore / createEntityDraftStore, or the raw
//      zustand `create` / `createStore` the two factories themselves wrap). Two stores in one file is
//      the "grab-bag store module" smell §5 forbids (one store per file).
//   2. field-cap — a mint call whose state initializer returns an object LITERAL may declare ≤10
//      top-level fields. Past 10 fields a store is doing multiple jobs — split it. (Factory files pass
//      the initializer as a param, so there's no literal to count — correctly skipped.)
//   3. no-exported-handle — the minted store handle (the `create(...)` result) is never `export`ed:
//      callers go through intent-named module actions + narrow read hooks, never raw set/getState
//      across a module boundary (§5). The factory FUNCTIONS (createGatedStore/…) are the sanctioned
//      mint API and legitimately return the handle — they don't `export const x = create()`.
import type { ObjectLiteralExpression, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { Check, Violation } from "../harness.ts";

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

export const stateFiles: Check = {
  name: "state-files",
  run: ({ project }): Violation[] => {
    const out: Violation[] = [];
    for (const sf of project.getSourceFiles()) {
      const rel = flatStateRel(sf.getFilePath());
      if (rel !== undefined) {
        scanFile(sf, rel, out);
      }
    }
    return out;
  },
};
