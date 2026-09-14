// Visitor-fed declared-knob/wire reconciliation for `knob-wire-coverage` (D107).
//
// SEVEN BELTS, ONE SHARED WALK. Each belt is a MEMBER SOURCE × CONSUMER SCOPE pair: A `EffectiveAppConfig`
// field × typed server read · B `USER_SETTINGS_SECTIONS` member × `section:"x"` write · B2 `appSettingsSchema`
// key × admin-surface write field · C settings schema leaf × read-shaped occurrence · E
// `DEFAULT_FORMAT_STRINGS` key × server read · F `chatMetadataSchema` key × write verb AND × read outside the
// parser/write scope. The belts are collected in ONE kind-indexed visitor pass instead of the legacy module's
// fifteen `getSourceFiles()`/`getDescendantsOfKind` sweeps.
//
// EVERY ARM FOLLOWS THE COMPOSITION ITS SOURCE LAW SANCTIONS OR REFUSES LOUDLY (#1094): A reads the
// interface's RESOLVED type, so an INHERITED `EffectiveAppConfig` field is a subject and an `extends` binding
// nothing refuses; B reads `lib/tuple-read.ts`, so a spread section member counts; B2/C/E/F share ONE
// authored-object reader that follows object spreads, `.shape` spreads, `.extend`/`.merge` and local/imported
// bindings, and throws on every other member kind, unbound binding, cycle, or zero-member contribution. Arm C
// also follows a precise imported semantic-source manifest for sanctioned sub-schema modules.
//
// THE DENOMINATOR IS NEVER SILENTLY SMALLER. A member population this reader cannot establish is a THROW
// (⇒ a fact error, exit 2), never a shorter list behind a green verdict; every belt's member count rides the
// returned value onto the consumer's population receipt. The paired-anchor rename tripwires are refusals
// here rather than findings — see `assertMemberSourcePresent`.
import type { InterfaceDeclaration, Node, ObjectLiteralExpression, SourceFile, VariableDeclaration } from "ts-morph";
import { Node as MorphNode, SyntaxKind } from "ts-morph";
import { defineFact } from "../contract/fact.ts";
import { readStringValue, unwrapExpression } from "./ast-read.ts";
import { readTupleDeclaration } from "./tuple-read.ts";

// ── member sources and their paired-anchor rename tripwires ─────────────────────────────────────────────
const SETTINGS_CONTRACTS = /\/packages\/contracts\/src\/settings\/index\.ts$/u;
const PRESET_CONTRACTS = /\/packages\/contracts\/src\/preset\/index\.ts$/u;
const METADATA_PARSER = /\/packages\/server\/src\/domain\/chat\/contract\/metadata\.ts$/u;

const EFFECTIVE_APP_CONFIG = "EffectiveAppConfig";
const APP_SETTINGS_SCHEMA = "appSettingsSchema";
const USER_SETTINGS_SECTIONS = "USER_SETTINGS_SECTIONS";
const USER_SETTINGS_SCHEMA = "userSettingsSchema";
const DEFAULT_USER_SETTINGS = "DEFAULT_USER_SETTINGS";
const DEFAULT_FORMAT_STRINGS = "DEFAULT_FORMAT_STRINGS";
const CHAT_METADATA_SCHEMA = "chatMetadataSchema";
const DIAGNOSTIC_PREVIEW_CHARS = 120;

/** Companion anchors: present ⇒ the member source MUST be findable, else the source was renamed away. */
const ANCHOR_GET_EFFECTIVE_CONFIG = "getEffectiveConfig";
const ANCHOR_UPDATE_SECTION = "updateUserSettingsSection";
const ANCHOR_PRESET_SCHEMA = "presetSchema";
const ANCHOR_PARSE_METADATA = "parseChatMetadata";

/** Arm C's imported semantic sources. Each row is a contract-graph edge, not a second member list: the
 *  resolver proves that `userSettingsSchema.<section>` reaches the named exported z.object and derives that
 *  object's top-level leaves. A rename, removed composition edge, cycle, or unsupported expression is a
 *  refusal instead of a smaller denominator reported as clean. */
const IMPORTED_SETTINGS_SCHEMA_SOURCES = [{ section: "appearance", symbol: "appearanceSettingsSchema" }] as const;

// ── consumer scopes ─────────────────────────────────────────────────────────────────────────────────────
// Arm A: the resolver DEFAULTS every field off an `AppSettings` receiver — its reads are AppSettings-typed,
// never EffectiveAppConfig-typed, so type-keying already excludes it from the consumer set; the config-cache
// APPLICATION seam (reloadEffectiveConfig rebinding live subsystems, e.g. logger.level = resolved.logLevel)
// is a GENUINE consumer and stays IN scope. So arm A needs no path exclusion.
const SERVER_SRC = /\/packages\/server\/src\//u;
const CLIENT_SRC = /\/packages\/client\/src\//u;
const UI_SRC = /\/packages\/ui\/src\//u;
const ENTRY_SCOPE = /\/packages\/server\/src\/entry\//u;
/** Arm B2: the admin write surfaces (settings + user-admin feature dirs). */
const ADMIN_SURFACES = /\/packages\/client\/src\/features\/(?:settings|user-admin)\//u;
/** Arm F: metadata WRITE scope (verbs + tRPC routers); the parser file is excluded from the READ scope. */
const CHAT_WRITE_SCOPE = /\/packages\/server\/src\/(?:domain\/chat\/verbs|transport\/trpc)\//u;

/** The arm vocabulary. `operation` is the reviewed-grant discriminator, so arm F's two belts over ONE
 *  authored node are independently licensable and §6.2's identical-carrier ban is never reached. */
export const KNOB_WIRE_OPERATIONS = {
  configField: "unread-config-field",
  settingsSection: "unwritten-settings-section",
  adminKey: "unwritten-admin-key",
  settingsLeaf: "unread-settings-leaf",
  formatString: "unread-format-string",
  metadataWrite: "unwritten-metadata-field",
  metadataRead: "unread-metadata-field",
} as const;

/** One unwired knob: its authored carrier, the member name, and the exact grant identity it binds. */
interface KnobWireCandidate {
  readonly node: Node;
  readonly token: string;
  readonly subject: string;
  readonly operation: string;
  readonly detail: string;
}

/** Every belt's resolved member count — the semantic denominator the verdict rests on. */
interface KnobWireCounts {
  readonly fields: number;
  readonly sections: number;
  readonly appKeys: number;
  readonly leaves: number;
  readonly appearanceLeaves: number;
  readonly formatStrings: number;
  readonly metadataKeys: number;
}

export interface KnobWirePopulation {
  readonly candidates: readonly KnobWireCandidate[];
  readonly counts: KnobWireCounts;
  /** Members judged across all seven belts (arm F counts its keys twice — two belts, two obligations). */
  readonly members: number;
  /** Member-source declarations that resolved (settings · preset · metadata · imported sub-schemas). */
  readonly sources: number;
}

function preview(node: Node): string {
  return node.getText().slice(0, DIAGNOSTIC_PREVIEW_CHARS);
}

// ── the ONE authored-object member reader (arms B2 · C · E · F) ─────────────────────────────────────────
// ONE resolver, never a fourth: arms B2/C/F read zod object schemas and arm E reads an `as const` map, and
// both questions are "which top-level members does this authored object DECLARE". A reader that keeps only
// direct `PropertyAssignment`s drops a spread, a shorthand and an imported schema argument SILENTLY, which
// is a denominator that shrinks behind a green verdict (#1094 G4). Sanctioned shapes are followed;
// everything else THROWS. Deliberately NOT shared with `lib/bus-payload-fact.ts`'s walker: that one REPORTS
// its unreadable shapes as D16 findings against a per-field frame, an inverted contract.

/** Chain methods that leave a schema's top-level KEY SET untouched — the receiver's members are the answer.
 *  `.pick`/`.omit`/`.transform` and every unlisted builder REFUSE: they change or erase the key set, and an
 *  unmodelled builder is exactly the composition this reader cannot establish. */
const KEY_NEUTRAL_SCHEMA_METHODS: ReadonlySet<string> = new Set([
  "brand",
  "catch",
  "catchall",
  "check",
  "default",
  "describe",
  "loose",
  "meta",
  "nullable",
  "nullish",
  "optional",
  "partial",
  "passthrough",
  "prefault",
  "readonly",
  "refine",
  "required",
  "strict",
  "strip",
  "superRefine",
]);

/** The mutable half of a walk: how many members the walk has DECLARED so far (duplicates included, so an
 *  override never reads as a zero contribution). A spread that leaves it unmoved contributed nothing. */
interface MemberTally {
  declared: number;
}

/** One walk's context: the member source being read (for diagnostics), the declaration keys already on the
 *  stack (the cycle domain), and the shared tally. */
interface SchemaWalk {
  readonly label: string;
  readonly seen: ReadonlySet<string>;
  readonly tally: MemberTally;
}

/** One declared member: the expression it carries (`undefined` for a shorthand) and the AUTHORED NAME NODE
 *  the finding anchors on. The name node is what makes each member independently reportable at its own
 *  coordinate — the legacy descriptor reported every arm at `<contract>:1:0`, one coordinate for the whole
 *  population, which a final ordinary position could not express and a final reviewed identity should not. */
interface SchemaMember {
  readonly value: Node | undefined;
  readonly nameNode: Node;
}

type SchemaMembers = Map<string, SchemaMember>;

/** The declaration a schema identifier names: this file's own const, or the one a named import points at —
 *  the local-or-named-import hop, spelled per member source so each keeps its own refusal vocabulary
 *  (`lib/tuple-read.ts`'s `spreadSource` is the twin). */
function schemaBinding(owner: SourceFile, localName: string): VariableDeclaration | undefined {
  const local = owner.getVariableDeclaration(localName);
  if (local !== undefined) {
    return local;
  }
  const imported = owner
    .getImportDeclarations()
    .flatMap((declaration) => declaration.getNamedImports().map((specifier) => ({ declaration, specifier })))
    .find(({ specifier }) => (specifier.getAliasNode()?.getText() ?? specifier.getName()) === localName);
  return imported === undefined ? undefined : imported.declaration.getModuleSpecifierSourceFile()?.getVariableDeclaration(imported.specifier.getName());
}

/** A member's KEY: an identifier / quoted name read through any wrapper, or a COMPUTED key whose expression
 *  is a string literal. A computed key this reader cannot NAME would enter the population as bracket text
 *  and match no wire — refuse (the #1091 precedent). */
function memberKey(name: Node, walk: SchemaWalk): string {
  if (MorphNode.isComputedPropertyName(name)) {
    const computed = readStringValue(name.getExpression());
    if (computed === undefined) {
      throw new Error(`knob-wire-coverage: computed ${walk.label} key in ${name.getSourceFile().getFilePath()} is not a string literal: ${preview(name)}`);
    }
    return computed;
  }
  return readStringValue(name) ?? name.getText();
}

/** Fold one object literal's members into `out` (key → its value expression and authored name node).
 *  A later member overrides an earlier one, which is the runtime's own precedence. */
function collectObjectMembers(object: ObjectLiteralExpression, out: SchemaMembers, walk: SchemaWalk): void {
  for (const property of object.getProperties()) {
    const spread = property.asKind(SyntaxKind.SpreadAssignment);
    if (spread !== undefined) {
      const before = walk.tally.declared;
      collectSchemaMembers(spread.getExpression(), out, walk);
      if (walk.tally.declared === before) {
        throw new Error(`knob-wire-coverage: ${walk.label} spreads "${spread.getExpression().getText()}", which contributed zero members`);
      }
      continue;
    }
    const assignment = property.asKind(SyntaxKind.PropertyAssignment);
    if (assignment !== undefined) {
      const nameNode = assignment.getNameNode();
      out.set(memberKey(nameNode, walk), { value: assignment.getInitializer(), nameNode });
      walk.tally.declared += 1;
      continue;
    }
    // A SHORTHAND member (`{ trustHtml }`) names its key and carries no readable schema expression — the
    // key is the population, so it counts; the value stays `undefined` for the caller that needs one.
    const shorthand = property.asKind(SyntaxKind.ShorthandPropertyAssignment);
    if (shorthand !== undefined) {
      out.set(shorthand.getName(), { value: undefined, nameNode: shorthand.getNameNode() });
      walk.tally.declared += 1;
      continue;
    }
    throw new Error(`knob-wire-coverage: unsupported ${walk.label} member kind ${property.getKindName()}: ${preview(property)}`);
  }
}

/** Follow an identifier to the members of the declaration it binds — local or named import, cycle-fenced. */
function collectBoundMembers(identifier: Node, out: SchemaMembers, walk: SchemaWalk): void {
  const declaration = schemaBinding(identifier.getSourceFile(), identifier.getText());
  if (declaration === undefined) {
    throw new Error(`knob-wire-coverage: ${walk.label} binding "${identifier.getText()}" resolves to no local declaration or named import`);
  }
  const key = `${declaration.getSourceFile().getFilePath()}#${declaration.getName()}`;
  if (walk.seen.has(key)) {
    throw new Error(`knob-wire-coverage: ${walk.label} composition cycle at ${key}`);
  }
  const initializer = declaration.getInitializer();
  if (initializer === undefined) {
    throw new Error(`knob-wire-coverage: ${walk.label} source ${key} has no initializer`);
  }
  collectSchemaMembers(initializer, out, { ...walk, seen: new Set([...walk.seen, key]) });
}

/** Dispatch one `<recv>.<method>(…)` builder in a schema position. */
function collectCallMembers(call: Node, out: SchemaMembers, walk: SchemaWalk): void {
  const callee = MorphNode.isCallExpression(call) ? call.getExpression() : undefined;
  if (callee === undefined || !MorphNode.isPropertyAccessExpression(callee)) {
    throw new Error(`knob-wire-coverage: unsupported ${walk.label} expression: ${preview(call)}`);
  }
  const method = callee.getName();
  const args = MorphNode.isCallExpression(call) ? call.getArguments() : [];
  const first = args[0];
  if (method === "object") {
    if (first === undefined) {
      throw new Error(`knob-wire-coverage: ${walk.label} declares z.object() with no shape argument`);
    }
    collectSchemaMembers(first, out, walk);
    return;
  }
  if (method === "extend" || method === "merge") {
    collectSchemaMembers(callee.getExpression(), out, walk);
    if (first === undefined) {
      throw new Error(`knob-wire-coverage: ${walk.label} declares .${method}() with no argument`);
    }
    collectSchemaMembers(first, out, walk);
    return;
  }
  if (KEY_NEUTRAL_SCHEMA_METHODS.has(method)) {
    collectSchemaMembers(callee.getExpression(), out, walk);
    return;
  }
  throw new Error(`knob-wire-coverage: unsupported ${walk.label} schema method .${method}(): ${preview(call)}`);
}

/** Walk one authored-object expression, recording every top-level member it contributes. */
function collectSchemaMembers(expression: Node, out: SchemaMembers, walk: SchemaWalk): void {
  const node = unwrapExpression(expression);
  if (MorphNode.isObjectLiteralExpression(node)) {
    collectObjectMembers(node, out, walk);
    return;
  }
  if (MorphNode.isIdentifier(node)) {
    collectBoundMembers(node, out, walk);
    return;
  }
  // `{ ...base.shape }` — the sanctioned zod spelling for "every key of that schema".
  if (MorphNode.isPropertyAccessExpression(node) && node.getName() === "shape") {
    collectSchemaMembers(node.getExpression(), out, walk);
    return;
  }
  if (MorphNode.isCallExpression(node)) {
    collectCallMembers(node, out, walk);
    return;
  }
  throw new Error(`knob-wire-coverage: unsupported ${walk.label} expression: ${preview(node)}`);
}

/** Every top-level member an authored object shape declares — a `z.object` schema chain or an `as const`
 *  map — key → its value expression and authored name node, resolving object spreads, `.shape` spreads,
 *  `.extend`/`.merge` composition and local/imported bindings. Every other shape throws. */
function schemaMembers(expression: Node, label: string): SchemaMembers {
  const out: SchemaMembers = new Map();
  collectSchemaMembers(expression, out, { label, seen: new Set(), tally: { declared: 0 } });
  return out;
}

/** The members of the authored object a NAMED declaration owns. EMPTY when the file declares no such name:
 *  a conformance mini-tree legitimately omits a member source, and `assertMemberSourcePresent` owns the
 *  "the real source was renamed away" direction. */
function declaredMembers(sf: SourceFile, varName: string): SchemaMembers {
  const initializer = sf.getVariableDeclaration(varName)?.getInitializer();
  return initializer === undefined ? new Map() : schemaMembers(initializer, varName);
}

/** Every `extends` clause of the member-source interface must RESOLVE. A base binding no interface
 *  declaration would silently contribute zero fields — the shrunken-denominator failure verbatim — so it is
 *  a refusal instead (the `contract-verb-presence` #943 precedent). */
function assertHeritageResolves(iface: InterfaceDeclaration): void {
  for (const clause of iface.getExtends()) {
    const symbol = clause.getExpression().getSymbol();
    const declarations = (symbol?.getAliasedSymbol() ?? symbol)?.getDeclarations() ?? [];
    if (!declarations.some((declaration) => MorphNode.isInterfaceDeclaration(declaration))) {
      throw new Error(
        `knob-wire-coverage: ${iface.getName()} in ${iface.getSourceFile().getFilePath()} extends "${clause.getText()}", which resolves to no interface declaration — its inherited fields cannot be enumerated`,
      );
    }
  }
}

/** The properties an `interface` EXPOSES (arm A) — the RESOLVED type's properties, not the local declaration
 *  list, so a field inherited through `extends` is still a knob that owes a consumer (#1094 G2). Each keeps
 *  its DECLARING node, so an inherited field's finding lands on the base interface that owns it. A property
 *  resolving to no declaration at all is unsupported composition, and refuses. */
function interfaceFields(sf: SourceFile, name: string): readonly (readonly [string, Node])[] {
  const iface = sf.getInterface(name);
  if (iface === undefined) {
    return [];
  }
  assertHeritageResolves(iface);
  return iface
    .getType()
    .getProperties()
    .map((property): readonly [string, Node] => {
      const declaration = property.getDeclarations()[0];
      if (declaration === undefined) {
        throw new Error(`knob-wire-coverage: member "${property.getName()}" of ${name} resolves to no declaration — its field shape cannot be established`);
      }
      return [property.getName(), declaration];
    });
}

/** The members of the `<CONST> = [...] as const` section tuple (arm B) — through `lib/tuple-read.ts`, the
 *  ONE home for that question, so a member arriving through a local/imported SPREAD counts (with the node of
 *  the declaration that CONTRIBUTED it) and every other element shape refuses (#1094 G3). */
function tupleMembers(sf: SourceFile, varName: string): readonly (readonly [string, Node])[] {
  const decl = sf.getVariableDeclaration(varName);
  if (decl === undefined || decl.getInitializer() === undefined) {
    return [];
  }
  return readTupleDeclaration(decl).entries.map((entry): readonly [string, Node] => [entry.value, entry.node]);
}

// ── arm C's leaf population ─────────────────────────────────────────────────────────────────────────────
/** The object literal a `z.object({...})` CallExpression declares, else undefined. */
function zObjectArg(call: Node): ObjectLiteralExpression | undefined {
  const ex = MorphNode.isCallExpression(call) ? call.getExpression() : undefined;
  const isZObject = ex !== undefined && MorphNode.isPropertyAccessExpression(ex) && ex.getName() === "object";
  const arg = isZObject && MorphNode.isCallExpression(call) ? call.getArguments()[0] : undefined;
  return arg !== undefined && MorphNode.isObjectLiteralExpression(arg) ? arg : undefined;
}

interface SettingsLeafPopulation {
  readonly leaves: readonly (readonly [string, Node])[];
  readonly importedLeafCount: number;
  readonly importedSources: number;
}

/** Local `z.object({...})` leaves in the settings contract, minus section names and `schemaVersion`.
 *  Through the shared member reader, so a leaf reaching a LOCAL z.object through an object spread is in the
 *  denominator instead of dropped (#1094 G4 — the same key was silently missing from arms B2 AND C). */
function localSettingsLeaves(settingsCalls: readonly Node[], sections: ReadonlySet<string>, into: Map<string, Node>): void {
  for (const call of settingsCalls) {
    const obj = zObjectArg(call);
    if (obj === undefined) {
      continue;
    }
    for (const [name, member] of schemaMembers(obj, "settings schema leaf")) {
      if (!(sections.has(name) || name === "schemaVersion" || into.has(name))) {
        into.set(name, member.nameNode);
      }
    }
  }
}

function importedSettingsLeaves(settings: SourceFile, into: Map<string, Node>): number {
  const userSettings = declaredMembers(settings, USER_SETTINGS_SCHEMA);
  let imported = 0;
  for (const source of IMPORTED_SETTINGS_SCHEMA_SOURCES) {
    const composed = userSettings.get(source.section);
    if (composed === undefined) {
      throw new Error(
        `knob-wire-coverage Arm C: ${USER_SETTINGS_SCHEMA} composes no "${source.section}" property — the semantic source ${source.symbol} is unreachable`,
      );
    }
    if (composed.value === undefined) {
      throw new Error(
        `knob-wire-coverage Arm C: ${USER_SETTINGS_SCHEMA}.${source.section} carries no readable schema expression (a shorthand member names no source)`,
      );
    }
    const localName = unwrapExpression(composed.value);
    if (!MorphNode.isIdentifier(localName) || localName.getText() !== source.symbol) {
      throw new Error(
        `knob-wire-coverage Arm C: ${USER_SETTINGS_SCHEMA}.${source.section} must compose the semantic source ${source.symbol}, got ${localName.getText()}`,
      );
    }
    const members = schemaMembers(localName, source.symbol);
    if (members.size === 0) {
      throw new Error(`knob-wire-coverage Arm C: semantic source ${source.symbol} resolved to zero leaves`);
    }
    imported += members.size;
    for (const [name, member] of members) {
      if (!into.has(name)) {
        into.set(name, member.nameNode);
      }
    }
  }
  return imported;
}

function settingsLeaves(settings: SourceFile, settingsCalls: readonly Node[], sections: ReadonlySet<string>): SettingsLeafPopulation {
  const into = new Map<string, Node>();
  localSettingsLeaves(settingsCalls, sections, into);
  if (settings.getVariableDeclaration(USER_SETTINGS_SCHEMA) === undefined) {
    if (settings.getVariableDeclaration(DEFAULT_USER_SETTINGS) !== undefined) {
      throw new Error(`knob-wire-coverage Arm C: ${DEFAULT_USER_SETTINGS} exists but ${USER_SETTINGS_SCHEMA} is missing`);
    }
    return { leaves: [...into], importedLeafCount: 0, importedSources: 0 };
  }
  const importedLeafCount = importedSettingsLeaves(settings, into);
  if (into.size === 0) {
    throw new Error("knob-wire-coverage Arm C: settings semantic leaf population resolved to zero");
  }
  return { leaves: [...into], importedLeafCount, importedSources: IMPORTED_SETTINGS_SCHEMA_SOURCES.length };
}

// ── the consumer corpora, accumulated in ONE kind-indexed pass ──────────────────────────────────────────
/** Every read-shaped and presence-shaped name one file contributes, per scope. The name sets are exactly the
 *  legacy corpora: PropertyAccess name · BindingElement (binding/property) name · string ElementAccess
 *  literal · bare string literal (catching a dynamic `MAP[key]` whose key is a string-union literal).
 *  Comments are never those node kinds, so every belt is comment-SAFE by construction. */
interface Corpora {
  /** Arm A: names read off an `EffectiveAppConfig`-TYPED receiver in `packages/server/src`. */
  readonly configReads: Set<string>;
  /** Arm B: `section: "x"` literals in `packages/client/src` ∪ `packages/server/src/entry`. */
  readonly sectionWrites: Set<string>;
  /** Arm B2: any identifier/string occurrence in the admin write surfaces. */
  readonly adminNames: Set<string>;
  /** Arm C: read-shaped names in `{server,client,ui}/src` outside the settings contract itself. */
  readonly settingsReads: Set<string>;
  /** Arm E: read-shaped names in `packages/server/src`. */
  readonly presetReads: Set<string>;
  /** Arm F write: any identifier/string occurrence in `domain/chat/verbs` ∪ `transport/trpc`. */
  readonly metadataWrites: Set<string>;
  /** Arm F read: read-shaped names in `packages/server/src` outside the parser and the write scope. */
  readonly metadataReads: Set<string>;
  /** Every bare identifier in the population — the companion-anchor presence check. */
  readonly identifiers: Set<string>;
  /** Every `z.object(...)` call in the settings contract (arm C's local leaf source). */
  readonly settingsCalls: Node[];
}

function newCorpora(): Corpora {
  return {
    configReads: new Set(),
    sectionWrites: new Set(),
    adminNames: new Set(),
    settingsReads: new Set(),
    presetReads: new Set(),
    metadataWrites: new Set(),
    metadataReads: new Set(),
    identifiers: new Set(),
    settingsCalls: [],
  };
}

/** Which scopes one file belongs to — computed once per file rather than per node. */
interface FileScope {
  readonly settingsRead: boolean;
  readonly presetRead: boolean;
  readonly metadataRead: boolean;
  readonly sectionWrite: boolean;
  readonly adminWrite: boolean;
  readonly metadataWrite: boolean;
  readonly configRead: boolean;
  readonly isSettingsContract: boolean;
}

function scopeOf(path: string): FileScope {
  const server = SERVER_SRC.test(path);
  const client = CLIENT_SRC.test(path);
  const isSettingsContract = SETTINGS_CONTRACTS.test(path);
  const chatWrite = CHAT_WRITE_SCOPE.test(path);
  return {
    settingsRead: (server || client || UI_SRC.test(path)) && !isSettingsContract,
    presetRead: server,
    metadataRead: server && !METADATA_PARSER.test(path) && !chatWrite,
    sectionWrite: client || ENTRY_SCOPE.test(path),
    adminWrite: ADMIN_SURFACES.test(path),
    metadataWrite: chatWrite,
    configRead: server,
    isSettingsContract,
  };
}

function addReadShaped(scope: FileScope, corpora: Corpora, name: string): void {
  if (scope.settingsRead) {
    corpora.settingsReads.add(name);
  }
  if (scope.presetRead) {
    corpora.presetReads.add(name);
  }
  if (scope.metadataRead) {
    corpora.metadataReads.add(name);
  }
}

function addPresence(scope: FileScope, corpora: Corpora, name: string): void {
  if (scope.adminWrite) {
    corpora.adminNames.add(name);
  }
  if (scope.metadataWrite) {
    corpora.metadataWrites.add(name);
  }
}

/** The `section:` literal a `section`-named PropertyAssignment (`section: "x"`) or PropertySignature
 *  (`readonly section: "x"`) declares — both are live call-site shapes; anything else contributes nothing. */
function literalText(node: Node | undefined): string | undefined {
  return node !== undefined && MorphNode.isStringLiteral(node) ? node.getLiteralText() : undefined;
}

function sectionLiteralOf(node: Node): string | undefined {
  if (MorphNode.isPropertyAssignment(node) && node.getName() === "section") {
    return literalText(node.getInitializer());
  }
  const typeNode = MorphNode.isPropertySignature(node) && node.getName() === "section" ? node.getTypeNode() : undefined;
  return typeNode !== undefined && MorphNode.isLiteralTypeNode(typeNode) ? literalText(typeNode.getLiteral()) : undefined;
}

/** The READ-SHAPED names one node contributes: a PropertyAccess name, a BindingElement's binding and
 *  property names, a string ElementAccess literal, or a bare string literal. */
function readShapedNames(node: Node): readonly string[] {
  if (MorphNode.isPropertyAccessExpression(node)) {
    return [node.getName()];
  }
  if (MorphNode.isBindingElement(node)) {
    return [node.getNameNode(), node.getPropertyNameNode()].flatMap((candidate) =>
      candidate !== undefined && MorphNode.isIdentifier(candidate) ? [candidate.getText()] : [],
    );
  }
  if (MorphNode.isElementAccessExpression(node)) {
    const argument = node.getArgumentExpression();
    return argument !== undefined && MorphNode.isStringLiteral(argument) ? [argument.getLiteralText()] : [];
  }
  return MorphNode.isStringLiteral(node) ? [node.getLiteralText()] : [];
}

/** The PRESENCE-shaped name one node contributes: a bare identifier or a string literal, which is what arms
 *  B2 and F-write key on (the `contract-verb-presence` name-keyed posture). */
function presenceName(node: Node): string | undefined {
  if (MorphNode.isIdentifier(node)) {
    return node.getText();
  }
  return MorphNode.isStringLiteral(node) ? node.getLiteralText() : undefined;
}

/** Arm A: a name read off an `EffectiveAppConfig`-TYPED receiver. Type-keyed (`analysis: "types"`), so an
 *  unrelated `.rateLimits` on some other object never counts as consumption. */
function configReadName(node: Node, scope: FileScope): string | undefined {
  if (!(scope.configRead && MorphNode.isPropertyAccessExpression(node))) {
    return;
  }
  const type = node.getExpression().getType();
  return (type.getSymbol() ?? type.getAliasSymbol())?.getName() === EFFECTIVE_APP_CONFIG ? node.getName() : undefined;
}

function visitNode(node: Node, scope: FileScope, corpora: Corpora): void {
  for (const name of readShapedNames(node)) {
    addReadShaped(scope, corpora, name);
  }
  const presence = presenceName(node);
  if (presence !== undefined) {
    addPresence(scope, corpora, presence);
    if (MorphNode.isIdentifier(node)) {
      corpora.identifiers.add(presence);
    }
  }
  const configRead = configReadName(node, scope);
  if (configRead !== undefined) {
    corpora.configReads.add(configRead);
  }
  if (MorphNode.isCallExpression(node)) {
    if (scope.isSettingsContract) {
      corpora.settingsCalls.push(node);
    }
    return;
  }
  const section = scope.sectionWrite ? sectionLiteralOf(node) : undefined;
  if (section !== undefined) {
    corpora.sectionWrites.add(section);
  }
}

// ── the per-belt reconcile ──────────────────────────────────────────────────────────────────────────────
interface Belt {
  readonly members: readonly (readonly [string, Node])[];
  readonly wired: ReadonlySet<string>;
  readonly operation: string;
  readonly subjectOf: (member: string) => string;
  readonly detailOf: (member: string) => string;
}

function runBelt(belt: Belt, into: KnobWireCandidate[]): number {
  for (const [member, node] of belt.members) {
    if (!belt.wired.has(member)) {
      into.push({ node, token: member, subject: belt.subjectOf(member), operation: belt.operation, detail: belt.detailOf(member) });
    }
  }
  return belt.members.length;
}

/** A member source that VANISHED while its companion anchor survived is a renamed-away source, and the belt
 *  would go vacuous-green over it. The legacy descriptor reported that as an ordinary finding; a finding of a
 *  `reviewed-grant` policy is grantable, and a permanent licence over a vacuous arm is precisely the failure
 *  the tripwire exists to prevent — so the successor is an UNSUPPRESSIBLE refusal (exit 2), the same class as
 *  every other "this denominator cannot be established" arm in this reader. Content-guarded on the anchor, so
 *  a synthetic mini-tree lacking both never fires it. */
function assertMemberSourcePresent(memberCount: number, anchor: string, source: string, corpora: Corpora): void {
  if (memberCount === 0 && corpora.identifiers.has(anchor)) {
    throw new Error(
      `knob-wire-coverage: the ${anchor} companion anchor is present but the ${source} member source is not — it was renamed away, so the belt would go vacuous-green. Re-point the member source in tooling/src/verify/lib/knob-wire-fact.ts (path-keyed-gates-die-on-rename; Core-Path-Registry.md D107).`,
    );
  }
}

function reconcile(files: readonly SourceFile[], corpora: Corpora): KnobWirePopulation {
  const settings = files.find((sf) => SETTINGS_CONTRACTS.test(sf.getFilePath()));
  const preset = files.find((sf) => PRESET_CONTRACTS.test(sf.getFilePath()));
  const metadata = files.find((sf) => METADATA_PARSER.test(sf.getFilePath()));

  const candidates: KnobWireCandidate[] = [];
  let members = 0;
  let sources = 0;
  let fields = 0;
  let sections = 0;
  let appKeys = 0;
  let leaves = 0;
  let appearanceLeaves = 0;
  let formatStrings = 0;
  let metadataKeys = 0;

  if (settings !== undefined) {
    sources += 1;
    const fieldMembers = interfaceFields(settings, EFFECTIVE_APP_CONFIG);
    const sectionMembers = tupleMembers(settings, USER_SETTINGS_SECTIONS);
    const appKeyMembers = [...declaredMembers(settings, APP_SETTINGS_SCHEMA)].map(([name, member]): readonly [string, Node] => [name, member.nameNode]);
    const leafPopulation = settingsLeaves(settings, corpora.settingsCalls, new Set(sectionMembers.map(([name]) => name)));
    assertMemberSourcePresent(fieldMembers.length, ANCHOR_GET_EFFECTIVE_CONFIG, EFFECTIVE_APP_CONFIG, corpora);
    assertMemberSourcePresent(sectionMembers.length, ANCHOR_UPDATE_SECTION, USER_SETTINGS_SECTIONS, corpora);
    fields = runBelt(
      {
        members: fieldMembers,
        wired: corpora.configReads,
        operation: KNOB_WIRE_OPERATIONS.configField,
        subjectOf: (member) => `${EFFECTIVE_APP_CONFIG}.${member}`,
        detailOf: (member) => `${EFFECTIVE_APP_CONFIG}.${member} is resolved (env floor ⊕ admin override) but READ by no server behavior`,
      },
      candidates,
    );
    sections = runBelt(
      {
        members: sectionMembers,
        wired: corpora.sectionWrites,
        operation: KNOB_WIRE_OPERATIONS.settingsSection,
        subjectOf: (member) => `${USER_SETTINGS_SECTIONS}.${member}`,
        detailOf: (member) => `${USER_SETTINGS_SECTIONS} "${member}" has no reachable section-patch write path (client or compose seed)`,
      },
      candidates,
    );
    appKeys = runBelt(
      {
        members: appKeyMembers,
        wired: corpora.adminNames,
        operation: KNOB_WIRE_OPERATIONS.adminKey,
        subjectOf: (member) => `${APP_SETTINGS_SCHEMA}.${member}`,
        detailOf: (member) => `${APP_SETTINGS_SCHEMA} key "${member}" has no write field in the admin surfaces (features/settings ∪ user-admin)`,
      },
      candidates,
    );
    leaves = runBelt(
      {
        members: leafPopulation.leaves,
        wired: corpora.settingsReads,
        operation: KNOB_WIRE_OPERATIONS.settingsLeaf,
        subjectOf: (member) => `${USER_SETTINGS_SCHEMA}.${member}`,
        detailOf: (member) => `settings schema leaf "${member}" is READ by nothing — the knob is dead from the schema down (the dupThreshold class)`,
      },
      candidates,
    );
    appearanceLeaves = leafPopulation.importedLeafCount;
    sources += leafPopulation.importedSources;
    members += fields + sections + appKeys + leaves;
  }

  if (preset !== undefined) {
    sources += 1;
    const formatMembers = [...declaredMembers(preset, DEFAULT_FORMAT_STRINGS)].map(([name, member]): readonly [string, Node] => [name, member.nameNode]);
    assertMemberSourcePresent(formatMembers.length, ANCHOR_PRESET_SCHEMA, DEFAULT_FORMAT_STRINGS, corpora);
    formatStrings = runBelt(
      {
        members: formatMembers,
        wired: corpora.presetReads,
        operation: KNOB_WIRE_OPERATIONS.formatString,
        subjectOf: (member) => `${DEFAULT_FORMAT_STRINGS}.${member}`,
        detailOf: (member) =>
          `${DEFAULT_FORMAT_STRINGS}.${member} is an editable/importable format string READ by no server behavior — a lie to the user and the ST importer`,
      },
      candidates,
    );
    members += formatStrings;
  }

  if (metadata !== undefined) {
    sources += 1;
    const metaMembers = [...declaredMembers(metadata, CHAT_METADATA_SCHEMA)].map(([name, member]): readonly [string, Node] => [name, member.nameNode]);
    assertMemberSourcePresent(metaMembers.length, ANCHOR_PARSE_METADATA, CHAT_METADATA_SCHEMA, corpora);
    metadataKeys = runBelt(
      {
        members: metaMembers,
        wired: corpora.metadataWrites,
        operation: KNOB_WIRE_OPERATIONS.metadataWrite,
        subjectOf: (member) => `${CHAT_METADATA_SCHEMA}.${member}`,
        detailOf: (member) =>
          `${CHAT_METADATA_SCHEMA}.${member} has no write verb (domain/chat/verbs ∪ transport/trpc) — a metadata field whose documentation lies`,
      },
      candidates,
    );
    runBelt(
      {
        members: metaMembers,
        wired: corpora.metadataReads,
        operation: KNOB_WIRE_OPERATIONS.metadataRead,
        subjectOf: (member) => `${CHAT_METADATA_SCHEMA}.${member}`,
        detailOf: (member) => `${CHAT_METADATA_SCHEMA}.${member} is never READ outside the parser + write scope — dead parse weight`,
      },
      candidates,
    );
    members += metadataKeys * 2;
  }

  return {
    candidates,
    counts: { fields, sections, appKeys, leaves, appearanceLeaves, formatStrings, metadataKeys },
    members,
    sources,
  };
}

/** The kinds every belt's corpus is derived from. `CallExpression` is arm C's local leaf source; the two
 *  property kinds carry the `section: "x"` write literal; the rest are the read/presence shapes. */
const KNOB_WIRE_KINDS = [
  SyntaxKind.PropertyAccessExpression,
  SyntaxKind.BindingElement,
  SyntaxKind.ElementAccessExpression,
  SyntaxKind.StringLiteral,
  SyntaxKind.Identifier,
  SyntaxKind.CallExpression,
  SyntaxKind.PropertyAssignment,
  SyntaxKind.PropertySignature,
] as const;

export const knobWireFact = defineFact({
  id: "knob-wire-coverage",
  population: ["@contracts", "@server", "@client", "@ui"],
  analysis: "types",
  resources: [],
  create: (ctx) => {
    const corpora = newCorpora();
    const scopes = new Map<string, FileScope>();
    const scopeFor = (sourceFile: SourceFile): FileScope => {
      const path = sourceFile.getFilePath();
      const hit = scopes.get(path);
      if (hit !== undefined) {
        return hit;
      }
      const scope = scopeOf(path);
      scopes.set(path, scope);
      return scope;
    };
    return {
      visitors: [{ kinds: [...KNOB_WIRE_KINDS], visit: (node, sourceFile) => visitNode(node, scopeFor(sourceFile), corpora) }],
      finish: (): KnobWirePopulation => {
        ctx.receipt({ kind: "population", source: "knob-wire-corpus-files", members: ctx.files.length });
        return reconcile(ctx.files, corpora);
      },
    };
  },
});
