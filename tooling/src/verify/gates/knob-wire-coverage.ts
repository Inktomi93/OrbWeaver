// Gate: knob-wire-coverage (D107) — the declared-knob-is-wired ratchet. A settings field/section/leaf, an
// `AppSettings` admin-editor key, a `DEFAULT_FORMAT_STRINGS` format string, or a `chatMetadataSchema` field
// that validates + stores but is never WRITTEN or never READ is a DEAD SWITCH: an edit silently governs
// nothing (the rateLimits dead-ended-pair, the permanently-OFF memory.enabled, the read-by-nobody
// dupThreshold). Six arms share ONE reconcile skeleton over one two-map registry — DOORWAY
// (sanctioned-indefinite rebuild seam, cited) and DEFERRED (tracked debt, cited) — both self-cleaning in
// BOTH directions (the D50 bus-coverage discipline): a member absent from both maps with no wire is
// MISSING-RED; a member that GAINED its wire but still carries an entry is STALE-RED; an entry naming a
// member that no longer exists is ORPHAN-RED. EVERY ARM FOLLOWS THE COMPOSITION ITS SOURCE LAW SANCTIONS OR
// REFUSES LOUDLY (#1094; arms A/B/B2/C/E/F were left local-only when #934 re-homed arm C's imported axis):
// A reads the interface's RESOLVED type, so an INHERITED `EffectiveAppConfig` field is a subject and an
// `extends` binding nothing refuses; B reads `lib/tuple-read.ts`, so a spread section member counts; B2/C/E/F
// share ONE authored-object reader that follows object spreads, `.shape` spreads, `.extend`/`.merge` and
// local/imported bindings, and throws on every other member kind, unbound binding, cycle, or zero-member
// contribution. Arm C also follows a precise imported semantic-source manifest for sanctioned sub-schema
// modules. The scan line prints every arm's member count and each is a declared population, so a shrunken
// denominator is loud instead of clean; the member sources keep their paired-anchor rename tripwires.
// Whole-project ts-morph run; full spec: docs/history/reviews/stickler/2026-07-25-knob-drift-gates.md;
// ruling: Core-Path-Registry.md D107; Spine-Config-and-Serialization.md §"Settings / config".
import type { InterfaceDeclaration, ObjectLiteralExpression, Project, SourceFile, Type, VariableDeclaration } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { ExemptionTable, GateDescriptor, GateRunCtx } from "../contract/gate.ts";
import type { Violation } from "../contract/harness.ts";
import { readStringValue, unwrapExpression } from "../lib/ast-read.ts";
import { readTupleDeclaration } from "../lib/tuple-read.ts";

// ── the two-map registry (keyed "<arm>:<member>") ───────────────────────────────────────────────────────
// DOORWAY = a SANCTIONED, indefinitely-dormant rebuild seam a purged/future domain will graft onto (never
// re-litigated, only stale-checked). DEFERRED = TRACKED DEBT with a remediation cite. Delete an entry the
// moment its wire lands (the gate REDs the stale entry). Founding set verified against the live tree
// 2026-07-25 (docs/history/reviews/stickler/2026-07-25-knob-drift-gates.md §7 "Founding entries").
const DOORWAY: ExemptionTable = {
  // F: read-live at entry/compose/chat.ts (meta.providerRouting → RouteChatAssignment) but NO verb/router
  // writes it — domain/connection/verbs/resolve-chat.ts's header says the middle hop is "intentionally NOT
  // wired". A per-chat connection-overlay writer is the intended graft (D107; audit Q2).
  "F:providerRouting:write": { why: 'resolve-chat.ts "intentionally NOT wired" + D107 (audit Q2) — a per-chat connection-overlay writer is the future graft.' },
  // NOTE: `roleDefaults.agent` (the buddy-rebuild seam) needs NO entry — "agent" is a GENERIC leaf name, so
  // arm C's documented name-keyed lenience (a generic name passes on any unrelated `"agent"` occurrence)
  // lets it through; only a distinctively-named dead leaf ever bites. Listing it would be a permanent stale.
};

const DEFERRED: ExemptionTable = {
  // A: resolved (env floor ⊕ admin override) but READ by no server behavior outside the resolver.
  "A:importSkipCharacters": {
    why: "D107 triage — resolved env-floor list read by no import behavior; remediation = domain/import consumes getEffectiveConfig().importSkipCharacters.",
  },
  "A:allowNonOwnerLocalCompute": {
    why: "D107 triage — resolved compute-permission read by no behavior outside the resolver; remediation = the non-owner local-compute gate reads getEffectiveConfig().allowNonOwnerLocalCompute.",
  },
  // B: a USER_SETTINGS_SECTIONS member with no reachable section-patch write path — its schema defaults are
  // pinned for every user (the memory.enabled class: a master switch nobody can flip). memory + worldInfo
  // WIRED 2026-07-25 (Phase B ①/②, the settings-section contribution seam: features/chat's
  // memory-settings-section writes section:"memory"; features/world-info's world-info-settings-section
  // writes section:"worldInfo") — entries pruned. workloads WIRED 2026-07-26 (Phase B ⑤: features/workloads'
  // workloads-tuning-section writes section:"workloads" — dupThreshold/computeThemesK/maxPairs/hubFraction).
  "B:profile": {
    why: "D107 — the settings-wiring remediation program (profile.avatarAssetId is live-read but the section has zero writers; the user's own avatar is unsettable).",
  },
  "B:groupDefaults": {
    why: "D107 audit Q1 — READ half wired 2026-07-25 (start-chat seeds metadata.group when the creator's defaults deviate); the section-patch WRITE path (a groupDefaults editor) rides the settings-wiring program.",
  },
  // B2: an AppSettings admin-editor key with no write field in the admin surfaces. memoryDefaults +
  // memorySummarizer + rateLimits WIRED 2026-07-26 (Phase B ③: features/user-admin's memory-tuning-section +
  // rate-limits-section write them through the admin pane's settings-section seam) — entries pruned.
  "B2:importSkipCharacters": {
    why: "D107 — the admin-editor wave of the settings-wiring program (verified UI-less 2026-07-25: zero admin-surface write field).",
  },
  // C: a settings schema leaf READ by nothing — dead from the schema down. personaWizardSeen DELETED
  // 2026-07-26 (Phase B ⑥ / D107): the first-run persona gate triggers on zero personas, never a "seen" flag,
  // so the field was removed (the rateLimits.general dead-field precedent) — entry pruned with the field.
};

// ── member-source symbols + their paired-anchor rename tripwires ─────────────────────────────────────────
// If the companion anchor identifier is present in the tree but the member-source symbol is NOT, the source
// was renamed away → RED loudly (never a vacuous green). Content-guarded so synthetic mini-trees can't
// misfire (the verify-registry-parity arm-2 pattern).
const SETTINGS_CONTRACTS = /\/packages\/contracts\/src\/settings\/index\.ts$/u;
const PRESET_CONTRACTS = /\/packages\/contracts\/src\/preset\/index\.ts$/u;

const EFFECTIVE_APP_CONFIG = "EffectiveAppConfig";
const APP_SETTINGS_SCHEMA = "appSettingsSchema";
const USER_SETTINGS_SECTIONS = "USER_SETTINGS_SECTIONS";
const DEFAULT_FORMAT_STRINGS = "DEFAULT_FORMAT_STRINGS";
const CHAT_METADATA_SCHEMA = "chatMetadataSchema";
const DIAGNOSTIC_PREVIEW_CHARS = 120;

// Arm C's imported semantic sources. Each row is a contract-graph edge, not a second member list: the
// resolver below proves that `userSettingsSchema.<section>` reaches the named exported z.object and derives
// that object's top-level leaves. A rename, removed composition edge, cycle, or unsupported expression is a
// tool error instead of a smaller denominator reported as clean.
const IMPORTED_SETTINGS_SCHEMA_SOURCES = [{ section: "appearance", symbol: "appearanceSettingsSchema" }] as const;

// Companion anchors (present ⇒ the member source MUST be findable, else the source was renamed away).
const ANCHOR_GET_EFFECTIVE_CONFIG = "getEffectiveConfig";
const ANCHOR_UPDATE_SECTION = "updateUserSettingsSection";
const ANCHOR_PRESET_SCHEMA = "presetSchema";
const ANCHOR_PARSE_METADATA = "parseChatMetadata";

// ── scopes ──────────────────────────────────────────────────────────────────────────────────────────────
const SERVER_SRC = /\/packages\/server\/src\//u;
// Arm A: the resolver (a function returning EffectiveAppConfig) DEFAULTS every field off an AppSettings
// receiver — its reads are AppSettings-typed, never EffectiveAppConfig-typed, so type-keying already
// excludes it from the consumer set; the config-cache APPLICATION seam (reloadEffectiveConfig rebinding
// live subsystems, e.g. logger.level = resolved.logLevel) is a GENUINE consumer and stays IN scope. So arm
// A needs no path exclusion — the type-key is the whole filter (deviation from the spec's broad
// domain/settings/** exclusion: that hid the load-bearing logLevel application; verified 2026-07-25).
const CLIENT_SERVER_UI_SRC = /\/packages\/(?:server|client|ui)\/src\//u;
const CLIENT_SRC = /\/packages\/client\/src\//u;
const ENTRY_SCOPE = /\/packages\/server\/src\/entry\//u;
const CONTRACTS_SRC = /\/packages\/contracts\/src\//u;
// Arm B2: the admin write surfaces (settings + user-admin feature dirs).
const ADMIN_SURFACES = /\/packages\/client\/src\/features\/(?:settings|user-admin)\//u;
// Arm F: metadata WRITE scope (verbs + tRPC routers); the parser file is excluded from the READ scope.
const CHAT_WRITE_SCOPE = /\/packages\/server\/src\/(?:domain\/chat\/verbs|transport\/trpc)\//u;
const METADATA_PARSER = /\/packages\/server\/src\/domain\/chat\/contract\/metadata\.ts$/u;

const TEST_FILE_RE = /\.test\.tsx?$/u;

function isTest(fp: string): boolean {
  return TEST_FILE_RE.test(fp);
}

// ── generic helpers ─────────────────────────────────────────────────────────────────────────────────────
function findFile(project: Project, re: RegExp): SourceFile | undefined {
  return project.getSourceFiles().find((sf) => re.test(sf.getFilePath()));
}

/** Does any file in the project mention `ident` as a bare identifier (the companion-anchor presence
 *  check)? Content-guarded so a synthetic tree lacking the anchor never activates the tripwire. */
function identifierPresent(project: Project, ident: string): boolean {
  for (const sf of project.getSourceFiles()) {
    for (const id of sf.getDescendantsOfKind(SyntaxKind.Identifier)) {
      if (id.getText() === ident) {
        return true;
      }
    }
  }
  return false;
}

// ── the ONE authored-object member reader (arms B2 · C · E · F) ─────────────────────────────────────────
// ONE resolver, never a fourth: arms B2/C/F read zod object schemas and arm E reads an `as const` map, and
// both questions are "which top-level members does this authored object DECLARE". A reader that keeps only
// direct `PropertyAssignment`s drops a spread, a shorthand and an imported schema argument SILENTLY, which
// is a denominator that shrinks behind a green ✓ (#1094 G4; the `_shared/schema-read.ts` #1035 rule —
// EVERY MEMBER KIND IS ANSWERED, NONE IS SKIPPED). Sanctioned shapes are followed; everything else THROWS
// (⇒ a ToolError attributed to this gate, exit 2), because a knob population this reader cannot establish
// must never read as a smaller one. Deliberately NOT shared with `bus-payload-allowlist`'s walker: that one
// REPORTS its unreadable shapes as D16 findings against a per-field frame, an inverted contract.

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

function preview(node: Node): string {
  return node.getText().slice(0, DIAGNOSTIC_PREVIEW_CHARS);
}

/** The declaration a schema identifier names: this file's own const, or the one a named import points at —
 *  the local-or-named-import hop, spelled per member source so each keeps its own refusal vocabulary
 *  (`lib/tuple-read.ts` `spreadSource` and `chat-viewer-plane-canon-reads`'s `matrixBinding` are the twins). */
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
  if (Node.isComputedPropertyName(name)) {
    const computed = readStringValue(name.getExpression());
    if (computed === undefined) {
      throw new Error(`knob-wire-coverage: computed ${walk.label} key in ${name.getSourceFile().getFilePath()} is not a string literal: ${preview(name)}`);
    }
    return computed;
  }
  return readStringValue(name) ?? name.getText();
}

/** Fold one object literal's members into `out` (key → its value expression, `undefined` for a shorthand).
 *  A later member overrides an earlier one, which is the runtime's own precedence. */
function collectObjectMembers(object: ObjectLiteralExpression, out: Map<string, Node | undefined>, walk: SchemaWalk): void {
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
      out.set(memberKey(assignment.getNameNode(), walk), assignment.getInitializer());
      walk.tally.declared += 1;
      continue;
    }
    // A SHORTHAND member (`{ trustHtml }`) names its key and carries no readable schema expression — the
    // key is the population, so it counts; the value stays `undefined` for the caller that needs one.
    const shorthand = property.asKind(SyntaxKind.ShorthandPropertyAssignment);
    if (shorthand !== undefined) {
      out.set(shorthand.getName(), undefined);
      walk.tally.declared += 1;
      continue;
    }
    throw new Error(`knob-wire-coverage: unsupported ${walk.label} member kind ${property.getKindName()}: ${preview(property)}`);
  }
}

/** Follow an identifier to the members of the declaration it binds — local or named import, cycle-fenced. */
function collectBoundMembers(identifier: Node, out: Map<string, Node | undefined>, walk: SchemaWalk): void {
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
function collectCallMembers(call: Node, out: Map<string, Node | undefined>, walk: SchemaWalk): void {
  const callee = Node.isCallExpression(call) ? call.getExpression() : undefined;
  if (callee === undefined || !Node.isPropertyAccessExpression(callee)) {
    throw new Error(`knob-wire-coverage: unsupported ${walk.label} expression: ${preview(call)}`);
  }
  const method = callee.getName();
  const args = Node.isCallExpression(call) ? call.getArguments() : [];
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
function collectSchemaMembers(expression: Node, out: Map<string, Node | undefined>, walk: SchemaWalk): void {
  const node = unwrapExpression(expression);
  if (Node.isObjectLiteralExpression(node)) {
    collectObjectMembers(node, out, walk);
    return;
  }
  if (Node.isIdentifier(node)) {
    collectBoundMembers(node, out, walk);
    return;
  }
  // `{ ...base.shape }` — the sanctioned zod spelling for "every key of that schema".
  if (Node.isPropertyAccessExpression(node) && node.getName() === "shape") {
    collectSchemaMembers(node.getExpression(), out, walk);
    return;
  }
  if (Node.isCallExpression(node)) {
    collectCallMembers(node, out, walk);
    return;
  }
  throw new Error(`knob-wire-coverage: unsupported ${walk.label} expression: ${preview(node)}`);
}

/** Every top-level member an authored object shape declares — a `z.object` schema chain or an `as const`
 *  map — key → its value expression, resolving object spreads, `.shape` spreads, `.extend`/`.merge`
 *  composition and local/imported bindings. Every other shape throws. */
function schemaMembers(expression: Node, label: string): Map<string, Node | undefined> {
  const out = new Map<string, Node | undefined>();
  collectSchemaMembers(expression, out, { label, seen: new Set(), tally: { declared: 0 } });
  return out;
}

/** The members of the authored object a NAMED declaration owns. EMPTY when the file declares no such name:
 *  a conformance mini-tree legitimately omits a member source, and the paired-anchor tripwire owns the
 *  "the real source was renamed away" direction. */
function declaredMembers(sf: SourceFile, varName: string): Map<string, Node | undefined> {
  const initializer = sf.getVariableDeclaration(varName)?.getInitializer();
  return initializer === undefined ? new Map<string, Node | undefined>() : schemaMembers(initializer, varName);
}

/** The keys of the authored object a NAMED declaration owns (arms B2 · E · F). */
function declaredKeys(sf: SourceFile, varName: string): string[] {
  return [...declaredMembers(sf, varName).keys()];
}

/** Every `extends` clause of the member-source interface must RESOLVE. A base binding no interface
 *  declaration would silently contribute zero fields — the shrunken-denominator failure verbatim — so it is
 *  a tool error instead (the `contract-verb-presence` #943 / `message-kind-policy-coverage` #947 precedent). */
function assertHeritageResolves(iface: InterfaceDeclaration): void {
  for (const clause of iface.getExtends()) {
    const symbol = clause.getExpression().getSymbol();
    const declarations = (symbol?.getAliasedSymbol() ?? symbol)?.getDeclarations() ?? [];
    if (!declarations.some((declaration) => Node.isInterfaceDeclaration(declaration))) {
      throw new Error(
        `knob-wire-coverage: ${iface.getName()} in ${iface.getSourceFile().getFilePath()} extends "${clause.getText()}", which resolves to no interface declaration — its inherited fields cannot be enumerated`,
      );
    }
  }
}

/** The property names an `interface` EXPOSES (arm A) — the RESOLVED type's properties, not the local
 *  declaration list, so a field inherited through `extends` is still a knob that owes a consumer (#1094 G2).
 *  A property resolving to no declaration at all is unsupported composition, and refuses. */
function interfaceKeys(sf: SourceFile, name: string): string[] {
  const iface = sf.getInterface(name);
  if (iface === undefined) {
    return [];
  }
  assertHeritageResolves(iface);
  return iface
    .getType()
    .getProperties()
    .map((property) => {
      if (property.getDeclarations().length === 0) {
        throw new Error(`knob-wire-coverage: member "${property.getName()}" of ${name} resolves to no declaration — its field shape cannot be established`);
      }
      return property.getName();
    });
}

/** The members of the `<CONST> = [...] as const` section tuple (arm B) — through `lib/tuple-read.ts`, the
 *  ONE home for that question, so a member arriving through a local/imported SPREAD counts and every other
 *  element shape refuses (#1094 G3; six sibling gates already read it this way). */
function tupleMembers(sf: SourceFile, varName: string): string[] {
  const decl = sf.getVariableDeclaration(varName);
  return decl === undefined || decl.getInitializer() === undefined ? [] : [...readTupleDeclaration(decl).members];
}

// ── reader corpora ──────────────────────────────────────────────────────────────────────────────────────
/** Every property name READ off a receiver whose TYPE symbol (or alias symbol) is `typeName`, in files the
 *  `inScope` predicate accepts. Type-keyed (ctx.checker via ts-morph .getType()) so an unrelated `.rateLimits`
 *  on some other object never counts. */
function typedReadNames(project: Project, typeName: string, inScope: (fp: string) => boolean): Set<string> {
  const out = new Set<string>();
  for (const sf of project.getSourceFiles()) {
    if (!inScope(sf.getFilePath())) {
      continue;
    }
    for (const pa of sf.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)) {
      const t: Type = pa.getExpression().getType();
      const sym = t.getSymbol() ?? t.getAliasSymbol();
      if (sym?.getName() === typeName) {
        out.add(pa.getName());
      }
    }
  }
  return out;
}

/** Wrap a per-file collector so each file's contribution is derived ONCE.
 *
 *  The collectors below are pure per-file derivations, but the call sites differ only in SCOPE:
 *  `readShapedNames` runs three times and `anyNameOccurrences` twice, over overlapping file sets (two of
 *  the read scopes are both SERVER_SRC with different exclusions). Without this, a file in two scopes was
 *  walked once per scope for an answer that cannot differ
 *  (docs/reviews/research/2026-08-31-gate-pass-unified-walk.md §2).
 *
 *  Keyed on `sf.compilerNode`, never the `SourceFile` wrapper, which is reused across
 *  `createSourceFile(…, {overwrite:true})` (GATE-AUTHORING.md §5). That also makes the module-level cache
 *  safe across the many `runPass` calls conformance makes: a new project means new compiler nodes. */
function perFileNames(per: (sf: SourceFile, out: Set<string>) => void): (sf: SourceFile) => ReadonlySet<string> {
  const cache = new WeakMap<object, ReadonlySet<string>>();
  return (sf: SourceFile): ReadonlySet<string> => {
    const key: object = sf.compilerNode;
    const hit = cache.get(key);
    if (hit !== undefined) {
      return hit;
    }
    const out = new Set<string>();
    per(sf, out);
    cache.set(key, out);
    return out;
  };
}

/** Accumulate names one file contributes, per a per-file collector, over the files `inScope` accepts. */
function collectNames(project: Project, inScope: (fp: string) => boolean, of: (sf: SourceFile) => ReadonlySet<string>): Set<string> {
  const out = new Set<string>();
  for (const sf of project.getSourceFiles()) {
    if (inScope(sf.getFilePath())) {
      for (const name of of(sf)) {
        out.add(name);
      }
    }
  }
  return out;
}

/** One file's read-shaped names: PropertyAccess name · BindingElement (binding/property) name · string
 *  ElementAccess literal · bare string literal (catches dynamic `MAP[key]` where key is a string-union
 *  literal, e.g. DEFAULT_FORMAT_STRINGS[key: "continueNudge"|…]). Comments are never those node kinds. */
function collectReadShaped(sf: SourceFile, out: Set<string>): void {
  for (const pa of sf.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)) {
    out.add(pa.getName());
  }
  for (const be of sf.getDescendantsOfKind(SyntaxKind.BindingElement)) {
    const nn = be.getNameNode();
    if (Node.isIdentifier(nn)) {
      out.add(nn.getText());
    }
    const pn = be.getPropertyNameNode();
    if (pn !== undefined && Node.isIdentifier(pn)) {
      out.add(pn.getText());
    }
  }
  for (const ea of sf.getDescendantsOfKind(SyntaxKind.ElementAccessExpression)) {
    const a = ea.getArgumentExpression();
    if (a !== undefined && Node.isStringLiteral(a)) {
      out.add(a.getLiteralText());
    }
  }
  for (const lit of sf.getDescendantsOfKind(SyntaxKind.StringLiteral)) {
    out.add(lit.getLiteralText());
  }
}

const readShapedOf = perFileNames(collectReadShaped);

/** Read-shaped name occurrences (name-keyed, documented lenience — bus-coverage/arm-C posture). */
function readShapedNames(project: Project, inScope: (fp: string) => boolean): Set<string> {
  return collectNames(project, inScope, readShapedOf);
}

/** The `section:` literal a `section`-named PropertyAssignment (`section: "x"`) or PropertySignature
 *  (`readonly section: "x"`) declares — both are live call-site shapes; anything else contributes nothing. */
function literalText(node: Node | undefined): string | undefined {
  return node !== undefined && Node.isStringLiteral(node) ? node.getLiteralText() : undefined;
}

function sectionLiteralOf(node: Node): string | undefined {
  if (Node.isPropertyAssignment(node) && node.getName() === "section") {
    return literalText(node.getInitializer());
  }
  const tn = Node.isPropertySignature(node) && node.getName() === "section" ? node.getTypeNode() : undefined;
  return tn !== undefined && Node.isLiteralTypeNode(tn) ? literalText(tn.getLiteral()) : undefined;
}

/** Every `section: "<x>"` literal in the scope (arm B write-path corpus). */
const sectionLiteralsOf = perFileNames((sf, out) => {
  for (const node of [...sf.getDescendantsOfKind(SyntaxKind.PropertyAssignment), ...sf.getDescendantsOfKind(SyntaxKind.PropertySignature)]) {
    const s = sectionLiteralOf(node);
    if (s !== undefined) {
      out.add(s);
    }
  }
});

function sectionLiterals(project: Project, inScope: (fp: string) => boolean): Set<string> {
  return collectNames(project, inScope, sectionLiteralsOf);
}

/** Any occurrence of a name (identifier or string literal) in the scope — arm B2 write presence + arm F
 *  write/read presence (name-keyed presence, the contract-verb-presence posture). */
const anyNamesOf = perFileNames((sf, out) => {
  for (const id of sf.getDescendantsOfKind(SyntaxKind.Identifier)) {
    out.add(id.getText());
  }
  for (const lit of sf.getDescendantsOfKind(SyntaxKind.StringLiteral)) {
    out.add(lit.getLiteralText());
  }
});

function anyNameOccurrences(project: Project, inScope: (fp: string) => boolean): Set<string> {
  return collectNames(project, inScope, anyNamesOf);
}

// ── the per-arm reconcile ───────────────────────────────────────────────────────────────────────────────
const MISSING = (armMember: string, detail: string): string =>
  `knob-wire-coverage[${armMember}]: ${detail} — a declared knob wired to nothing is a dead switch (an edit silently governs nothing). Wire the missing half, or add a cited DEFERRED (tracked debt) / DOORWAY (sanctioned rebuild seam) entry in tooling/src/verify/gates/knob-wire-coverage.ts. Spine-Config-and-Serialization.md §7.2; Core-Path-Registry.md D107; docs/history/reviews/stickler/2026-07-25-knob-drift-gates.md.`;
const STALE = (armMember: string): string =>
  `knob-wire-coverage[${armMember}]: this member GAINED its wire but still carries a DOORWAY/DEFERRED entry — delete the stale entry in tooling/src/verify/gates/knob-wire-coverage.ts (a self-cleaning ratchet, both directions; Core-Path-Registry.md D107).`;
const ORPHAN = (armMember: string): string =>
  `knob-wire-coverage[${armMember}]: a DOORWAY/DEFERRED entry names a member that no longer exists (renamed/deleted) — drop the entry in tooling/src/verify/gates/knob-wire-coverage.ts (Core-Path-Registry.md D107).`;
const TRIPWIRE = (source: string, anchor: string): string =>
  `knob-wire-coverage: the ${anchor} companion anchor is present but the ${source} member source is not — it was renamed away, so the arm would go vacuous-green. Re-point the member source in tooling/src/verify/gates/knob-wire-coverage.ts (path-keyed-gates-die-on-rename; Core-Path-Registry.md D107).`;

/** One arm's declarative spec: how to key its registry entries, its member set, its wired-predicate, and
 *  its per-member MISSING detail. `report` is the finding-anchor file. */
interface ArmSpec {
  readonly report: string;
  readonly keyOf: (member: string) => string;
  readonly members: readonly string[];
  readonly isWired: (member: string) => boolean;
  readonly detailOf: (member: string) => string;
}

interface ArmResult {
  readonly violations: readonly Violation[];
  readonly liveKeys: readonly string[];
}

/** One arm's reconcile: MISSING when unwired + uncited; STALE when wired + cited; the live registry keys
 *  it owns (for the ORPHAN pass). ORPHAN is judged once per loaded source by the caller. */
function runArm(spec: ArmSpec): ArmResult {
  const violations: Violation[] = [];
  const liveKeys: string[] = [];
  for (const member of spec.members) {
    const key = spec.keyOf(member);
    liveKeys.push(key);
    const cited = key in DOORWAY || key in DEFERRED;
    const wired = spec.isWired(member);
    if (!(wired || cited)) {
      violations.push({ file: spec.report, line: 1, message: MISSING(key, spec.detailOf(member)) });
    }
    if (wired && cited) {
      violations.push({ file: spec.report, line: 1, message: STALE(key) });
    }
  }
  return { violations, liveKeys };
}

// Real-tree sentinels: live registry keys the REAL member sources always produce (a stable member no
// remediation deletes). ORPHAN (a registry key naming a member that vanished) is judged ONLY when a
// sentinel is present — a synthetic conformance mini-tree (its own tiny member set) omits every sentinel,
// so it never orphan-flags the real founding entries (the verify-registry-parity real-root-guard pattern).
const REAL_TREE_SENTINELS: readonly string[] = ["B:routing", "A:corpusAutoindex", "E:wiFormat", "F:group:read"];

/** ORPHAN check: every registry key with a loaded arm-prefix must name a real live member — guarded on a
 *  real-tree sentinel so a synthetic tree never fires it. */
function orphanCheck(armPrefixes: readonly string[], liveKeys: ReadonlySet<string>): Violation[] {
  if (!REAL_TREE_SENTINELS.some((s) => liveKeys.has(s))) {
    return [];
  }
  const out: Violation[] = [];
  for (const key of [...Object.keys(DOORWAY), ...Object.keys(DEFERRED)]) {
    if (armPrefixes.some((p) => key.startsWith(p)) && !liveKeys.has(key)) {
      out.push({ file: "tooling/src/verify/gates/knob-wire-coverage.ts", line: 1, message: ORPHAN(key) });
    }
  }
  return out;
}

/** A member-source tripwire: the companion anchor is present but the source symbol vanished → RED.
 *  `sourceMissing` = the member set came back empty (the source symbol wasn't found). */
interface Tripwire {
  readonly sourceMissing: boolean;
  readonly anchor: string;
  readonly source: string;
  readonly report: string;
}
function tripwireViolation(project: Project, tw: Tripwire): readonly Violation[] {
  return tw.sourceMissing && identifierPresent(project, tw.anchor) ? [{ file: tw.report, line: 1, message: TRIPWIRE(tw.source, tw.anchor) }] : [];
}

const SETTINGS_REPORT = "packages/contracts/src/settings/index.ts";
const PRESET_REPORT = "packages/contracts/src/preset/index.ts";
const METADATA_REPORT = "packages/server/src/domain/chat/contract/metadata.ts";

/** The per-arm member counts the settings contract yields — the semantic denominator every settings arm's
 *  verdict rests on. Printed on the scan line AND declared as populations, so an arm that silently stops
 *  resolving a composed member is loud instead of clean (GATE-AUTHORING.md §1, #946). */
interface SettingsCounts {
  readonly fields: number;
  readonly sections: number;
  readonly appKeys: number;
}

/** Arms A/B/B2/C — rooted at the settings contract; Arm C also follows its declared imported sources. */
function settingsArms(
  project: Project,
  settings: SourceFile,
): ArmResult & { readonly tripwires: readonly Violation[]; readonly leafPopulation: SettingsLeafPopulation; readonly counts: SettingsCounts } {
  const fields = interfaceKeys(settings, EFFECTIVE_APP_CONFIG);
  const sections = tupleMembers(settings, USER_SETTINGS_SECTIONS);
  const appKeys = declaredKeys(settings, APP_SETTINGS_SCHEMA);
  const leafPopulation = settingsLeaves(settings, new Set(sections));
  const leaves = leafPopulation.leaves;

  const consumed = typedReadNames(project, EFFECTIVE_APP_CONFIG, (fp) => SERVER_SRC.test(fp) && !isTest(fp));
  const written = sectionLiterals(project, (fp) => (CLIENT_SRC.test(fp) || ENTRY_SCOPE.test(fp)) && !isTest(fp));
  const adminWritten = anyNameOccurrences(project, (fp) => ADMIN_SURFACES.test(fp) && !isTest(fp));
  const readNames = readShapedNames(project, (fp) => CLIENT_SERVER_UI_SRC.test(fp) && !SETTINGS_CONTRACTS.test(fp) && !isTest(fp));

  const arms: ArmResult[] = [
    runArm({
      report: SETTINGS_REPORT,
      keyOf: (m) => `A:${m}`,
      members: fields,
      isWired: (m) => consumed.has(m),
      detailOf: (m) => `EffectiveAppConfig.${m} is resolved (env floor ⊕ admin override) but READ by no server behavior`,
    }),
    runArm({
      report: SETTINGS_REPORT,
      keyOf: (m) => `B:${m}`,
      members: sections,
      isWired: (m) => written.has(m),
      detailOf: (m) => `USER_SETTINGS_SECTIONS "${m}" has no reachable section-patch write path (client or compose seed)`,
    }),
    runArm({
      report: SETTINGS_REPORT,
      keyOf: (m) => `B2:${m}`,
      members: appKeys,
      isWired: (m) => adminWritten.has(m),
      detailOf: (m) => `appSettingsSchema key "${m}" has no write field in the admin surfaces (features/settings ∪ user-admin)`,
    }),
    runArm({
      report: SETTINGS_REPORT,
      keyOf: (m) => `C:${m}`,
      members: leaves,
      isWired: (m) => readNames.has(m),
      detailOf: (m) => `settings schema leaf "${m}" is READ by nothing — the knob is dead from the schema down (the dupThreshold class)`,
    }),
  ];
  const tripwires = [
    ...tripwireViolation(project, {
      sourceMissing: fields.length === 0,
      anchor: ANCHOR_GET_EFFECTIVE_CONFIG,
      source: EFFECTIVE_APP_CONFIG,
      report: SETTINGS_REPORT,
    }),
    ...tripwireViolation(project, {
      sourceMissing: sections.length === 0,
      anchor: ANCHOR_UPDATE_SECTION,
      source: USER_SETTINGS_SECTIONS,
      report: SETTINGS_REPORT,
    }),
  ];
  return {
    violations: arms.flatMap((a) => a.violations),
    liveKeys: arms.flatMap((a) => a.liveKeys),
    tripwires,
    leafPopulation,
    counts: { fields: fields.length, sections: sections.length, appKeys: appKeys.length },
  };
}

/** Arm E — DEFAULT_FORMAT_STRINGS read coverage. */
function presetArm(project: Project, preset: SourceFile): ArmResult & { readonly tripwires: readonly Violation[]; readonly members: number } {
  const keys = declaredKeys(preset, DEFAULT_FORMAT_STRINGS);
  // Read-shaped (PropertyAccess) OR string-literal (catches DEFAULT_FORMAT_STRINGS[key] dynamic reads).
  const read = readShapedNames(project, (fp) => SERVER_SRC.test(fp) && !CONTRACTS_SRC.test(fp) && !isTest(fp));
  const arm = runArm({
    report: PRESET_REPORT,
    keyOf: (m) => `E:${m}`,
    members: keys,
    isWired: (m) => read.has(m),
    detailOf: (m) => `DEFAULT_FORMAT_STRINGS.${m} is an editable/importable format string READ by no server behavior — a lie to the user and the ST importer`,
  });
  return {
    ...arm,
    members: keys.length,
    tripwires: tripwireViolation(project, {
      sourceMissing: keys.length === 0,
      anchor: ANCHOR_PRESET_SCHEMA,
      source: DEFAULT_FORMAT_STRINGS,
      report: PRESET_REPORT,
    }),
  };
}

/** Arm F — chatMetadataSchema write+read coverage (two directions). */
function metadataArm(project: Project, metadata: SourceFile): ArmResult & { readonly tripwires: readonly Violation[]; readonly members: number } {
  const keys = declaredKeys(metadata, CHAT_METADATA_SCHEMA);
  const written = anyNameOccurrences(project, (fp) => CHAT_WRITE_SCOPE.test(fp) && !isTest(fp));
  const read = readShapedNames(project, (fp) => SERVER_SRC.test(fp) && !METADATA_PARSER.test(fp) && !CHAT_WRITE_SCOPE.test(fp) && !isTest(fp));
  const write = runArm({
    report: METADATA_REPORT,
    keyOf: (m) => `F:${m}:write`,
    members: keys,
    isWired: (m) => written.has(m),
    detailOf: (m) => `chatMetadataSchema.${m} has no write verb (domain/chat/verbs ∪ transport/trpc) — a metadata field whose documentation lies`,
  });
  const readBelt = runArm({
    report: METADATA_REPORT,
    keyOf: (m) => `F:${m}:read`,
    members: keys,
    isWired: (m) => read.has(m),
    detailOf: (m) => `chatMetadataSchema.${m} is never READ outside the parser + write scope — dead parse weight`,
  });
  return {
    violations: [...write.violations, ...readBelt.violations],
    liveKeys: [...write.liveKeys, ...readBelt.liveKeys],
    members: keys.length,
    tripwires: tripwireViolation(project, {
      sourceMissing: keys.length === 0,
      anchor: ANCHOR_PARSE_METADATA,
      source: CHAT_METADATA_SCHEMA,
      report: METADATA_REPORT,
    }),
  };
}

function reconcile(ctx: Pick<GateRunCtx, "project" | "scan">): Violation[] {
  const project = ctx.project;
  const settings = findFile(project, SETTINGS_CONTRACTS);
  const preset = findFile(project, PRESET_CONTRACTS);
  const metadata = findFile(project, METADATA_PARSER);

  const violations: Violation[] = [];
  const liveKeys = new Set<string>();
  const orphanPrefixes: string[] = [];

  if (settings !== undefined) {
    const r = settingsArms(project, settings);
    // EVERY ARM'S DENOMINATOR IS ON THE LINE, not just arm C's: each arm reads its own member source, so a
    // count for one says nothing about the others (#1094 — arm C was re-homed while A/B/B2 under-read).
    ctx.scan({
      unit: `settings graph [contracts=1 sources=${r.leafPopulation.sourceCount} fields=${r.counts.fields} sections=${r.counts.sections} appKeys=${r.counts.appKeys} leaves=${r.leafPopulation.leaves.length} appearanceLeaves=${r.leafPopulation.importedLeafCounts["appearance"] ?? 0}]`,
      candidates: r.leafPopulation.sourceCount,
      scanned: r.leafPopulation.sourceCount,
      population: [
        { source: EFFECTIVE_APP_CONFIG, members: r.counts.fields },
        { source: USER_SETTINGS_SECTIONS, members: r.counts.sections },
        { source: APP_SETTINGS_SCHEMA, members: r.counts.appKeys },
        { source: "userSettingsSchema leaves", members: r.leafPopulation.leaves.length },
      ],
    });
    violations.push(...r.violations, ...r.tripwires);
    for (const k of r.liveKeys) {
      liveKeys.add(k);
    }
    orphanPrefixes.push("A:", "B:", "B2:", "C:");
  }
  if (preset !== undefined) {
    const r = presetArm(project, preset);
    violations.push(...r.violations, ...r.tripwires);
    for (const k of r.liveKeys) {
      liveKeys.add(k);
    }
    orphanPrefixes.push("E:");
  }
  if (metadata !== undefined) {
    const r = metadataArm(project, metadata);
    violations.push(...r.violations, ...r.tripwires);
    for (const k of r.liveKeys) {
      liveKeys.add(k);
    }
    orphanPrefixes.push("F:");
  }

  // ORPHAN: judged only for arms whose source loaded (a synthetic tree omitting a source must not
  // orphan-flag every one of its keys).
  violations.push(...orphanCheck(orphanPrefixes, liveKeys));
  return violations;
}

/** Arm C leaves: local `z.object({...})` PropertyAssignment names in the settings contract plus the
 *  top-level leaves of each imported semantic source composed by `userSettingsSchema`, minus section names
 *  and `schemaVersion`. Name-keyed (documented lenience — an unrelated read can satisfy a generic name). */
/** The object literal a `z.object({...})` CallExpression declares, else undefined. */
function zObjectArg(call: Node): ObjectLiteralExpression | undefined {
  const ex = Node.isCallExpression(call) ? call.getExpression() : undefined;
  const isZObject = ex !== undefined && Node.isPropertyAccessExpression(ex) && ex.getName() === "object";
  const arg = isZObject && Node.isCallExpression(call) ? call.getArguments()[0] : undefined;
  return arg !== undefined && Node.isObjectLiteralExpression(arg) ? arg : undefined;
}

interface SettingsLeafPopulation {
  readonly leaves: readonly string[];
  readonly sourceCount: number;
  readonly importedLeafCounts: Readonly<Record<string, number>>;
}

function localSettingsLeaves(settings: SourceFile, sections: ReadonlySet<string>): Set<string> {
  const leaves = new Set<string>();
  for (const call of settings.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const obj = zObjectArg(call);
    if (obj === undefined) {
      continue;
    }
    // Through the shared member reader, so a leaf reaching a LOCAL z.object through an object spread is in
    // the denominator instead of dropped (#1094 G4 — the same key was silently missing from arms B2 AND C).
    for (const name of schemaMembers(obj, "settings schema leaf").keys()) {
      if (!sections.has(name) && name !== "schemaVersion") {
        leaves.add(name);
      }
    }
  }
  return leaves;
}

function importedSettingsLeaves(settings: SourceFile): { readonly leaves: Set<string>; readonly counts: Readonly<Record<string, number>> } {
  const leaves = new Set<string>();
  const importedLeafCounts: Record<string, number> = {};
  const userSettings = declaredMembers(settings, "userSettingsSchema");
  for (const source of IMPORTED_SETTINGS_SCHEMA_SOURCES) {
    if (!userSettings.has(source.section)) {
      throw new Error(
        `knob-wire-coverage Arm C: userSettingsSchema composes no "${source.section}" property — the semantic source ${source.symbol} is unreachable`,
      );
    }
    const composed = userSettings.get(source.section);
    if (composed === undefined) {
      throw new Error(
        `knob-wire-coverage Arm C: userSettingsSchema.${source.section} carries no readable schema expression (a shorthand member names no source)`,
      );
    }
    const localName = unwrapExpression(composed);
    if (!Node.isIdentifier(localName) || localName.getText() !== source.symbol) {
      throw new Error(
        `knob-wire-coverage Arm C: userSettingsSchema.${source.section} must compose the semantic source ${source.symbol}, got ${localName.getText()}`,
      );
    }
    const importedLeaves = [...schemaMembers(localName, source.symbol).keys()];
    if (importedLeaves.length === 0) {
      throw new Error(`knob-wire-coverage Arm C: semantic source ${source.symbol} resolved to zero leaves`);
    }
    importedLeafCounts[source.section] = importedLeaves.length;
    for (const leaf of importedLeaves) {
      leaves.add(leaf);
    }
  }
  return { leaves, counts: importedLeafCounts };
}

function settingsLeaves(settings: SourceFile, sections: ReadonlySet<string>): SettingsLeafPopulation {
  const leaves = localSettingsLeaves(settings, sections);
  if (settings.getVariableDeclaration("userSettingsSchema") === undefined) {
    if (settings.getVariableDeclaration("DEFAULT_USER_SETTINGS") !== undefined) {
      throw new Error("knob-wire-coverage Arm C: DEFAULT_USER_SETTINGS exists but userSettingsSchema is missing");
    }
    return { leaves: [...leaves], sourceCount: 1, importedLeafCounts: {} };
  }
  const imported = importedSettingsLeaves(settings);
  for (const leaf of imported.leaves) {
    leaves.add(leaf);
  }
  if (leaves.size === 0) {
    throw new Error("knob-wire-coverage Arm C: settings semantic leaf population resolved to zero");
  }
  return { leaves: [...leaves], sourceCount: 1 + IMPORTED_SETTINGS_SCHEMA_SOURCES.length, importedLeafCounts: imported.counts };
}

export const gate: GateDescriptor = {
  name: "knob-wire-coverage",
  docRow: "Core-Enforcement-Active-Gates.md (Core-Path-Registry.md D107)",
  status: "active",
  scopeSafety: "whole-project",
  message:
    "a declared knob is wired to nothing — a settings field/section/leaf, an AppSettings admin-editor key, a format string, or a chat-metadata field that validates and stores but is never written or never read is a dead switch: edits silently change nothing (the rateLimits/memory.enabled/dupThreshold classes). Wire the missing half, or add a cited DEFERRED (tracked debt) / DOORWAY (sanctioned rebuild seam) entry. Spine-Config-and-Serialization.md §7.2; Core-Path-Registry.md D107; docs/history/reviews/stickler/2026-07-25-knob-drift-gates.md.",
  fix: "wire the consumer/writer the arm names, or add the cited registry entry; a stale entry (member gained its wire) must be deleted in the same change.",
  run: (ctx) => {
    for (const v of reconcile(ctx)) {
      ctx.report({ file: v.file, line: v.line, column: 0, message: v.message });
    }
  },
  mustFlag: [
    {
      // Arm A: an EffectiveAppConfig field with no typed server consumer + no entry.
      files: {
        "packages/contracts/src/settings/index.ts": "export interface EffectiveAppConfig {\n  ghostA: number;\n}\n",
        "packages/server/src/entry/compose/x.ts": "export const getEffectiveConfig = 1;\nexport const q = 2;\n",
      },
      expect: { messageIncludes: "READ by no server behavior" },
      why: "arm A: an EffectiveAppConfig field resolved but read by no server behavior (the rateLimits dead-ended-pair)",
    },
    {
      // Arm B: a USER_SETTINGS_SECTIONS member with no section-patch write.
      files: {
        "packages/contracts/src/settings/index.ts": 'export const USER_SETTINGS_SECTIONS = ["ghostB"] as const;\n',
        "packages/client/src/features/x/components/x.tsx": "export const updateUserSettingsSection = 1;\n",
      },
      expect: { messageIncludes: "no reachable section-patch write path" },
      why: "arm B: a section member with no client section-patch and no compose seed writer (the memory.enabled class)",
    },
    {
      // Arm B2: an appSettingsSchema key with no admin-surface write field.
      files: {
        "packages/contracts/src/settings/index.ts":
          'import { z } from "zod";\nexport const USER_SETTINGS_SECTIONS = [] as const;\nexport const appSettingsSchema = z.object({ ghostB2: z.boolean() });\n',
        "packages/client/src/features/settings/lib/x.ts": "export const somethingElse = 1;\n",
      },
      expect: { messageIncludes: "no write field in the admin surfaces" },
      why: "arm B2: an AppSettings key absent from every admin write surface (a UI-less AppSettings)",
    },
    {
      // Arm C: a settings leaf read by nothing.
      files: {
        "packages/contracts/src/settings/index.ts":
          'import { z } from "zod";\nexport const USER_SETTINGS_SECTIONS = ["workloads"] as const;\nexport const s = z.object({ ghostLeaf: z.number() });\n',
        "packages/server/src/domain/x/x.ts": "export const unrelated = 1;\n",
      },
      expect: { messageIncludes: "dead from the schema down" },
      why: "arm C: a distinctively-named settings leaf with no read-shaped occurrence anywhere (the dupThreshold class)",
    },
    {
      // Arm C: an imported settings sub-schema leaf read by nothing.
      files: {
        "packages/contracts/src/settings/index.ts":
          'import { z } from "zod";\nimport { appearanceSettingsSchema } from "./appearance.ts";\nexport const USER_SETTINGS_SECTIONS = ["appearance"] as const;\nexport const userSettingsSchema = z.object({ schemaVersion: z.number(), appearance: appearanceSettingsSchema });\n',
        "packages/contracts/src/settings/appearance.ts":
          'import { z } from "zod";\nexport const appearanceSettingsSchema = z.object({ ghostAppearance: z.number() }).prefault({});\n',
        "packages/client/src/features/x/x.tsx": 'export const updateUserSettingsSection = 1;\nexport const writer = { section: "appearance", patch: {} };\n',
      },
      expect: { messageIncludes: "ghostAppearance" },
      why: "arm C imported-schema red: a leaf moved behind the sanctioned appearance module boundary remains in the semantic consumer-liveness denominator",
    },
    {
      // Arm A (#1094 G2): an INHERITED EffectiveAppConfig field is a subject. PAIRED — the inline field IS
      // consumed and passes in this same tree, so only the composed half can produce the finding.
      files: {
        "packages/contracts/src/settings/index.ts":
          "export interface GhostBaseProbe {\n  ghostInheritedA: number;\n}\nexport interface EffectiveAppConfig extends GhostBaseProbe {\n  wiredInlineA: number;\n}\n",
        "packages/server/src/entry/compose/x.ts":
          'import type { EffectiveAppConfig } from "@orb/contracts/settings";\nexport const getEffectiveConfig = (): EffectiveAppConfig => ({ ghostInheritedA: 1, wiredInlineA: 1 });\nexport const use = getEffectiveConfig().wiredInlineA;\n',
      },
      expect: { messageIncludes: "ghostInheritedA" },
      why: "arm A inherited-field red: a field EffectiveAppConfig inherits through `extends` is resolved config that owes a consumer — a local getProperties() read dropped it silently while the inline twin RED'd (#1094 G2)",
    },
    {
      // Arm B (#1094 G3): a section member arriving through a tuple SPREAD. PAIRED — the inline member has
      // its writer in this same tree.
      files: {
        "packages/contracts/src/settings/index.ts":
          'export const GHOST_SECTIONS_PROBE = ["ghostSpreadSection"] as const;\nexport const USER_SETTINGS_SECTIONS = [...GHOST_SECTIONS_PROBE, "wiredInlineSection"] as const;\n',
        "packages/client/src/features/x/components/x.tsx":
          'export const updateUserSettingsSection = 1;\nexport const w = { section: "wiredInlineSection", patch: {} };\n',
      },
      expect: { messageIncludes: "ghostSpreadSection" },
      why: "arm B spread red: a USER_SETTINGS_SECTIONS member composed through a spread is still an editor door that owes a write path — the direct-element reader dropped it while the inline twin RED'd (#1094 G3)",
    },
    {
      // Arm B2 (#1094 G4): an appSettingsSchema key arriving through an object SPREAD. Arm C flags both
      // keys here too (a bare identifier is not a read-shaped occurrence) — the B2 needle is the point.
      files: {
        "packages/contracts/src/settings/index.ts":
          'import { z } from "zod";\nexport const USER_SETTINGS_SECTIONS = [] as const;\nconst GHOST_APP_SHAPE_PROBE = { ghostSpreadAppKey: z.boolean() };\nexport const appSettingsSchema = z.object({ ...GHOST_APP_SHAPE_PROBE, wiredInlineAppKey: z.boolean() });\n',
        "packages/client/src/features/settings/lib/x.ts": "export const wiredInlineAppKey = 1;\n",
      },
      expect: { messageIncludes: "ghostSpreadAppKey" },
      why: "arm B2 spread red: an AppSettings key composed through an object spread still owes an admin write field — the PropertyAssignment-only reader dropped it from arms B2 AND C while the inline twin RED'd (#1094 G4)",
    },
    {
      // Arm C: a LOCAL settings leaf arriving through an object SPREAD (the same #1094 G4 miss, one arm
      // over: arm C was re-homed for the IMPORTED-MODULE axis and still under-read its own local spread).
      files: {
        "packages/contracts/src/settings/index.ts":
          'import { z } from "zod";\nexport const USER_SETTINGS_SECTIONS = [] as const;\nconst GHOST_LEAF_SHAPE_PROBE = { ghostSpreadLeaf: z.number() };\nexport const s = z.object({ ...GHOST_LEAF_SHAPE_PROBE, wiredInlineLeaf: z.number() });\n',
        "packages/client/src/features/x/x.tsx": "declare const settings: { wiredInlineLeaf?: number };\nexport const consumed = settings.wiredInlineLeaf;\n",
      },
      expect: { messageIncludes: "ghostSpreadLeaf" },
      why: "arm C local-spread red: a leaf spread into a local z.object is in the semantic denominator — the inline twin is READ and passes in the same tree, so only the composed half can produce this finding",
    },
    {
      // Arm E: a DEFAULT_FORMAT_STRINGS key arriving through an object SPREAD (the same member-kind class —
      // arm E reads an `as const` map through the same authored-object reader).
      files: {
        "packages/contracts/src/preset/index.ts":
          'export const presetSchema = 1;\nconst GHOST_FORMATS_PROBE = { ghostSpreadNudge: "x" } as const;\nexport const DEFAULT_FORMAT_STRINGS = { ...GHOST_FORMATS_PROBE, wiredInlineNudge: "y" } as const;\n',
        "packages/server/src/domain/chat/x.ts":
          "declare const cfg: { formatStrings?: { wiredInlineNudge?: string } };\nexport const v = cfg.formatStrings?.wiredInlineNudge;\n",
      },
      expect: { messageIncludes: "ghostSpreadNudge" },
      why: "arm E spread red: a format string composed through a spread is still editable/importable and owes a reader — the inline twin is read and passes in the same tree",
    },
    {
      // Arm F: a chatMetadataSchema key arriving through an object SPREAD, behind a `.loose()` chain (the
      // live spelling). PAIRED — the inline key has both its write verb and its reader here.
      files: {
        "packages/server/src/domain/chat/contract/metadata.ts":
          'import { z } from "zod";\nexport const parseChatMetadata = 1;\nconst GHOST_META_SHAPE_PROBE = { ghostSpreadMeta: z.number() };\nconst chatMetadataSchema = z.object({ ...GHOST_META_SHAPE_PROBE, wiredInlineMeta: z.number() }).loose();\nexport const s = chatMetadataSchema;\n',
        "packages/server/src/domain/chat/verbs/x.ts": "export const write = { wiredInlineMeta: 1 };\n",
        "packages/server/src/domain/chat/engine/x.ts": "declare const meta: { wiredInlineMeta?: number };\nexport const r = meta.wiredInlineMeta;\n",
      },
      expect: { messageIncludes: "ghostSpreadMeta" },
      why: "arm F spread red: a metadata field composed through a spread (under the live `.loose()` chain) still owes a writer and a reader — the inline twin satisfies both belts in the same tree",
    },
    {
      // Arm E: a DEFAULT_FORMAT_STRINGS key read by no server behavior.
      files: {
        "packages/contracts/src/preset/index.ts": 'export const presetSchema = 1;\nexport const DEFAULT_FORMAT_STRINGS = { ghostNudge: "x" } as const;\n',
        "packages/server/src/domain/chat/x.ts": "export const somethingElse = 1;\n",
      },
      expect: { messageIncludes: "READ by no server behavior" },
      why: "arm E: an editable/importable format string nothing reads — a lie to the user and the ST importer",
    },
    {
      // Arm F: a chatMetadataSchema key with no write verb (and no read) — the write arm fires.
      files: {
        "packages/server/src/domain/chat/contract/metadata.ts":
          'import { z } from "zod";\nexport const parseChatMetadata = 1;\nconst chatMetadataSchema = z.object({ ghostMeta: z.number() });\nexport const s = chatMetadataSchema;\n',
        "packages/server/src/domain/chat/verbs/x.ts": "export const noWrite = 1;\n",
      },
      expect: { messageIncludes: "no write verb" },
      why: "arm F (write): a metadata field with no verb/router writer — the toolRecurseLimit class, its documentation lies",
    },
    {
      // STALE: a member that IS wired but STILL carries a founding DEFERRED entry. The proof MUST borrow a
      // member that is a LIVE DEFERRED key in this file's map above — a synthetic tree can't inject into the
      // gate's own module-level DEFERRED, so it references a surviving entry. `B:profile` is that key (the
      // profile section has no writer yet). A tree whose ONLY section is `profile`, WITH a section:"profile"
      // write, makes it wired+cited → STALE. (No real-tree sentinel is present, so ORPHAN stays quiet —
      // ORPHAN's bite is proven live on the real tree, the bus-coverage-twin pattern.)
      // NEXT PRUNER: if you delete B:profile, repoint this fixture at another SURVIVING DEFERRED "B:" key
      // (else this stale bite-proof goes vacuous — expected a finding but gets 0).
      files: {
        "packages/contracts/src/settings/index.ts": 'export const USER_SETTINGS_SECTIONS = ["profile"] as const;\n',
        "packages/client/src/features/x/components/x.tsx": 'export const updateUserSettingsSection = 1;\nexport const w = { section: "profile", patch: {} };\n',
      },
      expect: { messageIncludes: "GAINED its wire but still carries" },
      why: "STALE: the founding DEFERRED B:profile member gains a section-patch writer → its stale entry must be deleted (the ratchet, self-cleaning both directions)",
    },
    {
      // TRIPWIRE: the updateUserSettingsSection anchor present but USER_SETTINGS_SECTIONS renamed away.
      files: {
        "packages/contracts/src/settings/index.ts": "export const RENAMED_SECTIONS = [] as const;\nexport const x = 1;\n",
        "packages/client/src/features/x/x.tsx": "export const updateUserSettingsSection = 1;\n",
      },
      expect: { messageIncludes: "was renamed away" },
      why: "the paired-anchor tripwire: the companion anchor is present but the member source symbol vanished — RED loudly, never vacuous-green",
    },
  ],
  mustPass: [
    {
      // Arm A: a typed consumer reads the field → passes.
      files: {
        "packages/contracts/src/settings/index.ts": "export interface EffectiveAppConfig {\n  wiredA: number;\n}\n",
        "packages/server/src/entry/compose/x.ts":
          'import type { EffectiveAppConfig } from "@orb/contracts/settings";\nexport const getEffectiveConfig = (): EffectiveAppConfig => ({ wiredA: 1 });\nexport const use = getEffectiveConfig().wiredA;\n',
      },
      why: "arm A: a compose consumer reads the field off an EffectiveAppConfig-typed receiver — real consumption, passes",
    },
    {
      // Arm A: an INHERITED field WITH a typed consumer → passes. The value-fidelity half of the #1094 G2
      // pair: resolving the base must widen the subject set, never manufacture an accusation.
      files: {
        "packages/contracts/src/settings/index.ts":
          "export interface GhostBaseProbe {\n  inheritedWiredA: number;\n}\nexport interface EffectiveAppConfig extends GhostBaseProbe {}\n",
        "packages/server/src/entry/compose/x.ts":
          'import type { EffectiveAppConfig } from "@orb/contracts/settings";\nexport const getEffectiveConfig = (): EffectiveAppConfig => ({ inheritedWiredA: 1 });\nexport const use = getEffectiveConfig().inheritedWiredA;\n',
      },
      why: "arm A inherited-field green: a base's field read off an EffectiveAppConfig-typed receiver is real consumption — the resolved-type reader must not accuse an inherited field that IS wired",
    },
    {
      // Arm B: a section member reached ONLY through a tuple spread, WITH its write path → passes.
      files: {
        "packages/contracts/src/settings/index.ts":
          'export const SPREAD_SECTIONS_PROBE = ["wiredSpreadSection"] as const;\nexport const USER_SETTINGS_SECTIONS = [...SPREAD_SECTIONS_PROBE] as const;\n',
        "packages/client/src/features/x/components/x.tsx":
          'export const updateUserSettingsSection = 1;\nexport const w = { section: "wiredSpreadSection", patch: {} };\n',
      },
      why: "arm B spread green: the spread member resolves to its own NAME (not the spread's text), so its section-patch writer satisfies it — a reader returning anything else would accuse a wired section",
    },
    {
      // Arms B2 + C: the composed zod spellings the source law sanctions — an IMPORTED base schema reached
      // through `.extend`, and a `{ ...base.shape }` spread — with every key wired → passes.
      files: {
        "packages/contracts/src/settings/base-app.ts": 'import { z } from "zod";\nexport const baseAppSchema = z.object({ wiredBaseKey: z.boolean() });\n',
        "packages/contracts/src/settings/index.ts":
          'import { z } from "zod";\nimport { baseAppSchema } from "./base-app.ts";\nexport const USER_SETTINGS_SECTIONS = [] as const;\nexport const appSettingsSchema = baseAppSchema.extend({ ...baseAppSchema.shape, wiredExtendKey: z.boolean() });\n',
        "packages/client/src/features/settings/lib/x.ts":
          "declare const view: { wiredBaseKey?: boolean; wiredExtendKey?: boolean };\nexport const a = view.wiredBaseKey;\nexport const b = view.wiredExtendKey;\n",
      },
      why: "arms B2/C composed green: an imported base through `.extend` plus a `{ ...base.shape }` re-spread resolves to exactly its two keys, and a spread that only RE-declares the base's key is a contribution (the tally counts declared members, not new ones) — never a zero-contribution refusal",
    },
    {
      // Arm B: a client section-patch writes the member → passes.
      files: {
        "packages/contracts/src/settings/index.ts": 'export const USER_SETTINGS_SECTIONS = ["wiredB"] as const;\n',
        "packages/client/src/features/x/components/x.tsx": 'export const updateUserSettingsSection = 1;\nexport const w = { section: "wiredB", patch: {} };\n',
      },
      why: 'arm B: a client mutation writes section:"wiredB" — the write path exists, passes',
    },
    {
      // Arm C: an imported settings sub-schema leaf with a production read → passes.
      files: {
        "packages/contracts/src/settings/index.ts":
          'import { z } from "zod";\nimport { appearanceSettingsSchema } from "./appearance.ts";\nexport const USER_SETTINGS_SECTIONS = ["appearance"] as const;\nexport const userSettingsSchema = z.object({ schemaVersion: z.number(), appearance: appearanceSettingsSchema });\n',
        "packages/contracts/src/settings/appearance.ts":
          'import { z } from "zod";\nexport const appearanceSettingsSchema = z.object({ wiredAppearance: z.number() }).prefault({});\n',
        "packages/client/src/features/x/x.tsx":
          'export const updateUserSettingsSection = 1;\nexport const writer = { section: "appearance", patch: {} };\ndeclare const appearance: { wiredAppearance: number };\nexport const consumed = appearance.wiredAppearance;\n',
      },
      why: "arm C imported-schema green: a consumed leaf behind the sanctioned appearance module boundary remains live",
    },
    {
      // Arm E: the format string is read (PropertyAccess) → passes; the dynamic-key form also passes.
      files: {
        "packages/contracts/src/preset/index.ts": 'export const presetSchema = 1;\nexport const DEFAULT_FORMAT_STRINGS = { wiredNudge: "x" } as const;\n',
        "packages/server/src/domain/chat/x.ts":
          "declare const cfg: { formatStrings?: { wiredNudge?: string } };\nexport const v = cfg.formatStrings?.wiredNudge;\n",
      },
      why: "arm E: a server behavior reads cfg.formatStrings.wiredNudge — the belt is satisfied, passes",
    },
    {
      // Arm F: a verb writes the key AND a consumer reads it → both sub-belts pass.
      files: {
        "packages/server/src/domain/chat/contract/metadata.ts":
          'import { z } from "zod";\nexport const parseChatMetadata = 1;\nconst chatMetadataSchema = z.object({ wiredMeta: z.number() });\nexport const s = chatMetadataSchema;\n',
        "packages/server/src/domain/chat/verbs/x.ts": "export const write = { wiredMeta: 1 };\n",
        "packages/server/src/domain/chat/engine/x.ts": "declare const meta: { wiredMeta?: number };\nexport const r = meta.wiredMeta;\n",
      },
      why: "arm F: a verb writes wiredMeta and the engine reads it — both write and read belts satisfied, passes",
    },
  ],
};
