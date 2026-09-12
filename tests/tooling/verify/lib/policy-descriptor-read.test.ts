// The `policy-soundness` family's shared reader, judged on the shapes that made the brief's greps lie: a
// same-named local `defineGate`, a message assembled from const aliases and concatenation, a template with a
// dynamic span, a conditional with two possible texts, a marker MENTION that is not a marker LINE, and a report
// sink reached through destructuring or a const alias. Every direction has its control.
import type { CallExpression, Node, SourceFile } from "ts-morph";
import { Project, SyntaxKind } from "ts-morph";
import {
  contextParameterOf,
  descriptorValue,
  discriminationOf,
  enclosingStringExpression,
  finalDescriptorOf,
  isContextRooted,
  markerFormIdsOf,
  mentionsWaiverOf,
  policyIdOfPath,
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

test("a marker LINE names a policy; a mention mid-sentence, in a fix or in a regex does not", () => {
  expect(markerFormIdsOf("// @orb-waive no-inline-types(Foo): reason\nexport type Foo = string;\n")).toEqual(["no-inline-types"]);
  expect(markerFormIdsOf("  /* @orb-waive byte-check-cast(KV_MAX): reason */\n")).toEqual(["byte-check-cast"]);
  expect(markerFormIdsOf("{/* @orb-waive empty-state-has-action(Empty): reason */}\n")).toEqual(["empty-state-has-action"]);
  expect(markerFormIdsOf("waive with `@orb-waive no-inline-types(<name>): <reason>` on the line above")).toEqual([]);
  expect(markerFormIdsOf("// a comment that later says @orb-waive no-inline-types(Foo)")).toEqual([]);
  expect(mentionsWaiverOf("waive with @orb-waive no-inline-types(<name>): <reason>", "no-inline-types")).toBe(true);
  expect(mentionsWaiverOf("waive with @orb-waive no-inline-types(<name>)", "no-inline")).toBe(false);
});

test("discriminationOf: tautology on one source, shared across two, discriminating on exactly one, unjudged when blind", () => {
  const only = [["the only message"]];
  expect(discriminationOf("only", only, 0)).toBe("tautology");
  const two = [["arm A: not registered"], ["arm B: does not exist"]];
  expect(discriminationOf("not", two, 0)).toBe("shared");
  expect(discriminationOf("does not exist", two, 0)).toBe("discriminates");
  expect(discriminationOf("does not exist", two, 1)).toBe("unjudged");
  expect(discriminationOf("absent", two, 0)).toBe("unjudged");
  // The conditional's two branches are ONE source: a substring in both branches is still one hit.
  expect(discriminationOf("n", [["no entry at all", '", not "x"'], ["ok."]], 0)).toBe("discriminates");
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
    { kind: "override", text: { segments: ["one"], complete: true } },
    { kind: "policy" },
    { kind: "override", text: { segments: ["two"], complete: true } },
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
