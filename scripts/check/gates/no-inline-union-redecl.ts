// Gate: no-inline-union-redecl (core/Spine-TypeScript-and-Patterns.md §7.5) — a string-union AXIS is
// declared ONCE as an `as const` tuple and the union derived; never re-spelled. Two checks: (A) an
// inline string-literal union TYPE ALIAS of ≥3 members. (B) any inline string-literal set whose members
// EXACTLY EQUAL an existing canonical tuple — catches a union in a property position or a `z.enum([...])`
// call that (A) misses. A genuine one-off enum with no canonical tuple (e.g. NODE_ENV) is not flagged.
//
// Two blind spots repaired (audit 2026-07-25 §F4/§G2):
//  - `as const satisfies readonly X[]` tuples: the house-encouraged derive idiom parses as a
//    SatisfiesExpression wrapping the AsExpression, so `unwrapAsConstTuple` now peels it. The satisfies clause
//    IS the axis's co-declaration of record — if it binds to `Interface["prop"]`, that property's own
//    inline literal union is the SOURCE the tuple derives from, not a re-spell; arm B exempts exactly
//    that binding site (else the idiom flags itself).
//  - the 2-member floor: a 2-member axis (ENTRY_POSITIONS, PROMPT_TRANSFORM_POINTS) never registered as
//    canonical. Arm A keeps its ≥3 floor (a bare `"ok" | "error"` alias is not noise-worthy), but arm B's
//    canonical-tuple REGISTRATION drops to ≥2 for tuples homed in `packages/contracts/` or `packages/kit/`
//    ONLY — the home demonstrably exists there, so a 2-member exact-set match is a low false-positive class
//    (a coincidental generic-pair match would need a homed contracts/kit tuple of the same two strings).
import type { ArrayLiteralExpression, CallExpression, Expression, UnionTypeNode, VariableDeclaration } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor, GateRunCtx } from "../contract.ts";

const ALIAS_MIN_MEMBERS = 3; // arm A floor (an inline union type-alias)
const TUPLE_MIN_MEMBERS = 3; // arm B default registration floor
const TUPLE_MIN_MEMBERS_HOMED = 2; // arm B floor for a tuple homed in contracts/ or kit/
const SEP = " ";

/** Package homes where a 2-member canonical tuple is trusted enough to register for arm B. */
function isTrustedHome(relFile: string): boolean {
  return relFile.startsWith("packages/contracts/") || relFile.startsWith("packages/kit/");
}

// The package cake (kit ← contracts ← db ← server ← client; ui deps kit only) — a file can only DERIVE
// from a tuple its package is allowed to import. A candidate can never re-spell a tuple homed UP the cake
// (it physically can't import it — e.g. a kit fn returning "always"|"keyword" cannot reach a contracts
// WORLD_INFO_SCOPES), so arm B must not flag it. Rank by import reach: a re-spell in package P against a
// tuple homed in H is only a real re-spell when H is reachable from P (rank[H] ≤ rank[P]).
const PACKAGE_IMPORT_RANK: Readonly<Record<string, number>> = { kit: 0, contracts: 1, ui: 1, db: 2, server: 3, client: 4 };
const PACKAGE_RE = /^packages\/(?<pkg>[^/]+)\//u;
const TESTS_RANK = 5; // tests import anything — never up-cake-blocked

/** The import-reach rank of the package a repo-relative file lives in (tests reach everything). */
function importRank(relFile: string): number {
  if (relFile.startsWith("tests/")) {
    return TESTS_RANK;
  }
  const pkg = PACKAGE_RE.exec(relFile)?.groups?.["pkg"];
  return pkg !== undefined ? (PACKAGE_IMPORT_RANK[pkg] ?? TESTS_RANK) : TESTS_RANK;
}

/** Can a re-spell in `candidateFile` legally import a tuple homed in `homeFile` (same-or-down the cake)?
 *  `ui` (rank 1) may only reach `kit` (rank 0), not its rank-peer `contracts` — encode that one exception. */
function canReachHome(candidateFile: string, homeFile: string): boolean {
  const candPkg = PACKAGE_RE.exec(candidateFile)?.groups?.["pkg"];
  const homePkg = PACKAGE_RE.exec(homeFile)?.groups?.["pkg"];
  if (candPkg === "ui" && homePkg === "contracts") {
    return false; // ui deps kit ONLY (D54) — a contracts tuple is unreachable from ui
  }
  return importRank(homeFile) <= importRank(candidateFile);
}

function relPath(root: string, abs: string): string {
  return abs.startsWith(root) ? abs.slice(root.length + 1) : abs;
}

/** Order-independent identity of a string-literal set. */
function sig(members: readonly string[]): string {
  return [...new Set(members)].sort().join(SEP);
}

/** The string members of an array literal, or undefined if any element isn't a string literal. */
function stringArrayMembers(arr: ArrayLiteralExpression): string[] | undefined {
  const els = arr.getElements();
  const out: string[] = [];
  for (const e of els) {
    if (!Node.isStringLiteral(e)) {
      return;
    }
    out.push(e.getLiteralText());
  }
  return out.length > 0 ? out : undefined;
}

/** The string members of an all-string-literal union, or undefined otherwise. */
function unionStringMembers(node: UnionTypeNode): string[] | undefined {
  const out: string[] = [];
  for (const part of node.getTypeNodes()) {
    if (!Node.isLiteralTypeNode(part)) {
      return;
    }
    const lit = part.getLiteral();
    if (!Node.isStringLiteral(lit)) {
      return;
    }
    out.push(lit.getLiteralText());
  }
  return out.length > 0 ? out : undefined;
}

/** The `z.enum([...])` literal-array members of a call, or undefined if it isn't that shape. */
function zEnumArrayMembers(call: CallExpression): string[] | undefined {
  if (!call.getExpression().getText().endsWith(".enum")) {
    return;
  }
  const [arg] = call.getArguments();
  return arg !== undefined && Node.isArrayLiteralExpression(arg) ? stringArrayMembers(arg) : undefined;
}

/** A location key `file:line:col` for a node — used to exempt a satisfies-referenced co-declaration site. */
type LocKey = string;
function locKeyOf(node: Node, root: string): LocKey {
  const sf = node.getSourceFile();
  const { column } = sf.getLineAndColumnAtPos(node.getStart());
  return `${relPath(root, sf.getFilePath())}:${node.getStartLineNumber()}:${column}`;
}

/** Unwrap a variable initializer to its `as const` array literal, tolerating a `satisfies` wrapper.
 *  Returns the array literal AND (when present) the `satisfies` element TYPE NODE — the co-declaration
 *  the tuple derives from. */
function unwrapAsConstTuple(init: Expression): { readonly arr: ArrayLiteralExpression; readonly satisfiesElement: Node | undefined } | undefined {
  let node: Expression = init;
  let satisfiesElement: Node | undefined;
  if (Node.isSatisfiesExpression(node)) {
    satisfiesElement = satisfiesElementType(node.getTypeNode());
    node = node.getExpression();
  }
  if (!Node.isAsExpression(node) || node.getTypeNode()?.getText() !== "const") {
    return;
  }
  const expr = node.getExpression();
  return Node.isArrayLiteralExpression(expr) ? { arr: expr, satisfiesElement } : undefined;
}

/** Peel `readonly X[]` → the element type node `X` (the axis's co-declaration reference). */
function satisfiesElementType(typeNode: Node | undefined): Node | undefined {
  let el = typeNode;
  if (el !== undefined && Node.isTypeOperatorTypeNode(el)) {
    el = el.getTypeNode();
  }
  if (el !== undefined && Node.isArrayTypeNode(el)) {
    return el.getElementTypeNode();
  }
  return el;
}

/** The union declaration node an `Interface["prop"]` indexed-access refers to (its co-declaration site),
 *  or undefined if it doesn't resolve to a single interface-property literal union. */
function coDeclarationUnionNode(elementType: Node): UnionTypeNode | undefined {
  if (!Node.isIndexedAccessTypeNode(elementType)) {
    return;
  }
  const indexLit = elementType.getIndexTypeNode();
  if (!Node.isLiteralTypeNode(indexLit)) {
    return;
  }
  const indexName = indexLit.getLiteral();
  if (!Node.isStringLiteral(indexName)) {
    return;
  }
  const prop = indexName.getLiteralText();
  const sym = elementType.getObjectTypeNode().getType().getSymbol();
  const propTypeNode = (sym?.getDeclarations() ?? [])
    .filter((d) => Node.isInterfaceDeclaration(d))
    .map((decl) => decl.getProperty(prop)?.getTypeNode())
    .find((tn) => tn !== undefined && Node.isUnionTypeNode(tn));
  return propTypeNode !== undefined && Node.isUnionTypeNode(propTypeNode) ? propTypeNode : undefined;
}

// Arm A (an inline string-union type-alias ≥3 members) is self-contained per alias → emitted at visit.
// Arm B (an inline union / z.enum re-spelling a CANONICAL tuple) needs ALL tuples collected before it can
// judge (a re-spell can reference a tuple declared later in the walk), so re-spell candidates are
// accumulated in visit and reconciled against the collected tuples in `finalize`.
type RespellCandidate = {
  /** The offending NODE itself — carried (not a line/column snapshot) so arm B can report through the
   *  NODE overload and `@orb-gate-ignore` works on it (GATE-AUTHORING §1; the Finding overload bypasses
   *  `hasGateIgnore`). Nodes stay live for the whole pass: `visit` and `run` share one Project. */
  readonly node: Node;
  readonly file: string;
  readonly loc: LocKey;
  readonly sig: string;
  /** Which arm-B sub-kind fired — it rides in the finding's TOKEN, which is the only precision a
   *  token-emitting gate's self-proofs have now that the per-finding messages fold into `message`. */
  readonly kind: "union" | "zenum";
};
type TupleHome = { readonly name: string; readonly file: string };
const passTuples = new Map<string, TupleHome>(); // sig → { tuple name, home file }
// Locations of satisfies-referenced co-declaration union nodes (Interface["prop"]) — a registered tuple's
// SOURCE of record, not a re-spell; arm B skips a candidate that IS one of these.
const passCoDeclLocs = new Set<LocKey>();
const passRespells: RespellCandidate[] = [];

function pushRespell(node: Node, root: string, members: string[], kind: "union" | "zenum"): void {
  passRespells.push({ node, file: relPath(root, node.getSourceFile().getFilePath()), loc: locKeyOf(node, root), sig: sig(members), kind });
}

/** Register a `const X = [...] as const [satisfies readonly Y[]]` string tuple as a canonical axis home
 *  (if it clears the per-home member floor) and record its satisfies co-declaration site for exemption. */
function registerTuple(decl: VariableDeclaration, root: string): void {
  const init = decl.getInitializer();
  if (init === undefined) {
    return;
  }
  const unwrapped = unwrapAsConstTuple(init);
  if (unwrapped === undefined) {
    return;
  }
  const members = stringArrayMembers(unwrapped.arr);
  if (members === undefined) {
    return;
  }
  const relFile = relPath(root, decl.getSourceFile().getFilePath());
  const floor = isTrustedHome(relFile) ? TUPLE_MIN_MEMBERS_HOMED : TUPLE_MIN_MEMBERS;
  if (members.length < floor) {
    return;
  }
  passTuples.set(sig(members), { name: decl.getName(), file: relFile });
  if (unwrapped.satisfiesElement !== undefined) {
    const coDecl = coDeclarationUnionNode(unwrapped.satisfiesElement);
    if (coDecl !== undefined) {
      passCoDeclLocs.add(locKeyOf(coDecl, root));
    }
  }
}

/** Arm A — emit an inline string-union type alias (≥3 members) immediately; it is self-contained. */
function visitAlias(node: Node, ctx: GateRunCtx): void {
  if (!Node.isTypeAliasDeclaration(node)) {
    return;
  }
  const typeNode = node.getTypeNode();
  if (typeNode === undefined || !Node.isUnionTypeNode(typeNode)) {
    return;
  }
  const members = unionStringMembers(typeNode);
  if (members !== undefined && members.length >= ALIAS_MIN_MEMBERS) {
    ctx.report(node, { token: `union ${node.getName()}`, offset: 0 });
  }
}

/** Arm B candidates — accumulate a non-alias UnionType / a z.enum([...]) for finalize reconciliation. */
function visitRespellCandidate(node: Node, root: string): void {
  if (Node.isUnionTypeNode(node)) {
    if (node.getParent()?.getKind() === SyntaxKind.TypeAliasDeclaration) {
      return; // arm A owns aliases
    }
    const members = unionStringMembers(node);
    if (members !== undefined) {
      pushRespell(node, root, members, "union");
    }
    return;
  }
  if (Node.isCallExpression(node)) {
    const members = zEnumArrayMembers(node);
    if (members !== undefined) {
      pushRespell(node, root, members, "zenum");
    }
  }
}

export const gate: GateDescriptor = {
  name: "no-inline-union-redecl",
  docRow: "core/Spine-TypeScript-and-Patterns.md §7.5",
  status: "active",
  scopeSafety: "whole-project", // arm B compares against tuples collected from the whole tree
  // THE ONE REASON, carrying all three arm tokens (arm B's two per-finding messages folded in here when it
  // stopped riding the Finding overload, which bypasses `hasGateIgnore` — GATE-AUTHORING §1).
  message:
    "an inline string-literal union re-spells (or should derive from) a canonical `as const` tuple — declare " +
    "the axis ONCE as a tuple (export const X = [...] as const) and derive ((typeof X)[number] / z.enum(X)). " +
    "A `union <Alias>` token is arm A: an inline string-union type alias of ≥3 members. A `re-spell <Tuple>` " +
    "token is arm B: an inline union whose members EXACTLY equal that homed tuple — derive " +
    "((typeof <Tuple>)[number]). A `z.enum re-spell <Tuple>` token is arm B's z.enum sub-kind — use " +
    "z.enum(<Tuple>). Spine-TypeScript-and-Patterns.md §7.5",
  fix: "derive the union from the homed tuple: `(typeof X)[number]` (or `z.enum(X)`) — never re-spell its members.",
  // Pinned to packages+tests: the §2.2 fold-in globs scripts/check/gates/** into the workspace; a gate
  // file's inline-union EXAMPLE strings (mustFlag fixtures) are not real axis declarations, and the gate
  // corpus never homes a canonical tuple — this pin keeps both arms' findings byte-identical to before.
  scanRoot: (p) => !p.startsWith("scripts/check/gates/"),
  kinds: [SyntaxKind.VariableDeclaration, SyntaxKind.TypeAliasDeclaration, SyntaxKind.UnionType, SyntaxKind.CallExpression],
  begin: () => {
    passTuples.clear();
    passCoDeclLocs.clear();
    passRespells.length = 0;
  },
  visit: (node, _sf, ctx) => {
    // Collect canonical tuples (for arm B's finalize reconciliation).
    if (Node.isVariableDeclaration(node)) {
      registerTuple(node, ctx.root);
      return;
    }
    visitAlias(node, ctx); // arm A (self-contained)
    visitRespellCandidate(node, ctx.root); // arm B (accumulate)
  },
  // Arm B reconciles in `run`, NOT `finalize`, and that is LOAD-BEARING: it reports node-anchored findings
  // through the NODE overload, so a `@orb-gate-ignore` here is CONSUMED during the phase it is reported in.
  // `gate-ignore-inventory`'s STALE sweep runs in `finalize`, and gates finalize in load (filename) order —
  // `g…` before `n…` — so a suppression consumed in THIS gate's finalize would land after the sweep read the
  // count and the author's correct marker would be reported stale (pass.ts's `gateIgnoreSuppressedInFinalize`
  // tripwire exists for exactly that, and names `run` as the fix). Every gate's `run` precedes every
  // `finalize`, and `run` is still after the whole walk — so all tuples are collected. See scripts/check/pass.ts.
  run: (ctx: GateRunCtx) => {
    for (const c of passRespells) {
      const home = passTuples.get(c.sig);
      if (home === undefined) {
        continue;
      }
      // A satisfies-bound tuple's own `Interface["prop"]` co-declaration is the SOURCE it derives from,
      // not a re-spell — skip it (else the derive idiom flags itself).
      if (passCoDeclLocs.has(c.loc)) {
        continue;
      }
      // A candidate that can't legally import the tuple's home (it sits UP the cake) is NOT a re-spell —
      // it physically cannot derive from it (a kit fn returning "always"|"keyword" can't reach a contracts
      // WORLD_INFO_SCOPES). Only flag when the home is reachable from the candidate's package.
      if (!canReachHome(c.file, home.file)) {
        continue;
      }
      ctx.report(c.node, { token: `${c.kind === "zenum" ? "z.enum re-spell" : "re-spell"} ${home.name}`, offset: 0 });
    }
  },
  mustFlag: [
    {
      files: "export type Mode = 'a' | 'b' | 'c';\n",
      at: "packages/contracts/src/x.ts",
      expect: { count: 1, token: "union Mode" },
      why: "an inline string-union type alias of ≥3 members (arm A) — declare a tuple + derive (§7.5)",
    },
    {
      files: {
        "packages/contracts/src/home.ts": "export const AXIS = ['a', 'b', 'c'] as const;\n",
        "packages/server/src/x.ts": "export interface T { mode: 'a' | 'b' | 'c' }\n",
      },
      expect: { count: 1, token: "re-spell AXIS" },
      why: "an inline union re-spelling a homed `as const` tuple (arm B, cross-file) — derive instead",
    },
    {
      files: {
        "packages/contracts/src/mode-home.ts": "export const MODE = ['a', 'b', 'c'] as const;\n",
        "packages/server/src/z.ts": "export const schema = z.enum(['a', 'b', 'c']);\n",
      },
      expect: { count: 1, token: "z.enum re-spell MODE" },
      why: "a `z.enum([...])` respelling a homed `as const` tuple (arm B ZENUM sub-kind — the AUTH_MODE bug) — use z.enum(X). The TOKEN is what discriminates the sub-kind now that both messages fold into `message`",
    },
    {
      files: {
        "packages/kit/src/pair-home.ts": "export const PAIR = ['x', 'y'] as const;\n",
        "packages/server/src/pair-respell.ts": "export interface P { side: 'x' | 'y' }\n",
      },
      expect: { count: 1, token: "re-spell PAIR" },
      why: "blind spot (b) repaired: a 2-member tuple homed in kit/ now registers, so a 2-member re-spell is caught (arm B at the ≥2 homed floor)",
    },
    {
      files: {
        "packages/contracts/src/sat-home.ts":
          "export interface Cfg { mode: 'a' | 'b' | 'c'; n: number }\nexport const MODES = ['a', 'b', 'c'] as const satisfies readonly Cfg['mode'][];\n",
        "packages/server/src/sat-respell.ts": "export interface Reuse { mode: 'a' | 'b' | 'c' }\n",
      },
      expect: { count: 1, token: "re-spell MODES" },
      why: "blind spot (a) repaired: an `as const satisfies readonly X[]` tuple now registers, so a FOREIGN re-spell is caught — while its OWN satisfies co-declaration (Cfg.mode) is exempt (the next mustPass proves the exemption)",
    },
  ],
  mustPass: [
    {
      files: "export type NodeEnv = 'development' | 'production';\n",
      at: "packages/contracts/src/y.ts",
      why: "a 2-member one-off union with no canonical tuple — arm A ≥3 floor + no home, passes",
    },
    {
      files: "export const schema = z.enum(['development', 'production', 'test']);\n",
      at: "packages/contracts/src/env.ts",
      why: "a `z.enum([...])` one-off (NODE_ENV-class) with NO matching canonical tuple in the tree — arm B no-op, passes",
    },
    {
      files: "export interface Cfg { mode: 'a' | 'b' | 'c'; n: number }\nexport const MODES = ['a', 'b', 'c'] as const satisfies readonly Cfg['mode'][];\n",
      at: "packages/contracts/src/sat-selfsource.ts",
      why: "the satisfies co-declaration EXEMPTION: `Cfg.mode` is the SOURCE the satisfies tuple derives from — the idiom must not flag itself (blind-spot-(a) care clause from §G2)",
    },
    {
      files: {
        "packages/server/src/local-pair-home.ts": "export const LOCAL_PAIR = ['x', 'y'] as const;\n",
        "packages/server/src/local-pair-use.ts": "export interface Q { side: 'x' | 'y' }\n",
      },
      why: "a 2-member tuple homed OUTSIDE contracts/kit stays below the arm-B registration floor (≥3), so a coincidental generic pair is NOT flagged — the false-positive control from §G2 fix (b)",
    },
    {
      files: {
        "packages/contracts/src/scope-home.ts": "export const SCOPES = ['always', 'keyword'] as const;\n",
        "packages/kit/src/engine.ts": "export function resolve(): 'always' | 'keyword' {\n  return 'always';\n}\n",
      },
      why: "the up-cake reach guard: a kit fn returning a union whose sig matches a CONTRACTS-homed tuple can't import it (kit ← contracts is one-directional) — flagging it would demand an illegal import, so it passes (the live `resolveEntryScope` case)",
    },
  ],
};
