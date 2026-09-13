// The family reader for the LITERAL-shaped plumbing laws — `tooling-port-registry` (a TCP port is a row in
// the one registry, `_shared/ports.ts`), `tooling-clock-budget` (a wall clock is derived through the one
// load budget, `_shared/load-budget.ts`) and `tooling-runner-config-literals` (both laws over the three
// ROOT runner configs, which no population reaches) — so what counts as "a port literal" and "a fixed
// clock" is ONE predicate in three policies (family `plumbing-literals`).
//
// SYNTAX, NOT IDENTITY, by design: both predicates judge a NUMERIC LITERAL and the NAME of the position it
// sits in. A number has no declaration to resolve, and the name-shaped halves exist precisely because a
// hand-picked port or a fixed clock carries a number no table knows — only its name gives it away. The one
// callee spelling here (`setTimeout`) is therefore a DECLARED LIMIT: a local function of that name is not
// a wall clock and its ceiling-scale delay would be a false positive, waivable at the literal.
//
// `portLiteralOf` / `fixedClockOf` are pure readers over ONE delivered node — no walk, no Project, no
// filesystem. `runnerConfigLiteralFacts` is the one reader that WALKS, and it walks a SCRATCH parse of text a
// declared resource fact delivered (`lib/config-static-read.ts#parseStaticSourceText`, the one parser),
// never the shared workspace — the walk lives here so that no gate module walks (guide §5).
//
// SINGLE-CONSUMER TODAY, and why `lib/` is still right (orchestrator ruling 2026-09-12, #1950 group 4):
// `runnerConfigLiteralFacts` has one consumer, `tooling-runner-config-literals`. The natural second is
// `runner-config-path-liveness`, which reads the SAME three files through `static-config` for their
// SELECTOR rows and would take these literal facts the day it judges a numeric option (a `timeout` beside a
// `testDir`). It belongs in `lib/` regardless: the three `exact-file` ids ARE the capability (a contract
// edit with a named consumer, `contract/resource-exact.ts`), and this module is ARITHMETIC over them — a
// weaker claim than a resource kind, which is what §12.4's "one scratch parser, many readers" shape asks
// for. Moving it into the gate would make the gate a walker and the parser private.
import type { CallExpression, Node as MorphNode, NumericLiteral } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { RunnerConfigLiteral, RunnerConfigRead } from "../contract/plumbing-literals.ts";
import { parseStaticSourceText } from "./config-static-read.ts";

/** A declaration/property NAME that means "this number is a TCP port". `port`, `ctPort`, `serverPort`,
 *  `FIXTURE_PORT`, `DEV_VITE_PORT` all land here. */
export const PORT_NAME_RE = /^port$|Port$|_PORT$|^PORT$/u;

/** Property names whose numeric value IS a wall clock. A nested option object reaches this list through its
 *  INNER property (playwright's expect-timeout and the use-block action timeout both land here) — the
 *  reader reads the LEAF, never the wrapper. */
export const CLOCK_KEYS: ReadonlySet<string> = new Set(["timeout", "timeoutMs", "testTimeout", "hookTimeout", "actionTimeout", "navigationTimeout"]);

/** A `setTimeout(fn, N)` below this is a SETTLE — a sleep the run always pays — and a settle is not a
 *  budget (it is never scaled, docs/design/1208-instrument-substrate.md §7.1). At or above it, the literal
 *  is a ceiling wearing a sleep's clothes. */
export const SETTLE_CEILING_MS = 5000;

/** A const NAMED as a wall clock. A name carrying BASE is the SANCTIONED shape (`NAV_TIMEOUT_BASE_MS`, the
 *  literal every budget is derived from). `*_BUDGET_MS` is DELIBERATELY absent: a verdict threshold is not
 *  a wall clock, and scaling it would widen the verdict on a loaded box. */
const CLOCK_NAME_RE = /(?:_TIMEOUT_MS|TimeoutMs)$/u;
const BASE_NAME_RE = /BASE|Base/u;
const SET_TIMEOUT = "setTimeout";
const DELAY_ARGUMENT = 1;

export interface PortLiteral {
  readonly literal: NumericLiteral;
  readonly value: number;
  /** `8788` for a registry value; `FIXTURE_PORT = 8123` / `ctPort: 3101` for a port-named position. */
  readonly label: string;
  readonly shape: "registry-value" | "port-named";
}

export interface FixedClock {
  readonly literal: NumericLiteral;
  /** `timeout: 30_000` / `STEP_TIMEOUT_MS = 5000` / `setTimeout(…, 30_000)`. */
  readonly label: string;
  readonly shape: "clock-option" | "clock-const" | "ceiling-sleep";
}

function numericValue(literal: NumericLiteral): number {
  return Number(literal.getLiteralText().replaceAll("_", ""));
}

/** The NAME a numeric literal is bound to (`const x = 8788` / `{ port: 8788 }`), or null when the literal
 *  sits in an unnamed position (a call argument, an array element). Read through the PARENT rather than a
 *  text match, so `x as never`/parenthesized wrappers cannot hide the binding. */
function boundName(node: MorphNode): { readonly name: string; readonly sep: string } | null {
  const parent = node.getParent();
  if (parent !== undefined && Node.isPropertyAssignment(parent)) {
    return { name: parent.getName().replaceAll(/['"]/gu, ""), sep: ":" };
  }
  if (parent !== undefined && Node.isVariableDeclaration(parent)) {
    return { name: parent.getName(), sep: " =" };
  }
  return null;
}

/** Is this numeric literal a port the registry should own? TWO shapes, and the order matters — a registry
 *  VALUE is a respell of a known row (the strongest claim, and it needs no name), while a port-NAMED
 *  position carrying an unknown number is a hand-picked pair. `registry` is the caller's live set (the
 *  policies import it from `_shared/ports.ts`, so a new reserved row widens the arm for free). */
export function portLiteralOf(node: MorphNode, registry: ReadonlySet<number>): PortLiteral | null {
  if (!Node.isNumericLiteral(node)) {
    return null;
  }
  const text = node.getLiteralText();
  const value = numericValue(node);
  if (registry.has(value)) {
    return { literal: node, value, label: text, shape: "registry-value" };
  }
  const bound = boundName(node);
  return bound !== null && PORT_NAME_RE.test(bound.name) ? { literal: node, value, label: `${bound.name}${bound.sep} ${text}`, shape: "port-named" } : null;
}

function ceilingSleepOf(call: CallExpression): FixedClock | null {
  if (call.getExpression().getText() !== SET_TIMEOUT) {
    return null;
  }
  const delay = call.getArguments()[DELAY_ARGUMENT];
  if (delay === undefined || !Node.isNumericLiteral(delay) || numericValue(delay) < SETTLE_CEILING_MS) {
    return null;
  }
  return { literal: delay, label: `${SET_TIMEOUT}(…, ${delay.getText()})`, shape: "ceiling-sleep" };
}

/** Is this node a fixed wall clock? Three shapes, one rule: a clock OPTION with a numeric value, a const
 *  NAMED as a clock with a bare numeric initializer (a literal moved one line up is still a fixed clock),
 *  or a `setTimeout` at ceiling scale. The reported subject is always the NUMERIC LITERAL — the position an
 *  ordinary waiver can name, where the legacy composite (`setTimeout(…, N)`) contained parens and could not
 *  be. */
export function fixedClockOf(node: MorphNode): FixedClock | null {
  if (Node.isPropertyAssignment(node)) {
    const name = node.getName().replaceAll(/['"]/gu, "");
    const init = node.getInitializer();
    return CLOCK_KEYS.has(name) && init !== undefined && Node.isNumericLiteral(init)
      ? { literal: init, label: `${name}: ${init.getText()}`, shape: "clock-option" }
      : null;
  }
  if (Node.isVariableDeclaration(node)) {
    const name = node.getName();
    const init = node.getInitializer();
    if (!CLOCK_NAME_RE.test(name) || BASE_NAME_RE.test(name) || init === undefined || !Node.isNumericLiteral(init)) {
      return null;
    }
    return { literal: init, label: `${name} = ${init.getText()}`, shape: "clock-const" };
  }
  return Node.isCallExpression(node) ? ceilingSleepOf(node) : null;
}

/** Both literal laws over ONE root runner config's TEXT, delivered by the `exact-file` door. The walk is a
 *  scratch parse, never the shared workspace; a config that does not parse REFUSES rather than yielding a
 *  clean zero over a file the reader never read. Rows come back in source order. */
export function runnerConfigLiteralFacts(rel: string, text: string, registry: ReadonlySet<number>): RunnerConfigRead {
  const read = parseStaticSourceText(rel, text);
  if (read.kind !== "ok") {
    return read;
  }
  const literals: RunnerConfigLiteral[] = [];
  for (const node of read.sf.getDescendantsOfKind(SyntaxKind.NumericLiteral)) {
    const port = portLiteralOf(node, registry);
    if (port !== null) {
      literals.push({ kind: "port", line: node.getStartLineNumber(), token: node.getText(), label: port.label });
    }
  }
  const clockHosts = [
    ...read.sf.getDescendantsOfKind(SyntaxKind.PropertyAssignment),
    ...read.sf.getDescendantsOfKind(SyntaxKind.VariableDeclaration),
    ...read.sf.getDescendantsOfKind(SyntaxKind.CallExpression),
  ];
  for (const node of clockHosts) {
    const clock = fixedClockOf(node);
    if (clock !== null) {
      literals.push({ kind: "clock", line: clock.literal.getStartLineNumber(), token: clock.literal.getText(), label: clock.label });
    }
  }
  return { kind: "ok", literals: literals.toSorted((left, right) => left.line - right.line || left.token.localeCompare(right.token)) };
}
