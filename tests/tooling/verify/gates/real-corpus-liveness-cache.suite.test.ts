import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { defineFact, defineGate, reviewedGrantsFor } from "@orb/tooling/verify";
import { readyResourceValue } from "../../../../tooling/src/verify/lib/resource-declaration.ts";
import type { RealCorpusLivenessArm, RealCorpusOverlay } from "../../../support/real-corpus-liveness.ts";
import { openRealCorpusLiveness } from "../../../support/real-corpus-liveness.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const IMPORTER = "packages/kit/src/importer.ts";
const EXPORTER = "packages/kit/src/exporter.ts";
const GLOBALS = "packages/kit/src/globals.d.ts";
const BASE = {
  [IMPORTER]: 'import { exported } from "./exporter"; export const value = exported; export const globalValue = ambient;\n',
  [EXPORTER]: 'export const exported = "baseline" as const;\n',
  [GLOBALS]: 'declare const ambient: "baseline-global";\n',
  "package.json": '{"name":"baseline-resource"}',
};

function countingArm(onPass: () => void, reportBaseline = false): RealCorpusLivenessArm {
  const message = "planted source change";
  const policy = defineGate({
    id: "retained-failure-control",
    family: "retained-failure-control",
    authority: "hard",
    severity: "error",
    population: "@kit",
    analysis: "syntax",
    execution: "selected-files",
    facts: [],
    resources: [],
    message,
    create: (ctx) => {
      onPass();
      return {
        visitFile: (file) => {
          if (reportBaseline || file.getFullText().includes("42")) {
            ctx.report.file(ctx.relativePath(file), { line: 1, message });
          }
        },
      };
    },
    mustFlag: [{ mode: "source", files: { [EXPORTER]: "export const exported = 42;" }, why: "changed source" }],
    mustPass: [{ mode: "source", files: { [EXPORTER]: BASE[EXPORTER] }, why: "unchanged source" }],
  });
  return { policy, overlays: [{ kind: "neutralise", path: EXPORTER, source: "export const exported = 42;" }], messageIncludes: message };
}

function failureOf(operation: () => void): Error {
  try {
    operation();
  } catch (error) {
    if (error instanceof Error) {
      return error;
    }
    throw error;
  }
  throw new Error("the controlled operation did not fail");
}

test("a failed shared proof retains its original error without replaying a successful prefix or returning partial verdicts", ({ plantedTree }) =>
  plantedTree(BASE).then((root) => {
    let passes = 0;
    const live = countingArm(() => {
      passes += 1;
    });
    const broken = {
      ...live,
      policy: defineGate({ ...live.policy, id: "broken-intervention" }),
      overlays: [{ kind: "resource", path: "package.json", replace: ["absent anchor", "replacement"] }],
    } satisfies RealCorpusLivenessArm;
    const runner = openRealCorpusLiveness(root, [live, broken]);
    const progress: string[] = [];
    const first = failureOf(() => runner.proveAll(({ arms }) => progress.push(...arms)));
    expect(first.message).toContain("matched 0 times");
    expect(passes).toBe(1);
    expect(progress).toEqual([live.policy.id]);
    expect(failureOf(() => runner.proveAll())).toBe(first);
    expect(failureOf(() => runner.verdict(live))).toBe(first);
    expect(passes).toBe(1);
    expect(runner.proveBatch([live]).get(live.policy.id)?.messages).toEqual([live.messageIncludes]);
    expect(passes).toBe(2);
  }));

test("a failed progress assertion is retained even when the intervention itself completed", async ({ plantedTree }) => {
  const root = await plantedTree(BASE);
  let passes = 0;
  const arm = countingArm(() => {
    passes += 1;
  });
  const runner = openRealCorpusLiveness(root, [arm]);
  const primary = new Error("progress assertion failed");
  expect(
    failureOf(() =>
      runner.proveAll(() => {
        throw primary;
      }),
    ),
  ).toBe(primary);
  expect(failureOf(() => runner.proveAll())).toBe(primary);
  expect(passes).toBe(1);
  expect(runner.proveBatch([arm]).get(arm.policy.id)?.messages).toEqual([arm.messageIncludes]);
  expect(passes).toBe(2);
});

test("a failed baseline retains its original finding without repeating native analysis or blocking independent restored controls", async ({ plantedTree }) => {
  const root = await plantedTree({ [EXPORTER]: BASE[EXPORTER] });
  let passes = 0;
  const arm = countingArm(() => {
    passes += 1;
  }, true);
  const runner = openRealCorpusLiveness(root, [arm]);
  const first = failureOf(() => runner.assertBaseline());
  expect(first.message).toContain("already report in their arm's scope before any overlay");
  expect(failureOf(() => runner.assertBaseline())).toBe(first);
  expect(passes).toBe(1);
  expect(runner.proveBatch([arm]).get(arm.policy.id)?.messages).toEqual([arm.messageIncludes]);
  expect(passes).toBe(2);
});

test("liveness cached passes preserve fresh solo facts, resources, populations, refusals and grants", { tags: ["slow"] }, ({ scratch }) => {
  for (const [path, text] of Object.entries(BASE)) {
    mkdirSync(dirname(join(scratch, path)), { recursive: true });
    writeFileSync(join(scratch, path), text);
  }
  const populations: string[][] = [];
  const fact = defineFact({
    id: "cache-equivalence-fact",
    population: "@kit",
    analysis: "types",
    resources: [],
    create: (ctx) => ({
      finish: () => {
        const source = ctx.sourceFile(IMPORTER);
        const value = source.getVariableDeclarationOrThrow("value").getType().getText();
        const global = source.getVariableDeclarationOrThrow("globalValue").getType().getText();
        const references = ctx
          .sourceFile(EXPORTER)
          .getVariableDeclarationOrThrow("exported")
          .findReferencesAsNodes()
          .map((node) => `${ctx.relativePath(node.getSourceFile())}:${String(node.getStart())}`)
          .toSorted();
        ctx.receipt({ kind: "population", source: "cache-equivalence-fact", members: ctx.files.length });
        return { value, global, references };
      },
    }),
  });
  const grantId = "tooling-project-home";
  const [grant] = reviewedGrantsFor([{ id: grantId }]);
  if (grant === undefined) {
    throw new Error("the reviewed-grant control requires a real central grant");
  }
  const policy = defineGate({
    id: "cache-equivalence",
    family: "cache-equivalence",
    authority: "hard",
    severity: "error",
    population: "@kit",
    analysis: "resource",
    execution: "entire-population",
    facts: [fact],
    resources: [{ kind: "package-metadata", id: "root" }],
    message: "changed inputs",
    create: (ctx) => ({
      evaluate: () => {
        const value = ctx.fact(fact);
        const resource = readyResourceValue(ctx.resources.packageMetadata("root"));
        const paths = ctx.files.map((file) => ctx.relativePath(file)).toSorted();
        populations.push(paths);
        ctx.receipt({ kind: "population", source: "cache-equivalence", members: 1 });
        if (value.value !== '"baseline"' || value.global !== '"baseline-global"' || value.references.length !== 2 || resource.name !== "baseline-resource") {
          ctx.report.file(IMPORTER, { line: 1, message: JSON.stringify({ ...value, resource: resource.name, paths }) });
        }
      },
    }),
    mustFlag: [{ mode: "resource", files: { [IMPORTER]: "export const value = 42;" }, why: "changed source input" }],
    mustPass: [{ mode: "resource", files: BASE, why: "unchanged input" }],
  });
  const granted = defineGate({
    ...policy,
    id: grantId,
    authority: "reviewed-grant",
    analysis: "types",
    resources: [],
    mustFlag: [{ mode: "types", files: { [IMPORTER]: BASE[IMPORTER] }, grant: { subject: grant.subject, operation: grant.operation }, why: "grant control" }],
    mustPass: [{ mode: "types", files: { [IMPORTER]: BASE[IMPORTER] }, why: "unchanged input" }],
    create: (ctx) => ({
      evaluate: () => {
        const value = ctx.fact(fact);
        ctx.receipt({ kind: "population", source: grantId, members: 1 });
        if (value.value !== '"baseline"') {
          ctx.report.file(IMPORTER, { line: 1, subject: grant.subject, operation: grant.operation, message: value.value });
        }
      },
    }),
  });
  const overlay: RealCorpusOverlay = { kind: "neutralise", path: EXPORTER, source: "export const exported = 42 as const;\n" };
  const arm: RealCorpusLivenessArm = { policy, overlays: [overlay], reportsAt: [IMPORTER], messageIncludes: "42" };
  const grantArm: RealCorpusLivenessArm = { ...arm, policy: granted, granted: true };
  const shared = openRealCorpusLiveness(scratch, [arm, grantArm]);
  expect(shared.assertBaseline().toSorted()).toEqual([policy.id, granted.id].toSorted());
  const incompleteKnownRoster = openRealCorpusLiveness(scratch, [arm], [grantArm]);
  expect(() => incompleteKnownRoster.proveBatch([arm])).toThrow("selected policy is absent from the known roster");
  const interventions: readonly (readonly [RealCorpusOverlay, ...RealCorpusOverlay[]])[] = [
    [overlay],
    [{ kind: "neutralise", path: GLOBALS, source: "declare const ambient: 77;\n" }],
    [{ kind: "remove", path: EXPORTER }],
    [
      {
        kind: "neutralise",
        path: IMPORTER,
        source: 'import { exported } from "./missing"; export const value = exported; export const globalValue = ambient;\n',
      },
    ],
    [
      {
        kind: "neutralise",
        path: IMPORTER,
        source: 'import { exported } from "./missing"; export const value = exported; export const globalValue = ambient;\n',
      },
      { kind: "add", path: "packages/kit/src/missing.ts", source: 'export const exported = "recovered" as const;\n' },
    ],
    [{ kind: "resource", path: "package.json", source: '{"name":"changed-resource"}' }],
    [{ kind: "resource", path: "package.json", source: "{" }],
    [{ kind: "neutralise", path: IMPORTER, source: 'export const value = "no-import" as const; export const globalValue = ambient;\n' }],
    [overlay, { kind: "edit", path: EXPORTER, replace: ["42", "99"] }],
  ];
  const observed: ReturnType<typeof shared.proveBatch>[] = [];
  for (const overlays of interventions) {
    const controls = [
      { ...arm, overlays },
      { ...grantArm, overlays },
    ];
    const actual = shared.proveBatch(controls);
    const population = populations.at(-1);
    const fresh = openRealCorpusLiveness(scratch, controls).proveBatch(controls);
    expect(actual).toEqual(fresh);
    expect(population).toEqual(populations.at(-1));
    const partitioned = new Map(controls.flatMap((control) => [...openRealCorpusLiveness(scratch, [control], controls).proveBatch([control])]));
    for (const control of controls) {
      const complete = actual.get(control.policy.id);
      expect(complete).toBeDefined();
      expect(partitioned.get(control.policy.id)).toEqual({ ...complete, batch: [control.policy.id] });
    }
    observed.push(actual);
    expect(shared.assertBaseline().toSorted()).toEqual([policy.id, granted.id].toSorted());
  }
  expect(observed[0]?.get(granted.id)?.messages).toEqual(["42"]);
  expect(observed[0]?.get(policy.id)?.messages.join()).toContain('"value":"42"');
  expect(observed[4]?.get(policy.id)?.messages.join()).toContain("recovered");
  expect(observed[5]?.get(policy.id)?.messages.join()).toContain("changed-resource");
  expect(observed[6]?.get(policy.id)?.refusals.join()).toContain("package");
  expect(observed[8]?.get(granted.id)?.messages).toEqual(["99"]);
  const progress: string[] = [];
  const prove = (): ReturnType<typeof shared.proveAll> =>
    shared.proveAll(
      ({ arms }) => progress.push(`completed:${arms.join(",")}`),
      (_index, ids) => progress.push(`started:${ids.join(",")}`),
    );
  const completed = prove();
  expect(progress).toEqual([`started:${policy.id},${granted.id}`, `completed:${policy.id},${granted.id}`]);
  expect(prove()).toBe(completed);
  expect(progress).toHaveLength(2);
  const missing: RealCorpusLivenessArm = { ...arm, overlays: [{ kind: "remove", path: "packages/kit/src/absent.ts" }] };
  const broken = openRealCorpusLiveness(scratch, [missing]);
  const failed: string[] = [];
  expect(() =>
    broken.proveAll(
      () => failed.push("completed"),
      (_index, ids) => failed.push(...ids),
    ),
  ).toThrow("matches no file");
  expect(failed).toEqual([policy.id]);
});
