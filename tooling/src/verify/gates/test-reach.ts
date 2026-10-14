// Policy: test-reach (docs/law/Spine-Testing.md §5) — every presence-gated module is reached by a test of the kind
// its surface owes: a test, or a test-tree helper it imports, references one of the module's value exports, or the
// test names the module in an `@subject` header. A file at a computed path proves nothing. The surfaces are derived
// by SHAPE (`demandFor`); reach is `floor/code-facts/test-reach.ts`. Family `mirror-index`: `@subject` paths must exist in the
// package or tooling source space. Current debt is reviewed-grant rows in `lib/reviewed-grants-test-reach*.ts`.
// The client `data/`, `forms/` and `state/` seals and the non-primitive `@orb/ui` logic groups are demanded here too,
// and every action a client store file exports must be CALLED by a test, not only imported. The standing
// worst-legal-art CT, a named-file floor rather than a reach demand, stays in `test-presence-client`.
import type { Expression, Node as MorphNode, SourceFile } from "ts-morph";
import { Node } from "ts-morph";
import type { DeclaredSubject } from "../../floor/code-facts/module-reach-contract.ts";
import { resolveExportedDeclarations } from "../../floor/code-facts/reference-fact.ts";
import { testReach } from "../../floor/code-facts/test-reach.ts";
import type { TestFamily } from "../../floor/testing/test-kinds.ts";
import { isLegacyTestPath } from "../../floor/testing/test-population.ts";
import type { GatePolicyContext } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";
import type { MirrorIndex } from "../contract/resource-mirror.ts";
import { codeTextForScan } from "../lib/comment-spans.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";

const SERVER_SRC = "packages/server/src/";
const CONTRACTS_SRC = "packages/contracts/src/";
const INFERENCE_SRC = "packages/inference/src/";
const CLIENT_SRC = "packages/client/src/";
const UI_SRC = "packages/ui/src/";
const DOMAIN_DIR = "domain/";
const STATE_HOME = "state/";
/** Direct children of these client owners are composed independently by every feature; bound fields keep their shared CT home. */
const CLIENT_SEAL_HOMES: readonly string[] = ["data/", "forms/", "forms/editor/", STATE_HOME];
/** Non-primitive `@orb/ui` logic groups; bare `primitives/` are covered by `ui-primitive-structure`'s CT clause. */
const UI_LOGIC_GROUPS: readonly string[] = ["charts/", "markdown/", "stream/", "content/", "code-editor/", "diff/", "fuzzy-search/"];
/** A `state/` file mints its own store only when it calls one of these factory doors. */
const STATE_STORE_FACTORY_RE = /\b(?:createGatedStore|createPersistedStore|createEntityDraftStore)(?:<[^(]*>)?\(/u;
const TIER_PREFIXES: readonly string[] = ["entry/", "transport/"];
const INFRA_PREFIXES: readonly string[] = ["infra/", "foundation/"];
const DECLARATION_EXT = ".d.ts";
const BARREL = "index.ts";
/** A real-tree file present on every live run and planted by no example but the tripwire rows. */
const REAL_TREE_ANCHOR = "packages/db/src/schema/index.ts";
/** The reviewed-grant operation prefix; the arm follows it, so a grant row names the surface it excuses. */
const UNREACHED_OPERATION = "unreached";
const STALE_SUBJECT_OPERATION = "stale-subject";

const BEHAVIOR: readonly TestFamily[] = ["unit", "integration"];
const RUNTIME: readonly TestFamily[] = ["unit", "integration", "contract"];
const BROWSER: readonly TestFamily[] = ["unit", "component"];

/** Each surface, the test families that satisfy it, and what its finding says. */
const ARMS = {
  verb: { families: BEHAVIOR, says: "verb is reached by no unit or integration test" },
  persistence: { families: ["integration"], says: "persistence module is reached by no integration test" },
  "domain-schema": { families: ["contract"], says: "domain contract schema is reached by no contract test" },
  "shared-schema": { families: ["contract"], says: "shared contract schema is reached by no contract test" },
  runner: { families: BEHAVIOR, says: "workloads runner with real logic is reached by no unit or integration test" },
  domain: { families: BEHAVIOR, says: "domain module with runtime logic is reached by no unit or integration test" },
  tier: { families: BEHAVIOR, says: "entry/transport module with runtime logic is reached by no unit or integration test" },
  router: { families: BEHAVIOR, says: "tRPC router is reached by no unit or integration test" },
  infra: { families: BEHAVIOR, says: "infra/foundation module with runtime logic is reached by no unit or integration test" },
  inference: { families: RUNTIME, says: "inference runtime module is reached by no runtime test" },
  "client-seal": { families: BROWSER, says: "client data/forms/state module is reached by no unit or component test" },
  "ui-logic": { families: BROWSER, says: "non-primitive @orb/ui logic module is reached by no unit or component test" },
} as const satisfies Record<string, { readonly families: readonly TestFamily[]; readonly says: string }>;
type Arm = keyof typeof ARMS;

const LAW = "(docs/law/Spine-Testing.md §5)";
const REACH_FIX =
  "import the module in a test of that kind and use one of its exports (a test kind reaches only the source extensions it holds, tooling/src/floor/testing/test-kinds.ts), call a store action it exports, or name the module in the test's `@subject` header. Existing debt is a reviewed-grant row in lib/reviewed-grants-test-reach*.ts; a new module gets a test, not a row.";
const UNCALLED_OPERATION = `${UNREACHED_OPERATION}:store-action`;
const uncalledSays = (action: string): string => `store action \`${action}\` is called by no unit or component test`;

const BLIND_DOMAIN =
  "BLINDNESS TRIPWIRE — the domain scan matched ZERO files with runtime logic. The demand derivation is keyed on `packages/server/src/domain/`; if that tree moved, this gate would report a clean corpus it never scanned.";
const BLIND_TIERS =
  "BLINDNESS TRIPWIRE — the entry/transport scan matched ZERO files with runtime logic. The demand derivation is keyed on the `entry/` and `transport/` prefixes under `packages/server/src/`.";
const BLIND_INFERENCE =
  "BLINDNESS TRIPWIRE — the inference scan matched ZERO modules with an emitted export. The demand derivation is keyed on `packages/inference/src/`; if that tree moved or its exports stopped resolving, this gate would report a clean corpus it never scanned.";
const BLIND_CLIENT =
  "BLINDNESS TRIPWIRE — the client scan matched ZERO data/forms/state modules with runtime logic. The demand derivation is keyed on those homes under `packages/client/src/`; if that tree moved, this gate would report a clean corpus it never scanned.";
const BLIND_UI =
  "BLINDNESS TRIPWIRE — the ui scan matched ZERO non-primitive logic modules. The demand derivation is keyed on the logic groups under `packages/ui/src/`; if that tree moved, this gate would report a clean corpus it never scanned.";
const BLIND_REACH =
  "BLINDNESS TRIPWIRE — the test tree resolved ZERO references into the demanded modules. Module resolution of the test imports failed, so every module would read as unreached.";

// ── Shape predicates: which files carry runtime behaviour a test owes ────────────────────────────────────────

// Read from CODE, never file text: a comment that spells `z.object(` declares no schema.
const SCHEMA_NEEDLES: readonly string[] = ["z.object(", "z.enum(", "z.discriminatedUnion("];

function hasSchema(sf: SourceFile): boolean {
  const text = codeTextForScan(sf, (raw) => SCHEMA_NEEDLES.some((needle) => raw.includes(needle)));
  return SCHEMA_NEEDLES.some((needle) => text.includes(needle));
}

// A D58 no-op stub runner reports and returns `{ deferred: true }` without touching its env; it owes nothing
// until a real `ctx.env` call arrives.
const DEFERRED_RESULT = "deferred: true";
const ENV_CALL = "ctx.env";

function isDeferredStubRunner(sf: SourceFile): boolean {
  const text = codeTextForScan(sf, (raw) => raw.includes(DEFERRED_RESULT));
  return text.includes(DEFERRED_RESULT) && !text.includes(ENV_CALL);
}

function exportedCallableInitializers(sf: SourceFile): readonly MorphNode[] {
  return sf
    .getVariableStatements()
    .filter((stmt) => stmt.isExported())
    .flatMap((stmt) => stmt.getDeclarations().flatMap((decl) => decl.getInitializer() ?? []))
    .filter((init) => Node.isArrowFunction(init) || Node.isFunctionExpression(init));
}

/** Every exported callable: functions, classes and function-valued consts. */
function exportedCallables(sf: SourceFile): readonly MorphNode[] {
  return [...sf.getFunctions().filter((fn) => fn.isExported()), ...sf.getClasses().filter((cls) => cls.isExported()), ...exportedCallableInitializers(sf)];
}

function hasCallableExport(sf: SourceFile): boolean {
  return exportedCallables(sf).length > 0;
}

/** A tRPC router: an exported binding initialised by `router({...})` or `t.router({...})`. */
function isRouter(sf: SourceFile): boolean {
  return sf
    .getVariableStatements()
    .filter((stmt) => stmt.isExported())
    .flatMap((stmt) => stmt.getDeclarations().flatMap((decl) => decl.getInitializer() ?? []))
    .some((init) => {
      if (!Node.isCallExpression(init)) {
        return false;
      }
      const callee = init.getExpression();
      return (Node.isIdentifier(callee) && callee.getText() === "router") || (Node.isPropertyAccessExpression(callee) && callee.getName() === "router");
    });
}

const SLOTTED_SEGMENTS: readonly string[] = ["/verbs/", "/persistence/", "/workloads/runners/"];
/** Feature-root wiring files: the zero-logic composition root and the DI bundle. */
const WIRING_ROOT_FILES: ReadonlySet<string> = new Set(["service.ts", "context.ts"]);
/** `domain` + `<feature>` + basename. */
const FEATURE_ROOT_SEGMENTS = 3;

function isFeatureRoot(rel: string): boolean {
  return rel.split("/").length === FEATURE_ROOT_SEGMENTS;
}

/** A `contract/` file whose every export is a class extending a `*Error`; its only assertion would be `instanceof`. */
function isErrorDeclarationOnly(sf: SourceFile): boolean {
  if (sf.getFunctions().some((f) => f.isExported()) || exportedCallableInitializers(sf).length > 0) {
    return false;
  }
  const classes = sf.getClasses().filter((c) => c.isExported());
  return classes.length > 0 && classes.every((c) => (c.getExtends()?.getExpression().getText() ?? "").endsWith("Error"));
}

function isDomainShapeExempt(rel: string, sf: SourceFile): boolean {
  const base = rel.slice(rel.lastIndexOf("/") + 1);
  if (isFeatureRoot(rel) && WIRING_ROOT_FILES.has(base)) {
    return true;
  }
  return rel.includes("/contract/") && (hasSchema(sf) || isErrorDeclarationOnly(sf));
}

function unwrapPlumbing(expr: Expression): Expression {
  let cur: Expression = expr;
  while (Node.isParenthesizedExpression(cur) || Node.isAwaitExpression(cur) || Node.isAsExpression(cur) || Node.isNonNullExpression(cur)) {
    cur = cur.getExpression();
  }
  return cur;
}

/** A value moved, never computed: an identifier, a member chain, a spread of one, or an object literal of those. */
function isPlumbingAtom(expr: Expression): boolean {
  const node = unwrapPlumbing(expr);
  if (Node.isSpreadElement(node)) {
    return isPlumbingAtom(node.getExpression());
  }
  if (Node.isIdentifier(node)) {
    return true;
  }
  if (Node.isPropertyAccessExpression(node) || Node.isElementAccessExpression(node)) {
    return isPlumbingAtom(node.getExpression());
  }
  if (!Node.isObjectLiteralExpression(node)) {
    return false;
  }
  return node.getProperties().every((prop) => {
    if (Node.isShorthandPropertyAssignment(prop)) {
      return true;
    }
    if (Node.isSpreadAssignment(prop)) {
      return isPlumbingAtom(prop.getExpression());
    }
    if (!Node.isPropertyAssignment(prop)) {
      return false;
    }
    const init = prop.getInitializer();
    return init !== undefined && (isPlumbingAtom(init) || isWiringExpression(init));
  });
}

/** One delegating call over plumbing, a DI bundle, or a factory whose body is one of those. */
function isWiringExpression(expr: Expression): boolean {
  const node = unwrapPlumbing(expr);
  if (Node.isArrowFunction(node) || Node.isFunctionExpression(node)) {
    const inner = singleBodyExpression(node);
    return inner !== undefined && (isPlumbingAtom(inner) || isWiringExpression(inner));
  }
  if (Node.isCallExpression(node)) {
    return (
      isPlumbingAtom(node.getExpression()) && node.getArguments().every((arg) => Node.isExpression(arg) && (isPlumbingAtom(arg) || isWiringExpression(arg)))
    );
  }
  return Node.isObjectLiteralExpression(node) && isPlumbingAtom(node);
}

function singleBodyExpression(fn: MorphNode): Expression | undefined {
  if (!(Node.isArrowFunction(fn) || Node.isFunctionExpression(fn) || Node.isFunctionDeclaration(fn))) {
    return;
  }
  const body = fn.getBody();
  if (body === undefined) {
    return;
  }
  if (!Node.isBlock(body)) {
    return Node.isExpression(body) ? body : undefined;
  }
  const statements = body.getStatements();
  const only = statements.length === 1 ? statements[0] : undefined;
  if (only === undefined || !(Node.isReturnStatement(only) || Node.isExpressionStatement(only))) {
    return;
  }
  return only.getExpression();
}

/** Every exported callable is a pass-through. An exported class is never one. */
function isPassThroughWiring(sf: SourceFile): boolean {
  const callables = exportedCallables(sf);
  return (
    callables.length > 0 &&
    callables.every((fn) => {
      const inner = singleBodyExpression(fn);
      return inner !== undefined && (isPlumbingAtom(inner) || isWiringExpression(inner));
    })
  );
}

function isEmittedDeclaration(declaration: MorphNode, sourceFile: SourceFile): boolean {
  if (declaration.getSourceFile() !== sourceFile) {
    return false;
  }
  const variable = Node.isVariableDeclaration(declaration) ? declaration : declaration.getFirstAncestor(Node.isVariableDeclaration);
  if (variable !== undefined) {
    return variable.getVariableStatement()?.hasDeclareKeyword() === false;
  }
  if (
    Node.isFunctionDeclaration(declaration) ||
    Node.isClassDeclaration(declaration) ||
    Node.isEnumDeclaration(declaration) ||
    Node.isModuleDeclaration(declaration)
  ) {
    return !declaration.hasDeclareKeyword();
  }
  return false;
}

/** Every emitted export counts, including data, namespaces and local named exports; a re-export does not. */
function hasRuntimeExport(sourceFile: SourceFile): boolean {
  if (sourceFile.getExportAssignments().length > 0) {
    return true;
  }
  return sourceFile.getExportSymbols().some((symbol) => {
    const exported = resolveExportedDeclarations(sourceFile, symbol.getName());
    return exported.kind === "resolved" && exported.value.some((declaration) => isEmittedDeclaration(declaration, sourceFile));
  });
}

// ── Demand derivation ────────────────────────────────────────────────────────────────────────────────────────

function domainArm(rel: string, sf: SourceFile): Arm | undefined {
  if (rel.includes("/verbs/")) {
    return "verb";
  }
  if (rel.includes("/persistence/")) {
    return "persistence";
  }
  if (rel.includes("/workloads/runners/")) {
    return isDeferredStubRunner(sf) ? undefined : "runner";
  }
  if (rel.includes("/contract/") && hasSchema(sf)) {
    return "domain-schema";
  }
  if (SLOTTED_SEGMENTS.some((seg) => rel.includes(seg)) || isDomainShapeExempt(rel, sf) || isPassThroughWiring(sf)) {
    return;
  }
  return hasCallableExport(sf) ? "domain" : undefined;
}

function serverArm(rel: string, sf: SourceFile): Arm | undefined {
  if (rel.startsWith(DOMAIN_DIR)) {
    return domainArm(rel, sf);
  }
  if (TIER_PREFIXES.some((prefix) => rel.startsWith(prefix))) {
    if (rel.endsWith(DECLARATION_EXT)) {
      return;
    }
    if (isRouter(sf)) {
      return "router";
    }
    return hasCallableExport(sf) && !isPassThroughWiring(sf) ? "tier" : undefined;
  }
  return INFRA_PREFIXES.some((prefix) => rel.startsWith(prefix)) && hasCallableExport(sf) ? "infra" : undefined;
}

/** A direct child of a client owner (`data/x.ts`, `forms/editor/x.ts`); a nested bucket keeps its shared CT home. */
function isClientSeal(rel: string): boolean {
  return CLIENT_SEAL_HOMES.some((home) => rel.startsWith(home) && !rel.slice(home.length).includes("/"));
}

// Read from CODE: a comment that names a factory door (every store's doc comment does) mints no store.
function isStoreFile(sf: SourceFile): boolean {
  return STATE_STORE_FACTORY_RE.test(codeTextForScan(sf, (raw) => STATE_STORE_FACTORY_RE.test(raw)));
}

/** Every exported function of a store file is a store action unless it is a `use*` read-hook, a selector rather than a write. */
function storeActionNames(sf: SourceFile): readonly string[] {
  const declared = sf.getFunctions().flatMap((fn) => (fn.isExported() ? (fn.getName() ?? []) : []));
  const bound = sf
    .getVariableStatements()
    .filter((stmt) => stmt.isExported())
    .flatMap((stmt) => stmt.getDeclarations())
    .filter((decl) => {
      const init = decl.getInitializer();
      return init !== undefined && (Node.isArrowFunction(init) || Node.isFunctionExpression(init));
    })
    .map((decl) => decl.getName());
  return [...declared, ...bound].filter((name) => !name.startsWith("use"));
}

/** The actions a test must call, for a client `state/` file that mints a store. */
function storeActionsFor(path: string, sf: SourceFile): readonly string[] {
  const rel = path.slice(CLIENT_SRC.length);
  return rel.startsWith(STATE_HOME) && isClientSeal(rel) && isStoreFile(sf) ? storeActionNames(sf) : [];
}

/** The surface one population file owes, or nothing. A barrel is a pure re-export in the server, the client and ui;
 *  a contracts `index.ts` is not (the domain's schemas co-locate there). */
function demandFor(path: string, sf: SourceFile): Arm | undefined {
  if (path.startsWith(SERVER_SRC)) {
    return sf.getBaseName() === BARREL ? undefined : serverArm(path.slice(SERVER_SRC.length), sf);
  }
  if (path.startsWith(CONTRACTS_SRC)) {
    return hasSchema(sf) ? "shared-schema" : undefined;
  }
  if (path.startsWith(CLIENT_SRC)) {
    return clientArm(path.slice(CLIENT_SRC.length), sf);
  }
  if (path.startsWith(UI_SRC)) {
    return uiArm(path.slice(UI_SRC.length), sf);
  }
  return path.startsWith(INFERENCE_SRC) && hasRuntimeExport(sf) ? "inference" : undefined;
}

function clientArm(rel: string, sf: SourceFile): Arm | undefined {
  return sf.getBaseName() !== BARREL && isClientSeal(rel) && hasCallableExport(sf) ? "client-seal" : undefined;
}

function uiArm(rel: string, sf: SourceFile): Arm | undefined {
  return sf.getBaseName() !== BARREL && UI_LOGIC_GROUPS.some((group) => rel.startsWith(group)) && hasCallableExport(sf) ? "ui-logic" : undefined;
}

interface Census {
  domainLogic: number;
  tierLogic: number;
}

function tally(census: Census, path: string, sf: SourceFile): void {
  const logic = path.startsWith(SERVER_SRC) && hasCallableExport(sf);
  if (!logic) {
    return;
  }
  const rel = path.slice(SERVER_SRC.length);
  if (rel.startsWith(DOMAIN_DIR)) {
    census.domainLogic += 1;
  } else if (TIER_PREFIXES.some((prefix) => rel.startsWith(prefix))) {
    census.tierLogic += 1;
  }
}

/** What the population owes: the modules and the actions a test must call. */
interface Demands {
  readonly modules: ReadonlyMap<string, Arm>;
  readonly actions: ReadonlyMap<string, ReadonlySet<string>>;
}

function demandedCount(modules: ReadonlyMap<string, Arm>, arm: Arm): number {
  return [...modules.values()].filter((demanded) => demanded === arm).length;
}

function blindness(census: Census, demands: Demands, references: number): string | undefined {
  if (census.domainLogic === 0) {
    return BLIND_DOMAIN;
  }
  if (census.tierLogic === 0) {
    return BLIND_TIERS;
  }
  if (demandedCount(demands.modules, "inference") === 0) {
    return BLIND_INFERENCE;
  }
  if (demandedCount(demands.modules, "client-seal") === 0) {
    return BLIND_CLIENT;
  }
  if (demandedCount(demands.modules, "ui-logic") === 0) {
    return BLIND_UI;
  }
  return demands.modules.size > 0 && references === 0 ? BLIND_REACH : undefined;
}

function collectDemands(ctx: GatePolicyContext, census: Census): Demands {
  const modules = new Map<string, Arm>();
  const actions = new Map<string, ReadonlySet<string>>();
  for (const sourceFile of ctx.files) {
    const path = ctx.relativePath(sourceFile);
    tally(census, path, sourceFile);
    const arm = demandFor(path, sourceFile);
    if (arm !== undefined) {
      modules.set(path, arm);
    }
    const names = path.startsWith(CLIENT_SRC) ? storeActionsFor(path, sourceFile) : [];
    if (names.length > 0) {
      actions.set(path, new Set(names));
    }
  }
  return { modules, actions };
}

/** The families each `@subject` path is declared by. A header naming no source module is itself a finding. */
function declaredFamilies(
  ctx: GatePolicyContext,
  declared: readonly DeclaredSubject[],
  spaces: readonly MirrorIndex[],
): ReadonlyMap<string, ReadonlySet<TestFamily>> {
  const out = new Map<string, Set<TestFamily>>();
  for (const { test, subject, family } of declared) {
    if (isLegacyTestPath(test)) {
      continue;
    }
    if (spaces.some((space) => space.sourceFiles.has(subject))) {
      out.set(subject, (out.get(subject) ?? new Set<TestFamily>()).add(family));
      continue;
    }
    ctx.report.file(test, {
      line: 1,
      column: 1,
      message: `@subject ${subject} names no source module — fix or delete the header ${LAW}.`,
      subject: test,
      operation: `${STALE_SUBJECT_OPERATION}:${subject}`,
    });
  }
  return out;
}

function reportUnreached(
  ctx: GatePolicyContext,
  demands: ReadonlyMap<string, Arm>,
  reachedBy: ReadonlyMap<string, ReadonlySet<TestFamily>>,
  declared: ReadonlyMap<string, ReadonlySet<TestFamily>>,
): number {
  let unreached = 0;
  for (const [path, arm] of demands) {
    const { families, says } = ARMS[arm];
    const by = [...(reachedBy.get(path) ?? []), ...(declared.get(path) ?? [])];
    if (by.some((family) => families.includes(family))) {
      continue;
    }
    unreached += 1;
    ctx.report.file(path, { line: 1, column: 1, message: `${says} ${LAW}.`, subject: path, operation: `${UNREACHED_OPERATION}:${arm}` });
  }
  return unreached;
}

/** A store action a test imports and never calls is not driven: reaching the store module is not coverage of a new action. */
function reportUncalled(
  ctx: GatePolicyContext,
  actions: ReadonlyMap<string, ReadonlySet<string>>,
  calledBy: ReadonlyMap<string, ReadonlyMap<string, ReadonlySet<TestFamily>>>,
): number {
  let uncalled = 0;
  for (const [path, names] of actions) {
    for (const name of names) {
      if ([...(calledBy.get(path)?.get(name) ?? [])].some((family) => BROWSER.includes(family))) {
        continue;
      }
      uncalled += 1;
      ctx.report.file(path, {
        line: 1,
        column: 1,
        message: `${uncalledSays(name)} ${LAW} — drive it and assert the resulting store state.`,
        subject: path,
        operation: `${UNCALLED_OPERATION}:${name}`,
      });
    }
  }
  return uncalled;
}

// ── Proof fixtures ───────────────────────────────────────────────────────────────────────────────────────────

/** The pair that keeps the tooling mirror family non-empty in a row that plants only package sources. */
const TOOLING_PAIR = { "tooling/src/snapx/cli.ts": "export {};\n", "tests/tooling/snapx/cli.test.ts": "export {};\n" } as const;

/** A `state/` store file: one action, and a read-hook the demand never asks a test to call. */
function storeSource(id: string, action: string): string {
  return `import { createGatedStore } from "./create-gated-store";\nconst useX = createGatedStore<{ n: number }>("${id}", () => ({ n: 0 }));\nexport function ${action}(): void {\n  useX.setState({ n: 1 }, false, "x/set");\n}\nexport function use${action[0]?.toUpperCase() ?? ""}${action.slice(1)}(): number {\n  return useX((s) => s.n);\n}\n`;
}

function without(files: Readonly<Record<string, string>>, ...paths: readonly string[]): Readonly<Record<string, string>> {
  return Object.fromEntries(Object.entries(files).filter(([path]) => !paths.includes(path)));
}

const SIGHTED_VERB = "packages/server/src/domain/chat/verbs/start-chat.ts";
const SIGHTED_TIER = "packages/server/src/entry/http/health.ts";
const SIGHTED_INFERENCE = "packages/inference/src/extensions/live.ts";
const SIGHTED_INFERENCE_TEST = "tests/inference/extensions/live.test.ts";
const SIGHTED_CLIENT = "packages/client/src/data/use-thing.ts";
const SIGHTED_CLIENT_TEST = "tests/client/data/use-thing.test.ts";
const SIGHTED_UI = "packages/ui/src/markdown/policy.ts";
const SIGHTED_UI_TEST = "tests/ui/markdown/policy.test.ts";

/** A tree in which every blindness scan finds a module and a test reaches every module. Each tripwire row removes one. */
const SIGHTED: Readonly<Record<string, string>> = {
  ...TOOLING_PAIR,
  [REAL_TREE_ANCHOR]: "export const schema = 1;\n",
  [SIGHTED_VERB]: "export const createStartChat = (): number => 1;\n",
  "tests/server/domain/chat/verbs/starting.test.ts":
    'import { createStartChat } from "../../../../../packages/server/src/domain/chat/verbs/start-chat.ts";\nexport const made = createStartChat();\n',
  [SIGHTED_TIER]: "export function health(): number {\n  const status = 200;\n  return status;\n}\n",
  "tests/server/entry/http/health.test.ts": 'import { health } from "../../../../packages/server/src/entry/http/health.ts";\nexport const t = health();\n',
  [SIGHTED_INFERENCE]: "export const live = 1;\n",
  [SIGHTED_INFERENCE_TEST]: 'import { live } from "../../../packages/inference/src/extensions/live.ts";\nexport const t = live;\n',
  [SIGHTED_CLIENT]: "export const useThing = () => 1;\n",
  [SIGHTED_CLIENT_TEST]: 'import { useThing } from "../../../packages/client/src/data/use-thing.ts";\nexport const t = useThing();\n',
  [SIGHTED_UI]: "export function build(): number {\n  return 1;\n}\n",
  [SIGHTED_UI_TEST]: 'import { build } from "../../../packages/ui/src/markdown/policy.ts";\nexport const t = build();\n',
};

const COMPOSED_START = "packages/server/src/domain/chat/verbs/start-chat.ts";
const COMPOSED_END = "packages/server/src/domain/chat/verbs/end-chat.ts";
const COMPOSED = {
  ...TOOLING_PAIR,
  [COMPOSED_START]: "export const start = () => 1;",
  [COMPOSED_END]: "export const end = () => 2;",
  "packages/server/src/entry/compose/services.ts":
    'import { start } from "../../domain/chat/verbs/start-chat.ts"; import { end } from "../../domain/chat/verbs/end-chat.ts"; export const createServices = () => ({ start, end });',
  "packages/server/src/entry/compose/index.ts": 'export { createServices } from "./services.ts";',
  "tests/support/node/server.ts":
    'import { createServices } from "../../../packages/server/src/entry/compose/index.ts"; export const root = () => createServices();',
};
const COMPOSED_USE = 'import { root } from "../../../support/node/server.ts"; export const used = root().start();';

export const gate = defineGate({
  id: "test-reach",
  family: "mirror-index",
  authority: "reviewed-grant",
  severity: "error",
  population: ["@server", "@contracts", "@inference", "@client", "@ui", "@tests"],
  // `resource` keeps the checker (alias resolution through barrels) and admits the mirror-index declarations.
  analysis: "resource",
  // Reach is a whole-graph relation: a changed test can drop a module no selected file names.
  execution: "entire-population",
  facts: [],
  resources: [
    { kind: "mirror-index", id: "package-test" },
    { kind: "mirror-index", id: "tooling-test" },
  ],
  message: `a presence-gated module is reached by no test of the kind its surface owes ${LAW}.`,
  fix: REACH_FIX,
  create: (ctx) => ({
    evaluate: () => {
      const packages = readyResourceValue(ctx.resources.mirrorIndex("package-test"));
      const tooling = readyResourceValue(ctx.resources.mirrorIndex("tooling-test"));
      const census: Census = { domainLogic: 0, tierLogic: 0 };
      const demands = collectDemands(ctx, census);
      const reach = testReach({
        // Mirror resources retain the legacy regression inventory, not strict reach evidence.
        files: ctx.files.filter((file) => !isLegacyTestPath(ctx.relativePath(file))),
        relativePath: ctx.relativePath,
        checker: ctx.checker(),
        isSubject: (path) => demands.modules.has(path),
        calls: demands.actions,
      });
      const declared = declaredFamilies(ctx, reach.declared, [packages, tooling]);
      if (!ctx.subset && packages.sourceFiles.has(REAL_TREE_ANCHOR)) {
        const blind = blindness(census, demands, reach.references);
        if (blind !== undefined) {
          throw new Error(blind);
        }
      }
      const unreached = reportUnreached(ctx, demands.modules, reach.reachedBy, declared) + reportUncalled(ctx, demands.actions, reach.calledBy);
      ctx.receipt({
        kind: "population",
        source: `test-reach [demanded=${String(demands.modules.size)},unreached=${String(unreached)},tests=${String(reach.tests)},references=${String(reach.references)}]`,
        members: ctx.files.length,
        unresolved: 0,
      });
    },
  }),
  mustFlag: [
    {
      mode: "resource",
      files: { ...COMPOSED, "tests/server/domain/chat/composed.int.test.ts": `// @subject ${COMPOSED_START}\n${COMPOSED_USE}` },
      expect: { count: 1, messageIncludes: "verb is reached by no unit or integration test" },
      grant: { subject: COMPOSED_END, operation: "unreached:verb" },
      why: "the exercised public-root verb earns its explicit subject credit, not the undriven sibling imported by the composed graph",
    },
    {
      mode: "resource",
      files: { ...COMPOSED, "tests/server/domain/chat/composed.int.test.ts": COMPOSED_USE },
      expect: { count: 2, messageIncludes: "verb is reached by no unit or integration test" },
      why: "without an explicit exercised subject, importing the root does not magically credit either child verb",
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/domain/chat/verbs/start-chat.ts": "export const createStartChat = (): number => 1;\n",
        "tests/server/domain/chat/verbs/start-chat.test.ts": "export {};\n",
        "tooling/src/snapx/cli.ts": "export {};\n",
        "tests/tooling/snapx/cli.test.ts": "export {};\n",
      },
      expect: {
        count: 1,
        messageIncludes: "verb is reached by no unit or integration test",
      },
      grant: {
        subject: "packages/server/src/domain/chat/verbs/start-chat.ts",
        operation: "unreached:verb",
      },
      why: "THE PLANTED UNREACHED VERB, and the `export {}` file at the old mirror path: under the file mirror this passed; a file at a computed path is not reach",
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/domain/chat/verbs/start-chat.ts":
          "export const createStartChat = (): number => 1;\nexport interface StartChat { readonly id: string }\n",
        "tests/server/domain/chat/verbs/start-chat.test.ts":
          'import type { StartChat } from "../../../../../packages/server/src/domain/chat/verbs/start-chat.ts";\nexport const shape: StartChat = { id: "a" };\n',
        "tooling/src/snapx/cli.ts": "export {};\n",
        "tests/tooling/snapx/cli.test.ts": "export {};\n",
      },
      expect: {
        count: 1,
        messageIncludes: "verb is reached",
      },
      why: "A TYPE IMPORT IS NOT REACH: the test names the verb module's interface and never touches a value export. Counting type-only specifiers reds this row",
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/domain/chat/verbs/start-chat.ts": "export const createStartChat = (): number => 1;\n",
        "packages/server/src/domain/chat/verbs/end-chat.ts": "export const createEndChat = (): number => 2;\n",
        "packages/server/src/domain/chat/index.ts":
          'export { createStartChat } from "./verbs/start-chat.ts";\nexport { createEndChat } from "./verbs/end-chat.ts";\n',
        "tests/server/domain/chat/ending.test.ts":
          'import { createEndChat } from "../../../../packages/server/src/domain/chat/index.ts";\nexport const ended = createEndChat();\n',
        "tooling/src/snapx/cli.ts": "export {};\n",
        "tests/tooling/snapx/cli.test.ts": "export {};\n",
      },
      expect: {
        count: 1,
        messageIncludes: "verb is reached",
      },
      why: "BARREL CLOSURE IS SYMBOL-PRECISE: the test imports the feature barrel and uses `createEndChat`, so `end-chat.ts` is reached and `start-chat.ts`, re-exported by the same barrel but never named, is not",
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/domain/chat/persistence/record.ts": "export const record = (): number => 1;\n",
        "tests/server/domain/chat/persistence/record.test.ts":
          'import { record } from "../../../../../packages/server/src/domain/chat/persistence/record.ts";\nexport const r = record();\n',
        "tooling/src/snapx/cli.ts": "export {};\n",
        "tests/tooling/snapx/cli.test.ts": "export {};\n",
      },
      expect: {
        count: 1,
        messageIncludes: "persistence module is reached by no integration test",
      },
      why: "THE FAMILY RULE: a persistence module reached only by a unit test still owes an integration test",
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/domain/chat/contract/schema.ts": "export const S = z.object({});\n",
        "tests/server/domain/chat/contract/schema.test.ts":
          'import { S } from "../../../../../packages/server/src/domain/chat/contract/schema.ts";\nexport const s = S;\n',
        "tooling/src/snapx/cli.ts": "export {};\n",
        "tests/tooling/snapx/cli.test.ts": "export {};\n",
      },
      expect: {
        count: 1,
        messageIncludes: "domain contract schema is reached by no contract test",
      },
      why: "a domain contract schema reached only by a unit test owes a contract test",
    },
    {
      mode: "resource",
      files: {
        "packages/contracts/src/chat/index.ts": "export const S = z.object({});\n",
        "tests/contracts/chat/other.contract.test.ts": "export {};\n",
        "tooling/src/snapx/cli.ts": "export {};\n",
        "tests/tooling/snapx/cli.test.ts": "export {};\n",
      },
      expect: {
        count: 1,
        messageIncludes: "shared contract schema is reached by no contract test",
      },
      why: "a shared contracts `index.ts` carries schemas and is demanded; it is not a server barrel",
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/domain/chat/verbs/start-chat.ts": "export const createStartChat = (): number => 1;\n",
        "tests/server/domain/chat/verbs/starting.test.ts": "// @subject packages/server/src/domain/chat/verbs/gone.ts\nexport {};\n",
        "tooling/src/snapx/cli.ts": "export {};\n",
        "tests/tooling/snapx/cli.test.ts": "export {};\n",
      },
      expect: {
        count: 2,
        messageIncludes: "names no source module",
      },
      why: "A STALE @subject HEADER: the named module does not exist, so the header is a finding and does not excuse the verb either",
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/transport/trpc/routers/chat.ts":
          "export const chatRouter = router({\n  send: authedProcedure.mutation(({ ctx }) => ctx.services.chat.send()),\n});\n",
        "tests/server/transport/trpc/routers/other.test.ts": "export {};\n",
        "tooling/src/snapx/cli.ts": "export {};\n",
        "tests/tooling/snapx/cli.test.ts": "export {};\n",
      },
      expect: {
        count: 1,
        messageIncludes: "tRPC router is reached by no unit or integration test",
      },
      why: "A ROUTER IS DEMANDED: a `router({...})` binding has no callable export, so the file-mirror policy exempted every router shell; reach demands one",
    },
    {
      mode: "resource",
      files: {
        "packages/inference/src/extensions/normalize.ts": "export const normalize = buildNormalizer();\n",
        "tests/inference/other.test.ts": "export {};\n",
        "tooling/src/snapx/cli.ts": "export {};\n",
        "tests/tooling/snapx/cli.test.ts": "export {};\n",
      },
      expect: {
        count: 1,
        messageIncludes: "inference runtime module is reached by no runtime test",
      },
      why: "an exported call initializer is inference runtime behaviour even though it is not function syntax",
    },
    {
      mode: "resource",
      files: {
        "packages/inference/src/extensions/normalize.ts": "const { live } = buildNormalizer();\nexport { live };\n",
        "tests/inference/other.test.ts": "export {};\n",
        "tooling/src/snapx/cli.ts": "export {};\n",
        "tests/tooling/snapx/cli.test.ts": "export {};\n",
      },
      expect: {
        count: 1,
        messageIncludes: "inference runtime module",
      },
      why: "a destructured local export resolves to its emitted variable, so it is runtime and not a barrel",
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/domain/workloads/runners/regrown.ts":
          "// It used to return { deferred: true } and now does the real pass.\nexport const run = (ctx: { env: { x: number } }) => ctx.env.x;\n",
        "tests/server/domain/workloads/runners/other.test.ts": "export {};\n",
        "tooling/src/snapx/cli.ts": "export {};\n",
        "tests/tooling/snapx/cli.test.ts": "export {};\n",
      },
      expect: {
        count: 1,
        messageIncludes: "workloads runner with real logic",
      },
      why: "COMMENT POSTURE: a runner whose comment quotes `deferred: true` is not a D58 stub; the code touches its env",
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/domain/workloads/runners/half-filled.ts":
          "export const run = (ctx: { env: { x: number } }) => {\n  const n = ctx.env.x;\n  return { deferred: true, n };\n};\n",
        "tests/server/domain/workloads/runners/other.test.ts": "export {};\n",
        "tooling/src/snapx/cli.ts": "export {};\n",
        "tests/tooling/snapx/cli.test.ts": "export {};\n",
      },
      expect: {
        count: 1,
        messageIncludes: "workloads runner with real logic",
      },
      why: "THE `!ctx.env` HALF of the stub exemption: a runner that still returns `deferred: true` but touches its env is being filled in",
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/domain/chat/substrate/decides-access.ts":
          "export function shapeVia(ctx: Ctx, speaker: Speaker): Shaped {\n  return speaker.narrator ? shapeAll(ctx) : shapeOne(ctx, speaker);\n}\n",
        "tests/server/domain/chat/substrate/other.test.ts": "export {};\n",
        "tooling/src/snapx/cli.ts": "export {};\n",
        "tests/tooling/snapx/cli.test.ts": "export {};\n",
      },
      expect: {
        count: 1,
        messageIncludes: "domain module with runtime logic",
      },
      why: "THE PASS-THROUGH EXEMPTION'S PERMISSIVE EDGE: a one-expression body that decides is not a forwarder",
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/domain/tag/registry/service.ts":
          "export function createRegistryService(ctx: { db: number }) {\n  const db = ctx.db;\n  return { db, ready: db > 0 };\n}\n",
        "tests/server/domain/tag/registry/other.test.ts": "export {};\n",
        "tooling/src/snapx/cli.ts": "export {};\n",
        "tests/tooling/snapx/cli.test.ts": "export {};\n",
      },
      expect: {
        count: 1,
        messageIncludes: "domain module with runtime logic",
      },
      why: "THE FEATURE-ROOT DEPTH: `service.ts` one level below the feature root is not the composition root",
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/domain/tag/contract/holder.ts": "export class TagHolder extends DomainBase {\n  read(): number {\n    return 1;\n  }\n}\n",
        "tests/server/domain/tag/contract/other.test.ts": "export {};\n",
        "tooling/src/snapx/cli.ts": "export {};\n",
        "tests/tooling/snapx/cli.test.ts": "export {};\n",
      },
      expect: {
        count: 1,
        messageIncludes: "domain module with runtime logic",
      },
      why: "THE `extends *Error` TEST: a contract class with an ordinary base carries methods and is demanded",
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/domain/tag/substrate/engine.ts": "export class TagEngine {\n  run(rows: number[]): number {\n    return rows.length;\n  }\n}\n",
        "tests/server/domain/tag/substrate/other.test.ts": "export {};\n",
        "tooling/src/snapx/cli.ts": "export {};\n",
        "tests/tooling/snapx/cli.test.ts": "export {};\n",
      },
      expect: {
        count: 1,
        messageIncludes: "domain module with runtime logic",
      },
      why: "THE EXPORTED-CLASS ARM: a class-only subsystem is runtime logic",
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/domain/chat/substrate/limits.ts":
          "export const limitsSchema = z.object({});\nexport function clampLimit(n: number): number {\n  const next = n + 1;\n  return next;\n}\n",
        "tests/server/domain/chat/substrate/other.test.ts": "export {};\n",
        "tooling/src/snapx/cli.ts": "export {};\n",
        "tests/tooling/snapx/cli.test.ts": "export {};\n",
      },
      expect: {
        count: 1,
        messageIncludes: "domain module with runtime logic",
      },
      why: "THE `/contract/` FENCE: the schema exemption belongs to the contract slot, not to any file that mentions a zod builder",
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/entry/compose/gate.ts":
          "export const decide = (deps: Deps, req: Req): Verdict => (req.anonymous ? deps.publicBucket(req.ip) : deps.authedBucket(req.userId));\n",
        "tests/server/entry/compose/other.test.ts": "export {};\n",
        "tooling/src/snapx/cli.ts": "export {};\n",
        "tests/tooling/snapx/cli.test.ts": "export {};\n",
      },
      expect: {
        count: 1,
        messageIncludes: "entry/transport module with runtime logic",
      },
      why: "THE TIER PASS-THROUGH'S PERMISSIVE EDGE: a ternary decides, so it stays demanded",
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/infra/providers/env-firewall.ts": "export function firewall(): void {}\n",
        "tests/server/infra/other.test.ts": "export {};\n",
        "tooling/src/snapx/cli.ts": "export {};\n",
        "tests/tooling/snapx/cli.test.ts": "export {};\n",
      },
      expect: {
        count: 1,
        messageIncludes: "infra/foundation module with runtime logic",
      },
      why: "an infra module with a callable export",
    },
    {
      mode: "resource",
      files: {
        ...TOOLING_PAIR,
        "packages/client/src/forms/editor/validate.ts": "export function validate(): boolean {\n  return true;\n}\n",
        "tests/client/forms/editor/validate.dom.test-d.ts":
          'import { validate } from "../../../../packages/client/src/forms/editor/validate.ts";\nexport type Result = ReturnType<typeof validate>;\n',
      },
      expect: { count: 1, messageIncludes: "client data/forms/state module is reached by no unit or component test" },
      why: "a type test cannot substitute for runtime behavior coverage, even when it imports the module by value and its browser world is registered",
    },
    {
      mode: "resource",
      files: {
        ...TOOLING_PAIR,
        "packages/client/src/forms/editor/focus.ts": "export function focusInvalid(): void {}\n",
        "tests/client/forms/editor/focus.ct.tsx": "export {};\n",
      },
      expect: { count: 1, messageIncludes: "client data/forms/state module is reached by no unit or component test" },
      why: "a component test at the module's mirror path that never imports it proves nothing: the file name is not reach",
    },
    {
      mode: "resource",
      files: {
        ...TOOLING_PAIR,
        "packages/client/src/data/use-thing.ts": "export const useThing = () => 1;\n",
        "tests/client/data/other.test.ts": "export const t = 1;\n",
      },
      expect: { count: 1, messageIncludes: "client data/forms/state module is reached by no unit or component test" },
      why: "a logic-bearing client data hook that no test imports is an untested surface (§5); a sibling test in the same directory is not reach",
    },
    {
      mode: "resource",
      files: {
        ...TOOLING_PAIR,
        "packages/client/src/data/use-thing.tsx": "export const useThing = () => 1;\n",
        "tests/client/data/use-thing.test.ts": 'import { useThing } from "../../../packages/client/src/data/use-thing.tsx";\nexport const t = useThing();\n',
      },
      expect: { count: 1, messageIncludes: "client data/forms/state module is reached by no unit or component test" },
      why: "THE SOURCE-EXTENSION JUDGEMENT: a `.test.ts` kind holds `.ts` sources only (test-kinds.ts `sourceExtensions`), so a node-world test that imports a `.tsx` module has not reached it as that kind",
    },
    {
      mode: "resource",
      files: {
        ...TOOLING_PAIR,
        "packages/ui/src/markdown/policy.ts": "export function build(): number {\n  return 1;\n}\n",
        "tests/ui/markdown/other.ct.tsx": "export {};\n",
      },
      expect: { count: 1, messageIncludes: "non-primitive @orb/ui logic module is reached by no unit or component test" },
      why: "a ui logic module is judged by reach, not by a test sitting in its mirror directory",
    },
    {
      mode: "resource",
      files: {
        ...TOOLING_PAIR,
        "packages/ui/src/markdown/policy.ts": "export function build(): number {\n  return 1;\n}\n",
        "tests/ui/markdown/markdown.test-d.ts":
          'import { build } from "../../../packages/ui/src/markdown/policy.ts";\nexport type Built = ReturnType<typeof build>;\n',
      },
      expect: { count: 1, messageIncludes: "non-primitive @orb/ui logic module is reached by no unit or component test" },
      why: "a type test proves types, never that the group runs, so it does not satisfy a ui logic module",
    },
    {
      mode: "resource",
      files: {
        ...TOOLING_PAIR,
        "packages/client/src/state/gpresclient-store.ts": storeSource("g-presclient", "gPresClientAction"),
        "tests/client/state/gpresclient-store.ct.tsx":
          'import { gPresClientAction, useGPresClientAction } from "../../../packages/client/src/state/gpresclient-store.ts";\nexport const t = [gPresClientAction, useGPresClientAction];\n',
      },
      expect: { count: 1, messageIncludes: "store action `gPresClientAction` is called by no unit or component test" },
      why: "the test imports the action and never calls it. Reaching the store module is not driving a new action",
    },
    {
      mode: "resource",
      files: {
        ...TOOLING_PAIR,
        "packages/client/src/state/gprescomment-store.ts": storeSource("g-prescomment", "gPresCommentAction"),
        "tests/client/state/gprescomment-store.ct.tsx":
          'import { gPresCommentAction, useGPresCommentAction } from "../../../packages/client/src/state/gprescomment-store.ts";\n// TODO drive it: gPresCommentAction();\nexport const t = useGPresCommentAction;\nexport const u = gPresCommentAction;\n',
      },
      expect: { count: 1, messageIncludes: "gPresCommentAction" },
      why: "COMMENT POSTURE: a commented-out call is not a call, the founding `referenced by ZERO test` defect wearing a `//`",
    },
    {
      mode: "resource",
      files: {
        ...TOOLING_PAIR,
        "packages/client/src/state/gpresstrlit-store.ts": storeSource("g-presstrlit", "gPresStrLitAction"),
        "tests/client/state/gpresstrlit-store.test.ts":
          'import { gPresStrLitAction, useGPresStrLitAction } from "../../../packages/client/src/state/gpresstrlit-store.ts";\nexport const label = "calls gPresStrLitAction( when the panel opens";\nexport const t = [useGPresStrLitAction, gPresStrLitAction];\n',
      },
      expect: { count: 1, messageIncludes: "gPresStrLitAction" },
      why: "STRING POSTURE: an action name spelled inside a string literal is not a call, the same defect wearing quotes",
    },
    {
      mode: "resource",
      files: {
        ...TOOLING_PAIR,
        "packages/server/src/domain/chat/verbs/start-chat.ts": "export const createStartChat = (): number => 1;\n",
        "packages/server/src/domain/chat/index.ts": 'export { createStartChat } from "./verbs/start-chat.ts";\n',
        "tests/server/domain/chat/starting.test.ts":
          'import { vi } from "vitest";\nimport { createStartChat } from "../../../../packages/server/src/domain/chat/index.ts";\nvi.mock("../../../../packages/server/src/domain/chat/verbs/start-chat.ts", () => ({ createStartChat: () => 0 }));\nexport const made = createStartChat();\n',
      },
      expect: { count: 1, messageIncludes: "verb is reached by no unit or integration test" },
      why: "A MOCK THROUGH A FEATURE BARREL: the import names the barrel, but the binding resolves to the verb the same file replaces, so it is a fake and not reach",
    },
    {
      mode: "resource",
      files: {
        ...TOOLING_PAIR,
        "packages/server/src/domain/chat/verbs/start-chat.ts": "export const createStartChat = (): number => 1;\n",
        "tests/server/domain/chat/verbs/starting.test.ts":
          'import { vi } from "vitest";\nimport { createStartChat } from "../../../../../packages/server/src/domain/chat/verbs/start-chat.ts";\nconst TARGET = "../../../../../packages/server/src/domain/chat/verbs/start-chat.ts";\nvi.mock(TARGET, () => ({ createStartChat: () => 0 }));\nexport const made = createStartChat();\n',
      },
      expect: { count: 1, messageIncludes: "verb is reached by no unit or integration test" },
      why: "A MOCK THROUGH A CONST SPECIFIER: `vi.mock` names the module by a const string, which resolves to the module the file imports",
    },
  ],
  mustRefuse: [
    {
      mode: "resource",
      files: without(SIGHTED, SIGHTED_INFERENCE, SIGHTED_INFERENCE_TEST),
      expect: { messageIncludes: "the inference scan matched ZERO" },
      why: "BLINDNESS TRIPWIRE: on the real tree an empty inference population is a scan that never ran, not a clean corpus",
    },
    {
      mode: "resource",
      files: without(SIGHTED, SIGHTED_CLIENT, SIGHTED_CLIENT_TEST),
      expect: { messageIncludes: "the client scan matched ZERO" },
      why: "BLINDNESS TRIPWIRE: the client data/forms/state demand was keyed on a tree that no longer holds a seal",
    },
    {
      mode: "resource",
      files: without(SIGHTED, SIGHTED_UI, SIGHTED_UI_TEST),
      expect: { messageIncludes: "the ui scan matched ZERO" },
      why: "BLINDNESS TRIPWIRE: the non-primitive ui logic demand was keyed on groups that no longer hold a module",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: {
        ...COMPOSED,
        "tests/server/domain/chat/composed.int.test.ts": `// @subject ${COMPOSED_START}\n${COMPOSED_USE}`,
        "tests/server/domain/chat/ending.int.test.ts": `// @subject ${COMPOSED_END}\nimport { root } from "../../../support/node/server.ts"; export const used = root().end();`,
      },
      why: "both behaviors are explicitly driven through the same root, with no automatic whole-graph credit",
    },
    {
      mode: "resource",
      files: SIGHTED,
      why: "THE SIGHTED TWIN of the three tripwire rows: every scan finds a module and every module is reached, so the same substrate passes",
    },
    {
      mode: "resource",
      files: {
        ...TOOLING_PAIR,
        "packages/client/src/forms/editor/validate.ts": "export function validate(): boolean {\n  return true;\n}\n",
        "tests/client/forms/editor/validate.dom.test.ts":
          'import { validate } from "../../../../packages/client/src/forms/editor/validate.ts";\nexport const t = validate();\n',
        "packages/client/src/data/use-thing.tsx": "export const useThing = () => 1;\n",
        "tests/client/data/use-thing.dom.test.ts":
          'import { useThing } from "../../../packages/client/src/data/use-thing.tsx";\nexport const t = useThing();\n',
      },
      why: "registered DOM runtime tests reach their modules, and a `.dom.test.ts` kind holds `.tsx` sources",
    },
    {
      mode: "resource",
      files: {
        ...TOOLING_PAIR,
        "packages/client/src/forms/editor/focus.ts": "export function focusInvalid(): void {}\n",
        "tests/client/forms/editor/focus.ct.tsx":
          'import { focusInvalid } from "../../../../packages/client/src/forms/editor/focus.ts";\nexport const t = focusInvalid();\n',
      },
      why: "an editor-owned callable reached by a component test passes",
    },
    {
      mode: "resource",
      files: {
        ...TOOLING_PAIR,
        "packages/client/src/data/constants.ts": "export const X = 1;\n",
        "tests/client/data/other.test.ts": "export const t = 1;\n",
      },
      why: "a file with NO callable export (plain value) is not a logic surface — passes. THE CALLABLE NARROWING: replacing `hasCallableExport` with `true` reds this row",
    },
    {
      mode: "resource",
      files: {
        ...TOOLING_PAIR,
        "packages/client/src/data/bus/apply-chat-bus-event.ts": "export function build(): number {\n  return 1;\n}\n",
        "packages/client/src/forms/editor/bound-fields/text-field.tsx": "export function build(): number {\n  return 1;\n}\n",
        "tests/client/data/other.test.ts": "export const t = 1;\n",
      },
      why: "a nested bucket (data/bus, forms/editor/bound-fields) is not a DIRECT child of any client owner, so it keeps its shared CT home. THE DIRECT-CHILD FENCE: dropping the no-slash test reds this row with two findings",
    },
    {
      mode: "resource",
      files: {
        ...TOOLING_PAIR,
        "packages/ui/src/markdown/policy.ts": "export function build(): number {\n  return 1;\n}\n",
        "packages/ui/src/markdown/to-plain-text.ts": "export function plain(): number {\n  return 2;\n}\n",
        "tests/ui/markdown/markdown.ct.tsx":
          'import { build } from "../../../packages/ui/src/markdown/policy.ts";\nimport { plain } from "../../../packages/ui/src/markdown/to-plain-text.ts";\nexport const t = [build(), plain()];\n',
      },
      why: "one component test that imports and uses both ui logic modules reaches both, whatever its basename",
    },
    {
      mode: "resource",
      files: {
        ...TOOLING_PAIR,
        "packages/client/src/data/trpc.ts": "export const createTrpcClient = () => 1;\n",
        "tests/client/data/trpc.test.ts":
          'import { createTrpcClient } from "../../../packages/client/src/data/trpc.ts";\nexport const t = createTrpcClient();\n',
      },
      why: "`data/trpc.ts` is an ordinary direct child of the `data/` home with no exclusion: it passes because a test imports and uses it",
    },
    {
      mode: "resource",
      files: {
        ...TOOLING_PAIR,
        "packages/ui/src/primitives/button/button.tsx": "export function build(): number {\n  return 1;\n}\n",
        "tests/ui/markdown/markdown.ct.tsx": "export {};\n",
      },
      why: "DECLARED LIMIT — bare primitives/ are covered by ui-primitive-structure's CT clause, not demanded here. THE `UI_LOGIC_GROUPS` NARROWING: replacing the prefix test with `true` reds this row",
    },
    {
      mode: "resource",
      files: {
        ...TOOLING_PAIR,
        "packages/client/src/state/gpresclientok-store.ts": storeSource("g-presclientok", "gPresClientOkAction"),
        "tests/client/state/gpresclientok-store.ct.tsx":
          'import { gPresClientOkAction } from "../../../packages/client/src/state/gpresclientok-store.ts";\ngPresClientOkAction();\nexport const t = 1;\n',
      },
      why: "the test imports the action and calls it — covered, passes",
    },
    {
      mode: "resource",
      files: {
        ...TOOLING_PAIR,
        "packages/client/src/state/gprestories-store.ts": storeSource("g-prestories", "gPresStoriesAction"),
        "tests/client/state/_ct-stories.tsx":
          'import { gPresStoriesAction } from "../../../packages/client/src/state/gprestories-store.ts";\nexport const Story = (): null => {\n  gPresStoriesAction();\n  return null;\n};\n',
        "tests/client/state/gprestories-store.ct.tsx": 'import { Story } from "./_ct-stories.tsx";\nexport const t = Story;\n',
      },
      why: "THE STORY MODULE (Spine-Testing §7 — a CT only mounts from a non-test module): the action is called in the story module a CT imports and nowhere in the CT itself, and that IS coverage",
    },
    {
      mode: "resource",
      files: {
        ...TOOLING_PAIR,
        "packages/client/src/state/gprestpl-store.ts": storeSource("g-prestpl", "gPresTplAction"),
        "tests/client/state/gprestpl-store.test.ts":
          'import { gPresTplAction } from "../../../packages/client/src/state/gprestpl-store.ts";\nexport const t = `drove ${gPresTplAction()} write`;\n',
      },
      why: "a real call interpolated inside a template literal is CODE, so it counts",
    },
    {
      mode: "resource",
      files: {
        ...TOOLING_PAIR,
        "packages/client/src/state/purehandle.ts": 'export function gPureBuild(): { kind: "x" } {\n  return { kind: "x" };\n}\n',
        "tests/client/state/purehandle.ct.tsx":
          'import { gPureBuild } from "../../../packages/client/src/state/purehandle.ts";\nexport const t = gPureBuild;\n',
      },
      why: "no store-factory call in the file — not a store, so no action is demanded. THE `isStoreFile` NARROWING: replacing it with `true` demands `gPureBuild` be called and reds this row",
    },
    {
      mode: "resource",
      files: {
        ...TOOLING_PAIR,
        "packages/client/src/state/gprescomm-store.ts":
          "// This module is the one that documents the door: createGatedStore(…) is called by the STORES,\n" +
          "// never by this file.\n" +
          "export function gPresCommDoc(): number {\n  return 1;\n}\n",
        "tests/client/state/gprescomm-store.test.ts":
          'import { gPresCommDoc } from "../../../packages/client/src/state/gprescomm-store.ts";\nexport const t = gPresCommDoc;\n',
      },
      why: "COMMENT POSTURE, the FALSE-POSITIVE direction: a `state/*.ts` whose COMMENT names a factory door mints no store, so demanding a call of its actions would be an invented finding. `isStoreFile` reads CODE",
    },
    {
      mode: "resource",
      files: {
        ...TOOLING_PAIR,
        "packages/client/src/data/index.ts": "export const build = () => 1;\n",
      },
      why: "a client barrel is a re-export surface, not a composed seal, and is never demanded — dropping the barrel fence reds this row",
    },
    {
      mode: "resource",
      files: {
        ...TOOLING_PAIR,
        "packages/client/src/state/gprestypeargs-store.ts":
          'import { createGatedStore } from "./create-gated-store";\nconst useX = createGatedStore<{ n: number }>("g-prestypeargs", () => ({ n: 0 }));\nexport function gPresTypeArgsAction<T>(value: T): T {\n  useX.setState({ n: 1 }, false, "x/set");\n  return value;\n}\n',
        "tests/client/state/gprestypeargs-store.test.ts":
          'import { gPresTypeArgsAction } from "../../../packages/client/src/state/gprestypeargs-store.ts";\nexport const t = gPresTypeArgsAction<number>(1);\n',
      },
      why: "a generic action is driven as `NAME<T>(…)`; a call with explicit type arguments is still a call",
    },
    {
      mode: "resource",
      files: {
        ...TOOLING_PAIR,
        "packages/client/src/state/gpresconsthook-store.ts":
          'import { createGatedStore } from "./create-gated-store";\nconst useX = createGatedStore<{ n: number }>("g-presconsthook", () => ({ n: 0 }));\nexport const useGPresConstHook = (): number => useX((s) => s.n);\nexport function gPresConstHookAction(): void {\n  useX.setState({ n: 1 }, false, "x/set");\n}\n',
        "tests/client/state/gpresconsthook-store.test.ts":
          'import { gPresConstHookAction } from "../../../packages/client/src/state/gpresconsthook-store.ts";\ngPresConstHookAction();\nexport const t = 1;\n',
      },
      why: "THE `use*` EXCLUSION ON THE CONST ARM: a read-hook is a selector, not a write, so no test is asked to call it. The hook here is an exported arrow, which the function-declaration arm does not reach",
    },
    {
      mode: "resource",
      files: {
        ...TOOLING_PAIR,
        "packages/server/src/domain/chat/verbs/start-chat.ts": "export const createStartChat = (): number => 1;\n",
        "packages/server/src/domain/chat/verbs/end-chat.ts": "export const createEndChat = (): number => 2;\n",
        "packages/server/src/domain/chat/index.ts":
          'export { createStartChat } from "./verbs/start-chat.ts";\nexport { createEndChat } from "./verbs/end-chat.ts";\n',
        "tests/server/domain/chat/starting.test.ts":
          'import { vi } from "vitest";\nimport { createStartChat } from "../../../../packages/server/src/domain/chat/index.ts";\nimport { createEndChat } from "../../../../packages/server/src/domain/chat/verbs/end-chat.ts";\nconst OTHER = "../../../../packages/server/src/domain/chat/verbs/end-chat.ts";\nvi.mock(OTHER, () => ({ createEndChat: () => 0 }));\nexport const made = [createStartChat(), createEndChat];\n',
        "tests/server/domain/chat/ending.test.ts":
          'import { vi } from "vitest";\nimport { createEndChat } from "../../../../packages/server/src/domain/chat/index.ts";\nvi.mock("../../../../packages/server/src/domain/chat/verbs/start-chat.ts", () => ({ createStartChat: () => 0 }));\nexport const ended = createEndChat();\n',
      },
      why: "THE CONTROLS for both mock-resolution plants: mocking a DIFFERENT module (by const specifier, by literal) leaves a barrel-imported binding real, so `start-chat.ts` and `end-chat.ts` are both reached",
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/domain/chat/verbs/start-chat.ts": "export const createStartChat = (): number => 1;\n",
        "tests/server/domain/chat/verbs/starting-a-chat.test.ts":
          'import { createStartChat } from "../../../../../packages/server/src/domain/chat/verbs/start-chat.ts";\nexport const made = createStartChat();\n',
        "tooling/src/snapx/cli.ts": "export {};\n",
        "tests/tooling/snapx/cli.test.ts": "export {};\n",
      },
      why: "a behaviour-named test that imports the verb and calls its export reaches it",
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/domain/chat/verbs/start-chat.ts": "export const createStartChat = (): number => 1;\n",
        "tests/server/domain/chat/verbs/starting-a-chat.int.test.ts":
          "// Proves chat start through the composed service.\n// @subject packages/server/src/domain/chat/verbs/start-chat.ts\nexport {};\n",
        "tooling/src/snapx/cli.ts": "export {};\n",
        "tests/tooling/snapx/cli.test.ts": "export {};\n",
      },
      why: "AN @subject HEADER IS PRESENCE: the test names the verb it proves through the composition root, so the reach rule accepts it without an import edge",
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/domain/chat/verbs/start-chat.ts": "export const createStartChat = (): number => 1;\n",
        "tests/server/domain/chat/_support.ts":
          'import { createStartChat } from "../../../../packages/server/src/domain/chat/verbs/start-chat.ts";\nexport const harness = { start: createStartChat };\n',
        "tests/server/domain/chat/verbs/starting.int.test.ts": 'import { harness } from "../_support.ts";\nexport const started = harness.start();\n',
        "tooling/src/snapx/cli.ts": "export {};\n",
        "tests/tooling/snapx/cli.test.ts": "export {};\n",
      },
      why: "REACH THROUGH A TEST-TREE HELPER: the test imports a harness that names the verb. The story-module path for a CT is the same walk",
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/domain/chat/verbs/start-chat.ts": "export const createStartChat = (): number => 1;\n",
        "packages/server/src/domain/chat/index.ts": 'export { createStartChat } from "./verbs/start-chat.ts";\n',
        "tests/server/domain/chat/starting.test.ts":
          'import { createStartChat } from "../../../../packages/server/src/domain/chat/index.ts";\nexport const made = createStartChat();\n',
        "tooling/src/snapx/cli.ts": "export {};\n",
        "tests/tooling/snapx/cli.test.ts": "export {};\n",
      },
      why: "BARREL CLOSURE: an export named through the feature barrel resolves to the verb that declares it",
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/domain/chat/verbs/start-chat.ts": "export const createStartChat = (): number => 1;\n",
        "tests/server/domain/chat/verbs/starting.test.ts":
          'export async function load(): Promise<number> {\n  const { createStartChat } = await import("../../../../../packages/server/src/domain/chat/verbs/start-chat.ts");\n  return createStartChat();\n}\n',
        "tooling/src/snapx/cli.ts": "export {};\n",
        "tests/tooling/snapx/cli.test.ts": "export {};\n",
      },
      why: "A DESTRUCTURED DYNAMIC IMPORT: the specifier is the edge",
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/domain/workloads/runners/stub.ts": "export const run = () => ({ deferred: true });\n",
        "tests/server/domain/workloads/runners/other.test.ts": "export {};\n",
        "tooling/src/snapx/cli.ts": "export {};\n",
        "tests/tooling/snapx/cli.test.ts": "export {};\n",
      },
      why: "DECLARED LIMIT: a D58 no-op stub runner owes nothing until it touches its env",
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/domain/tag/service.ts":
          "export function createTagService(ctx: { db: number }) {\n  const db = ctx.db;\n  return { db, ready: db > 0 };\n}\n",
        "packages/server/src/domain/stats/context.ts":
          "export function createStatsContext(db: number, now: () => number) {\n  const clock = now;\n  return { db, now: clock };\n}\n",
        "tests/server/domain/tag/other.test.ts": "export {};\n",
        "tooling/src/snapx/cli.ts": "export {};\n",
        "tests/tooling/snapx/cli.test.ts": "export {};\n",
      },
      why: "DECLARED LIMIT: the feature-root `service.ts` and `context.ts` are wiring. Two-statement bodies, so the wiring-root exemption is what acquits them",
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/domain/tag/contract/errors.ts": "export class TagNotFoundError extends DomainNotFoundError {}\n",
        "tests/server/domain/tag/other.test.ts": "export {};\n",
        "tooling/src/snapx/cli.ts": "export {};\n",
        "tests/tooling/snapx/cli.test.ts": "export {};\n",
      },
      why: "DECLARED LIMIT: a contract file declaring only error classes",
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/domain/chat/substrate/assembly-access.ts":
          "export function shapeTurn(...args: Parameters<typeof shape>): ReturnType<typeof shape> {\n  return shape(...args);\n}\n",
        "packages/server/src/entry/boot/seed-themes.ts":
          "export async function seedThemes(deps: SeedThemesDeps): Promise<void> {\n  await ensureSeedThemes(deps.db, deps.now);\n}\n",
        "packages/server/src/entry/compose/minter.ts":
          "export function minter<P extends string>(prefix: P): () => TypeIdOf<P> {\n  return (): TypeIdOf<P> => mintTypeId(prefix);\n}\n",
        "packages/server/src/transport/trpc/context.ts":
          "export function createContext(parts: Parts): Context {\n  return { auth: parts.auth, services: parts.services };\n}\n",
        "packages/server/src/entry/http/frame-types.d.ts": "export declare function hostV1(): void;\n",
        "tests/server/domain/chat/other.test.ts": "export {};\n",
        "tooling/src/snapx/cli.ts": "export {};\n",
        "tests/tooling/snapx/cli.test.ts": "export {};\n",
      },
      why: "DECLARED LIMITS: the spread forwarder, the one-call boot step, the curried factory, the DI bundle and a declaration file carry no behaviour of their own",
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/domain/chat/index.ts": 'export * from "./service.ts";\nexport const front = () => 1;\n',
        "tests/server/domain/chat/other.test.ts": "export {};\n",
        "tooling/src/snapx/cli.ts": "export {};\n",
        "tests/tooling/snapx/cli.test.ts": "export {};\n",
      },
      why: "DECLARED LIMIT: a server `index.ts` is a barrel and owes nothing",
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/domain/chat/contract/prose.ts": '// z.object({ id }) is declared in packages/contracts, not here.\nexport const LABEL = "x";\n',
        "tests/server/domain/chat/contract/other.test.ts": "export {};\n",
        "tooling/src/snapx/cli.ts": "export {};\n",
        "tests/tooling/snapx/cli.test.ts": "export {};\n",
      },
      why: "COMMENT POSTURE: a comment that spells `z.object(` declares no schema",
    },
    {
      mode: "resource",
      files: {
        "packages/inference/src/contract/types.ts": "export interface Request { readonly text: string; }\n",
        "packages/inference/src/contract/index.ts": 'export { live } from "../../../kit/src/live.ts";\n',
        "packages/kit/src/live.ts": "export const live = 1;\n",
        "tests/inference/other.test.ts": "export {};\n",
        "tooling/src/snapx/cli.ts": "export {};\n",
        "tests/tooling/snapx/cli.test.ts": "export {};\n",
      },
      why: "DECLARED LIMIT: a pure inference contract and a cross-file re-export emit nothing of their own",
    },
  ],
});
