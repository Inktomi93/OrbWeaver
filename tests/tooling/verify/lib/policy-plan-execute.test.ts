import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { PolicyPassResult } from "@orb/tooling/verify";
import { defineGate, executePolicyPlan, planPolicyCommand, policyPassExitCode } from "@orb/tooling/verify";
import { Project } from "ts-morph";
import { policy, runRequest, scope } from "./_policy-plan-fixture.ts";

test.describe("final policy plan execution", () => {
  test("executes a plan through the production pass and refuses project/population drift", () => {
    const gate = policy("known");
    const corpus = { gates: [gate], families: [gate.family] };
    const planned = planPolicyCommand({ request: runRequest(), corpus, scope: scope(["tooling/src/a.ts"], "file") });
    if (!planned.ok || planned.plan.mode !== "run") {
      throw new Error("fixture plan did not resolve");
    }
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile("/repo/tooling/src/a.ts", "export const a = 1;\n");
    project.createSourceFile("/repo/tooling/src/b.ts", "export const b = 2;\n");

    expect(executePolicyPlan({ root: "/repo", project, corpus, plan: planned.plan, reviewedGrants: [] })).toMatchObject({
      ok: true,
      exitCode: 0,
      pass: { policies: [{ id: "known", owner: { status: "success" } }] },
    });

    const incompleteProject = new Project({ useInMemoryFileSystem: true });
    incompleteProject.createSourceFile("/repo/tooling/src/a.ts", "export const a = 1;\n");
    expect(executePolicyPlan({ root: "/repo", project: incompleteProject, corpus, plan: planned.plan, reviewedGrants: [] })).toMatchObject({
      ok: false,
      exitCode: 2,
      message: expect.stringMatching(/population.*plan/i),
    });
  });

  test("execution carries the full known roster into ordinary-waiver adjudication", () => {
    const selected = policy("selected-hard");
    const unselected = defineGate({ ...policy("known-ordinary"), authority: "ordinary" });
    const reviewed = defineGate({
      ...policy("known-reviewed"),
      authority: "reviewed-grant",
      mustFlag: [
        {
          mode: "source",
          files: { "tooling/src/a.ts": "export const a = 1;\n" },
          grant: { subject: "subject", operation: "read" },
          why: "the known unselected owner must withhold grant liveness",
        },
      ],
    });
    const corpus = { gates: [selected, unselected, reviewed], families: [selected.family, unselected.family, reviewed.family] };
    const planned = planPolicyCommand({
      request: runRequest({ selector: { kind: "check", names: [selected.id] } }),
      corpus,
      scope: scope(["tooling/src/a.ts"], "file"),
    });
    if (!planned.ok || planned.plan.mode !== "run") {
      throw new Error("full-roster fixture plan did not resolve");
    }
    const plan = planned.plan;
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile(
      "/repo/tooling/src/a.ts",
      [
        "// @orb-waive missing-policy(value): unknown policy must stay loud",
        "// @orb-waive known-ordinary(value): unselected liveness is withheld",
        "export const value = 1;",
      ].join("\n"),
    );
    project.createSourceFile("/repo/tooling/src/b.ts", "export const b = 2;\n");

    const result = executePolicyPlan({ root: "/repo", project, corpus, plan: planned.plan, reviewedGrants: [] });

    expect(result).toMatchObject({
      ok: true,
      exitCode: 1,
      pass: { authority: { authorityAlarms: [{ policyId: "missing-policy", message: expect.stringMatching(/unknown policy/i) }] } },
    });
    if (!result.ok) {
      throw new Error(result.message);
    }
    expect(result.pass.authority.authorityAlarms).toHaveLength(1);

    const cleanProject = new Project({ useInMemoryFileSystem: true });
    cleanProject.createSourceFile("/repo/tooling/src/a.ts", "export const a = 1;\n");
    cleanProject.createSourceFile("/repo/tooling/src/b.ts", "export const b = 2;\n");
    const grant = { id: "grant", policyId: reviewed.id, subject: "subject", operation: "read", why: "fixture", endsWhen: "the owner runs" };
    const executeGrants = (reviewedGrants: readonly (typeof grant)[]): ReturnType<typeof executePolicyPlan> =>
      executePolicyPlan({ root: "/repo", project: cleanProject, corpus, plan, reviewedGrants });

    expect(executeGrants([{ ...grant, policyId: "missing-policy" }])).toMatchObject({
      ok: true,
      exitCode: 2,
      pass: { authority: { toolErrors: [{ kind: "invalid-grant", policyId: "missing-policy" }] } },
    });
    expect(executeGrants([{ ...grant, policyId: selected.id }])).toMatchObject({
      ok: true,
      exitCode: 2,
      pass: { authority: { toolErrors: [{ kind: "invalid-grant-authority", policyId: selected.id }] } },
    });
    expect(executeGrants([grant])).toMatchObject({
      ok: true,
      exitCode: 0,
      pass: { authority: { authorityAlarms: [], reviewedGrantConsumption: [{ id: grant.id, count: 0 }] } },
    });
  });

  test("executes ResourceHost acquisition through the bound policy context", () => {
    const resource = defineGate({
      id: "resource-host",
      family: "resource-host",
      authority: "hard",
      severity: "error",
      population: { of: "none", why: "resource-only" },
      analysis: "resource",
      execution: "selected-files",
      facts: [],
      resources: [{ kind: "package-metadata", id: "tooling" }],
      message: "resource host must resolve",
      create: (ctx) => ({
        evaluate: () => {
          const fact = ctx.resources.packageMetadata("tooling");
          if (fact.status !== "ready") {
            throw new Error(fact.reason);
          }
        },
      }),
      mustFlag: [{ mode: "resource", files: { "tooling/package.json": "{}\n" }, why: "founding defect" }],
      mustPass: [{ mode: "resource", files: { "tooling/package.json": "{}\n" }, why: "nearest legal shape" }],
    });
    const corpus = { gates: [resource], families: [resource.family] };
    const resolved = scope(["tooling/package.json"], "file");
    const planned = planPolicyCommand({
      request: runRequest({ scope: { kind: "file", paths: ["tooling/package.json"] } }),
      corpus,
      scope: resolved,
      resourceOptions: {
        root: "/repo",
        overlay: { "tooling/package.json": '{"name":"@orb/tooling","private":true}\n' },
      },
    });
    if (!planned.ok || planned.plan.mode !== "run") {
      throw new Error("resource fixture plan did not resolve");
    }

    expect(
      executePolicyPlan({
        root: "/repo",
        project: new Project({ useInMemoryFileSystem: true }),
        corpus,
        plan: planned.plan,
        reviewedGrants: [],
        resourceOptions: { overlay: { "tooling/package.json": '{"name":"@orb/tooling","private":true}\n' } },
      }),
    ).toMatchObject({
      ok: true,
      exitCode: 0,
      pass: { policies: [{ receipts: [{ kind: "resource", source: "package:tooling", resources: 1, unresolved: 0 }] }] },
    });

    expect(
      executePolicyPlan({
        root: "/repo",
        project: new Project({ useInMemoryFileSystem: true }),
        corpus,
        plan: { ...planned.plan, resourcePathsByPolicy: {} },
        reviewedGrants: [],
        resourceOptions: { overlay: { "tooling/package.json": '{"name":"@orb/tooling","private":true}\n' } },
      }),
    ).toMatchObject({ ok: false, exitCode: 2, message: expect.stringMatching(/resource manifest.*planned populations/i) });
  });

  test("warning findings stay visible and block only when promotion is requested", () => {
    const warning = defineGate({
      ...policy("warning-policy", { severity: "warning" }),
      create: (ctx) => ({ evaluate: () => ctx.report.file("tooling/src/a.ts", { line: 1, column: 1 }) }),
    });
    const corpus = { gates: [warning], families: [warning.family] };
    const resolved = scope(["tooling/src/a.ts"], "file");
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile("/repo/tooling/src/a.ts", "export const a = 1;\n");
    project.createSourceFile("/repo/tooling/src/b.ts", "export const b = 2;\n");
    const execute = (failOnWarnings: boolean): ReturnType<typeof executePolicyPlan> => {
      const planned = planPolicyCommand({ request: runRequest({ failOnWarnings }), corpus, scope: resolved });
      if (!planned.ok || planned.plan.mode !== "run") {
        throw new Error("warning fixture plan did not resolve");
      }
      return executePolicyPlan({ root: "/repo", project, corpus, plan: planned.plan, reviewedGrants: [] });
    };

    expect(execute(false)).toMatchObject({
      ok: true,
      exitCode: 0,
      pass: { authority: { effectiveFindings: [{ policyId: "warning-policy", severity: "warning" }], verdict: { warnings: 1, blocking: 0 } } },
    });
    expect(execute(true)).toMatchObject({ ok: true, exitCode: 1, pass: { authority: { verdict: { warnings: 1, blocking: 1 } } } });
  });

  test("maps completed policy results onto the stable exit classes", () => {
    const result = {
      facts: [],
      policies: [],
      factErrors: [],
      toolErrors: [],
      waiverCarrierRefusals: [],
      authority: {
        effectiveFindings: [],
        waivedFindings: [],
        grantedFindings: [],
        authorityAlarms: [],
        unjudgedReviewedGrants: [],
        waiverBudget: null,
        toolErrors: [],
        withheldPolicyIds: [],
        ordinaryConsumption: [],
        reviewedGrantConsumption: [],
        verdict: { errors: 0, warnings: 0, blocking: 0, failOnWarnings: false },
      },
      timing: { totalMs: 0, policyMs: 0, factMs: 0 },
    } satisfies PolicyPassResult;
    expect(policyPassExitCode(result)).toBe(0);
    expect(policyPassExitCode({ ...result, authority: { ...result.authority, verdict: { ...result.authority.verdict, blocking: 1 } } })).toBe(1);
    expect(policyPassExitCode({ ...result, toolErrors: [{ policyId: "x", phase: "create", message: "boom" }] })).toBe(2);
    expect(policyPassExitCode({ ...result, factErrors: [{ factId: "x", phase: "finish", message: "boom" }] })).toBe(2);
  });
});
