// RETIRED RESIDUE (2026-09-06, #1584): the five thin per-bus gates this reconcile served — `bus-coverage`,
// `user-bus-coverage`, `rpg-bus-coverage`, `automation-bus-coverage`, `domain-events-coverage` — are DELETED.
// One `bus-producer-coverage` policy on the shared bus producer fact quantifies over every belted union
// instead. Nothing imports this module but its own spec; it retires with the legacy runtime at cutover.
// What it WAS: the shared producer-coverage reconcile for the per-bus emit-coverage ratchets (D50 + twins).
// A bus's event union is compile-exhaustive on the CONSUMER side (the client's total map), but nothing
// machine-checks the PRODUCER side — a member can be declared, replay-guarded/reduced, and never emitted
// (silently dead wire). Each bus's thin gate supplied a `BusCoverageSpec`; THIS module owned the ONE
// reconcile so a new bus was a spec, not a third
// copy of the belt logic (derive, not re-declare — CLAUDE.md "Build the full shape" /
// lock-the-extensible-shape). Two shapes of `*_EVENT_TYPES` belt are supported: an object literal
// (`{ delta: true, … } satisfies Record<X["type"], true>` — chat/user) and an array literal
// (`[…] as const satisfies readonly X["type"][]` — the domain-event/RPG twins).
// DECLARED LIMIT: this is syntax-level resolution of the repository's named emitter doors, one-hop local
// event variables, and the chat stream's yielded frame. It deliberately does not chase arbitrary aliases or
// cross-file dataflow; a new producer door must join the explicit contract below instead of becoming a
// literal-shaped false clean.
import type { CallExpression, Expression, ObjectLiteralExpression, Project, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { Violation } from "../contract/harness.ts";
import type { BusCoverageSpec } from "../contract/readers.ts";
import { declarationsNamed, readStringValue, unwrapExpression } from "./ast-read.ts";

/** The DEFAULT server tiers where a bus event's discriminator must appear in an executable emitter call:
 *  the two tiers
 *  that own business writes. `entry/compose` is excluded on purpose — the user-bus survey's ruling (§1.2):
 *  the ratchet quantifies VERB-side emits, and counting the composition root would let a member whose only
 *  producer is a compose-side wrapper read as covered while every domain writer stayed silent. A bus with a
 *  LEGITIMATE composition-root producer overrides it per spec (see `BusCoverageSpec.emitScope`). */
const DEFAULT_EMIT_SCOPE = /\/packages\/server\/src\/(?:domain|transport)\//u;
/** Parse the discriminator keys out of the belt const, per the bus's `keyShape`. An empty result is a
 *  fail-loud blindness tripwire in `reconcileBusCoverage`. */
function busEventKeys(contracts: SourceFile, spec: BusCoverageSpec): string[] {
  const decl = contracts.getVariableDeclaration(spec.typesConst);
  if (decl === undefined) {
    return [];
  }
  if (spec.keyShape === "object") {
    const obj = decl.getFirstDescendantByKind(SyntaxKind.ObjectLiteralExpression);
    if (obj === undefined) {
      return [];
    }
    return obj.getProperties().flatMap((p) => (p.isKind(SyntaxKind.PropertyAssignment) ? [p.getName()] : []));
  }
  const arr = decl.getFirstDescendantByKind(SyntaxKind.ArrayLiteralExpression);
  if (arr === undefined) {
    return [];
  }
  return arr
    .getElements()
    .flatMap((el) => (el.isKind(SyntaxKind.StringLiteral) || el.isKind(SyntaxKind.NoSubstitutionTemplateLiteral) ? [el.getLiteralText()] : []));
}

const EMITTER_NAMES = new Map<string, ReadonlySet<string>>([
  ["AUTOMATION_BUS_EVENT_TYPES", new Set(["notify", "notifyRuleEvent"])],
  ["CHAT_BUS_EVENT_TYPES", new Set(["emit", "emitLive", "emitQuiet", "emitRecallPhase", "emitRoomEvent", "emitWiEvent", "writeReasoning"])],
  ["DOMAIN_EVENT_TYPES", new Set(["emit"])],
  ["RPG_BUS_EVENT_TYPES", new Set(["emitBus"])],
  ["USER_BUS_EVENT_TYPES", new Set(["emit", "emitUserEvent", "publishUserEvent"])],
]);

const DIRECT_DISCRIMINATOR_ARGUMENT = new Map<string, ReadonlyMap<string, number>>([["AUTOMATION_BUS_EVENT_TYPES", new Map([["notifyRuleEvent", 1]])]]);

const DISCRIMINATOR_PROPERTY = new Map<string, ReadonlyMap<string, string>>([["CHAT_BUS_EVENT_TYPES", new Map([["writeReasoning", "event"]])]]);
const PLUGIN_SURFACE_STATE = /\/domain\/plugin\/substrate\/surface-state\.ts$/u;
const CANONICAL_RECEIVERS = new Set(["ctx", "deps", "rc.ctx"]);
const CANONICAL_IMPORT_RE = /(?:^|\/)(?:bus|transport\/trpc)(?:\/|$)/u;
const CANONICAL_LOCAL_FUNCTIONS = new Map<string, ReadonlyMap<string, RegExp>>([
  ["AUTOMATION_BUS_EVENT_TYPES", new Map([["notifyRuleEvent", /\/domain\/automation\/engine\/dispatch\.ts$/u]])],
  [
    "CHAT_BUS_EVENT_TYPES",
    new Map([
      ["emitQuiet", /\/domain\/chat\/engine\/engine\.ts$/u],
      ["emitRoomEvent", /\/entry\/compose\/room-reach\.ts$/u],
      ["writeReasoning", /\/domain\/chat\/verbs\/edit\.ts$/u],
    ]),
  ],
  [
    "USER_BUS_EVENT_TYPES",
    new Map([
      ["emit", PLUGIN_SURFACE_STATE],
      ["publishUserEvent", /\/transport\/trpc\/user-events-bus\.ts$/u],
    ]),
  ],
]);

interface EmitterBindingQuery {
  readonly sf: SourceFile;
  readonly localName: string;
  readonly emitterName: string;
  readonly spec: BusCoverageSpec;
  readonly seen: Set<string>;
}

function calleeName(call: CallExpression): string | undefined {
  const expression = unwrapExpression(call.getExpression());
  if (Node.isIdentifier(expression)) {
    return expression.getText();
  }
  if (Node.isPropertyAccessExpression(expression)) {
    return expression.getName();
  }
  const argument = Node.isElementAccessExpression(expression) ? expression.getArgumentExpression() : undefined;
  return argument === undefined ? undefined : readStringValue(argument);
}

function isCanonicalReceiver(expression: Expression): boolean {
  return CANONICAL_RECEIVERS.has(unwrapExpression(expression).getText());
}

function isCanonicalVariableBinding({ sf, localName, emitterName, spec, seen }: EmitterBindingQuery): boolean {
  for (const declaration of declarationsNamed(sf, localName).filter(Node.isVariableDeclaration)) {
    const name = declaration.getNameNode();
    const initializer = declaration.getInitializer();
    if (initializer === undefined) {
      continue;
    }
    if (Node.isIdentifier(name) && name.getText() === localName && Node.isExpression(initializer)) {
      return isCanonicalEmitterExpression(initializer, emitterName, spec, seen);
    }
    if (Node.isObjectBindingPattern(name) && isCanonicalReceiver(initializer)) {
      const element = name.getElements().find((candidate) => candidate.getName() === localName);
      const boundName = element?.getPropertyNameNode()?.getText() ?? element?.getName();
      if (boundName === emitterName) {
        return true;
      }
    }
  }
  return false;
}

function isCanonicalImportBinding(sf: SourceFile, localName: string, emitterName: string): boolean {
  for (const declaration of sf.getImportDeclarations()) {
    if (!CANONICAL_IMPORT_RE.test(declaration.getModuleSpecifierValue())) {
      continue;
    }
    const imported = declaration.getNamedImports().find((candidate) => candidate.getAliasNode()?.getText() === localName || candidate.getName() === localName);
    if (imported !== undefined && imported.getName() === emitterName) {
      return true;
    }
  }
  return false;
}

function isCanonicalEmitterExpression(expression: Expression, emitterName: string, spec: BusCoverageSpec, seen: Set<string>): boolean {
  const value = unwrapExpression(expression);
  if (Node.isPropertyAccessExpression(value)) {
    return value.getName() === emitterName && isCanonicalReceiver(value.getExpression());
  }
  if (Node.isElementAccessExpression(value)) {
    const name = value.getArgumentExpression();
    return name !== undefined && readStringValue(name) === emitterName && isCanonicalReceiver(value.getExpression());
  }
  if (!Node.isIdentifier(value)) {
    return false;
  }
  const sf = value.getSourceFile();
  const localName = value.getText();
  const key = `${sf.getFilePath()}:${localName}:${emitterName}`;
  if (seen.has(key)) {
    return false;
  }
  seen.add(key);
  if (isCanonicalVariableBinding({ sf, localName, emitterName, spec, seen }) || isCanonicalImportBinding(sf, localName, emitterName)) {
    return true;
  }

  const localFunction = CANONICAL_LOCAL_FUNCTIONS.get(spec.typesConst)?.get(localName);
  return localName === emitterName && localFunction?.test(sf.getFilePath()) === true;
}

function isCanonicalEmitterCall(call: CallExpression, emitterName: string, spec: BusCoverageSpec): boolean {
  const expression = unwrapExpression(call.getExpression());
  if (Node.isPropertyAccessExpression(expression)) {
    return expression.getName() === emitterName && isCanonicalReceiver(expression.getExpression());
  }
  if (Node.isElementAccessExpression(expression)) {
    const argument = expression.getArgumentExpression();
    return argument !== undefined && readStringValue(argument) === emitterName && isCanonicalReceiver(expression.getExpression());
  }
  return Node.isIdentifier(expression) && isCanonicalEmitterExpression(expression, emitterName, spec, new Set());
}

function objectExpressions(expression: Expression): ObjectLiteralExpression[] {
  const value = unwrapExpression(expression);
  if (Node.isObjectLiteralExpression(value)) {
    return [value];
  }
  if (Node.isIdentifier(value)) {
    const initializer = declarationsNamed(value.getSourceFile(), value.getText())
      .filter(Node.isVariableDeclaration)
      .find((declaration) => declaration.getName() === value.getText())
      ?.getInitializer();
    if (initializer !== undefined) {
      const unwrapped = unwrapExpression(initializer);
      return Node.isObjectLiteralExpression(unwrapped) ? [unwrapped] : unwrapped.getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression);
    }
  }
  return value.getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression);
}

function propertyValues(objects: readonly ObjectLiteralExpression[], propertyName: string): string[] {
  const values: string[] = [];
  for (const object of objects) {
    const property = object.getProperty(propertyName);
    if (Node.isPropertyAssignment(property)) {
      const value = readStringValue(property.getInitializerOrThrow());
      if (value !== undefined) {
        values.push(value);
      }
    }
  }
  return values;
}

function discriminatorValues(call: CallExpression, spec: BusCoverageSpec, canonicalName = calleeName(call)): string[] {
  const name = canonicalName;
  const directIndex = name === undefined ? undefined : DIRECT_DISCRIMINATOR_ARGUMENT.get(spec.typesConst)?.get(name);
  const direct = directIndex === undefined ? undefined : call.getArguments()[directIndex];
  const directValue = direct === undefined ? undefined : readStringValue(direct);
  const propertyName = name === undefined ? "type" : (DISCRIMINATOR_PROPERTY.get(spec.typesConst)?.get(name) ?? "type");
  const objectValues = call
    .getArguments()
    .flatMap((argument) => (Node.isExpression(argument) ? propertyValues(objectExpressions(argument), propertyName) : []));
  return directValue === undefined ? objectValues : [...objectValues, directValue];
}

function canonicalEmitterName(call: CallExpression, spec: BusCoverageSpec, emitterNames: ReadonlySet<string>): string | undefined {
  const called = calleeName(call);
  if (called !== undefined && emitterNames.has(called) && isCanonicalEmitterCall(call, called, spec)) {
    return called;
  }
  const expression = unwrapExpression(call.getExpression());
  if (!Node.isIdentifier(expression)) {
    return;
  }
  return [...emitterNames].find((name) => isCanonicalEmitterExpression(expression, name, spec, new Set()));
}

function yieldedChatDiscriminators(sf: SourceFile): string[] {
  return sf.getDescendantsOfKind(SyntaxKind.YieldExpression).flatMap((statement) => {
    const expression = statement.getExpression();
    if (expression === undefined) {
      return [];
    }
    const frames = objectExpressions(expression).filter((object) => {
      const channel = object.getProperty("channel");
      return Node.isPropertyAssignment(channel) && readStringValue(channel.getInitializerOrThrow()) === "chat";
    });
    return frames.flatMap((frame) => {
      const event = frame.getProperty("event");
      if (!Node.isPropertyAssignment(event)) {
        return [];
      }
      const initializer = event.getInitializerOrThrow();
      return Node.isExpression(initializer) ? propertyValues(objectExpressions(initializer), "type") : [];
    });
  });
}

function callDiscriminators(sf: SourceFile, spec: BusCoverageSpec, emitterNames: ReadonlySet<string>): string[] {
  return sf.getDescendantsOfKind(SyntaxKind.CallExpression).flatMap((call) => {
    const name = canonicalEmitterName(call, spec, emitterNames);
    if (name === undefined) {
      return [];
    }
    if (spec.typesConst === "USER_BUS_EVENT_TYPES" && name === "emit" && !PLUGIN_SURFACE_STATE.test(sf.getFilePath())) {
      return [];
    }
    return discriminatorValues(call, spec, name);
  });
}

/** Discriminators carried by an actual injected emitter call in the server producer scope. AST-only:
 * comments, declarations, totality tables, and unrelated object literals cannot satisfy coverage. */
function emittedDiscriminators(project: Project, spec: BusCoverageSpec): ReadonlySet<string> {
  const emitterNames = EMITTER_NAMES.get(spec.typesConst);
  if (emitterNames === undefined) {
    return new Set();
  }
  const emitted = new Set<string>();
  for (const sf of project.getSourceFiles()) {
    if (!(spec.emitScope ?? DEFAULT_EMIT_SCOPE).test(sf.getFilePath())) {
      continue;
    }
    for (const value of callDiscriminators(sf, spec, emitterNames)) {
      emitted.add(value);
    }
    if (spec.typesConst === "CHAT_BUS_EVENT_TYPES") {
      for (const value of yieldedChatDiscriminators(sf)) {
        emitted.add(value);
      }
    }
  }
  return emitted;
}

/** The whole-tree reconciliation: every belt key must be carried by a canonical emitter call OR
 *  DEFERRED; a DEFERRED-and-emitted key is a stale entry. The canonical home and belt are blindness
 *  tripwires: disappearance is RED, never a vacuous clean. */
export function reconcileBusCoverage(project: Project, spec: BusCoverageSpec): Violation[] {
  const contracts = project.getSourceFiles().find((sf) => spec.contractsFile.test(sf.getFilePath()));
  if (contracts === undefined) {
    return [{ file: spec.reportFile, line: 1, message: `canonical bus contracts home is missing for ${spec.typesConst}` }];
  }
  const keys = busEventKeys(contracts, spec);
  if (keys.length === 0) {
    return [{ file: spec.reportFile, line: 1, message: `canonical bus event belt ${spec.typesConst} is missing or empty` }];
  }
  const emittedKeys = emittedDiscriminators(project, spec);
  const violations: Violation[] = [];
  for (const key of keys) {
    const emitted = emittedKeys.has(key);
    const deferred = key in spec.deferred;
    if (!(emitted || deferred)) {
      violations.push({ file: spec.reportFile, line: 1, message: spec.missingPrefix + key });
    }
    if (emitted && deferred) {
      violations.push({ file: spec.reportFile, line: 1, message: spec.stalePrefix + key });
    }
  }
  return violations;
}
