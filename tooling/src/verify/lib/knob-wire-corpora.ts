// THE CONSUMER CORPORA of `knob-wire-coverage` (D107): which names each file READS or MENTIONS, per belt
// scope, accumulated in ONE kind-indexed visitor pass — the wired side every belt reconciles its members
// against. Comments are never these node kinds, so every belt is comment-SAFE by construction. Split out of
// `knob-wire-fact.ts` at the size cap (2026-09-18); one-way — it imports the member-source anchors from
// `knob-wire-members.ts` and nothing from `knob-wire-fact.ts`.
import type { Node } from "ts-morph";
import { Node as MorphNode } from "ts-morph";
import { EFFECTIVE_APP_CONFIG, METADATA_PARSER, SETTINGS_CONTRACTS } from "./knob-wire-members.ts";

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

// ── the consumer corpora, accumulated in ONE kind-indexed pass ──────────────────────────────────────────
/** Every read-shaped and presence-shaped name one file contributes, per scope. The name sets are exactly the
 *  legacy corpora: PropertyAccess name · BindingElement (binding/property) name · string ElementAccess
 *  literal · bare string literal (catching a dynamic `MAP[key]` whose key is a string-union literal).
 *  Comments are never those node kinds, so every belt is comment-SAFE by construction. */
export interface Corpora {
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

export function newCorpora(): Corpora {
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
export interface FileScope {
  readonly settingsRead: boolean;
  readonly presetRead: boolean;
  readonly metadataRead: boolean;
  readonly sectionWrite: boolean;
  readonly adminWrite: boolean;
  readonly metadataWrite: boolean;
  readonly configRead: boolean;
  readonly isSettingsContract: boolean;
}

export function scopeOf(path: string): FileScope {
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

export function visitNode(node: Node, scope: FileScope, corpora: Corpora): void {
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
