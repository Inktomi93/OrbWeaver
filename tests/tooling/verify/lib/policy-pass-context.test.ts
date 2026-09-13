// THE #2250 PIN — the fact-widening REMEDY names the door the author actually called.
//
// #1976 built the consumer-side diagnosis: a shared `defineFact` provider's population is the UNION of its
// consumers', so a policy handed a declaration from a file its OWN population excludes gets a refusal, and
// since `f96f45fb4` that refusal DIAGNOSES — it names the admitting fact and points at `declarationHome`.
// cb-v-wave-6 then drove all three doors and found the closing clause hard-coded to *"never with
// ctx.relativePath"* and appended VERBATIM by the `sourceFile` and `report.file` twins, so a policy that
// called `ctx.sourceFile(path)` was told not to use a function it never called. §5b criterion 2 applied to a
// remedy: the sentence an author ACTS on has to be true of what they did.
//
// RED-FIRST, run against the unmodified `lib/policy-pass-context.ts` (`git show HEAD:` restored in place,
// then `cp` back): the two door rows below FAILED — both `sourceFile` and `report.file` produced
// `… never with ctx.relativePath.` — while the `relativePath` row and the three no-diagnosis controls
// passed. That asymmetry is the whole defect and it is why the controls ride in the same file: a fix that
// simply DELETED the clause would also turn those two rows green while destroying the remedy.
import { Project } from "ts-morph";
import { defineFact } from "../../../../tooling/src/verify/contract/fact.ts";
import type { RawGateFinding } from "../../../../tooling/src/verify/contract/gate-authority.ts";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { defineGate } from "../../../../tooling/src/verify/contract/policy.ts";
import type { PolicyFactValueRegistry } from "../../../../tooling/src/verify/contract/policy-pass.ts";
import type { ResourceHost } from "../../../../tooling/src/verify/contract/resource-host.ts";
import { makePolicyContext } from "../../../../tooling/src/verify/lib/policy-pass-context.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const NARROW = "packages/client/src/narrow.ts";
const WIDE = "packages/server/src/wide.ts";
const FOREIGN = "packages/kit/src/foreign.ts";
const FACT_ID = "x-shared-index";

/** A provider spanning client+server, consumed by a policy that declares client alone — the #1976 shape. */
const sharedIndex = defineFact({
  id: FACT_ID,
  population: { in: ["@client", "@server"] },
  analysis: "syntax",
  resources: [],
  create: (ctx) => ({
    finish: () => {
      ctx.receipt({ kind: "population", source: FACT_ID, members: 1 });
      return 1;
    },
  }),
});

const consumer: GatePolicy = defineGate({
  id: "x-fact-consumer",
  family: "x-fact-consumer",
  authority: "hard",
  severity: "error",
  population: "@client",
  analysis: "syntax",
  execution: "entire-population",
  facts: [sharedIndex],
  resources: [],
  message: "m",
  create: () => ({ evaluate: () => undefined }),
  mustFlag: [{ mode: "source", files: { [NARROW]: "export const a = 1;\n" }, why: "w" }],
  mustPass: [{ mode: "source", files: { [NARROW]: "export const a = 1;\n" }, why: "w" }],
});

/** One context over a project holding ONLY the narrow file — exactly what the pass delivers a `@client`
 *  policy — so every ask about the wide or the foreign path takes the out-of-population arm. */
function context(): { readonly ctx: ReturnType<typeof makePolicyContext>["context"]; readonly project: Project } {
  const project = new Project({ useInMemoryFileSystem: true });
  const narrow = project.createSourceFile(`/root/${NARROW}`, "export const a = 1;\n");
  const paths = new Map<object, string>([[narrow.compilerNode, NARROW]]);
  const findings: RawGateFinding[] = [];
  const factValues: PolicyFactValueRegistry = new Map([[sharedIndex, { status: "ready", value: 1 }]]);
  const runtime = makePolicyContext({
    policy: consumer,
    paths,
    files: [narrow],
    resourcePaths: [],
    resources: {} as ResourceHost,
    resourceRequests: [],
    checker: () => project.getTypeChecker(),
    findings,
    factValues,
  });
  return { ctx: runtime.context, project };
}

function refusal(call: () => unknown): string {
  try {
    call();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("the door did not refuse — the fixture no longer reaches the out-of-population arm");
}

test("ctx.sourceFile's fact-widening remedy names ctx.sourceFile, not a function the author never called", () => {
  const { ctx } = context();
  const message = refusal(() => ctx.sourceFile(WIDE));
  expect(message, "the measured prefix is unchanged — warning-code-coverage quotes it").toContain(
    "sourceFile path is absent or outside the effective population",
  );
  expect(message, "the diagnosis still names the admitting fact").toContain(FACT_ID);
  expect(message, "the remedy names the door that threw").toContain("never with ctx.sourceFile.");
  expect(message, "and does not name a door this author never opened").not.toContain("ctx.relativePath");
});

test("ctx.report.file's fact-widening remedy names ctx.report.file", () => {
  const { ctx } = context();
  const message = refusal(() => {
    ctx.report.file(WIDE, { line: 1, column: 0 });
  });
  expect(message).toContain("finding file is outside the effective population");
  expect(message).toContain(FACT_ID);
  expect(message, "the remedy names the door that threw").toContain("never with ctx.report.file.");
  expect(message).not.toContain("ctx.relativePath");
});

test("ctx.relativePath keeps the #1976 wording byte-for-byte — the arm that already named its own door", () => {
  const { ctx, project } = context();
  const wide = project.createSourceFile(`/root/${WIDE}`, "export const b = 2;\n");
  const message = refusal(() => ctx.relativePath(wide));
  expect(message).toContain("source file is outside the effective population");
  expect(message).toContain(
    `it IS inside the population of this policy's declared fact ${FACT_ID}, which is wider than the policy's own. ` +
      "A declaration reached through a shared provider is named with `declarationHome(ctx, file)` (lib/declaration-home.ts), never with ctx.relativePath.",
  );
});

// THE CONTROLS. Without these a fix that deleted the remedy clause outright would turn the two door rows
// green while destroying the thing #1976 built: the diagnosis is CONDITIONAL on a declared fact admitting
// the path, and a bare refusal is the correct answer for a path no fact admits.
test("a path NO declared fact admits refuses BARE on every door — the diagnosis is not a blanket suffix", () => {
  const { ctx, project } = context();
  const foreign = project.createSourceFile(`/root/${FOREIGN}`, "export const c = 3;\n");
  for (const [label, call] of [
    ["sourceFile", (): unknown => ctx.sourceFile(FOREIGN)],
    [
      "report.file",
      (): void => {
        ctx.report.file(FOREIGN, { line: 1, column: 0 });
      },
    ],
    ["relativePath", (): unknown => ctx.relativePath(foreign)],
  ] as const) {
    const message = refusal(call);
    expect(message, `${label} names the path`).toContain(FOREIGN);
    expect(message, `${label} carries no fact diagnosis`).not.toContain(FACT_ID);
    expect(message, `${label} carries no remedy`).not.toContain("declarationHome");
  }
});
