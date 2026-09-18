// Zod schema-arm scanning for the notification-schema half of the bus-payload-shape reader, extracted
// from bus-payload-fact.ts (tooling-size, #1584 residue). Everything here reads a zod builder EXPRESSION,
// never a named type declaration (that stays in the front door as scanBusDecl/walkDecl); the front door
// imports these, this leaf imports only from bus-payload-fact-resolve.ts.
import type { Node as MorphNode, VariableDeclaration } from "ts-morph";
import { Node as N } from "ts-morph";
import type { MemberRead } from "../contract/symbol-reference.ts";
import { unwrapExpression } from "./ast-read.ts";
import type { CollectorState, WalkFrame } from "./bus-payload-fact-resolve.ts";
import {
  contributionMark,
  NOTIFICATION_SCHEMA_NAME,
  nodeKey,
  recordMember,
  refuse,
  SCHEMA_KEY_NEUTRAL_METHODS,
  UNRESOLVED_SCHEMA_TOKEN,
  UNSUPPORTED_TOKEN,
} from "./bus-payload-fact-resolve.ts";
import { readMemberAccess } from "./symbol-reference.ts";

/** Resolve an identifier naming a schema const to its INITIALIZER, inside the population only — the
 *  value-side twin of `resolveNamedTypes`. */
function resolveSchemaInit(nameNode: MorphNode, state: CollectorState): MorphNode | undefined {
  const definitions = N.isIdentifier(nameNode) ? nameNode.getDefinitionNodes() : [];
  const decl = definitions.find(
    (def): def is VariableDeclaration =>
      N.isVariableDeclaration(def) && state.admitted.has(def.getSourceFile().getFilePath()) && def.getInitializer() !== undefined,
  );
  return decl?.getInitializer();
}

/** A `{ ...base.shape }` spread — the third sanctioned imported shape, RESOLVED. Any other spread is
 *  refused: it would otherwise be dropped silently, the same omission `getProperties()` makes. */
function scanSchemaSpread(prop: MorphNode, expression: MorphNode, frame: WalkFrame): void {
  const spread = readMemberAccess(unwrapExpression(expression));
  if (spread !== undefined && spread.name === "shape") {
    scanSchemaExpr(spread.receiver, true, { ...frame, origin: "inherited" });
    return;
  }
  refuse(frame.state, prop, `${UNSUPPORTED_TOKEN}Spread`);
}

/** Record the wire keys one `z.object({ … })` literal declares. */
function scanSchemaObject(obj: MorphNode, frame: WalkFrame): void {
  if (!N.isObjectLiteralExpression(obj)) {
    refuse(frame.state, obj, `${UNSUPPORTED_TOKEN}${obj.getKindName()}`);
    return;
  }
  for (const prop of obj.getProperties()) {
    if (N.isSpreadAssignment(prop)) {
      scanSchemaSpread(prop, prop.getExpression(), frame);
      continue;
    }
    if (!(N.isPropertyAssignment(prop) || N.isShorthandPropertyAssignment(prop))) {
      refuse(frame.state, prop, `${UNSUPPORTED_TOKEN}${prop.getKindName()}`);
      continue;
    }
    if (N.isComputedPropertyName(prop.getNameNode())) {
      refuse(frame.state, prop, `${UNSUPPORTED_TOKEN}ComputedName`);
      continue;
    }
    recordMember({ prop, anchor: prop.getNameNode(), name: prop.getName() }, frame.origin, frame.state);
    const value = N.isPropertyAssignment(prop) ? prop.getInitializer() : undefined;
    if (value !== undefined) {
      scanSchemaExpr(value, false, frame);
    }
  }
}

/** Resolve an ARM/value identifier to the schema it names (#1025). Unresolvable ⇒ REFUSED in an arm
 *  position; a bare identifier in a property VALUE is the zod twin of the non-transitive boundary. */
function scanSchemaIdentifier(expr: MorphNode, strict: boolean, frame: WalkFrame): void {
  if (!strict) {
    return;
  }
  const init = resolveSchemaInit(expr, frame.state);
  if (init === undefined) {
    refuse(frame.state, expr, `${UNRESOLVED_SCHEMA_TOKEN}${expr.getText()}`);
    return;
  }
  const key = nodeKey(init);
  if (frame.state.walkedDecls.has(key)) {
    return;
  }
  frame.state.walkedDecls.add(key);
  scanSchemaExpr(init, true, { ...frame, origin: "inherited" });
}

/** Dispatch one `<recv>.<method>(…)` schema builder. An unmodeled method in an ARM position is REFUSED —
 *  which is how `.loose()`/`.passthrough()`/`.catchall()` are refused (they admit unknown keys). */
function scanSchemaCall(expr: MorphNode, callee: MemberRead, strict: boolean, frame: WalkFrame): void {
  const method = callee.name;
  const args = N.isCallExpression(expr) ? expr.getArguments() : [];
  if (method === "object") {
    scanSchemaObject(args[0] ?? expr, frame);
    return;
  }
  if (method === "discriminatedUnion" || method === "union") {
    scanSchemaArms(args[method === "union" ? 0 : 1] ?? expr, frame);
    return;
  }
  if (method === "extend") {
    scanSchemaExpr(callee.receiver, strict, frame);
    scanSchemaObject(args[0] ?? expr, { ...frame, origin: "local" });
    return;
  }
  if (method === "merge") {
    scanSchemaExpr(callee.receiver, strict, frame);
    scanSchemaExpr(args[0] ?? expr, strict, { ...frame, origin: "inherited" });
    return;
  }
  if (SCHEMA_KEY_NEUTRAL_METHODS.has(method) || !strict) {
    scanSchemaExpr(callee.receiver, strict, frame);
    return;
  }
  refuse(frame.state, expr, `${UNSUPPORTED_TOKEN}z.${method}`);
}

/** Walk one schema expression, recording every wire key it contributes. `strict` marks an ARM position — the
 *  event's own identity, where an unmodeled shape is REFUSED and an identifier is RESOLVED. A property VALUE
 *  is walked non-strictly: a leaf validator contributes no key. */
export function scanSchemaExpr(node: MorphNode, strict: boolean, frame: WalkFrame): void {
  const expr = unwrapExpression(node);
  if (N.isIdentifier(expr)) {
    scanSchemaIdentifier(expr, strict, frame);
    return;
  }
  const callee = N.isCallExpression(expr) ? readMemberAccess(expr.getExpression()) : undefined;
  if (callee !== undefined) {
    scanSchemaCall(expr, callee, strict, frame);
    return;
  }
  if (strict) {
    refuse(frame.state, expr, `${UNSUPPORTED_TOKEN}${expr.getKindName()}`);
  }
}

/** The arms of a `z.discriminatedUnion`/`z.union` — each is an ARM position (strict). A non-literal arms
 *  argument is refused rather than resolved (a declared limit: the arms list is spelled inline today). */
function scanSchemaArms(arms: MorphNode, frame: WalkFrame): void {
  if (!N.isArrayLiteralExpression(arms)) {
    refuse(frame.state, arms, `${UNSUPPORTED_TOKEN}non-literal-arms`);
    return;
  }
  for (const arm of arms.getElements()) {
    scanSchemaExpr(arm, true, frame);
  }
}

/** Scan the notification zod schema: every arm's property keys are wire fields, including the keys an
 *  IMPORTED schema object contributes (#1025). */
export function scanNotificationSchema(decl: VariableDeclaration, init: MorphNode, state: CollectorState): void {
  state.resolvedRoots.add(NOTIFICATION_SCHEMA_NAME);
  state.events += 1;
  const before = contributionMark(state);
  scanSchemaExpr(init, true, { state, origin: "local", owner: init });
  if (contributionMark(state) === before) {
    state.emptyRoots.push({ name: NOTIFICATION_SCHEMA_NAME, node: decl.getNameNode() });
  }
}
