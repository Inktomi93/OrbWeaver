// THE MEMBER SOURCES of `knob-wire-coverage` (D107): which members each source DECLARES — the ONE
// authored-object member reader arms B2/C/E/F share (`declaredMembers`), the resolved-interface reader (arm
// A, `interfaceFields`), the tuple reader (arm B, `tupleMembers`), arm C's leaf population (`settingsLeaves`)
// and the member-source constants with their paired anchors. A population this module cannot establish is
// a THROW, never a shorter list (`knob-wire-fact.ts`'s header states why). Split out at the size cap
// (2026-09-18); one-way — this module imports nothing from `knob-wire-fact.ts` or `knob-wire-corpora.ts`.
import type { InterfaceDeclaration, Node, ObjectLiteralExpression, SourceFile, VariableDeclaration } from "ts-morph";
import { Node as MorphNode, SyntaxKind } from "ts-morph";
import { readStringValue, unwrapExpression } from "./ast-read.ts";
import { readMemberAccess } from "./symbol-reference.ts";
import { readTupleDeclaration } from "./tuple-read.ts";

// ── member sources and their paired-anchor rename tripwires ─────────────────────────────────────────────
export const SETTINGS_CONTRACTS = /\/packages\/contracts\/src\/settings\/index\.ts$/u;
export const PRESET_CONTRACTS = /\/packages\/contracts\/src\/preset\/index\.ts$/u;
export const METADATA_PARSER = /\/packages\/server\/src\/domain\/chat\/contract\/metadata\.ts$/u;

export const EFFECTIVE_APP_CONFIG = "EffectiveAppConfig";
export const APP_SETTINGS_SCHEMA = "appSettingsSchema";
export const USER_SETTINGS_SECTIONS = "USER_SETTINGS_SECTIONS";
export const USER_SETTINGS_SCHEMA = "userSettingsSchema";
const DEFAULT_USER_SETTINGS = "DEFAULT_USER_SETTINGS";
export const DEFAULT_FORMAT_STRINGS = "DEFAULT_FORMAT_STRINGS";
export const CHAT_METADATA_SCHEMA = "chatMetadataSchema";
const DIAGNOSTIC_PREVIEW_CHARS = 120;

/** Companion anchors: present ⇒ the member source MUST be findable, else the source was renamed away. */
export const ANCHOR_GET_EFFECTIVE_CONFIG = "getEffectiveConfig";
export const ANCHOR_UPDATE_SECTION = "updateUserSettingsSection";
export const ANCHOR_PRESET_SCHEMA = "presetSchema";
export const ANCHOR_PARSE_METADATA = "parseChatMetadata";

/** Arm C's imported semantic sources. Each row is a contract-graph edge, not a second member list: the
 *  resolver proves that `userSettingsSchema.<section>` reaches the named exported z.object and derives that
 *  object's top-level leaves. A rename, removed composition edge, cycle, or unsupported expression is a
 *  refusal instead of a smaller denominator reported as clean. */
const IMPORTED_SETTINGS_SCHEMA_SOURCES = [{ section: "appearance", symbol: "appearanceSettingsSchema" }] as const;

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

/** Dispatch one `<recv>.<method>(…)` builder in a schema position. The METHOD is read through
 *  `lib/symbol-reference.ts#readMemberAccess` (#2353), so `z["object"]({ … })` and `.extend`/`.prefault`
 *  spelled with brackets are the same builder as their dotted twins. Keyed on `PropertyAccessExpression`
 *  alone this reader THREW on every bracket-spelled schema — a loud tool error rather than a silent pass,
 *  but still a gate that stopped judging six of its own `mustFlag` fixtures under the respelling. */
function collectCallMembers(call: Node, out: SchemaMembers, walk: SchemaWalk): void {
  const callee = MorphNode.isCallExpression(call) ? call.getExpression() : undefined;
  const read = callee === undefined ? undefined : readMemberAccess(callee);
  if (read === undefined) {
    throw new Error(`knob-wire-coverage: unsupported ${walk.label} expression: ${preview(call)}`);
  }
  const method = read.name;
  const receiver = read.receiver;
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
    collectSchemaMembers(receiver, out, walk);
    if (first === undefined) {
      throw new Error(`knob-wire-coverage: ${walk.label} declares .${method}() with no argument`);
    }
    collectSchemaMembers(first, out, walk);
    return;
  }
  if (KEY_NEUTRAL_SCHEMA_METHODS.has(method)) {
    collectSchemaMembers(receiver, out, walk);
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
  // `{ ...base.shape }` / `{ ...base["shape"] }` — the sanctioned zod spelling for "every key of that schema".
  const shape = readMemberAccess(node);
  if (shape !== undefined && shape.name === "shape") {
    collectSchemaMembers(shape.receiver, out, walk);
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
export function declaredMembers(sf: SourceFile, varName: string): SchemaMembers {
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
export function interfaceFields(sf: SourceFile, name: string): readonly (readonly [string, Node])[] {
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
export function tupleMembers(sf: SourceFile, varName: string): readonly (readonly [string, Node])[] {
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

export function settingsLeaves(settings: SourceFile, settingsCalls: readonly Node[], sections: ReadonlySet<string>): SettingsLeafPopulation {
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
