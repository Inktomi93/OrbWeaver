// The SHARED COMPUTATION for the `ct-poll-schedule-and-paint` family (owner ruling 2026-09-12, #2096 /
// §12.3): the poll-options reader, the schedule-freshness test, the paint-barrier vocabulary, the
// untrusted-trigger test and the motion-poll test — the questions both halves ask IDENTICALLY.
//
// WHY IT IS HERE AND NOT IN A GATE MODULE. `ct-poll-schedule-and-paint` judges each occurrence (a shared
// `intervals` schedule; an `evaluate`-driven trigger with no painted barrier before a motion poll).
// `ct-poll-schedule-and-paint-health` is the BLINDNESS TRIPWIRE over the founding CT file — it proves that
// file still exercises every shape the occurrence policy matches on. That claim is only meaningful while
// both modules match with the SAME predicates: a drifted copy in the tripwire would certify a vocabulary
// the occurrence gate no longer uses, which is precisely the failure a blindness tripwire exists to
// prevent. The sibling used to reach these by importing the occurrence gate module directly, which the
// owner banned on 2026-09-12: **a gate module NEVER imports another gate module; a shared predicate moves
// to `lib/<family>.ts`.** `lib/contract-derives-not-respells.ts` is the worked precedent.
//
// THE BOUNDARY IS THE DEPENDENCY CLOSURE, NOT A LINE RANGE. A first carve took a contiguous span and `tsc`
// caught it immediately: owner-only helpers came along while `PAINT_API` was stranded behind. So the split
// is by what the predicates CLOSE OVER — and four of those (`EVALUATE`, `ancestorContains`,
// `isBarrierCall`, `reportSharedSchedule`) are exported rather than private because the occurrence
// policy's own descriptor still calls them. `TEST_CALLEE`/`testBodyOf` and this family's `MESSAGE`/`FIX`
// deliberately did NOT move: the first is the test-body walk, and the second is one policy's diagnostic
// voice — the `-health` sibling reports a different thing in different words, so sharing them would make
// one policy's prose the other's dependency.
import type { CallExpression, SourceFile, Node as TsNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";

const INTERVALS = "intervals";
const EXPECT = "expect";
const POLL = "poll";
const TO_PASS = "toPass";
export const EVALUATE = "evaluate";
export const PAINT_API = "requestAnimationFrame";

/** The reads that only exist because a `layout-shift` entry was delivered — the values ARM B protects. */
export const MOTION_READS: ReadonlySet<string> = new Set(["cls", "observedCls", "virtualizedCls", "nonVirtualizedCls"]);
/** Untrusted triggers `locator.click()`'s two-stable-frame actionability wait does NOT cover. */
const UNTRUSTED_TRIGGERS: ReadonlySet<string> = new Set(["click", "dispatchEvent"]);

/** The options argument of a Playwright poll door — `expect.poll(fn, OPTS)` / `<expect>.toPass(OPTS)`. */
export function pollOptionsArg(call: CallExpression): TsNode | undefined {
  const callee = call.getExpression();
  if (!Node.isPropertyAccessExpression(callee)) {
    return;
  }
  if (callee.getName() === TO_PASS) {
    return call.getArguments()[0];
  }
  const isExpectPoll = callee.getName() === POLL && callee.getExpression().getText() === EXPECT;
  return isExpectPoll ? call.getArguments()[1] : undefined;
}

/** A MODULE-SCOPE `const X = …` initializer in this file, by name. Deliberately module-scope only: that is
 *  the shared-across-calls shape ARM A is about, and `getVariableDeclaration` reads exactly that tier. */
function moduleConstInit(sf: SourceFile, name: string): TsNode | undefined {
  return sf.getVariableDeclaration(name)?.getInitializer();
}

/** Does this identifier name a module-scope object literal that carries an `intervals` key? */
function namesSharedSchedule(sf: SourceFile, id: TsNode): boolean {
  const init = moduleConstInit(sf, id.getText());
  return init !== undefined && Node.isObjectLiteralExpression(init) && init.getProperty(INTERVALS) !== undefined;
}

/** The node to report for ONE options property, or undefined when that property is legal. Three spellings
 *  of the same shared reference: `intervals: IDENT`, `{ intervals }`, and `{ ...SHARED }` (a spread copies
 *  the object, never the array inside it). */
function sharedScheduleNode(prop: TsNode, sf: SourceFile): TsNode | undefined {
  if (Node.isShorthandPropertyAssignment(prop) && prop.getName() === INTERVALS) {
    return prop;
  }
  if (Node.isPropertyAssignment(prop) && prop.getName() === INTERVALS) {
    const value = prop.getInitializerOrThrow();
    return Node.isIdentifier(value) ? value : undefined;
  }
  if (!Node.isSpreadAssignment(prop)) {
    return;
  }
  const expr = prop.getExpression();
  return Node.isIdentifier(expr) && namesSharedSchedule(sf, expr) ? expr : undefined;
}

/** ARM A — every identifier-carried route to a shared interval array in one options argument. */
export function reportSharedSchedule(options: TsNode, sf: SourceFile, report: (node: TsNode, token: string) => void): void {
  if (Node.isIdentifier(options)) {
    if (namesSharedSchedule(sf, options)) {
      report(options, options.getText());
    }
    return;
  }
  if (!Node.isObjectLiteralExpression(options)) {
    return;
  }
  for (const prop of options.getProperties()) {
    const hit = sharedScheduleNode(prop, sf);
    if (hit !== undefined) {
      report(hit, Node.isShorthandPropertyAssignment(hit) ? INTERVALS : hit.getText());
    }
  }
}

/** Is this options argument a FRESH mint — an inline array literal or a factory call? (the health arm's
 *  read.) */
export function isFreshSchedule(options: TsNode | undefined): boolean {
  if (options === undefined) {
    return false;
  }
  if (Node.isCallExpression(options)) {
    return true;
  }
  if (!Node.isObjectLiteralExpression(options)) {
    return false;
  }
  const prop = options.getProperty(INTERVALS);
  return prop !== undefined && Node.isPropertyAssignment(prop) && Node.isArrayLiteralExpression(prop.getInitializerOrThrow());
}

/** Does `scope`'s subtree contain `node`? Walks UP from `node` via its ancestor chain (never a descendant
 *  walk of `scope`) — the shared kind-indexed walk already delivers every identifier/call in the file, so
 *  "is this occurrence inside that scope" is answered by ancestry, never by re-walking down from `scope`. */
export function ancestorContains(scope: TsNode, node: TsNode): boolean {
  return node === scope || node.getAncestors().includes(scope);
}

/** Does `scope`'s subtree contain a `requestAnimationFrame` identifier, from the file's own
 *  pre-collected identifier list? */
function reachesPaintApi(scope: TsNode, identifiers: readonly TsNode[]): boolean {
  return identifiers.some((id) => id.getText() === PAINT_API && ancestorContains(scope, id));
}

/** The names of same-file helpers whose body reaches `requestAnimationFrame` — the barrier vocabulary,
 *  DERIVED rather than hard-coded so a rename of `settlePaint` cannot silently disarm ARM B. */
export function barrierNames(sf: SourceFile, identifiers: readonly TsNode[]): ReadonlySet<string> {
  const names = new Set<string>();
  for (const fn of sf.getFunctions()) {
    const name = fn.getName();
    if (name !== undefined && reachesPaintApi(fn, identifiers)) {
      names.add(name);
    }
  }
  for (const decl of sf.getVariableDeclarations()) {
    const init = decl.getInitializer();
    if (init !== undefined && (Node.isArrowFunction(init) || Node.isFunctionExpression(init)) && reachesPaintApi(init, identifiers)) {
      names.add(decl.getName());
    }
  }
  return names;
}

/** A barrier: a call to a derived helper, or an inline `page.evaluate(() => requestAnimationFrame(…))`. */
export function isBarrierCall(call: CallExpression, names: ReadonlySet<string>, identifiers: readonly TsNode[]): boolean {
  const callee = call.getExpression();
  if (Node.isIdentifier(callee) && names.has(callee.getText())) {
    return true;
  }
  return Node.isPropertyAccessExpression(callee) && callee.getName() === EVALUATE && reachesPaintApi(call, identifiers);
}

/** An UNTRUSTED trigger: `<locator>.evaluate(el => el.click())` / a dispatched event — no actionability wait. */
export function isUntrustedTrigger(call: CallExpression, calls: readonly CallExpression[]): boolean {
  const callee = call.getExpression();
  if (!(Node.isPropertyAccessExpression(callee) && callee.getName() === EVALUATE)) {
    return false;
  }
  return call.getArguments().some((arg) =>
    calls.some((inner) => {
      if (!ancestorContains(arg, inner)) {
        return false;
      }
      const target = inner.getExpression();
      return Node.isPropertyAccessExpression(target) && UNTRUSTED_TRIGGERS.has(target.getName());
    }),
  );
}

/** A poll whose asserted value is layout-shift-derived (the read that needs a painted "before"). */
export function isMotionPoll(call: CallExpression, identifiers: readonly TsNode[]): boolean {
  if (pollOptionsArg(call) === undefined) {
    return false;
  }
  const statement = call.getFirstAncestorByKind(SyntaxKind.ExpressionStatement) ?? call;
  return identifiers.some((id) => MOTION_READS.has(id.getText()) && ancestorContains(statement, id));
}
