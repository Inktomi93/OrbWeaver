// The `policy-soundness` family's shared reader, judged on the shapes that made the brief's greps lie: a
// same-named local `defineGate`, a message assembled from const aliases and concatenation, a template with a
// dynamic span, a conditional with two possible texts, a marker MENTION that is not a marker LINE, and a report
// sink reached through destructuring or a const alias. Every direction has its control.
import type { CallExpression, Node, SourceFile } from "ts-morph";
import { Project, SyntaxKind } from "ts-morph";
import type { StaticSegments } from "../../../../tooling/src/verify/contract/policy-descriptor-read.ts";
import {
  contextParameterOf,
  descriptorArrayPresence,
  descriptorProperty,
  descriptorValue,
  discriminationOf,
  enclosingStringExpression,
  finalDescriptorOf,
  finalRegistrationOf,
  isContextRooted,
  markerFormIdsOf,
  mentionsWaiverOf,
  messageAlternatives,
  policyIdOfPath,
  policyProductionDependencies,
  proofRowsOf,
  reportSiteMessage,
  reportSiteOf,
  staticSegments,
  staticText,
} from "../../../../tooling/src/verify/lib/policy-descriptor-read.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const CONTRACT_STUB = "export function defineGate<const Policy>(policy: Policy): Policy {\n  return policy;\n}\n";

function projectOf(files: Readonly<Record<string, string>>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile("/repo/tooling/src/verify/contract/policy.ts", CONTRACT_STUB);
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`/repo/${path}`, source);
  }
  return project;
}

function moduleOf(source: string): SourceFile {
  return projectOf({ "tooling/src/verify/gates/probe.ts": source }).getSourceFileOrThrow("/repo/tooling/src/verify/gates/probe.ts");
}

function initializer(sf: SourceFile, name: string): Node {
  return sf.getVariableDeclarationOrThrow(name).getInitializerOrThrow();
}

const CANONICAL_HEAD = 'import { defineGate } from "../contract/policy.ts";\n';
/** A template-substitution opener spelled in two halves, so fixture SOURCE can carry `${…}` without biome
 *  reading the test's own strings as unfinished templates. */
const OPEN = ["$", "{"].join("");

test("static text derives canonical frozen keys in JavaScript order through imported value aliases", () => {
  const project = projectOf({
    "tooling/src/verify/lib/words.ts":
      'const DEFINITION = { zebra: "a", 10: "ten", 2: "two", alpha: "first", ["alpha"]: "last", "01": "padded" };\nexport const WORDS = Object.freeze(Object.keys(DEFINITION));\n',
    "tooling/src/verify/gates/probe.ts":
      'import { WORDS as imported } from "../lib/words.ts";\nconst alias = imported;\nconst separator = "|";\nconst result = alias.join(separator);\n',
  });
  const source = project.getSourceFileOrThrow("/repo/tooling/src/verify/gates/probe.ts");
  expect(staticText(initializer(source, "result"))).toBe("2|10|zebra|alpha|01");
  expect(messageAlternatives(initializer(source, "result"))).toEqual([{ segments: ["2|10|zebra|alpha|01"], complete: true }]);
  const producer = project.getSourceFileOrThrow("/repo/tooling/src/verify/lib/words.ts");
  producer.replaceWithText(`${producer.getFullText()}\nArray.prototype.join = () => "changed";\n`);
  expect(staticText(initializer(source, "result"))).toBeUndefined();
});

test("an empty derived sequence is a known empty template span, not unreadable text", () => {
  const source = moduleOf(`const result = \`before ${OPEN}Object.freeze([]).join(",")} after\`;`);
  expect(staticText(initializer(source, "result"))).toBe("before  after");
  expect(messageAlternatives(initializer(source, "result"))).toEqual([{ segments: ["before  after"], complete: true }]);
});

test.each([
  'const values = ["a", "b"]; values.push("c"); const result = values.join(",");',
  'declare function mutate(value: unknown): void; const values = ["a", "b"]; mutate(values); const result = Object.freeze(values).join(",");',
  'declare function mutate(value: unknown): void; const definition = { a: "x" }; mutate(definition); const result = Object.freeze(Object.keys(definition)).join(",");',
  'const Object = { keys: () => ["wrong"], freeze: (value: unknown) => value }; const result = Object.freeze(Object.keys({ a: "x" })).join(",");',
  'const values = { join: () => "wrong" }; const result = values.join(",");',
  'declare const separator: string; const result = Object.freeze(["a", "b"]).join(separator);',
  'declare const key: string; const result = Object.freeze(Object.keys({ [key]: "x" })).join(",");',
  'const left = right; const right = left; const result = Object.freeze(left).join(",");',
])("derived text refuses unstable identity or effects: %s", (source) => {
  expect(staticText(initializer(moduleOf(`export {};\n${source}`), "result"))).toBeUndefined();
});

test("finalDescriptorOf reads a canonical import and refuses a local lookalike and a legacy object", () => {
  const canonical = moduleOf(`${CANONICAL_HEAD}export const gate = defineGate({ id: "probe" });\n`);
  expect(finalDescriptorOf(canonical)?.getText()).toBe('{ id: "probe" }');

  const lookalike = moduleOf('function defineGate(policy: unknown): unknown {\n  return policy;\n}\nexport const gate = defineGate({ id: "probe" });\n');
  expect(finalDescriptorOf(lookalike)).toBeUndefined();

  const legacy = moduleOf('export const gate = { name: "probe", mustFlag: [1], mustPass: [1] };\n');
  expect(finalDescriptorOf(legacy)).toBeUndefined();

  const aliased = moduleOf('import { defineGate as declare } from "../contract/policy.ts";\nexport const gate = declare({ id: "probe" });\n');
  expect(finalDescriptorOf(aliased)?.getText()).toBe('{ id: "probe" }');
});

test("finalRegistrationOf sees a NON-LITERAL argument as a registration with no descriptor — the blind spot finalDescriptorOf could not name (#2111 A42)", () => {
  const indirect = moduleOf(`${CANONICAL_HEAD}const DESCRIPTOR = { id: "probe" };\nexport const gate = defineGate(DESCRIPTOR);\n`);
  const registration = finalRegistrationOf(indirect);
  expect(registration).toBeDefined();
  expect(registration?.descriptor).toBeUndefined();
  expect(registration?.argument?.getText()).toBe("DESCRIPTOR");
  // The two readers agree on the literal shape, and on the lookalike.
  expect(finalDescriptorOf(indirect)).toBeUndefined();
  const canonical = moduleOf(`${CANONICAL_HEAD}export const gate = defineGate({ id: "probe" });\n`);
  expect(finalRegistrationOf(canonical)?.descriptor?.getText()).toBe('{ id: "probe" }');
  const lookalike = moduleOf(
    'function defineGate(policy: unknown): unknown {\n  return policy;\n}\nexport const gate = defineGate(DESCRIPTOR);\nconst DESCRIPTOR = { id: "probe" };\n',
  );
  expect(finalRegistrationOf(lookalike)).toBeUndefined();
});

test("staticSegments joins what is certain and breaks where text is dynamic", () => {
  const sf = moduleOf(
    [
      'const A = "alpha";',
      'const joined = "x" + A + "y";',
      `const template = \`head ${OPEN}A} tail\`;`,
      "declare const dynamic: string;",
      `const broken = \`head ${OPEN}dynamic} tail\`;`,
      `const edge = \`${OPEN}dynamic}a\` + "b";`,
      `const branch = dynamic === "" ? "no entry at all" : \`"${OPEN}dynamic}", not "x"\`;`,
      `const viaBranch = \`exports has ${OPEN}branch} for the key.\`;`,
      "",
    ].join("\n"),
  );
  expect(staticSegments(initializer(sf, "joined"))).toEqual({ segments: ["xalphay"], complete: true });
  expect(staticSegments(initializer(sf, "template"))).toEqual({ segments: ["head alpha tail"], complete: true });
  expect(staticSegments(initializer(sf, "broken"))).toEqual({ segments: ["head ", " tail"], complete: false });
  // The dynamic span sits between `a` and `b`? No — it precedes `a`; but the LEFT half is incomplete, so the
  // reader refuses to glue `a` to `b` rather than guess which pieces are adjacent.
  expect(staticSegments(initializer(sf, "edge"))).toEqual({ segments: ["a", "b"], complete: false });
  expect(staticSegments(initializer(sf, "branch"))).toEqual({ segments: ["no entry at all", '"', '", not "x"'], complete: false });
  expect(staticSegments(initializer(sf, "viaBranch"))).toEqual({
    segments: ["exports has ", "no entry at all", '"', '", not "x"', " for the key."],
    complete: false,
  });
  expect(staticText(initializer(sf, "joined"))).toBe("xalphay");
  expect(staticText(initializer(sf, "broken"))).toBeUndefined();
});

// #2040: a message composed by a CALL was text the census could not see. A same-file function or arrow whose
// body is ONE string-valued return expression is authored text and is read through; its parameters stay dynamic
// exactly like an inline span. A method, a bodyless declaration, several statements or recursion keeps
// returning the empty incomplete read the census counts as UNREADABLE, never as absence.
test("staticSegments reads one-return text functions and refuses unreadable callees", () => {
  const sf = moduleOf(
    [
      'const plain = (): string => "the entry is missing.";',
      `const withParam = (subject: string): string => \`arm A: ${OPEN}subject} is not registered.\`;`,
      "function blockForm(subject: string): string {",
      `  return \`home ${OPEN}subject} tail\`;`,
      "}",
      `const nested = (subject: string): string => \`${OPEN}withParam(subject)} Its home is gone.\`;`,
      "function twoStatements(subject: string): string {",
      "  const local = subject;",
      "  return local;",
      "}",
      "const recurse = (subject: string): string => recurse(subject);",
      "declare const helper: { text: () => string };",
      "declare function imported(): string;",
      "declare const value: string;",
      "const fromPlain = plain();",
      `const insideTemplate = \`head ${OPEN}plain()} tail\`;`,
      "const fromParam = withParam(value);",
      "const fromBlock = blockForm(value);",
      "const fromNested = nested(value);",
      "const fromTwoStatements = twoStatements(value);",
      "const fromRecurse = recurse(value);",
      "const fromMethod = helper.text();",
      "const fromImport = imported();",
      `const methodInTemplate = \`head ${OPEN}helper.text()} tail\`;`,
      "",
    ].join("\n"),
  );
  expect(staticSegments(initializer(sf, "fromPlain"))).toEqual({ segments: ["the entry is missing."], complete: true });
  expect(staticSegments(initializer(sf, "insideTemplate"))).toEqual({ segments: ["head the entry is missing. tail"], complete: true });
  expect(staticSegments(initializer(sf, "fromParam"))).toEqual({ segments: ["arm A: ", " is not registered."], complete: false });
  expect(staticSegments(initializer(sf, "fromBlock"))).toEqual({ segments: ["home ", " tail"], complete: false });
  expect(staticSegments(initializer(sf, "fromNested"))).toEqual({ segments: ["arm A: ", " is not registered.", " Its home is gone."], complete: false });
  // THE REFUSALS. Each is "I could not read this", which the census counts as an unreadable SOURCE.
  expect(staticSegments(initializer(sf, "fromTwoStatements"))).toEqual({ segments: [], complete: false });
  expect(staticSegments(initializer(sf, "fromRecurse"))).toEqual({ segments: [], complete: false });
  expect(staticSegments(initializer(sf, "fromMethod"))).toEqual({ segments: [], complete: false });
  expect(staticSegments(initializer(sf, "fromImport"))).toEqual({ segments: [], complete: false });
  // A refused call INSIDE a template still breaks the segment and leaves the certain pieces certain.
  expect(staticSegments(initializer(sf, "methodInTemplate"))).toEqual({ segments: ["head ", " tail"], complete: false });
});

test("a marker LINE names a policy; a mention mid-sentence, in a fix or in a regex does not", () => {
  expect(markerFormIdsOf("// @orb-waive no-inline-types(Foo): reason\nexport type Foo = string;\n")).toEqual(["no-inline-types"]);
  expect(markerFormIdsOf("  /* @orb-waive byte-check-cast(KV_MAX): reason */\n")).toEqual(["byte-check-cast"]);
  expect(markerFormIdsOf("{/* @orb-waive empty-state-has-action(Empty): reason */}\n")).toEqual(["empty-state-has-action"]);
  // The RESOURCE carriers' openers — the engine's `commentBody` reads a Markdown HTML comment and a SQL
  // line comment, so a resource fixture's marker-form line is spelled with them.
  expect(markerFormIdsOf("<!-- @orb-waive ledger-symbol-liveness(domain/x.ts): reason -->\n- **D1** — `domain/x.ts`\n")).toEqual(["ledger-symbol-liveness"]);
  expect(markerFormIdsOf("-- @orb-waive sql-policy(forbidden): reason\nSELECT forbidden;\n")).toEqual(["sql-policy"]);
  expect(markerFormIdsOf("waive with `@orb-waive no-inline-types(<name>): <reason>` on the line above")).toEqual([]);
  expect(markerFormIdsOf("// a comment that later says @orb-waive no-inline-types(Foo)")).toEqual([]);
  expect(mentionsWaiverOf("waive with @orb-waive no-inline-types(<name>): <reason>", "no-inline-types")).toBe(true);
  expect(mentionsWaiverOf("waive with @orb-waive no-inline-types(<name>)", "no-inline")).toBe(false);
});

const whole = (...segments: readonly string[]): StaticSegments => ({ segments, complete: true });
const partial = (...segments: readonly string[]): StaticSegments => ({ segments, complete: false });

test("discriminationOf: tautology on one source, shared across two, discriminating on exactly one, unjudged when blind", () => {
  const only = [whole("the only message")];
  expect(discriminationOf("only", only, 0)).toBe("tautology");
  const two = [whole("arm A: not registered"), whole("arm B: does not exist")];
  expect(discriminationOf("not", two, 0)).toBe("shared");
  expect(discriminationOf("does not exist", two, 0)).toBe("discriminates");
  expect(discriminationOf("does not exist", two, 1)).toBe("unjudged");
  expect(discriminationOf("absent", two, 0)).toBe("unjudged");
  // The conditional's two branches are ONE source: a substring in both branches is still one hit.
  expect(discriminationOf("n", [partial("no entry at all", '", not "x"'), whole("ok.")], 0)).toBe("discriminates");
});

// #2040 arm B: `discriminates` is a claim of ABSENCE from every other source, so a NON-HITTING source that was
// read only in part cannot support it — the piece nobody could see may carry the substring. The two verdicts
// that FIND rest on certain hits and are unmoved, which is what keeps the refusal from costing enforcement.
test("discriminationOf refuses to claim absence from a source it read only in part", () => {
  const hitting = whole("arm A: does not exist");
  expect(discriminationOf("does not exist", [hitting, whole("arm B: is missing")], 0)).toBe("discriminates");
  expect(discriminationOf("does not exist", [hitting, partial("arm B: ", " is missing")], 0)).toBe("unjudged");
  // The INCOMPLETE source is the one that hits: nothing is being claimed absent from it, so the read stands.
  expect(discriminationOf("arm A", [partial("arm A: ", " is missing"), whole("arm B: is gone")], 0)).toBe("discriminates");
  // A finding still fires on certain hits, however partial the sources are.
  expect(discriminationOf("arm", [partial("arm A: ", " x"), partial("arm B: ", " y")], 0)).toBe("shared");
  expect(discriminationOf("arm", [partial("arm A: ", " x")], 0)).toBe("tautology");
});

function callsOf(sf: SourceFile): readonly CallExpression[] {
  return sf.getDescendantsOfKind(SyntaxKind.CallExpression);
}

test("reportSiteOf recognises the sink through the context, destructuring and a const alias, and only the sink", () => {
  const sf = moduleOf(
    [
      CANONICAL_HEAD,
      "export const gate = defineGate({",
      '  message: "policy message",',
      "  create: (ctx) => {",
      "    const { report } = ctx;",
      "    const sink = ctx.report;",
      "    const other = { node: (value: unknown): unknown => value };",
      "    return {",
      "      evaluate: () => {",
      '        ctx.report.node(ctx, { message: "one" });',
      '        report.file("x", { line: 1, column: 1 });',
      "        sink.node(ctx, { message: TWO });",
      "        other.node(ctx);",
      "      },",
      "    };",
      "  },",
      "});",
      'const TWO = "two";',
      "",
    ].join("\n"),
  );
  const sites = callsOf(sf).map((call) => reportSiteOf(call));
  expect(sites.filter((site) => site !== undefined)).toEqual(["node", "file", "node"]);
  const reportCalls = callsOf(sf).filter((call) => reportSiteOf(call) !== undefined);
  expect(reportCalls.map((call) => reportSiteMessage(call))).toEqual([
    { kind: "override", texts: [{ segments: ["one"], complete: true }] },
    { kind: "policy" },
    { kind: "override", texts: [{ segments: ["two"], complete: true }] },
  ]);
});

// #2055: `staticSegments` answers with the UNION of a conditional's branches in ONE record, which is the right
// answer for one subject and the WRONG one for a message CENSUS — a site emitting `cond ? A : B` emits A or B
// and never a text carrying both, so folding them made a substring living only in A read as matching the
// module's ONLY source (TAUTOLOGY) on rows whose `messageIncludes` is their only discriminator.
test("messageAlternatives splits a conditional message into one source per branch, through templates and aliases", () => {
  const sf = moduleOf(
    [
      "declare const unreadable: boolean;",
      "declare const operation: string;",
      'const UNREADABLE = "whether this opens a socket CANNOT be established.";',
      'const MESSAGE = "this opens a socket.";',
      `const composed = \`${OPEN}unreadable ? UNREADABLE : MESSAGE} Proc: ${OPEN}operation}.\`;`,
      'const plain = "just the one text.";',
      'const nested = unreadable ? (operation === "" ? "a" : "b") : "c";',
      "",
    ].join("\n"),
  );
  // TWO sources, one per branch — each carrying the certain pieces of THAT branch and nothing from the other.
  expect(messageAlternatives(initializer(sf, "composed"))).toEqual([
    { segments: ["whether this opens a socket CANNOT be established. Proc: ", "."], complete: false },
    { segments: ["this opens a socket. Proc: ", "."], complete: false },
  ]);
  // The UNION read is still what `staticSegments` answers — one record holding both branches' text, which is
  // exactly the fold that made the census lie.
  expect(staticSegments(initializer(sf, "composed")).segments).toEqual([
    "whether this opens a socket CANNOT be established.",
    "this opens a socket.",
    " Proc: ",
    ".",
  ]);
  // A message with no conditional is ONE alternative, identical to the single read — no behaviour moved.
  expect(messageAlternatives(initializer(sf, "plain"))).toEqual([{ segments: ["just the one text."], complete: true }]);
  expect(messageAlternatives(initializer(sf, "nested"))).toEqual([
    { segments: ["a"], complete: true },
    { segments: ["b"], complete: true },
    { segments: ["c"], complete: true },
  ]);
});

test("reportSiteMessage refuses details it cannot read whole", () => {
  const sf = moduleOf(
    `${CANONICAL_HEAD}export const gate = defineGate({\n  create: (ctx) => ({ evaluate: () => { ctx.report.node(ctx, details()); ctx.report.node(ctx, { ...spread }); } }),\n});\ndeclare function details(): { message: string };\ndeclare const spread: { message: string };\n`,
  );
  const reportCalls = callsOf(sf).filter((call) => reportSiteOf(call) !== undefined);
  expect(reportCalls.map((call) => reportSiteMessage(call))).toEqual([{ kind: "unreadable" }, { kind: "unreadable" }]);
});

test("proofRowsOf resolves literal rows, spreads of const arrays and aliases, and names what it cannot read", () => {
  const sf = moduleOf(
    [
      CANONICAL_HEAD,
      'const SHARED = [{ mode: "source", why: "shared" }];',
      'const ONE = { mode: "source", why: "one" };',
      "export const gate = defineGate({",
      '  mustFlag: [{ mode: "source", why: "inline" }, ...SHARED, ONE, rows()],',
      "});",
      "declare function rows(): unknown;",
      "",
    ].join("\n"),
  );
  const descriptor = finalDescriptorOf(sf);
  const read = proofRowsOf(descriptor === undefined ? undefined : descriptorValue(descriptor, "mustFlag"));
  expect(read.rows.map((row) => staticText(descriptorValue(row, "why")))).toEqual(["inline", "shared", "one"]);
  expect(read.unreadable.map((node) => node.getText())).toEqual(["rows()"]);
});

test("enclosingStringExpression climbs to the whole composed string a literal belongs to", () => {
  const sf = moduleOf(`const A = "a";\nconst composed = ("x" + A) + \`y${OPEN}A}z\`;\n`);
  const literals = sf.getDescendantsOfKind(SyntaxKind.StringLiteral).filter((node) => node.getLiteralText() === "x");
  expect(literals).toHaveLength(1);
  const top = enclosingStringExpression(literals[0] as Node);
  expect(top).toBe(initializer(sf, "composed"));
  expect(staticSegments(top)).toEqual({ segments: ["xayaz"], complete: true });
});

test("contextParameterOf and isContextRooted see the context through members, destructuring and aliases", () => {
  const sf = moduleOf(
    [
      CANONICAL_HEAD,
      "declare function helper(...args: unknown[]): void;",
      "export const gate = defineGate({",
      "  create: (ctx) => {",
      "    const { report } = ctx;",
      "    const sink = ctx.report;",
      "    const unrelated = { report: 1 };",
      "    return { evaluate: () => { helper(ctx); helper(ctx.report.node); helper(report); helper(sink); helper(unrelated.report); } };",
      "  },",
      "});",
      "",
    ].join("\n"),
  );
  const descriptor = finalDescriptorOf(sf);
  expect(descriptor).toBeDefined();
  const symbol = descriptor === undefined ? undefined : contextParameterOf(descriptor);
  expect(symbol).toBeDefined();
  const helperCalls = callsOf(sf).filter((call) => call.getExpression().getText() === "helper");
  const rooted = helperCalls.map((call) => (symbol === undefined ? undefined : isContextRooted(call.getArguments()[0] as Node, symbol)));
  expect(rooted).toEqual([true, true, true, true, false]);
});

test("policyIdOfPath strips exactly the corpus directory and the extension, and refuses anything else", () => {
  expect(policyIdOfPath("tooling/src/verify/gates/no-inline-types.ts")).toBe("no-inline-types");
  expect(() => policyIdOfPath("tooling/src/verify/lib/no-inline-types.ts")).toThrow("not a gate corpus path");
});

test("declaration arrays distinguish absent, empty, opaque elements and unreadable present properties", () => {
  const source = moduleOf(`${CANONICAL_HEAD} const EMPTY = []; const INPUTS = [provider()]; export const gate = defineGate({
    facts: EMPTY, resources: INPUTS, get mustRefuse() { return []; }
  });`);
  const descriptor = finalDescriptorOf(source);
  if (descriptor === undefined) {
    throw new Error("fixture must register");
  }
  const values = descriptorArrayPresence([descriptor], ["facts", "resources", "mustRefuse", "missing"]).get(descriptor);
  expect(values?.get("facts")).toMatchObject({ kind: "resolved", value: "empty" });
  const resources = values?.get("resources");
  expect(resources?.kind).toBe("resolved");
  expect(resources).toMatchObject({ kind: "resolved", value: "nonempty" });
  expect(values?.get("mustRefuse")).toMatchObject({ kind: "unresolved", reason: "unsupported" });
  expect(values?.get("missing")).toBeUndefined();
});

test("array-use endpoints require canonical descriptors, never same-named properties or local defineGate lookalikes", () => {
  const project = projectOf({
    "tooling/src/verify/lib/shared.ts": "export const VALUES = [];",
    "tooling/src/verify/gates/probe.ts": `${CANONICAL_HEAD} import { VALUES } from "../lib/shared.ts"; export const gate = defineGate({ facts: VALUES });`,
    "tooling/src/verify/gates/other.ts":
      'import { VALUES } from "../lib/shared.ts"; function defineGate(value) { return value; } export const gate = defineGate({ facts: VALUES });',
  });
  const source = project.getSourceFileOrThrow("/repo/tooling/src/verify/gates/probe.ts");
  const descriptor = finalDescriptorOf(source);
  const other = project.getSourceFileOrThrow("/repo/tooling/src/verify/gates/other.ts");
  const lookalike = other.getFirstDescendantByKindOrThrow(SyntaxKind.ObjectLiteralExpression);
  if (descriptor === undefined) {
    throw new Error("fixture must register");
  }
  const values = descriptorArrayPresence([descriptor, lookalike], ["facts"]);
  expect(values.has(lookalike)).toBe(false);
  expect(values.get(descriptor)?.get("facts")).toMatchObject({ kind: "unresolved", reason: "dynamic" });
  other.replaceWithText(`${CANONICAL_HEAD} import { VALUES } from "../lib/shared.ts"; export const gate = defineGate({ facts: VALUES });`);
  const sibling = finalDescriptorOf(other);
  if (sibling === undefined) {
    throw new Error("sibling must register");
  }
  expect(descriptorArrayPresence([descriptor, sibling], ["facts"]).get(descriptor)?.get("facts")).toMatchObject({ kind: "resolved", value: "empty" });
});

test("descriptor property anchors retain shorthand values without accepting methods or accessors", () => {
  const sf = moduleOf('const family = "twin"; const fields = { family, count: 1, method() {}, get computed() { return 1; } };');
  const object = sf.getVariableDeclarationOrThrow("fields").getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
  expect(descriptorProperty(object, "family")?.getKind()).toBe(SyntaxKind.ShorthandPropertyAssignment);
  expect(staticText(descriptorValue(object, "family"))).toBe("twin");
  expect(descriptorProperty(object, "count")?.getKind()).toBe(SyntaxKind.PropertyAssignment);
  expect(descriptorProperty(object, "missing")).toBeUndefined();
  expect(descriptorProperty(object, "method")).toBeUndefined();
  expect(descriptorProperty(object, "computed")).toBeUndefined();
});

test("static text calls share callable identity across imported and local aliases", () => {
  const project = projectOf({
    "tooling/src/verify/lib/text.ts": 'export const text = (): string => "shared text";\n',
    "tooling/src/verify/gates/probe.ts": 'import { text as imported } from "../lib/text.ts";\nconst alias = imported;\nconst result = alias();\n',
  });
  const sf = project.getSourceFileOrThrow("/repo/tooling/src/verify/gates/probe.ts");
  expect(staticText(initializer(sf, "result"))).toBe("shared text");
});

test("static text never certifies the body of a mutable or reassigned callable", () => {
  const project = projectOf({
    "tooling/src/verify/lib/text.ts": 'export let imported = (): string => "before";\n',
    "tooling/src/verify/gates/probe.ts":
      'import { imported } from "../lib/text.ts";\nlet local = (): string => "before";\nfunction written(): string { return "before"; }\nwritten = (): string => "after";\nconst a = local();\nconst b = written();\nconst c = imported();\n',
  });
  const sf = project.getSourceFileOrThrow("/repo/tooling/src/verify/gates/probe.ts");
  expect(["a", "b", "c"].map((name) => staticSegments(initializer(sf, name)))).toEqual([
    { segments: [], complete: false },
    { segments: [], complete: false },
    { segments: [], complete: false },
  ]);
});

function productionDependencies(project: Project): ReadonlySet<Node> {
  const descriptor = finalDescriptorOf(project.getSourceFileOrThrow("/repo/tooling/src/verify/gates/probe.ts"));
  if (descriptor === undefined) {
    throw new Error("production dependency fixture must register a final descriptor");
  }
  return policyProductionDependencies([descriptor]).get(descriptor) ?? new Set();
}

test("production dependencies follow canonical aliases, namespace re-exports, wrappers and recursion to a fixpoint", () => {
  const project = projectOf({
    "tooling/src/verify/lib/reader.ts": "export function reader() { return 1; } export function other() { return 2; }",
    "tooling/src/verify/lib/barrel.ts": 'export { reader as renamed } from "./reader.ts";',
    "tooling/src/verify/lib/wrapper.ts":
      'import * as shared from "./barrel.ts"; export function first() { return second(); } function second() { return shared.renamed() + first(); }',
    "tooling/src/verify/gates/probe.ts": `${CANONICAL_HEAD}import { first } from "../lib/wrapper.ts"; const alias = first; export const gate = defineGate({ create: () => ({ evaluate: () => alias() }) });`,
  });
  const dependencies = productionDependencies(project);
  const reader = project.getSourceFileOrThrow("/repo/tooling/src/verify/lib/reader.ts");
  expect(dependencies.has(reader.getFunctionOrThrow("reader"))).toBe(true);
  expect(dependencies.has(reader.getFunctionOrThrow("other"))).toBe(false);
});

test("production dependencies retain canonical subject data through stable derived values", () => {
  const project = projectOf({
    "tooling/src/verify/lib/subject.ts": 'export const SUBJECTS = ["one", "two"] as const; export const UNUSED = "elsewhere";',
    "tooling/src/verify/lib/derived.ts": 'import { SUBJECTS as source } from "./subject.ts"; export const selected = source.map(value => value.length);',
    "tooling/src/verify/gates/probe.ts": `${CANONICAL_HEAD}import { selected } from "../lib/derived.ts"; const local = { selected }; export const gate = defineGate({ create: () => ({ evaluate: () => local.selected }) });`,
  });
  const dependencies = productionDependencies(project);
  const subject = project.getSourceFileOrThrow("/repo/tooling/src/verify/lib/subject.ts");
  expect(dependencies.has(subject.getVariableDeclarationOrThrow("SUBJECTS"))).toBe(true);
  expect(dependencies.has(subject.getVariableDeclarationOrThrow("UNUSED"))).toBe(false);
});

test("production roots exclude unused imports, proof builders, erased types and unreferenced local functions", () => {
  const project = projectOf({
    "tooling/src/verify/lib/reader.ts": "export function reader() { return 1; }",
    "tooling/src/verify/gates/probe.ts": `${CANONICAL_HEAD}import { reader } from "../lib/reader.ts";
      const proof = reader();
      export const gate = defineGate({ mustFlag: [proof], create: () => {
        type Reader = typeof reader;
        const unused = () => reader();
        function alsoUnused() { return reader(); }
        return { evaluate: () => ({ reader: 1 } as { reader: typeof reader }) };
      } });`,
  });
  expect(productionDependencies(project).has(project.getSourceFileOrThrow("/repo/tooling/src/verify/lib/reader.ts").getFunctionOrThrow("reader"))).toBe(false);
});

test("mutable or reassigned imported declarations cannot supply canonical production dependencies", () => {
  const project = projectOf({
    "tooling/src/verify/lib/reader.ts": "export let reader = () => 1; export function written() { return 2; } written = () => 3; export let SUBJECT = 'one';",
    "tooling/src/verify/gates/probe.ts": `${CANONICAL_HEAD}import { reader, written, SUBJECT } from "../lib/reader.ts"; export const gate = defineGate({ create: () => ({ evaluate: () => [reader(), written(), SUBJECT] }) });`,
  });
  const dependencies = productionDependencies(project);
  const reader = project.getSourceFileOrThrow("/repo/tooling/src/verify/lib/reader.ts");
  expect([...dependencies].filter((node) => node.getSourceFile() === reader)).toEqual([]);
});

test("a shadowed parameter does not acquire the imported reader's identity", () => {
  const project = projectOf({
    "tooling/src/verify/lib/reader.ts": "export function reader() { return 1; }",
    "tooling/src/verify/gates/probe.ts": `${CANONICAL_HEAD}import { reader } from "../lib/reader.ts"; export const gate = defineGate({ create: () => ({ evaluate: (reader: () => number) => reader() }) });`,
  });
  expect(productionDependencies(project).has(project.getSourceFileOrThrow("/repo/tooling/src/verify/lib/reader.ts").getFunctionOrThrow("reader"))).toBe(false);
});

test("an imported create function and its parameter defaults are production dependencies", () => {
  const project = projectOf({
    "tooling/src/verify/lib/reader.ts": "export const SUBJECT = 1; export const create = (context, value = SUBJECT) => ({ evaluate: () => value });",
    "tooling/src/verify/gates/probe.ts": `${CANONICAL_HEAD}import { create } from "../lib/reader.ts"; export const gate = defineGate({ create });`,
  });
  const dependencies = productionDependencies(project);
  const reader = project.getSourceFileOrThrow("/repo/tooling/src/verify/lib/reader.ts");
  expect(dependencies.has(initializer(reader, "create"))).toBe(true);
  expect(dependencies.has(reader.getVariableDeclarationOrThrow("SUBJECT"))).toBe(true);
});

test("method-form create roots reach shared readers without turning ordinary methods into descriptor values", () => {
  const project = projectOf({
    "tooling/src/verify/lib/reader.ts": "export function reader() { return 1; }",
    "tooling/src/verify/gates/probe.ts": `${CANONICAL_HEAD}import { reader } from "../lib/reader.ts"; export const gate = defineGate({ create() { return { evaluate: () => reader() }; } });`,
  });
  const source = project.getSourceFileOrThrow("/repo/tooling/src/verify/gates/probe.ts");
  const descriptor = finalDescriptorOf(source);
  expect(descriptor?.getProperty("create")?.getKind()).toBe(SyntaxKind.MethodDeclaration);
  expect(descriptor === undefined ? undefined : descriptorValue(descriptor, "create")).toBeUndefined();
  expect(productionDependencies(project).has(project.getSourceFileOrThrow("/repo/tooling/src/verify/lib/reader.ts").getFunctionOrThrow("reader"))).toBe(true);
});

test("a fresh production census reads overwritten helper source instead of a cached dependency", () => {
  const project = projectOf({
    "tooling/src/verify/lib/subject.ts": "export const FIRST = 1; export const SECOND = 2;",
    "tooling/src/verify/lib/reader.ts": 'import { FIRST } from "./subject.ts"; export function reader() { return FIRST; }',
    "tooling/src/verify/gates/probe.ts": `${CANONICAL_HEAD}import { reader } from "../lib/reader.ts"; export const gate = defineGate({ create: () => ({ evaluate: () => reader() }) });`,
  });
  const subject = project.getSourceFileOrThrow("/repo/tooling/src/verify/lib/subject.ts");
  expect(productionDependencies(project).has(subject.getVariableDeclarationOrThrow("FIRST"))).toBe(true);
  project
    .getSourceFileOrThrow("/repo/tooling/src/verify/lib/reader.ts")
    .replaceWithText('import { SECOND } from "./subject.ts"; export function reader() { return SECOND; }');
  const dependencies = productionDependencies(project);
  expect(dependencies.has(subject.getVariableDeclarationOrThrow("FIRST"))).toBe(false);
  expect(dependencies.has(subject.getVariableDeclarationOrThrow("SECOND"))).toBe(true);
});
