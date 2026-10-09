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
