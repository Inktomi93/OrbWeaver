// unwired (tRPC procedures no client consumes) + clientgap (server-only client-facing shapes).
import { Node, SyntaxKind } from "ts-morph";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { SourceCorpus } from "../../_shared/ts-workspace.ts";
import type { Flags, Hit } from "../contract/types.ts";
import { collectAppRouterOutputProvenance } from "../lib/app-router-provenance.ts";
import { emit, hitOf, narrate } from "../lib/emit.ts";
import { declKey } from "../lib/keys.ts";
import { exitToolError, noteUnits, SKIP_TEST_FILES, scanCorpus, WHOLE_CORPUS } from "../lib/ledger.ts";
import { buildLiveness, CLIENT_SRC_PREFIX } from "../lib/liveness.ts";
import { isTestPath } from "../lib/root.ts";
import { ownExports, resolveScope } from "../lib/scope.ts";

refuseDirectInvocation(import.meta.url, "pnpm ast <lens>");

// ── unwired: server tRPC procedures with NO client consumer (the PD-138 blind spot) ────────────
// Import-based liveness CANNOT see this — the client consumes a procedure through the typed proxy
// (`trpc.<ns>.<proc>` / `Trpc["<ns>"]["<proc>"]`), never an import edge to the server router. So we
// enumerate both surfaces STRUCTURALLY and diff them:
//   • server: every `t.router({ … })` object-literal, wired to its appRouter namespace, keyed
//     `<ns>.<proc>` (loose root procs — health/echo/clientError — key on their bare name).
//   • client: every `trpc.<ns>.<proc>` property-access chain AND `Trpc["<ns>"]["<proc>"]` indexed
//     type, scanned across client prod (non-test) files.
// `serverProcedures − clientConsumed` is emitted at each unwired procedure's SERVER definition site.
//
// THE VALUE-SIDE READ HAS FOUR SPELLINGS, NOT ONE (lens calibration, 2026-08-13). The proxy is an ordinary
// object at the value level, so every JS member-read form reaches a procedure and each is a separate AST
// kind: `trpc.ns.proc` (PropertyAccess), `trpc.ns["proc"]` and `trpc["ns"].proc` (ElementAccess), and the
// optional-chained `trpc?.ns?.proc`. A dot-only matcher is the "property read has THREE shapes" false clean
// applied to a whole lens: ONE consumer written with brackets reads as an unwired verb, and the natural fix
// (delete it) would break the client. {@link memberReadOf} normalizes all four to `(object, name)` so the
// pair matcher below sees one shape. (Optional chaining needs no special case — ts-morph models `a?.b` as a
// PropertyAccessExpression with a question-dot token — but it IS covered by a planted control in the
// self-test, because "needs no special case" is a claim that must be provable, not assumed.)
/** The full name a server procedure and its client consumer agree on: `<ns>.<proc>`, or bare `<proc>`
 *  for a loose root procedure (namespace ""). */
function procFullName(ns: string, proc: string): string {
  return ns === "" ? proc : `${ns}.${proc}`;
}

/** The object-literal keys of a `t.router({ … })` call — the procedure/sub-router names. Returns null
 *  if `node` is not a `t.router(objectLiteral)` call (so a caller can probe any expression cheaply). */
function routerObjectKeys(node: Node): string[] | null {
  if (!Node.isCallExpression(node)) {
    return null;
  }
  const expr = node.getExpression();
  if (!(Node.isPropertyAccessExpression(expr) && expr.getName() === "router")) {
    return null;
  }
  const arg = node.getArguments()[0];
  if (arg === undefined || !Node.isObjectLiteralExpression(arg)) {
    return null;
  }
  const keys: string[] = [];
  for (const prop of arg.getProperties()) {
    if (Node.isPropertyAssignment(prop) || Node.isShorthandPropertyAssignment(prop)) {
      const nameNode = prop.getNameNode();
      keys.push(Node.isStringLiteral(nameNode) ? nameNode.getLiteralText() : nameNode.getText());
    }
  }
  return keys;
}

/** Resolve an appRouter property VALUE (a sub-router identifier like `pluginRouter`) to the `t.router`
 *  call that defines it, following the variable declaration's initializer. Inline router calls are read
 *  directly by the caller before this identifier-only resolution step. */
function resolveRouterInitializer(value: Node): Node | undefined {
  if (!Node.isIdentifier(value)) {
    return;
  }
  return value
    .getDefinitionNodes()
    .filter((d) => Node.isVariableDeclaration(d))
    .map((d) => d.getInitializer())
    .find((init) => init !== undefined && routerObjectKeys(init) !== null);
}

interface ServerProc {
  full: string;
  decl: Node;
}

/** Enumerate every server tRPC procedure as `<ns>.<proc>` (loose root procs bare), each paired with its
 *  definition site (the object-literal property — the node the unwired hit points at). Derived from the
 *  root `appRouter = t.router({ … })`: an identifier value is a namespaced sub-router; any other value
 *  (a `publicProcedure…` chain) is a loose root procedure keyed on its own name. */
export function collectServerProcedures(project: SourceCorpus): ServerProc[] {
  const out: ServerProc[] = [];
  for (const sf of project.getSourceFiles()) {
    for (const v of sf.getVariableDeclarations()) {
      if (v.getName() !== "appRouter") {
        continue;
      }
      const init = v.getInitializer();
      const arg = init !== undefined && Node.isCallExpression(init) ? init.getArguments()[0] : undefined;
      if (arg === undefined || !Node.isObjectLiteralExpression(arg)) {
        continue;
      }
      collectFromAppRouter(arg, out);
    }
  }
  return out;
}

/** Walk the appRouter object-literal: each property is a namespaced sub-router (identifier value → its
 *  `t.router` keys) or a loose root procedure (any other value → its own name). */
function collectFromAppRouter(appLiteral: Node, out: ServerProc[]): void {
  if (!Node.isObjectLiteralExpression(appLiteral)) {
    return;
  }
  for (const prop of appLiteral.getProperties()) {
    if (!Node.isPropertyAssignment(prop)) {
      continue;
    }
    const ns = prop.getName();
    const value = prop.getInitializerOrThrow();
    const subRouter = routerObjectKeys(value) !== null ? value : resolveRouterInitializer(value);
    if (subRouter === undefined) {
      // A loose root procedure (`health: publicProcedure.query(…)`) — bare name, defined right here.
      out.push({ full: procFullName("", ns), decl: prop });
      continue;
    }
    for (const proc of routerObjectKeys(subRouter) ?? []) {
      out.push({ full: procFullName(ns, proc), decl: procDeclNode(subRouter, proc) });
    }
  }
}

/** The definition node for procedure `proc` inside a `t.router({ … })` call — its object-literal property
 *  (so an unwired hit points at the verb), falling back to the router call itself. */
function procDeclNode(routerCall: Node, proc: string): Node {
  if (Node.isCallExpression(routerCall)) {
    const arg = routerCall.getArguments()[0];
    if (arg !== undefined && Node.isObjectLiteralExpression(arg)) {
      const match = arg.getProperties().find((p) => (Node.isPropertyAssignment(p) || Node.isShorthandPropertyAssignment(p)) && p.getName() === proc);
      if (match !== undefined) {
        return match;
      }
    }
  }
  return routerCall;
}

/** `<ns>.<proc>` full names the CLIENT consumes, from prod (non-test) client files: property-access
 *  chains `X.<ns>.<proc>` (root identifier untrusted — matched by the known namespace+proc pair) and
 *  indexed-access types `Trpc["<ns>"]["<proc>"]`. Loose root procs match a bare `X.<proc>` chain. */
export function collectClientConsumed(project: SourceCorpus, valid: Set<string>): Set<string> {
  const consumed = new Set<string>();
  const looseProcs = new Set([...valid].filter((f) => !f.includes(".")));
  for (const sf of project.getSourceFiles()) {
    const fp = sf.getFilePath();
    if (!fp.includes(CLIENT_SRC_PREFIX) || isTestPath(fp)) {
      continue;
    }
    for (const kind of [SyntaxKind.PropertyAccessExpression, SyntaxKind.ElementAccessExpression] as const) {
      for (const access of sf.getDescendantsOfKind(kind)) {
        markConsumedFromAccess(access, valid, looseProcs, consumed);
      }
    }
    for (const ia of sf.getDescendantsOfKind(SyntaxKind.IndexedAccessType)) {
      markConsumedFromIndexedType(ia, valid, consumed);
    }
  }
  return consumed;
}

/** ONE value-level member read as `(object, name)`, whatever spelling it wears: `x.name`, `x?.name`,
 *  `x["name"]`. Undefined for a computed element access (`x[key]`) — that names no procedure statically, and
 *  guessing one would be a fabricated consumer. */
export function memberReadOf(node: Node): { object: Node; name: string } | undefined {
  if (Node.isPropertyAccessExpression(node)) {
    return { object: node.getExpression(), name: node.getName() };
  }
  if (!Node.isElementAccessExpression(node)) {
    return;
  }
  const arg = node.getArgumentExpression();
  return arg !== undefined && Node.isStringLiteral(arg) ? { object: node.getExpression(), name: arg.getLiteralText() } : undefined;
}

/** A `X.<ns>.<proc>` access marks `<ns>.<proc>` consumed; a `X.<proc>` access whose tail is a known loose
 *  root procedure marks that bare name consumed. Both hops go through {@link memberReadOf}, so a bracket or
 *  optional-chained spelling of either hop counts exactly like the dot form. */
function markConsumedFromAccess(node: Node, valid: Set<string>, looseProcs: Set<string>, consumed: Set<string>): void {
  const outer = memberReadOf(node);
  if (outer === undefined) {
    return;
  }
  const proc = outer.name;
  const inner = memberReadOf(outer.object);
  if (inner !== undefined) {
    const full = `${inner.name}.${proc}`;
    if (valid.has(full)) {
      consumed.add(full);
    }
  }
  if (looseProcs.has(proc)) {
    consumed.add(proc);
  }
}

/** A `Trpc["<ns>"]["<proc>"]` indexed type marks `<ns>.<proc>` consumed — the type-level consumption the
 *  import-liveness is blind to. */
function markConsumedFromIndexedType(ia: Node, valid: Set<string>, consumed: Set<string>): void {
  if (!Node.isIndexedAccessTypeNode(ia)) {
    return;
  }
  const outerKey = literalOfIndex(ia.getIndexTypeNode());
  const objectType = ia.getObjectTypeNode();
  if (outerKey === undefined || !Node.isIndexedAccessTypeNode(objectType)) {
    return;
  }
  const nsKey = literalOfIndex(objectType.getIndexTypeNode());
  if (nsKey === undefined) {
    return;
  }
  const full = `${nsKey}.${outerKey}`;
  if (valid.has(full)) {
    consumed.add(full);
  }
}

/** The string value of a literal type index node (`"list"` → `list`), else undefined. */
function literalOfIndex(node: Node): string | undefined {
  if (!Node.isLiteralTypeNode(node)) {
    return;
  }
  const lit = node.getLiteral();
  return Node.isStringLiteral(lit) ? lit.getLiteralText() : undefined;
}

// The two HONEST exemption categories for a client-unconsumed procedure — each a distinct marker whose
// NAME states the truth (never the old catch-all `@unwired-exempt`, which conflated them):
//   • @server-only: <reason>   — no client consumer BY DESIGN; the proc is not a UI surface at all
//                                (break-glass admin KV, ops-only escape hatches). It ships to serve
//                                server/ops callers, never the front-end.
//   • @test-fixture: <reason>  — a prod-router proc kept alive as a DELIBERATE, ratified always-ship
//                                fixture for a test or the cross-tenant sweep (the CT typed-read template,
//                                the sweep's own IDOR probe target). Its only consumer is a test — and
//                                that is on purpose, stated here.
// Both require a non-empty reason after the colon (mirrors `biome-ignore` discipline — a bare marker with
// no rationale is not a legal exemption).
const SERVER_ONLY_RE = /@server-only:\s*\S/u;

const TEST_FIXTURE_RE = /@test-fixture:\s*\S/u;

/** True if `decl` (the procedure's object-literal property) carries a leading `// @server-only: <reason>`
 *  or `// @test-fixture: <reason>` comment — the two honest reasons a client never consumes it. The reason
 *  is required; a bare marker (empty after the colon) does NOT exempt. */
export function isUnwiredExempt(decl: Node): boolean {
  return decl.getLeadingCommentRanges().some((range) => {
    const text = range.getText();
    return SERVER_ONLY_RE.test(text) || TEST_FIXTURE_RE.test(text);
  });
}

/** Server tRPC procedures no client file consumes (via the typed proxy or a `Trpc[…]` inference) — the
 *  import-liveness blind spot that ships a verb the front-end never wires. Optional scope = a `<ns>.<proc>`
 *  full-name substring (a router name); default = all procedures. A procedure marked
 *  `// @server-only: <reason>` (no client consumer by design) or `// @test-fixture: <reason>` (a deliberate
 *  always-ship test/sweep fixture) is excluded from the report. */
export function cmdUnwired(project: SourceCorpus, scope: string, flags: Flags): void {
  scanCorpus(project, WHOLE_CORPUS);
  const procs = collectServerProcedures(project);
  // The scope of THIS lens is the enumerated procedure set, not a path: zero procedures means the
  // `appRouter = t.router({…})` shape stopped matching, and a structurally blind run must not print clean.
  noteUnits("procs", procs.length);
  if (procs.length === 0) {
    exitToolError(
      "ast unwired: enumerated ZERO server procedures — the `appRouter = t.router({ … })` shape this lens derives from did not match, so nothing could be reported. Re-check packages/server/src/transport (the router shape), not the client.",
    );
  }
  if (scope !== "") {
    // A `<ns>.<proc>` substring that names no enumerated procedure is a scope that entered nothing —
    // the router-name typo that used to read as "this router is fully wired".
    const scoped = procs.filter((p) => p.full.includes(scope));
    noteUnits(`procs-matching-"${scope}"`, scoped.length);
    if (scoped.length === 0) {
      exitToolError(
        `ast unwired: scope "${scope}" matched none of the ${procs.length} enumerated procedure(s) — pass a \`<ns>.<proc>\` substring (a router name), or run bare for all.`,
      );
    }
  }
  const valid = new Set(procs.map((p) => p.full));
  const consumed = collectClientConsumed(project, valid);
  const hits: Hit[] = [];
  for (const { full, decl } of procs) {
    if (consumed.has(full) || (scope !== "" && !full.includes(scope)) || isUnwiredExempt(decl)) {
      continue;
    }
    const h = hitOf(decl, "unwired-proc");
    h.text = `${full}  —  ${h.text}`;
    hits.push(h);
  }
  emit(hits, flags, `unwired${scope === "" ? "" : ` ${scope}`} (${procs.length} server procedure(s) enumerated)`);
}

// ── clientgap: client-facing contract exports the SERVER consumes but the CLIENT never does ─────
// The liveness extension: an export in exact server product consumption but NOT client product consumption.
// Tests annotate behavior; they do not prove the product wired the contract. Raw this
// is noisy (server-only contracts are legion), so default-scope is `@orb/contracts` filtered to the
// client-facing WIRE shapes (a `*View`/`*Summary` name heuristic — the surface a UI actually renders).
// CANDIDATE lens (like orphans): a hit may be client-consumed via a re-exported barrel or a `Trpc[…]`
// inference the import-liveness can't see — VERIFY before acting.
const CLIENT_FACING_SUFFIX_RE = /(View|Summary)$/u;

const CONTRACTS_SRC_PREFIX = "/packages/contracts/src/";

/** Exports of a scope the SERVER prod-consumes but the CLIENT never does — a wire
 *  shape that never made it to the front-end. Default scope `contracts`, filtered to `*View`/`*Summary`
 *  client-facing names; a path/package scope overrides. A CANDIDATE lens — verify, don't act blind. */
export function cmdClientGap(project: SourceCorpus, arg: string, flags: Flags): void {
  const scoped = arg === "" ? "contracts" : arg;
  const scope = resolveScope(project, scoped, "clientgap");
  const isContracts = scope.prefix.includes(CONTRACTS_SRC_PREFIX);
  const files = scanCorpus(project, { scope: scope.prefix, label: `path:${scope.prefix}`, skip: [SKIP_TEST_FILES] });
  const live = buildLiveness(project);
  const procedures = collectServerProcedures(project);
  if (procedures.length === 0) {
    exitToolError(
      "ast clientgap: enumerated ZERO AppRouter procedures, so client-consumed output provenance cannot be resolved. Re-check the root `appRouter = t.router({ … })` composition shape.",
    );
  }
  const consumedProcedures = collectClientConsumed(project, new Set(procedures.map(({ full }) => full)));
  const provenance = collectAppRouterOutputProvenance(project, consumedProcedures, procedures);
  if (provenance === undefined) {
    exitToolError("ast clientgap: could not resolve the single exported AppRouter type declaration; refusing a false-clean contract report.");
  }
  if (provenance.unresolvedProcedures.length > 0) {
    exitToolError(
      `ast clientgap: could not resolve AppRouter output provenance for ${provenance.unresolvedProcedures.join(", ")}; refusing a false-clean contract report.`,
    );
  }
  noteUnits("client-consumed-procedures", consumedProcedures.size);
  noteUnits("client-output-contract-declarations", provenance.contractKeys.size);
  const hits: Hit[] = [];
  for (const sf of files) {
    for (const { name, decl } of ownExports(sf)) {
      const key = declKey(decl);
      const gap = live.usedServerProd.has(key) && !live.usedClientProd.has(key) && !provenance.contractKeys.has(key);
      // On the default contracts scope, gate to client-facing wire names (else it floods with server-only
      // contracts). A caller-supplied scope trusts the caller — report every gap in it.
      if (!gap || (isContracts && !CLIENT_FACING_SUFFIX_RE.test(name))) {
        continue;
      }
      const h = hitOf(decl, "client-gap");
      h.text = `${name}  —  ${h.text}`;
      hits.push(h);
    }
  }
  narrate(
    flags,
    "clientgap is a CANDIDATE lens — AppRouter output provenance is checker-resolved through aliases, barrels, nested constituents, and intersections; remaining hits may still be intentional server-only or external/plugin contracts, so verify before acting.",
  );
  emit(hits, flags, `clientgap ${scope.label}${isContracts ? " (client-facing *View/*Summary names)" : ""}`);
}
