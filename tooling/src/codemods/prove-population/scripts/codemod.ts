// Makes a test check prove its population before it judges it: `expect(rows.every(p))` becomes
// `expect(nonEmpty(rows).every(p))`, and each `?.` on the spine of an `expect(...).not` subject or matcher argument
// becomes a `present(...)` narrowing, so a missing row throws instead of comparing `undefined`.

import type { Codemod, Edit, GetSelector, RuleConfig, SgNode } from "codemod:ast-grep";
import type TS from "codemod:ast-grep/langs/typescript";
import { useMetricAtom } from "codemod:metrics";
import path from "path";

const DOOR = "@orb/testkit/iso";
const KIT_ROOT = "tests/support/";
const KIT_HOME = "tests/support/iso/non-empty.ts";
const NON_EMPTY = "nonEmpty";
const PRESENT = "present";

const EXPECT_CALL: RuleConfig<TS> = {
  rule: { kind: "call_expression", has: { field: "function", kind: "identifier", regex: "^expect$" } },
};

export const getSelector: GetSelector<TS> = () => EXPECT_CALL;

const edits = useMetricAtom("prove-population-edits");
const skips = useMetricAtom("prove-population-skips");

// These callbacks are serialized to the browser, where the iso helpers do not exist.
const SERIALIZED_CALLBACK: RuleConfig<TS> = {
  rule: {
    kind: "call_expression",
    has: {
      field: "function",
      kind: "member_expression",
      has: { field: "property", regex: "^(evaluate|evaluateAll|evaluateHandle|waitForFunction|addInitScript|\\$eval|\\$\\$eval)$" },
    },
  },
};

const OPTIONAL_HOLDERS = new Set(["member_expression", "subscript_expression", "call_expression"]);

function spineObject(node: SgNode<TS>): SgNode<TS> | null {
  if (!OPTIONAL_HOLDERS.has(node.kind())) {
    return null;
  }
  return node.field(node.kind() === "call_expression" ? "function" : "object");
}

const isOptional = (node: SgNode<TS>): boolean => node.children().some((child) => child.kind() === "optional_chain");

/** True when an optional link sits on the node's object spine, the part ESTree wraps in one ChainExpression. */
function hasOptionalSpine(node: SgNode<TS>): boolean {
  for (let current: SgNode<TS> | null = node; current !== null; current = spineObject(current)) {
    if (OPTIONAL_HOLDERS.has(current.kind()) && isOptional(current)) {
      return true;
    }
  }
  return false;
}

/** The node's text with each optional link on its spine replaced by a `present(...)` narrowing of its object. */
function narrowed(node: SgNode<TS>): string {
  const object = spineObject(node);
  if (object === null) {
    return node.text();
  }
  const rest = node.text().slice(object.text().length);
  if (!isOptional(node)) {
    return `${narrowed(object)}${rest}`;
  }
  const link = rest.trimStart();
  const tail = node.kind() === "member_expression" ? `.${link.slice(2)}` : link.slice(2);
  return `${PRESENT}(${narrowed(object)})${tail}`;
}

const argumentsOf = (call: SgNode<TS>): SgNode<TS>[] => (call.field("arguments")?.children() ?? []).filter((child) => child.isNamed());

/** `expect(x)` followed by `.not`, returning the matcher call so its arguments narrow too. */
function negatedMatcher(expectCall: SgNode<TS>): SgNode<TS> | null {
  const not = expectCall.parent();
  if (not?.kind() !== "member_expression" || not.field("property")?.text() !== "not") {
    return null;
  }
  const matcher = not.parent();
  const call = matcher?.parent();
  return matcher?.kind() === "member_expression" && call?.kind() === "call_expression" ? call : null;
}

interface Planned {
  readonly edits: Edit[];
  readonly helpers: Set<string>;
}

function planChain(expectCall: SgNode<TS>, subject: SgNode<TS>, plan: Planned): void {
  const matcher = negatedMatcher(expectCall);
  if (matcher === null || !hasOptionalSpine(subject)) {
    return;
  }
  for (const node of [subject, ...argumentsOf(matcher)]) {
    if (hasOptionalSpine(node)) {
      plan.edits.push(node.replace(narrowed(node)));
    }
  }
  plan.helpers.add(PRESENT);
  edits.increment({ shape: "chain-not" });
}

function planEvery(subject: SgNode<TS>, plan: Planned): void {
  const callee = subject.kind() === "call_expression" ? subject.field("function") : null;
  if (callee?.kind() !== "member_expression" || callee.field("property")?.text() !== "every" || isOptional(callee)) {
    return;
  }
  const receiver = callee.field("object");
  if (receiver === null) {
    return;
  }
  if (receiver.kind() === "call_expression" && receiver.field("function")?.text() === NON_EMPTY) {
    skips.increment({ reason: "already-proven" });
    return;
  }
  if (hasOptionalSpine(receiver)) {
    plan.helpers.add(PRESENT);
  }
  plan.edits.push(receiver.replace(`${NON_EMPTY}(${narrowed(receiver)})`));
  plan.helpers.add(NON_EMPTY);
  edits.increment({ shape: "every" });
}

function sourceOf(statement: SgNode<TS>): string | undefined {
  return statement
    .field("source")
    ?.find({ rule: { kind: "string_fragment" } })
    ?.text();
}

/** Kit files import the helper by relative path; every other test imports it through the iso door. */
function moduleFor(filename: string): string {
  const at = filename.indexOf(KIT_ROOT);
  if (at === -1) {
    return DOOR;
  }
  const repoRoot = filename.slice(0, at);
  const relative = path.relative(path.dirname(filename), `${repoRoot}${KIT_HOME}`);
  return relative.startsWith(".") ? relative : `./${relative}`;
}

function importEdits(rootNode: SgNode<TS>, module: string, helpers: ReadonlySet<string>): Edit[] {
  const imports = rootNode.findAll({ rule: { kind: "import_statement" } });
  const isTypeOnly = (statement: SgNode<TS>): boolean => statement.children().some((child) => child.kind() === "type");
  const existing = imports.find((statement) => sourceOf(statement) === module && !isTypeOnly(statement));
  const imported = new Set(
    imports.flatMap((statement) =>
      isTypeOnly(statement) ? [] : statement.findAll({ rule: { kind: "import_specifier" } }).map((specifier) => specifier.text()),
    ),
  );
  const missing = [...helpers].filter((helper) => !imported.has(helper)).sort();
  if (missing.length === 0) {
    return [];
  }
  const last = existing
    ?.find({ rule: { kind: "named_imports" } })
    ?.findAll({ rule: { kind: "import_specifier" } })
    .at(-1);
  if (last !== undefined) {
    const { end } = last.range();
    return [{ startPos: end.index, endPos: end.index, insertedText: `, ${missing.join(", ")}` }];
  }
  const lastImport = imports.at(-1);
  const at = lastImport === undefined ? 0 : lastImport.range().end.index;
  const line = `import { ${missing.join(", ")} } from "${module}";`;
  return [{ startPos: at, endPos: at, insertedText: lastImport === undefined ? `${line}\n` : `\n${line}` }];
}

const codemod: Codemod<TS> = (root) => {
  const filename = root.filename();
  if (filename.endsWith(KIT_HOME)) {
    skips.increment({ reason: "helper-file" });
    return Promise.resolve(null);
  }
  const rootNode = root.root();
  const plan: Planned = { edits: [], helpers: new Set() };
  for (const expectCall of rootNode.findAll(EXPECT_CALL)) {
    const [subject] = argumentsOf(expectCall);
    if (subject === undefined) {
      continue;
    }
    if (expectCall.ancestors().some((ancestor) => ancestor.matches(SERIALIZED_CALLBACK))) {
      skips.increment({ reason: "serialized-callback" });
      continue;
    }
    planChain(expectCall, subject, plan);
    planEvery(subject, plan);
  }
  if (plan.edits.length === 0) {
    return Promise.resolve(null);
  }
  return Promise.resolve(rootNode.commitEdits([...plan.edits, ...importEdits(rootNode, moduleFor(filename), plan.helpers)]));
};

export default codemod;
