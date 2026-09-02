// Gate: config-group-completeness (client-architecture-lockdown.md §8 / §16 G4 · config-revamp-design.md
// §3.1 + §6.8) — the config-group registry's structural walls tsc can't see. tsc forces the door Record total
// over CONFIG_GROUP_IDS and (§6.8) makes every non-collection group a SKIMMER by type — no `surface` render,
// no group-owned `subcategories` — so the arms the type system now owns are NOT here (a vacuous arm is not
// a port). What is here:
//   (1) CO-LOCATION — a `ConfigGroupDefinition` lives only in `features/*/lib/*-group.{ts,tsx}`, and a
//       `CollectionContribution` (a `collection` body) only in `features/*/lib/*-collection.{ts,tsx}`;
//   (2) DUPLICATE ID — two co-located defs declaring the same `id` (a shadow def rots green while edits land
//       in the dead twin; the door assembly silently picks one name);
//   (3) HOST-IMPORTS-NO-BODY — the config CONTENT host importing a feature's internals (`#features/*`, or a
//       relative path escaping `features/config/`) instead of reading bodies off the registries;
//   (4) ANCHOR-OUTSIDE-REGISTRY (§6.8.3, the hole tsc cannot see) — a client file that CALLS `configAnchorId(`
//       but neither declares a `ConfigSectionContribution` nor declares a component some contribution's
//       `body` renders by JSX tag is a section painted OUTSIDE the registry: it has an anchor the LIST, the
//       spy and the search will never derive a row for — exactly the half-migration the doctrine bans;
//   (5)–(7) the COLLECTION arms folded in from the retired `collection-registry-completeness` gate: `create`
//       is `{label, useRun}` DATA (never a rendered node), a declared `importFile` is `{label, accept, useRun}`
//       data, and ORPHAN-BODY — a co-located `CollectionContribution` no `*-group` def references is dead
//       wire that reads as a shipped library;
//   (8) UNREADABLE DEFINITION (#944, 2026-09-01) — `literalInit` returning undefined used to mean "skip
//       this declaration", so an imported group/collection/contribution initializer hid duplicate ids,
//       collection lifecycle data, orphan references and contributed body tags at once, from a file still
//       sitting at its sanctioned path. §8/§6.8 give each definition ONE home and sanction no builder, so
//       an unresolvable initializer FAILS CLOSED — and each of the THREE accumulators declares its own
//       POPULATION (#946), because they are three different denominators that can shrink independently.
import type { ObjectLiteralExpression, SourceFile, Node as TsMorphNode, VariableDeclaration } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { ObjectLiteralRead } from "../contract/ast-read.ts";
import type { GateDescriptor, GateRunCtx } from "../contract/gate.ts";
import type { Violation } from "../contract/harness.ts";
import { readObjectLiteral, readStringValue, unwrapExpression } from "../lib/ast-read.ts";
import { fileLoaded } from "../lib/pass.ts";

/** A NODE-anchored hit — never a `{file,line,message}` Finding literal (finding-overload-provenance): the
 *  node carries its own position, and `token` folds the per-occurrence detail the gate's static `message`
 *  can't. */
interface Hit {
  readonly node: TsMorphNode;
  readonly token: string;
}

const CLIENT_SRC = "/packages/client/src/";
/** A co-located config-group definition file: `features/<owner>/lib/<id>-group.{ts,tsx}`. */
const GROUP_FILE_RE = /\/features\/[^/]+\/lib\/[^/]+-group\.tsx?$/;
/** A co-located collection body file: `features/<owner>/lib/<name>-collection.{ts,tsx}`. */
const COLLECTION_FILE_RE = /\/features\/[^/]+\/lib\/[^/]+-collection\.tsx?$/;
const CONFIG_HOST_SUFFIX = "/features/config/surfaces/config-content-surface.tsx";
/** The two homes the ANCHOR arm exempts: the id's definition (`state/`) and the host that READS anchors
 *  (`features/config/` — the spy prefix, the jump). */
const ANCHOR_EXEMPT_RE = /\/packages\/client\/src\/(?:state|features\/config)\//;
const ANCHOR_FN = "configAnchorId";
/** The ORPHAN arm's real-tree anchor — the door module every real run loads and no conformance example plants. */
const DOOR_REL = "packages/client/src/compose/authed-app.tsx";

function rel(path: string): string {
  const idx = path.indexOf("/packages/");
  return idx === -1 ? path : path.slice(idx + 1);
}

function objProp(obj: ObjectLiteralExpression, name: string): Node | undefined {
  const prop = obj.getProperty(name);
  return prop !== undefined && Node.isPropertyAssignment(prop) ? prop.getInitializer() : undefined;
}

/** A definition's declared `id` string literal (through any as/satisfies/paren wrapper), or undefined. */
function defId(def: ObjectLiteralExpression): string | undefined {
  const id = objProp(def, "id");
  return id === undefined ? undefined : readStringValue(id);
}

/** The `body` object literal of a group def (the §3.1 union), or undefined when it isn't one. */
function bodyLiteral(def: ObjectLiteralExpression): ObjectLiteralExpression | undefined {
  const body = objProp(def, "body");
  return body !== undefined && Node.isObjectLiteralExpression(body) ? body : undefined;
}

/** The identifier a `collection` body names (`collection: tagCollection`), or undefined. */
function collectionBodyRef(def: ObjectLiteralExpression): string | undefined {
  const body = bodyLiteral(def);
  const ref = body === undefined ? undefined : objProp(body, "collection");
  const unwrapped = ref === undefined ? undefined : unwrapExpression(ref);
  return unwrapped !== undefined && Node.isIdentifier(unwrapped) ? unwrapped.getText() : undefined;
}

/** Every JSX tag name rendered anywhere inside `node` (opening + self-closing). */
function jsxTagNames(node: Node, into: Set<string>): void {
  for (const el of node.getDescendantsOfKind(SyntaxKind.JsxOpeningElement)) {
    into.add(el.getTagNameNode().getText());
  }
  for (const el of node.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement)) {
    into.add(el.getTagNameNode().getText());
  }
}

/** Does this file CALL `configAnchorId(` (a CallExpression whose callee is that bare identifier)? A comment
 *  or a string naming it does not count — code, never file text (the #117/#132 comment-blindness class). */
function callsAnchorFn(sf: SourceFile): boolean {
  return sf.getDescendantsOfKind(SyntaxKind.CallExpression).some((call) => {
    const callee = call.getExpression();
    return Node.isIdentifier(callee) && callee.getText() === ANCHOR_FN;
  });
}

/** The top-level component names a file declares: `function X(...)` and `const X = …` — the shapes a
 *  contribution's `body: () => <X />` can render. */
function declaredComponentNames(sf: SourceFile): readonly string[] {
  const names: string[] = [];
  for (const fn of sf.getFunctions()) {
    const name = fn.getName();
    if (name !== undefined) {
      names.push(name);
    }
  }
  for (const decl of sf.getVariableDeclarations()) {
    names.push(decl.getName());
  }
  return names;
}

interface Seen {
  readonly name: string;
  readonly file: string;
}

interface Def {
  readonly name: string;
  readonly path: string;
  readonly line: number;
  readonly init: ObjectLiteralExpression;
}

/** Records `key` against `seen`; returns the FIRST owner if `key` is already claimed (a duplicate). */
function claim(key: string, def: Def, seen: Map<string, Seen>): Seen | undefined {
  const firstOwner = seen.get(key);
  if (firstOwner === undefined) {
    seen.set(key, { name: def.name, file: rel(def.path) });
    return;
  }
  return firstOwner;
}

/** The THREE semantic denominators this gate carries (#946) — three accumulators that can shrink
 *  independently, so they are three declared populations, never one summed number. */
type PopulationKey = "ConfigGroupDefinition" | "CollectionContribution" | "ConfigSectionContribution";
type PopulationTally = Record<PopulationKey, { members: number; unresolved: number }>;

function emptyPopulation(): PopulationTally {
  return {
    ConfigGroupDefinition: { members: 0, unresolved: 0 },
    CollectionContribution: { members: 0, unresolved: 0 },
    ConfigSectionContribution: { members: 0, unresolved: 0 },
  };
}

interface ScanState {
  readonly ctx: GateRunCtx;
  readonly population: PopulationTally;
  readonly out: Violation[];
  readonly hits: Hit[];
  readonly seenIds: Map<string, Seen>;
  /** Every `CollectionContribution` declaration by name → its site (the ORPHAN arm's population). */
  readonly bodySites: Map<string, { readonly file: string; readonly line: number }>;
  /** Every identifier a `collection` body arm references. */
  readonly bodyRefs: Set<string>;
  /** Every JSX tag some `ConfigSectionContribution.body` renders (the ANCHOR arm's allow-set). */
  readonly contributedTags: Set<string>;
  /** Files that stamp anchors: path → the component names they declare + whether they declare a contribution. */
  readonly anchorStampers: Map<string, { readonly names: readonly string[]; readonly declaresContribution: boolean; readonly sf: SourceFile }>;
}

function checkGroupDef(def: Def, state: ScanState): void {
  const id = defId(def.init);
  const idOwner = id === undefined ? undefined : claim(id, def, state.seenIds);
  if (idOwner !== undefined) {
    state.out.push({
      file: rel(def.path),
      line: def.line,
      message: `ConfigGroupDefinition "${def.name}" declares id "${id}", already claimed by "${idOwner.name}" (${idOwner.file}) — two definitions for one id is a shadow def that rots green — docs/design/config-revamp-design.md §6.8.`,
    });
  }
  const ref = collectionBodyRef(def.init);
  if (ref !== undefined) {
    state.bodyRefs.add(ref);
  }
}

/** The create-is-DATA arm (config-rail-spec.md §3): the host renders the affordance, so the body declares
 *  `{label, useRun}` and never a node. A rendered `create` would put a second create grammar in the LIST. */
function checkCreateIsData(def: Def, out: Violation[]): void {
  const create = objProp(def.init, "create");
  if (create === undefined) {
    out.push({
      file: rel(def.path),
      line: def.line,
      message: `collection "${def.name}" declares no \`create\` — a library you cannot add to is not a library, and the host renders the verb from this data — docs/design/config-rail-spec.md §3.`,
    });
    return;
  }
  const unwrapped = unwrapExpression(create);
  if (!Node.isObjectLiteralExpression(unwrapped)) {
    out.push({
      file: rel(def.path),
      line: def.line,
      message: `collection "${def.name}"'s \`create\` is not a data literal — the HOST draws the create affordance in its own chrome grammar; a body declares \`{label, useRun}\` — docs/design/config-rail-spec.md §3.`,
    });
    return;
  }
  const labelNode = objProp(unwrapped, "label");
  const label = labelNode === undefined ? undefined : readStringValue(labelNode);
  if (label === undefined || label.length === 0) {
    out.push({
      file: rel(def.path),
      line: def.line,
      message: `collection "${def.name}"'s \`create.label\` is not a non-empty string literal — it IS the affordance's accessible name ("New tag"), so it cannot be computed at the host — docs/design/config-rail-spec.md §3.`,
    });
  }
  if (objProp(unwrapped, "useRun") === undefined) {
    out.push({
      file: rel(def.path),
      line: def.line,
      message: `collection "${def.name}"'s \`create\` has no \`useRun\` — the runner is a HOOK (a definition is a module value; a bare function can never reach the owner's mutation) — docs/design/config-rail-spec.md §3.`,
    });
  }
}

/** The IMPORT-IS-DATA arm (R2WI) — the same wall as `create`, on D121-D's other lifecycle half. */
function checkImportIsData(def: Def, out: Violation[]): void {
  const door = objProp(def.init, "importFile");
  if (door === undefined) {
    return;
  }
  const unwrapped = unwrapExpression(door);
  if (!Node.isObjectLiteralExpression(unwrapped)) {
    out.push({
      file: rel(def.path),
      line: def.line,
      message: `collection "${def.name}"'s \`importFile\` is not a data literal — the HOST draws the import affordance in the group band (D121-D band=Import); a body declares \`{label, accept, useRun}\` — docs/design/config-rail-spec.md §3.`,
    });
    return;
  }
  const labelNode = objProp(unwrapped, "label");
  const label = labelNode === undefined ? undefined : readStringValue(labelNode);
  if (label === undefined || label.length === 0) {
    out.push({
      file: rel(def.path),
      line: def.line,
      message: `collection "${def.name}"'s \`importFile.label\` is not a non-empty string literal — it IS the trigger's accessible name AND its tooltip, so it cannot be computed at the host — docs/design/config-rail-spec.md §3.`,
    });
  }
  const acceptNode = objProp(unwrapped, "accept");
  if (acceptNode === undefined || readStringValue(acceptNode) === undefined) {
    out.push({
      file: rel(def.path),
      line: def.line,
      message: `collection "${def.name}"'s \`importFile.accept\` is not a string literal — the file-picker filter is the body's own fact and the host cannot guess it — docs/design/config-rail-spec.md §3.`,
    });
  }
  if (objProp(unwrapped, "useRun") === undefined) {
    out.push({
      file: rel(def.path),
      line: def.line,
      message: `collection "${def.name}"'s \`importFile\` has no \`useRun\` — the runner is a HOOK, exactly like \`create.useRun\` (a definition is a module value) — docs/design/config-rail-spec.md §3.`,
    });
  }
}

/** A typed declaration's object-literal initializer — through any `as`/`satisfies`/paren wrapper around the
 *  WHOLE literal (the planted-probe lesson: `{ id: "personas" } as ConfigGroupDefinition` slipped the dup-id
 *  and co-location arms while the plain literal tripped them) AND through same-file indirection, or the
 *  REFUSAL naming the shape (#944 — an imported/builder definition is not a skip, it is a fail-closed
 *  finding: §8/§6.8 give each definition ONE home, so the law cannot be established through an import). */
function literalInit(decl: VariableDeclaration): ObjectLiteralRead {
  return readObjectLiteral(decl.getInitializer());
}

/** Record the fail-closed finding + the denominator loss for a declaration whose definition is unreadable. */
function failClosed(decl: VariableDeclaration, read: Extract<ObjectLiteralRead, { kind: "unresolved" }>, kind: PopulationKey, state: ScanState): void {
  state.population[kind].unresolved += 1;
  state.hits.push({ node: decl, token: `${decl.getName()}-unreadable-definition (${read.shape})` });
}

/** A `ConfigGroupDefinition`-typed declaration: co-location, then the per-def arms. */
function checkGroupDecl(decl: VariableDeclaration, path: string, state: ScanState): void {
  if (!GROUP_FILE_RE.test(path)) {
    state.hits.push({ node: decl, token: `${decl.getName()}-not-co-located` });
    return;
  }
  const read = literalInit(decl);
  if (read.kind === "unresolved") {
    failClosed(decl, read, "ConfigGroupDefinition", state);
    return;
  }
  state.population.ConfigGroupDefinition.members += 1;
  checkGroupDef({ name: decl.getName(), path, line: decl.getStartLineNumber(), init: read.object }, state);
}

/** A `CollectionContribution`-typed declaration: co-location, then the folded-in collection arms. */
function checkCollectionDecl(decl: VariableDeclaration, path: string, state: ScanState): void {
  if (!COLLECTION_FILE_RE.test(path)) {
    state.hits.push({ node: decl, token: `${decl.getName()}-not-co-located` });
    return;
  }
  const read = literalInit(decl);
  if (read.kind === "unresolved") {
    failClosed(decl, read, "CollectionContribution", state);
    return;
  }
  state.population.CollectionContribution.members += 1;
  const line = decl.getStartLineNumber();
  const def: Def = { name: decl.getName(), path, line, init: read.object };
  state.bodySites.set(def.name, { file: rel(path), line });
  checkCreateIsData(def, state.out);
  checkImportIsData(def, state.out);
}

/** A `ConfigSectionContribution`-typed declaration: record every tag its `body` renders. */
function noteContribution(decl: VariableDeclaration, state: ScanState): void {
  const read = literalInit(decl);
  if (read.kind === "unresolved") {
    // FAIL CLOSED: an unreadable contribution contributes NO tags to the ANCHOR arm's allow-set, which
    // turns that arm's every judgement into a guess — the permissive direction, silently.
    failClosed(decl, read, "ConfigSectionContribution", state);
    return;
  }
  state.population.ConfigSectionContribution.members += 1;
  const body = objProp(read.object, "body");
  if (body !== undefined) {
    jsxTagNames(body, state.contributedTags);
  }
}

/** Route one typed declaration by its annotation's head identifier; true when it is a contribution. */
function checkDecl(decl: VariableDeclaration, path: string, state: ScanState): boolean {
  const typeText = decl.getTypeNode()?.getText() ?? "";
  if (typeText.startsWith("ConfigGroupDefinition")) {
    checkGroupDecl(decl, path, state);
  } else if (typeText.startsWith("CollectionContribution")) {
    checkCollectionDecl(decl, path, state);
  } else if (typeText.startsWith("ConfigSectionContribution")) {
    noteContribution(decl, state);
    return true;
  }
  return false;
}

function checkFile(sf: SourceFile, state: ScanState): void {
  let declaresContribution = false;
  for (const decl of sf.getVariableDeclarations()) {
    if (checkDecl(decl, sf.getFilePath(), state)) {
      declaresContribution = true;
    }
  }
  const path = sf.getFilePath();
  if (!ANCHOR_EXEMPT_RE.test(path) && callsAnchorFn(sf)) {
    state.anchorStampers.set(path, { names: declaredComponentNames(sf), declaresContribution, sf });
  }
}

/** The config host mounting a feature's internals directly instead of reading them off the registries —
 *  the de-god's whole point. `#features/*` is the front-door alias; a relative path with two `..` hops
 *  escapes `features/config/` into a sibling feature. */
function checkHostImportsNoBody(sf: SourceFile, hits: Hit[]): void {
  for (const imp of sf.getImportDeclarations()) {
    const spec = imp.getModuleSpecifierValue();
    if (spec.startsWith("#features/") || spec.startsWith("../../")) {
      hits.push({ node: imp, token: `host-imports:${spec}` });
    }
  }
}

/** The ANCHOR-OUTSIDE-REGISTRY arm (§6.8.3). Runs after every file is scanned, so the allow-set of
 *  contributed tags is complete: a stamping file passes if it declares a contribution itself (the anchor is
 *  passed into a body as a prop — the persona this-chat shape) or declares a component a contribution
 *  renders (the `components/x-section.tsx` ↔ `lib/x-section.tsx` pair, every other section on the tree). */
function checkAnchorsOutsideRegistry(state: ScanState): void {
  for (const [, stamper] of state.anchorStampers) {
    if (stamper.declaresContribution || stamper.names.some((name) => state.contributedTags.has(name))) {
      continue;
    }
    state.hits.push({ node: stamper.sf, token: "anchor-outside-registry" });
  }
}

/** The ORPHAN-BODY arm: a co-located, exported `CollectionContribution` no `*-group` def's `collection`
 *  body references — dead wire that reads as a shipped library, and knip-invisible because the front door
 *  re-exports it. Runs only against the REAL tree (the door anchor), so a conformance mini-project — which
 *  may plant a body with no group beside it — never reds the gate's own self-proof. */
function checkOrphanBodies(state: ScanState): void {
  if (!fileLoaded(state.ctx, DOOR_REL)) {
    return;
  }
  for (const [name, site] of state.bodySites) {
    if (!state.bodyRefs.has(name)) {
      state.out.push({
        file: site.file,
        line: site.line,
        message: `collection "${name}" is co-located and exported but no ConfigGroupDefinition's \`collection\` body references it — an unregistered library is dead wire that reads as shipped. Register it through a \`*-group.tsx\` def (and the door's total Record), or delete it — docs/design/config-revamp-design.md §6.8.`,
      });
    }
  }
}

export const gate: GateDescriptor = {
  name: "config-group-completeness",
  docRow: "client-architecture-lockdown.md §8 / §16 G4",
  status: "active",
  scopeSafety: "whole-project",
  message:
    "a config group is dishonest: a ConfigGroupDefinition not co-located in a feature `*-group` file (or a CollectionContribution outside a `*-collection` file), a co-located definition this gate cannot READ (an imported/builder initializer — the duplicate-id, lifecycle-data, orphan and contributed-tag arms then all have nothing to judge), a duplicate id, the config host importing a feature's internals instead of reading the registries, a file stamping `configAnchorId(…)` that no ConfigSectionContribution renders (a section painted OUTSIDE the registry — the LIST, spy and search cannot derive a row for it), a collection body whose `create`/`importFile` is not `{label, useRun}` data, or a collection body no group references — client-architecture-lockdown.md §8 / docs/design/config-revamp-design.md §6.8.",
  fix: "write every definition as a co-located object literal (a same-file const and an `as`/`satisfies` wrapper read fine — an IMPORT does not); co-locate the definition under features/*/lib/*-group.{ts,tsx} (a collection body under lib/*-collection.tsx, referenced from its group's `body.collection`); register every anchored section as a ConfigSectionContribution whose `body` renders the component that stamps the anchor (or pass the anchor in from the contribution); declare `create: { label, useRun }` / `importFile: { label, accept, useRun }` as data; read bodies off the registries in the host instead of importing a feature.",
  run: (ctx) => {
    const state: ScanState = {
      ctx,
      population: emptyPopulation(),
      out: [],
      hits: [],
      seenIds: new Map<string, Seen>(),
      bodySites: new Map(),
      bodyRefs: new Set<string>(),
      contributedTags: new Set<string>(),
      anchorStampers: new Map(),
    };
    for (const sf of ctx.project.getSourceFiles()) {
      const path = sf.getFilePath();
      if (!path.includes(CLIENT_SRC)) {
        continue;
      }
      checkFile(sf, state);
      if (path.endsWith(CONFIG_HOST_SUFFIX)) {
        checkHostImportsNoBody(sf, state.hits);
      }
    }
    checkAnchorsOutsideRegistry(state);
    checkOrphanBodies(state);
    for (const v of state.out) {
      ctx.report({ file: v.file, line: v.line, column: 0, message: v.message });
    }
    for (const hit of state.hits) {
      ctx.report(hit.node, { token: hit.token, offset: 0 });
    }
    // The three SEMANTIC denominators (#946), beside the harness's one file count: zero members in any of
    // them on the real tree means that accumulator's discovery went blind, and any unresolved declaration
    // is denominator loss. Both refuse the verdict rather than rendering ✓.
    ctx.scan({
      population: Object.entries(state.population).map(([source, p]) => ({ source, members: p.members, unresolved: p.unresolved })),
    });
  },
  mustFlag: [
    {
      files: "export const xGroup: ConfigGroupDefinition = { id: 'x' };\n",
      at: "packages/client/src/features/x/lib/not-a-group-file.ts",
      expect: { token: "xGroup-not-co-located" },
      why: "a ConfigGroupDefinition outside a `*-group` file — the co-location arm",
    },
    {
      files: "export const strayCollection: CollectionContribution = { create: { label: 'New x', useRun: () => () => undefined } };\n",
      at: "packages/client/src/features/x/lib/not-a-collection-file.ts",
      expect: { token: "strayCollection-not-co-located" },
      why: "a CollectionContribution outside a `*-collection` file — the body co-location arm (folded in from collection-registry-completeness)",
    },
    {
      files: {
        "packages/client/src/features/a/lib/a-group.ts": "export const aGroup: ConfigGroupDefinition = { id: 'dup' };\n",
        "packages/client/src/features/b/lib/b-group.ts": "export const bGroup: ConfigGroupDefinition = { id: 'dup' };\n",
      },
      expect: { messageIncludes: "already claimed by" },
      why: "two co-located ConfigGroupDefinitions declaring the SAME id — the shadow-def duplicate-id arm",
    },
    {
      files: {
        "packages/client/src/features/a/lib/a-group.ts": "export const aGroup: ConfigGroupDefinition = { id: 'dup' as never };\n",
        "packages/client/src/features/b/lib/b-group.ts": "export const bGroup: ConfigGroupDefinition = { id: 'dup' as never };\n",
      },
      expect: { messageIncludes: "already claimed by" },
      why: "duplicate ids written `'dup' as never` (AsExpression) — the wrapped-literal shape the plain StringLiteral reader silently PASSED before hardening",
    },
    {
      files: {
        "packages/client/src/features/a/lib/a-group.ts": "export const aGroup: ConfigGroupDefinition = { id: 'dup' } as ConfigGroupDefinition;\n",
        "packages/client/src/features/b/lib/b-group.ts": "export const bGroup: ConfigGroupDefinition = { id: 'dup' } satisfies ConfigGroupDefinition;\n",
      },
      expect: { messageIncludes: "already claimed by" },
      why: "duplicate ids on WHOLE-literal `as`/`satisfies` wrappers — the shape a real-tree probe slipped past the plain ObjectLiteral reader (2026-08-30) before `literalInit` unwrapped it",
    },
    {
      files:
        "export const strayCollection: CollectionContribution = { create: { label: 'New x', useRun: () => () => undefined } } as CollectionContribution;\n",
      at: "packages/client/src/features/x/lib/not-a-collection-file.ts",
      expect: { token: "strayCollection-not-co-located" },
      why: "a CollectionContribution outside a `*-collection` file, wrapped in a whole-literal `as` — the co-location arm keys on the annotation, so the wrapper never mattered here; pinned so the two probe shapes stay covered together",
    },
    {
      files: 'import { XSection } from "../../persona/components/x-section.tsx";\nexport const G = XSection;\n',
      at: "packages/client/src/features/config/surfaces/config-content-surface.tsx",
      expect: { token: "host-imports:../../persona/components/x-section.tsx" },
      why: "the config host reaching into a sibling feature by relative path — the host-imports-no-body arm",
    },
    {
      files: 'import { personasGroup } from "#features/persona";\nexport const G = personasGroup;\n',
      at: "packages/client/src/features/config/surfaces/config-content-surface.tsx",
      expect: { token: "host-imports:#features/persona" },
      why: "the config host importing a feature's front door — the host reads the door-assembled registries, never a feature",
    },
    {
      files:
        'import { configAnchorId } from "#state";\nexport function RogueSection() { return <Section heading="Rogue" id={configAnchorId("personas", "rogue")} />; }\n',
      at: "packages/client/src/features/persona/components/rogue-section.tsx",
      expect: { token: "anchor-outside-registry" },
      why: "a component stamping a config anchor that NO ConfigSectionContribution renders — a section painted outside the registry (§6.8.3): the LIST, the spy and the search derive rows from contributions only, so this anchor is unreachable by design",
    },
    {
      files: {
        "packages/client/src/features/persona/components/persona-settings-surface.tsx":
          'import { configAnchorId } from "#state";\nconst ANCHORS = { roster: configAnchorId("personas", "your-personas") } as const;\nexport function PersonaSettingsSurface() { return <PersonaPanelSurface anchors={ANCHORS} />; }\n',
        "packages/client/src/features/persona/lib/persona-roster-section.tsx":
          'export const personaRosterSection: ConfigSectionContribution = { id: "persona-roster", anchor: "personas", nav: NAV, body: () => <PersonaRosterSection /> };\n',
      },
      expect: { token: "anchor-outside-registry" },
      why: "the pre-§6.8 persona shape: a SURFACE hand-stamping anchors it passes into a shared panel, while the registry's contribution renders a DIFFERENT component — the surface's anchors are outside the registry even though a contribution exists at the same anchor",
    },
    {
      files: "export const xCollection: CollectionContribution = { emptyText: 'none' };\n",
      at: "packages/client/src/features/x/lib/x-collection.tsx",
      expect: { messageIncludes: "declares no `create`" },
      why: "a library with no create verb — the create-is-data arm's absence half",
    },
    {
      files: "export const xCollection: CollectionContribution = { create: <NewXButton /> };\n",
      at: "packages/client/src/features/x/lib/x-collection.tsx",
      expect: { messageIncludes: "not a data literal" },
      why: "a create affordance RENDERED by the body — the host owns that chrome",
    },
    {
      files: "export const xCollection: CollectionContribution = { create: { label: '', useRun: () => () => undefined } };\n",
      at: "packages/client/src/features/x/lib/x-collection.tsx",
      expect: { messageIncludes: "create.label" },
      why: "an empty accessible name for the create affordance",
    },
    {
      files: "export const xCollection: CollectionContribution = { create: { label: 'New x', run: () => undefined } };\n",
      at: "packages/client/src/features/x/lib/x-collection.tsx",
      expect: { messageIncludes: "no `useRun`" },
      why: "a bare `run` that can never reach the owner's mutation — the hook-runner arm",
    },
    {
      files:
        "export const xCollection: CollectionContribution = { create: { label: 'New x', useRun: () => () => undefined }, importFile: <ImportXButton /> };\n",
      at: "packages/client/src/features/x/lib/x-collection.tsx",
      expect: { messageIncludes: "`importFile` is not a data literal" },
      why: "an import affordance RENDERED by the body — the host owns the band's chrome (D121-D band=Import)",
    },
    {
      files:
        "export const xCollection: CollectionContribution = { create: { label: 'New x', useRun: () => () => undefined }, importFile: { label: 'Import an x', useRun: () => () => undefined } };\n",
      at: "packages/client/src/features/x/lib/x-collection.tsx",
      expect: { messageIncludes: "importFile.accept" },
      why: "an import door with no file-picker filter — the host cannot guess what bytes the collection reads",
    },
    {
      files:
        "export const xCollection: CollectionContribution = { create: { label: 'New x', useRun: () => () => undefined }, importFile: { label: '', accept: 'application/json', useRun: () => () => undefined } };\n",
      at: "packages/client/src/features/x/lib/x-collection.tsx",
      expect: { messageIncludes: "importFile.label" },
      why: "an empty accessible name for the import trigger",
    },
    {
      files:
        "export const xCollection: CollectionContribution = { create: { label: 'New x', useRun: () => () => undefined }, importFile: { label: 'Import an x', accept: 'application/json', run: () => undefined } };\n",
      at: "packages/client/src/features/x/lib/x-collection.tsx",
      expect: { messageIncludes: "`importFile` has no `useRun`" },
      why: "a bare `run` on the import door — the hook-runner arm, same reason as create's",
    },
    {
      files: {
        "packages/client/src/features/x/lib/x-definition.ts": "export const xDef = { emptyText: 'none' };\n",
        "packages/client/src/features/x/lib/x-collection.tsx":
          'import { xDef } from "./x-definition.ts";\nexport const xCollection: CollectionContribution = xDef;\n',
      },
      expect: {
        token:
          "xCollection-unreadable-definition (the identifier `xDef` (not an object literal declared in this file — an imported or re-exported definition))",
      },
      why: "THE #944 COLLECTION CONTROL (the audit's exact fixture): an imported `CollectionContribution` with NO `create`. The create-is-data arm would have RED'd it; before the fail-closed arm `literalInit` returned undefined and the whole declaration was skipped",
    },
    {
      files: {
        "packages/client/src/features/a/lib/a-definition.ts": "export const aDef = { id: 'dup' };\n",
        "packages/client/src/features/a/lib/a-group.ts": 'import { aDef } from "./a-definition.ts";\nexport const aGroup: ConfigGroupDefinition = aDef;\n',
        "packages/client/src/features/b/lib/b-group.ts": "export const bGroup: ConfigGroupDefinition = { id: 'dup' };\n",
      },
      expect: {
        token: "aGroup-unreadable-definition (the identifier `aDef` (not an object literal declared in this file — an imported or re-exported definition))",
      },
      why: "THE #944 GROUP CONTROL — a SECOND fixture because the group and collection accumulators are different code paths (the audit says so explicitly). The imported group hides a duplicate id from the seenIds map: the dup-id arm cannot fire at all, so the fail-closed finding is the only thing standing between this and silence",
    },
    {
      files: {
        "packages/client/src/features/x/lib/x-definition.tsx": "export const xDef = { id: 'x', anchor: 'personas', body: () => <XSection /> };\n",
        "packages/client/src/features/x/lib/x-section.tsx":
          'import { xDef } from "./x-definition.tsx";\nexport const xSection: ConfigSectionContribution = xDef;\n',
      },
      expect: {
        token: "xSection-unreadable-definition (the identifier `xDef` (not an object literal declared in this file — an imported or re-exported definition))",
      },
      why: "THE #944 CONTRIBUTION CONTROL — the third accumulator, and the PERMISSIVE direction (GATE-AUTHORING §5): an unreadable contribution silently contributes NO tags to the ANCHOR arm's allow-set, so every anchor-stamping file it should have vouched for becomes a false accusation and every one it should not becomes a guess",
    },
  ],
  mustPass: [
    {
      files:
        'export const tagsGroup: ConfigGroupDefinition = { id: \'tags\', shelf: "collections", body: { kind: "collection", collection: tagCollection } };\n',
      at: "packages/client/src/features/tag/lib/tags-group.tsx",
      why: "a co-located `collection` group wrapping its body — the F-1 shape — passes (the ORPHAN arm needs the real door, absent here)",
    },
    {
      files: "export const skimmerGroup: ConfigGroupDefinition = { id: 'appearance', body: { kind: \"sections\" } };\n",
      at: "packages/client/src/features/x/lib/appearance-group.tsx",
      why: "a pure SKIMMER — no own body, no own rows; its rows derive from the contributions at its anchor — passes",
    },
    {
      files: "export const draftGroup: ConfigGroupDefinition = { id: 'draft', body: { placeholder: true } };\n",
      at: "packages/client/src/features/x/lib/draft-group.tsx",
      why: "a DECLARED-PLACEHOLDER group — flagged honestly, no render — passes",
    },
    {
      files: {
        "packages/client/src/features/workloads/components/workloads-jobs-section.tsx":
          'import { configAnchorId } from "#state";\nexport function WorkloadsJobsSection() { return <Section heading="Runs" id={configAnchorId("workloads", "jobs")} />; }\n',
        "packages/client/src/features/workloads/lib/workloads-jobs-section.tsx":
          'export const workloadsJobsSection: ConfigSectionContribution = { id: "workloads-jobs", anchor: "workloads", nav: NAV, body: () => <WorkloadsJobsSection /> };\n',
      },
      why: "the registered shape: a component stamps its anchor and a ConfigSectionContribution renders THAT component — the LIST/spy/search derive its row — passes",
    },
    {
      files:
        'import { configAnchorId } from "#state";\nexport const personaThisChatSection: ConfigSectionContribution = { id: "persona-this-chat", anchor: "personas", nav: NAV, body: () => <PersonaThisChatSection anchorId={configAnchorId("personas", "this-chat")} /> };\n',
      at: "packages/client/src/features/persona/lib/persona-this-chat-section.tsx",
      why: "a contribution passing the anchor INTO a shared component as a prop (the persona this-chat shape, three mounts one component) — the stamping file IS the contribution — passes",
    },
    {
      files: 'import { configAnchorId } from "#state";\nexport const prefix = configAnchorId("appearance", "");\n',
      at: "packages/client/src/features/config/surfaces/config-content-surface.tsx",
      why: "the config HOST reading anchors (the spy prefix, the jump) is the registry's consumer, not a painter — exempt, passes",
    },
    {
      files: "export const tagCollection: CollectionContribution = { create: { label: 'New tag', useRun: useCreateTagMember } };\n",
      at: "packages/client/src/features/tag/lib/tag-collection.tsx",
      why: "a FULL co-located collection body with a data create verb — passes (the ORPHAN arm needs the real door, absent here)",
    },
    {
      files:
        "export const worldInfoCollection: CollectionContribution = { create: { label: 'New book', useRun: useCreateWorldInfoMember }, importFile: { label: 'Import a world-info book', accept: 'application/json', useRun: useImportWorldInfoMember } };\n",
      at: "packages/client/src/features/world-info/lib/world-info-collection.tsx",
      why: "a body with BOTH lifecycle halves declared as data (D121-D band=Import) — the shape R2's world-info migration ships",
    },
    {
      files:
        'const tagsGroupDef = { id: \'tags\', shelf: "collections", body: { kind: "collection", collection: tagCollection } };\nexport const tagsGroup: ConfigGroupDefinition = tagsGroupDef;\n',
      at: "packages/client/src/features/tag/lib/tags-group.tsx",
      why: "SAME-FILE indirection — still co-located, so it resolves and the `collection` body reference is still recorded for the ORPHAN arm. The declared limit this row writes down: only an import/builder fails closed",
    },
  ],
};
