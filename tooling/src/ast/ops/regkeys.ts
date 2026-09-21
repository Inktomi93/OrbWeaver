// regkeys: registry rows whose KEY LITERAL is dispatched nowhere (informational, owner-ruled).
import type { SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { SourceCorpus } from "../../_shared/ts-workspace.ts";
import type { Flags, Hit, RegistryDef } from "../contract/types.ts";
import { emit, hitOf, narrate } from "../lib/emit.ts";
import { exitToolError, noteUnits, scanCorpus } from "../lib/ledger.ts";
import { isTestPath } from "../lib/root.ts";
import { relPath } from "./swallowed.ts";

refuseDirectInvocation(import.meta.url, "pnpm ast <lens>");

// ── regkeys: registry rows whose KEY LITERAL is dispatched nowhere (INFORMATIONAL — owner-ruled) ───────
// The blind spot every other lens in this file shares: a string-keyed dispatch table is ONE import edge and
// ONE symbol, so `orphans`/`prodonly`/knip all see it as fully alive no matter how many of its ROWS are dead.
// A retired chrome zone, a template id nothing renders, a settings pane no route reaches — each is a live-
// looking row in a live table. This verb asks the only question the symbol layer cannot: does this ROW'S KEY
// get spelled anywhere outside its own table?
//
// IT IS INFORMATIONAL AND NEVER GATES (owner ruling, 2026-08-03). Registry dispatch is legitimately dynamic:
// a key can arrive from the DB, from a URL segment, from a `Object.keys(REGISTRY).map(…)` iteration that
// never names one member, or from a template literal. Every one of those makes a LIVE row look dead here.
// So this is the one lens in the file with NO marker, NO exemption grammar, and NO exit-1 arm — reading it
// costs a minute and acting on it requires reading the call sites. Gating on it would train agents to delete
// live rows; that is why it is `manual`-tier with a HEURISTIC banner and why it never joins `pnpm check`.
//
// WHAT COUNTS AS A REGISTRY (structural, never a hardcoded census — a doc list rots the day a table moves).
// An exported const with at least {@link REGISTRY_ROW_FLOOR} rows AND either a `satisfies`/annotation naming
// `Record<` (the house Record-not-switch dispatch shape) or a SCREAMING_SNAKE name (the repo's table-constant
// convention), in EITHER of the two shapes this repo writes a table in:
//   • KEYED — an object literal; the row key is the property name.
//   • ROW-ARRAY — an array literal of object rows, each carrying a string-literal identity property
//     ({@link REGISTRY_ROW_ID_KEYS}); the row key is that property's value.
// The row-array arm is the DERIVATION-DRIFT fix (lens calibration, owner ruling 2026-08-13): this verb's own
// USAGE example is `pnpm ast regkeys TEMPLATE_DEFS`, and `TEMPLATE_DEFS` — the preset template catalogue,
// `packages/contracts/src/preset/index.ts`, class (a) in the registry census — is an array of `{ id, … }`
// rows, so the example derived ZERO registries and exited 2 while 172 others matched. A lens whose own
// documented example cannot run is a lens nobody trusts.
//
// KEY EXTRACTION READS THROUGH A COMPUTED NAME. `{ ["main_prompt"]: … }` is a legal (and used —
// `MARKER_COPY`, client preset prompt-assembly) spelling of a string key, and taking the name node's TEXT
// yielded the key `["main_prompt"]`, which nothing on earth spells: 100% of that table's rows reported
// undispatched. A computed name wrapping a STRING LITERAL is unwrapped; a computed name wrapping anything
// else (an identifier constant) is NOT a literal key and the row is skipped rather than guessed at.
//
// WHAT COUNTS AS A DISPATCH SITE. Any spelling of the key ANYWHERE else in the workspace: a string literal, a
// property-access name (`x.<key>`), a bare identifier, or a JSX attribute name — collected in ONE syntactic
// pass (no type resolution, which is why this verb is fast). The registry's OWN file is excluded (a table
// naming its own rows proves nothing), and so are test paths (a test enumerating a table is not a product
// consumer — the same rule `testonly` applies to exports).
const REGISTRY_ROW_FLOOR = 3;

const SCREAMING_SNAKE_RE = /^[A-Z][A-Z0-9_]*$/u;

const RECORD_ANNOTATION_RE = /\bRecord\s*</u;

/** How many registries a key's report line names before collapsing (a key can live in several tables). */
const REGKEY_SITES_SHOWN = 3;

/** The `satisfies`/`as`/annotation text attached to a variable declaration — where a `Record<…>` dispatch
 *  shape declares itself. Empty when the const carries no type at all. */
function declaredTypeText(v: Node): string {
  if (!Node.isVariableDeclaration(v)) {
    return "";
  }
  const init = v.getInitializer();
  const satisfiesText = init !== undefined && Node.isSatisfiesExpression(init) ? (init.getTypeNode()?.getText() ?? "") : "";
  return `${v.getTypeNode()?.getText() ?? ""} ${satisfiesText}`;
}

/** Unwrap the `satisfies`/`as const` wrappers a house registry is written with, down to the literal — an
 *  object literal (the KEYED shape) or an array literal (the ROW-ARRAY shape). */
function registryLiteralOf(node: Node | undefined): Node | undefined {
  let cur = node;
  while (cur !== undefined && (Node.isSatisfiesExpression(cur) || Node.isAsExpression(cur) || Node.isParenthesizedExpression(cur))) {
    cur = cur.getExpression();
  }
  return cur !== undefined && (Node.isObjectLiteralExpression(cur) || Node.isArrayLiteralExpression(cur)) ? cur : undefined;
}

/** The property names a ROW-ARRAY registry's row identity can live under, in precedence order. `id` is the
 *  house spelling (`TEMPLATE_DEFS`); a row carrying none of these has no literal key and is skipped. */
const REGISTRY_ROW_ID_KEYS = ["id", "key"] as const;

/** The literal KEY of one row of a KEYED registry — the property name, read through a computed
 *  `["literal"]` wrapper. Undefined when the name is computed from a non-literal (an identifier constant):
 *  there is no key to check, and inventing one from the expression's text is how `["main_prompt"]` happened. */
function keyedRowKey(prop: Node): string | undefined {
  if (!(Node.isPropertyAssignment(prop) || Node.isShorthandPropertyAssignment(prop))) {
    return;
  }
  const nameNode = prop.getNameNode();
  if (Node.isStringLiteral(nameNode)) {
    return nameNode.getLiteralText();
  }
  if (Node.isComputedPropertyName(nameNode)) {
    const inner = nameNode.getExpression();
    return Node.isStringLiteral(inner) ? inner.getLiteralText() : undefined;
  }
  return nameNode.getText();
}

/** The literal KEY of one row of a ROW-ARRAY registry: the row object's `id`/`key` string-literal property. */
function rowArrayRowKey(element: Node): string | undefined {
  if (!Node.isObjectLiteralExpression(element)) {
    return;
  }
  let key: string | undefined;
  for (const idKey of REGISTRY_ROW_ID_KEYS) {
    const prop = element.getProperty(idKey);
    const value = prop !== undefined && Node.isPropertyAssignment(prop) ? prop.getInitializer() : undefined;
    if (key === undefined && value !== undefined && Node.isStringLiteral(value)) {
      key = value.getLiteralText();
    }
  }
  return key;
}

/** Every registry-shaped exported const in the workspace (excluding test paths — a table declared in a test
 *  is a fixture, not a dispatch surface). */
export function collectRegistries(project: SourceCorpus): RegistryDef[] {
  const out: RegistryDef[] = [];
  for (const sf of project.getSourceFiles()) {
    const filePath = sf.getFilePath();
    if (isTestPath(filePath)) {
      continue;
    }
    for (const v of sf.getVariableDeclarations()) {
      const def = registryDefOf(v, filePath);
      if (def !== undefined) {
        out.push(def);
      }
    }
  }
  return out;
}

/** ONE variable declaration as a RegistryDef, or undefined when it is not registry-shaped. */
function registryDefOf(v: Node, filePath: string): RegistryDef | undefined {
  if (!Node.isVariableDeclaration(v)) {
    return;
  }
  if (!v.isExported()) {
    return;
  }
  const literal = registryLiteralOf(v.getInitializer());
  if (literal === undefined) {
    return;
  }
  const name = v.getName();
  if (!(SCREAMING_SNAKE_RE.test(name) || RECORD_ANNOTATION_RE.test(declaredTypeText(v)))) {
    return;
  }
  const rows = registryRowsOf(literal);
  return rows.length < REGISTRY_ROW_FLOOR ? undefined : { name, filePath, rows };
}

/** The `(key, node)` rows of a registry literal, in whichever of the two shapes it is written. A member with
 *  no LITERAL key (a spread, a computed non-literal name, a row object with no `id`/`key` string) yields no
 *  row — it is a key this lens cannot check, never a key it invents. */
function registryRowsOf(literal: Node): { key: string; node: Node }[] {
  const rows: { key: string; node: Node }[] = [];
  const members: readonly Node[] = Node.isArrayLiteralExpression(literal)
    ? literal.getElements()
    : (literal.asKindOrThrow(SyntaxKind.ObjectLiteralExpression).getProperties() as readonly Node[]);
  const keyOf = Node.isArrayLiteralExpression(literal) ? rowArrayRowKey : keyedRowKey;
  for (const node of members) {
    const key = keyOf(node);
    if (key !== undefined) {
      rows.push({ key, node });
    }
  }
  return rows;
}

/** Every SPELLING a file uses — string-literal texts, property-access names, bare identifiers, and JSX
 *  attribute names. One syntactic pass per file; the union over all OTHER files is what a registry key is
 *  checked against. */
function spellingsOf(sf: SourceFile): Set<string> {
  const out = new Set<string>();
  for (const node of sf.getDescendantsOfKind(SyntaxKind.StringLiteral)) {
    out.add(node.getLiteralText());
  }
  for (const node of sf.getDescendantsOfKind(SyntaxKind.NoSubstitutionTemplateLiteral)) {
    out.add(node.getLiteralText());
  }
  for (const node of sf.getDescendantsOfKind(SyntaxKind.Identifier)) {
    out.add(node.getText());
  }
  for (const node of sf.getDescendantsOfKind(SyntaxKind.JsxAttribute)) {
    out.add(node.getNameNode().getText());
  }
  return out;
}

/** filePath → the spellings that file uses. Built once; a key's dispatch question is then a scan of this map
 *  skipping the registry's own file and every test path. */
export function spellingIndex(project: SourceCorpus): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();
  for (const sf of project.getSourceFiles()) {
    index.set(sf.getFilePath(), spellingsOf(sf));
  }
  return index;
}

/** The non-test, non-owning files that spell `key` — the dispatch sites. Capped at
 *  {@link REGKEY_SITES_SHOWN} + 1 so a common word short-circuits instead of scanning the whole index. */
function dispatchSitesOf(key: string, ownerFile: string, index: ReadonlyMap<string, Set<string>>): string[] {
  const sites: string[] = [];
  for (const [fp, spellings] of index) {
    if (fp === ownerFile || isTestPath(fp) || !spellings.has(key)) {
      continue;
    }
    sites.push(relPath(fp));
    if (sites.length > REGKEY_SITES_SHOWN) {
      return sites;
    }
  }
  return sites;
}

// ── DOT-ACCESS BLIND SPOT (owner-reproduced 2026-08-14) ──────────────────────────────────────────────────
// `spellingsOf` above already captures a property-access NAME via the generic `Identifier` sweep — a
// `PropertyAccessExpression`'s name node IS an Identifier — so `MOTION_BUDGETS.frameGapMs` elsewhere in the
// WORKSPACE would already dispatch `frameGapMs`. The blind spot is narrower and structural: `dispatchSitesOf`
// unconditionally EXCLUDES the registry's OWN file (`fp === ownerFile`), because a table's row DECLARATION
// (`frameGapMs: 50`) is itself a spelling of the key — without the exclusion, every row would trivially
// "dispatch" against its own definition. But that same exclusion also hides a REAL consumer that happens to
// live in the same file: `MOTION_BUDGETS` (packages/client/src/lib/motion-flaggers.ts) reads
// `MOTION_BUDGETS.frameGapMs`/`.cssScanIntervalMs`/`.spaceScanCap` from functions defined later in the SAME
// file it declares — genuine dispatch, reported undispatched anyway. The fix is not to drop the owner-file
// exclusion (that would un-blind the self-declaration false-negative it exists to prevent) — it is a
// NARROWER, additional consumption class: a property read explicitly QUALIFIED by the registry's own
// identifier (`REGISTRY.key`/`REGISTRY?.key`/`REGISTRY["key"]`) is real dispatch evidence wherever it
// appears, including the registry's own file (a row's bare declaration never matches this qualified shape,
// so crediting the owner file here cannot resurrect the self-declaration false-negative).
/** `index.get(registryName)`, minting the empty bucket on first credit. */
function qualifiedBucket(registryName: string, index: Map<string, Set<string>>): Set<string> {
  const existing = index.get(registryName);
  if (existing !== undefined) {
    return existing;
  }
  const created = new Set<string>();
  index.set(registryName, created);
  return created;
}

/** Record `registryName.key`/`registryName?.key` reads in `sf` into `index`, for every name in
 *  `registryNames`. Split off `qualifiedAccessIndex` to keep both node-kind walks under the complexity
 *  ceiling. */
function creditPropertyAccesses(sf: SourceFile, registryNames: ReadonlySet<string>, index: Map<string, Set<string>>): void {
  for (const pa of sf.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)) {
    const expr = pa.getExpression().getText();
    if (registryNames.has(expr)) {
      qualifiedBucket(expr, index).add(pa.getName());
    }
  }
}

/** Record `registryName["key"]` reads in `sf` into `index`, for every name in `registryNames`. */
function creditElementAccesses(sf: SourceFile, registryNames: ReadonlySet<string>, index: Map<string, Set<string>>): void {
  for (const ea of sf.getDescendantsOfKind(SyntaxKind.ElementAccessExpression)) {
    const expr = ea.getExpression().getText();
    if (!registryNames.has(expr)) {
      continue;
    }
    const arg = ea.getArgumentExpression();
    if (arg !== undefined && Node.isStringLiteral(arg)) {
      qualifiedBucket(expr, index).add(arg.getLiteralText());
    }
  }
}

/** `registryNames` → the property names read off THAT identifier anywhere in the corpus (owner file
 *  included — see the section header above), via all THREE property-read shapes (`REGISTRY.key`,
 *  `REGISTRY?.key`, `REGISTRY["key"]` — a dot-only sweep is a known false clean in this repo). Test paths
 *  are still excluded — a test enumerating a table is not a product consumer, the same rule `spellingsOf`
 *  callers apply. ONE pass over the whole project, built once per `regkeys` invocation. */
export function qualifiedAccessIndex(project: SourceCorpus, registryNames: ReadonlySet<string>): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();
  for (const sf of project.getSourceFiles()) {
    if (isTestPath(sf.getFilePath())) {
      continue;
    }
    creditPropertyAccesses(sf, registryNames, index);
    creditElementAccesses(sf, registryNames, index);
  }
  return index;
}

/** Registry rows whose key literal is spelled at ZERO dispatch sites outside their own table (and outside
 *  tests). INFORMATIONAL — a computed/DB-sourced/iterated key is a live row that looks dead here. Optional
 *  scope = a registry NAME or file substring; bare = every registry. Never exits non-zero on findings. */
export function cmdRegKeys(project: SourceCorpus, arg: string, flags: Flags): void {
  const all = collectRegistries(project);
  const registries = arg === "" ? all : all.filter((r) => r.name.includes(arg) || r.filePath.includes(arg));
  noteUnits("registries", registries.length);
  if (registries.length === 0) {
    exitToolError(
      `ast regkeys: scope "${arg}" matched no registry — pass a registry const name (TEMPLATE_DEFS), a file substring, or run bare for all ${all.length}.`,
    );
  }
  // The scope resolves to REGISTRIES; the files it admits are the ones declaring them (the dispatch-site
  // index is a workspace-wide substrate pass, deliberately not counted as the candidate corpus).
  scanCorpus(project, { scope: registries.map((r) => r.filePath), label: "path:registry-files" });
  const index = spellingIndex(project);
  const qualified = qualifiedAccessIndex(project, new Set(registries.map((r) => r.name)));
  const byRegistry = new Map(registries.map((r) => [r, regKeyHitsFor(r, index, qualified)] as const));
  if (flags.all) {
    printRegistriesPerTable(registries, byRegistry, flags);
  }
  narrate(
    flags,
    `regkeys is a HEURISTIC, INFORMATIONAL lens — it NEVER gates and has no exemption marker (owner ruling). Registry dispatch is legitimately dynamic: a key that arrives from the DB, a URL segment, a template literal, or an \`Object.keys(REGISTRY)\` iteration is a LIVE row that looks dead here — and three classes stay INVISIBLE to this lens entirely: ITERATION consumption (\`Object.entries(REGISTRY)\`/\`.map(...)\`, which spells no key at all), CSS-class-STRING derivation (a key concatenated into a class name rather than read as a property), and SAME-VALUE-different-SPELLING literals (a throw site spelling \`"compaction_empty"\` instead of \`CHAT_OP_CODES.compactionEmpty\`). Read the call sites before acting on any line below. (${registries.length} registry/registries, ${registries.reduce((n, r) => n + r.rows.length, 0)} row(s) examined; a registry = an exported const with ${REGISTRY_ROW_FLOOR}+ rows carrying a \`Record<…>\` annotation or a SCREAMING_SNAKE name, in either shape: an OBJECT literal keyed by property name, or an ARRAY literal of \`{ ${REGISTRY_ROW_ID_KEYS.join("|")}: "<key>" }\` rows.)`,
  );
  const hits = registries.flatMap((r) => byRegistry.get(r) ?? []);
  emit(hits, flags, `regkeys ${arg === "" ? "(all registries)" : arg}`);
}

/** ONE registry's undispatched rows — split off the main loop so `--all`'s per-registry breakdown and the
 *  default flat hit list are computed from the SAME per-registry call, never two independent walks. A row
 *  is dispatched if EITHER the generic spelling-anywhere-else check finds it OR a qualified
 *  `REGISTRY.key`/`REGISTRY["key"]` read names it (the latter checked FIRST, and checked including the
 *  registry's own file — see the dot-access section header above for why that inclusion is safe). */
export function regKeyHitsFor(registry: RegistryDef, index: ReadonlyMap<string, Set<string>>, qualified: ReadonlyMap<string, Set<string>>): Hit[] {
  const hits: Hit[] = [];
  const qualifiedKeys = qualified.get(registry.name);
  for (const row of registry.rows) {
    if (qualifiedKeys?.has(row.key) === true || dispatchSitesOf(row.key, registry.filePath, index).length > 0) {
      continue;
    }
    const h = hitOf(row.node, "regkey-undispatched");
    h.text = `${registry.name}["${row.key}"]  —  the key is spelled in NO non-test file outside this table`;
    hits.push(h);
  }
  return hits;
}

/** `regkeys --all`: per-registry sectioning, the same shape as `columns --all` — a registry with
 *  undispatched rows gets its full list, a clean one collapses to one line, so a sweep names which
 *  TABLES need a look instead of forty manual per-registry runs. */
function printRegistriesPerTable(registries: readonly RegistryDef[], byRegistry: ReadonlyMap<RegistryDef, Hit[]>, flags: Flags): void {
  let withFindings = 0;
  for (const registry of registries) {
    const hits = byRegistry.get(registry) ?? [];
    if (hits.length === 0) {
      narrate(flags, `  ${registry.name} (${relPath(registry.filePath)}): healthy — 0 of ${registry.rows.length} row(s) undispatched`);
      continue;
    }
    withFindings += 1;
    narrate(flags, `  ${registry.name} (${relPath(registry.filePath)}): ${hits.length} of ${registry.rows.length} row(s) undispatched`);
    for (const h of hits) {
      narrate(flags, `    ${h.file}:${h.line}  [${h.kind}]  ${h.text}`);
    }
  }
  narrate(flags, `regkeys --all: swept ${registries.length} registry/registries, ${withFindings} carrying a finding.`);
}
