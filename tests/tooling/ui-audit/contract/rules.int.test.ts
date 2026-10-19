// @subject tooling/src/ui-audit/contract/rules.ts
// Every live ui-audit rule owns a firing proof and a precision-neighbour silence proof. The registry is the
// denominator; a proof counts only when it is attached to an executable top-level `auditRuleTest`
// registration whose helper forwards to the real `test`, so deleting the test deletes the proof.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { DesignAuditRuleId } from "@orb/tooling/ui-audit";
import { DESIGN_AUDIT_RULES } from "@orb/tooling/ui-audit";
import type { ArrayLiteralExpression, Node, ObjectLiteralExpression, SourceFile } from "ts-morph";
import { Project, SyntaxKind } from "ts-morph";

// A registry row whose id is computed widens the id union to `string`, which would let any proof id type-check.
type RuleIdsAreLiteralTypes = string extends DesignAuditRuleId ? false : true;
const RULE_IDS_ARE_LITERAL_TYPES: RuleIdsAreLiteralTypes = true;

const PROOF_ROOT = "tests/tooling/ui-audit";
const WALKER_COMPONENT_TEST = "tests/tooling/design-audit-walker.ct.tsx";
const HELPER = "auditRuleTest";
const KINDS = ["fires", "silent"] as const;
const TOOL_FIXTURE_DOOR = "@orb/testkit/node/tool-fixtures.ts";

interface Proof {
  readonly rule: string;
  readonly kind: string;
}

/** The string a node provably holds: a literal, a `+` of literals, or an immutable same-file const of those. */
function staticString(node: Node | undefined): string | undefined {
  if (node === undefined) {
    return undefined;
  }
  if (node.isKind(SyntaxKind.StringLiteral) || node.isKind(SyntaxKind.NoSubstitutionTemplateLiteral)) {
    return node.getLiteralText();
  }
  if (node.isKind(SyntaxKind.ParenthesizedExpression) || node.isKind(SyntaxKind.AsExpression)) {
    return staticString(node.getExpression());
  }
  if (node.isKind(SyntaxKind.BinaryExpression) && node.getOperatorToken().getKind() === SyntaxKind.PlusToken) {
    const left = staticString(node.getLeft());
    const right = staticString(node.getRight());
    return left === undefined || right === undefined ? undefined : left + right;
  }
  if (node.isKind(SyntaxKind.Identifier)) {
    return staticString(constInitializer(node));
  }
  return undefined;
}

function constInitializer(identifier: Node): Node | undefined {
  const declaration = identifier.getSourceFile().getVariableDeclaration(identifier.getText());
  return declaration?.getVariableStatement()?.getDeclarationKind() === "const" ? declaration.getInitializer() : undefined;
}

function proofArray(node: Node | undefined): ArrayLiteralExpression | undefined {
  const resolved = node?.isKind(SyntaxKind.Identifier) === true ? constInitializer(node) : node;
  const value = resolved?.isKind(SyntaxKind.AsExpression) === true ? resolved.getExpression() : resolved;
  return value?.isKind(SyntaxKind.ArrayLiteralExpression) === true ? value : undefined;
}

function field(row: ObjectLiteralExpression, name: string): string | undefined {
  const property = row.getProperty(name);
  return property?.isKind(SyntaxKind.PropertyAssignment) === true ? staticString(property.getInitializer())?.trim() : undefined;
}

/** `test` imported once from the shared tool fixtures, unaliased, and never shadowed in the file. */
function testIsBound(source: SourceFile): boolean {
  const bindings = source
    .getImportDeclarations()
    .flatMap((declaration) => declaration.getNamedImports().map((named) => ({ named, module: declaration.getModuleSpecifierValue() })))
    .filter(({ named }) => (named.getAliasNode()?.getText() ?? named.getName()) === "test");
  const shadowed =
    source.getFunctions().some((fn) => fn.getName() === "test") || source.getVariableDeclarations().some((declaration) => declaration.getName() === "test");
  return bindings.length === 1 && bindings[0]?.module === TOOL_FIXTURE_DOOR && bindings[0].named.getAliasNode() === undefined && !shadowed;
}

/** One unshadowed `auditRuleTest(proofs, title, fn)` declaration that hands its title and callback to the real `test`. */
function helperForwardsToTest(source: SourceFile): boolean {
  const helpers = source.getFunctions().filter((fn) => fn.getName() === HELPER);
  const [helper] = helpers;
  const shadowed =
    source
      .getImportDeclarations()
      .some((declaration) => declaration.getNamedImports().some((named) => (named.getAliasNode()?.getText() ?? named.getName()) === HELPER)) ||
    source.getVariableDeclarations().some((declaration) => declaration.getName() === HELPER);
  if (helpers.length !== 1 || helper === undefined || shadowed || !testIsBound(source)) {
    return false;
  }
  if (
    helper
      .getParameters()
      .map((parameter) => parameter.getName())
      .join(",") !== "proofs,title,fn"
  ) {
    return false;
  }
  // A nested function, variable or parameter named `test` rebinds the call below just as a top-level one does.
  const bodyShadowsTest = [
    ...helper.getDescendantsOfKind(SyntaxKind.FunctionDeclaration),
    ...helper.getDescendantsOfKind(SyntaxKind.VariableDeclaration),
    ...helper.getDescendantsOfKind(SyntaxKind.Parameter),
  ].some((declaration) => declaration.getName() === "test");
  const forwards = helper.getDescendantsOfKind(SyntaxKind.CallExpression).some((call) => {
    const [title, callback] = call.getArguments();
    return (
      call.getExpression().getText() === "test" &&
      title?.getText() === "title" &&
      callback !== undefined &&
      (callback.getText() === "fn" || callback.getDescendantsOfKind(SyntaxKind.Identifier).some((identifier) => identifier.getText() === "fn"))
    );
  });
  return forwards && !bodyShadowsTest;
}

function topLevelRegistrations(source: SourceFile): readonly Node[] {
  return source
    .getStatements()
    .flatMap((statement) => (statement.isKind(SyntaxKind.ExpressionStatement) ? [statement.getExpression()] : []))
    .filter((expression) => expression.isKind(SyntaxKind.CallExpression) && expression.getExpression().getText() === HELPER);
}

/** One proof row: `rule`, `kind` and `reason` all present and non-empty, `kind` one of the two proof classes. */
function readProof(element: Node): Proof | undefined {
  const row = element.isKind(SyntaxKind.ObjectLiteralExpression) ? element : undefined;
  const rule = row === undefined ? undefined : field(row, "rule");
  const kind = row === undefined ? undefined : field(row, "kind");
  const reason = row === undefined ? undefined : field(row, "reason");
  return rule === undefined || rule === "" || kind === undefined || !KINDS.some((known) => known === kind) || reason === undefined || reason === ""
    ? undefined
    : { rule, kind };
}

interface Registration {
  readonly problems: readonly string[];
  readonly proofs: readonly Proof[];
}

/** An unbound helper contributes no rows, and an unexecutable registration must not satisfy the pair it claims. */
function readRegistration(path: string, call: Node, bound: boolean): Registration {
  const [proofsArgument, , callback] = call.isKind(SyntaxKind.CallExpression) ? call.getArguments() : [];
  const table = proofArray(proofsArgument);
  if (!bound) {
    return { problems: [`${path}: ${HELPER} is not bound to the imported test(title, fn) registration`], proofs: [] };
  }
  if (table === undefined || !(callback?.isKind(SyntaxKind.ArrowFunction) === true || callback?.isKind(SyntaxKind.FunctionExpression) === true)) {
    return { problems: [`${path}: ${HELPER} must carry a literal proof array and executable callback`], proofs: [] };
  }
  const rows = table.getElements().map((element) => ({ element, proof: readProof(element) }));
  return {
    problems: rows
      .filter(({ proof }) => proof === undefined)
      .map(({ element }) => `${path}: malformed or empty executable design-audit proof: ${element.getText()}`),
    proofs: rows.flatMap(({ proof }) => (proof === undefined ? [] : [proof])),
  };
}

/** The two-sided denominator: no proof names an unregistered id, and no registered id lacks either class. */
function coverageProblems(proofs: readonly Proof[], ruleIds: readonly string[]): readonly string[] {
  const registered = new Set(ruleIds);
  return [
    ...proofs.filter(({ rule }) => !registered.has(rule)).map(({ rule }) => `stale design-audit proof id not present in the registry: ${rule}`),
    ...ruleIds.flatMap((id) =>
      KINDS.filter((kind) => !proofs.some((proof) => proof.rule === id && proof.kind === kind)).map(
        (kind) => `missing executable ${kind} proof for design-audit rule ${id}`,
      ),
    ),
  ];
}

/** Every verdict about the proof corpus: malformed evidence, unbound helpers, stale ids and the ids still owed a proof. */
function proofProblems(files: Readonly<Record<string, string>>, ruleIds: readonly string[]): readonly string[] {
  const project = new Project({ useInMemoryFileSystem: true, skipAddingFilesFromTsConfig: true });
  const registrations = Object.entries(files).flatMap(([path, text]) => {
    const source = project.createSourceFile(path, text);
    const bound = helperForwardsToTest(source);
    return topLevelRegistrations(source).map((call) => readRegistration(path, call, bound));
  });
  return [
    ...registrations.flatMap(({ problems }) => problems),
    ...coverageProblems(
      registrations.flatMap(({ proofs }) => proofs),
      ruleIds,
    ),
  ];
}

/** Every authored source under the proof root plus the walker component test, so a proof in any such file is judged. */
function proofFilesUnder(root: string): Record<string, string> {
  const files: Record<string, string> = {};
  const read = (path: string): void => {
    files[path.slice(root.length + 1)] = readFileSync(path, "utf8");
  };
  for (const entry of readdirSync(join(root, PROOF_ROOT), { recursive: true, withFileTypes: true })) {
    if (entry.isFile() && /\.tsx?$/u.test(entry.name)) {
      read(join(entry.parentPath, entry.name));
    }
  }
  read(join(root, WALKER_COMPONENT_TEST));
  return files;
}

const BOUND_HELPER = `import { test } from "${TOOL_FIXTURE_DOOR}";\nfunction ${HELPER}(proofs: unknown, title: string, fn: () => void): void { void proofs; test(title, fn); }\n`;
const BOTH = `${HELPER}([{ rule: "side-tab", kind: "fires", reason: "fixture" }, { rule: "side-tab", kind: "silent", reason: "neighbor" }], "fixture", () => {});\n`;
const proofFile = (body: string): Record<string, string> => ({ [`${PROOF_ROOT}/__plant.test.ts`]: body });
const ONE_RULE = ["side-tab"];

test("every registered design-audit rule owns a firing and a silence proof", ({ repoRoot }) => {
  const ids = DESIGN_AUDIT_RULES.map((rule) => rule.id);
  expect(RULE_IDS_ARE_LITERAL_TYPES, "a registry row carries a computed id").toBe(true);
  expect(ids.length, "the design-audit registry resolved to zero rules").toBeGreaterThan(0);
  expect(new Set(ids).size, "two registry rows claim one rule id").toBe(ids.length);
  expect(proofProblems(proofFilesUnder(repoRoot), ids)).toEqual([]);
});

test("a complete pair, a const-bound proof array and registration-like text are judged correctly", () => {
  expect(proofProblems(proofFile(`${BOUND_HELPER}${BOTH}`), ONE_RULE)).toEqual([]);
  expect(proofProblems(proofFile(`${BOUND_HELPER}const quoted = "${HELPER}([{ rule: ghost }])";\nvoid quoted;\n${BOTH}`), ONE_RULE)).toEqual([]);
  const bound = `const PROOFS = [{ rule: "side-tab", kind: "fires", reason: "fixture emits" }, { rule: "side-tab", kind: "silent", reason: "nearest sanctioned neighbour" }] as const;\n${HELPER}(PROOFS, "fixture", () => {});\n`;
  expect(proofProblems(proofFile(`${BOUND_HELPER}${bound}`), ONE_RULE)).toEqual([]);
});

test("a registration whose helper does not forward to the real test proves nothing", () => {
  const unbound = proofFile(BOTH);
  expect(proofProblems(unbound, ONE_RULE)).toEqual(
    expect.arrayContaining([expect.stringContaining("not bound"), expect.stringContaining("missing executable fires proof")]),
  );
  const noop = `import { test } from "${TOOL_FIXTURE_DOOR}";\nfunction ${HELPER}(proofs: unknown, title: string, fn: () => void): void { void proofs; void title; void fn; }\n${BOTH}`;
  expect(proofProblems(proofFile(noop), ONE_RULE)).toEqual(expect.arrayContaining([expect.stringContaining("not bound")]));
  const shadow = `import { test } from "${TOOL_FIXTURE_DOOR}";\nfunction ${HELPER}(proofs: unknown, title: string, fn: () => void): void { void proofs; const test = (_title: string, _fn: () => void): void => {}; test(title, fn); }\n${BOTH}`;
  expect(proofProblems(proofFile(shadow), ONE_RULE)).toEqual(expect.arrayContaining([expect.stringContaining("not bound")]));
  const helperWith = (inner: string): string =>
    `import { test } from "${TOOL_FIXTURE_DOOR}";\nfunction ${HELPER}(proofs: unknown, title: string, fn: () => void): void { void proofs; ${inner} test(title, fn); }\n${BOTH}`;
  const fnShadow = helperWith("function test(_title: string, _fn: () => void): void {}");
  const paramShadow = helperWith("[0].forEach((test) => { void test; });");
  for (const body of [fnShadow, paramShadow]) {
    expect(proofProblems(proofFile(body), ONE_RULE)).toEqual(expect.arrayContaining([expect.stringContaining("not bound")]));
  }
});

test("a rule short of either proof class, or a proof naming no registered rule, is reported", () => {
  const only = (kind: string): string => `${HELPER}([{ rule: "side-tab", kind: "${kind}", reason: "fixture" }], "fixture", () => {});\n`;
  expect(proofProblems(proofFile(BOUND_HELPER + only("fires")), ONE_RULE)).toEqual(["missing executable silent proof for design-audit rule side-tab"]);
  expect(proofProblems(proofFile(BOUND_HELPER + only("silent")), ONE_RULE)).toEqual(["missing executable fires proof for design-audit rule side-tab"]);
  const stale = `${HELPER}([{ rule: "side-tab", kind: "fires", reason: "fixture" }, { rule: "side-tab", kind: "silent", reason: "neighbor" }, { rule: "border-accent-on-rounded", kind: "fires", reason: "dynamic" }], "fixture", () => {});\n`;
  expect(proofProblems(proofFile(BOUND_HELPER + stale), ONE_RULE)).toEqual([
    "stale design-audit proof id not present in the registry: border-accent-on-rounded",
  ]);
});

test("an empty reason or an unknown proof class is malformed and does not satisfy the pair", () => {
  const emptyReason = `${HELPER}([{ rule: "side-tab", kind: "fires", reason: "" }, { rule: "side-tab", kind: "silent", reason: "neighbor" }], "fixture", () => {});\n`;
  expect(proofProblems(proofFile(BOUND_HELPER + emptyReason), ONE_RULE)).toEqual([
    expect.stringContaining("malformed or empty executable design-audit proof"),
    "missing executable fires proof for design-audit rule side-tab",
  ]);
  const hedged = `${HELPER}([{ rule: "side-tab", kind: "maybe", reason: "hedged" }, { rule: "side-tab", kind: "silent", reason: "neighbor" }], "fixture", () => {});\n`;
  expect(proofProblems(proofFile(BOUND_HELPER + hedged), ONE_RULE)).toEqual([
    expect.stringContaining("malformed or empty executable design-audit proof"),
    "missing executable fires proof for design-audit rule side-tab",
  ]);
});

test("a computed proof array, a named callback and a nested registration are not executable evidence", () => {
  const computed = `declare function buildProofs(): unknown;\n${HELPER}(buildProofs(), "fixture", () => {});\n`;
  expect(proofProblems(proofFile(BOUND_HELPER + computed), ONE_RULE)).toEqual(
    expect.arrayContaining([expect.stringContaining("must carry a literal proof array"), "missing executable fires proof for design-audit rule side-tab"]),
  );
  const named = `function body(): void {}\n${HELPER}([{ rule: "side-tab", kind: "fires", reason: "fixture" }, { rule: "side-tab", kind: "silent", reason: "neighbor" }], "fixture", body);\n`;
  expect(proofProblems(proofFile(BOUND_HELPER + named), ONE_RULE)).toEqual(
    expect.arrayContaining([expect.stringContaining("must carry a literal proof array and executable callback")]),
  );
  const nested = `describe("audit", () => {\n  ${BOTH}});\n`;
  expect(proofProblems(proofFile(BOUND_HELPER + nested), ONE_RULE)).toEqual([
    "missing executable fires proof for design-audit rule side-tab",
    "missing executable silent proof for design-audit rule side-tab",
  ]);
});
