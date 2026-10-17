import childProcess from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import process from "node:process";
import type { InventoryWorkerRequest } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";

export const NATIVE_POLICY_CASES = [
  "runtime-orders",
  "outputs-shared",
  "clone-alias",
  "clone-value",
  "clone-failure",
  "callable-waiver-test",
  "callable-waiver-describe",
  "member-orders",
  "member-grants",
  "cast-orders",
] as const;

async function run(mode: string, root: string): Promise<object> {
  const requests: string[] = [];
  const failed = join(root, ".cache/native-policy-failed-worker.mjs");
  const spawn = childProcess.spawnSync;
  Object.defineProperty(childProcess, "spawnSync", {
    value: (...args: Parameters<typeof spawn>): ReturnType<typeof spawn> => {
      const index = args[1]?.findIndex((value) => value.endsWith("semantic-inventory-worker.ts")) ?? -1;
      const path = index < 0 ? undefined : args[1]?.[index + 1];
      if (path !== undefined) {
        const { controllerImplementation: _executingController, ...request } = JSON.parse(readFileSync(path, "utf8")) as InventoryWorkerRequest;
        requests.push(JSON.stringify(request));
        if (mode === "clone-failure") {
          writeFileSync(failed, "process.stderr.write('injected native policy worker exit');process.exitCode=7;\n");
          return spawn(
            args[0],
            args[1]?.map((value) => (value.endsWith("semantic-inventory-worker.ts") ? failed : value)),
            args[2],
          );
        }
      }
      return spawn(...args);
    },
  });
  syncBuiltinESMExports();
  const { projectCtx, nativeTypeFactOptions } = await import("../../../../tooling/src/verify/lib/project-context.ts");
  const { runPolicyPass } = await import("../../../../tooling/src/verify/lib/policy-pass.ts");
  const { reviewedGrantsFor } = await import("../../../../tooling/src/verify/lib/reviewed-grants.ts");
  let orders: readonly (readonly GatePolicy[])[];
  let known: readonly GatePolicy[];
  if (mode === "cast-orders") {
    const { gate: fabrication } = await import("../../../../tooling/src/verify/gates/no-test-fabrication.ts");
    const { gate: looseIds } = await import("../../../../tooling/src/verify/gates/no-loose-id-cast.ts");
    known = [fabrication, looseIds];
    orders = [known, known.toReversed()];
  } else if (mode === "runtime-orders") {
    const { gate: verbs } = await import("../../../../tooling/src/verify/gates/verb-naming.ts");
    const { gate: health } = await import("../../../../tooling/src/verify/gates/firehose-import-allowlist-health.ts");
    known = [verbs, health];
    orders = [
      [verbs, health],
      [health, verbs],
    ];
  } else if (mode === "outputs-shared") {
    const { gate } = await import("../../../../tooling/src/verify/gates/no-opaque-test-fixture.ts");
    known = [gate];
    orders = [[gate], [gate]];
  } else if (mode.startsWith("member-")) {
    const { gate: subscription } = await import("../../../../tooling/src/verify/gates/single-stream-transport.ts");
    known = [subscription];
    orders = mode === "member-orders" ? [[subscription], [subscription]] : [[subscription], [subscription], [subscription]];
  } else if (mode.startsWith("callable-waiver-")) {
    const { gate: audit } = await import("../../../../tooling/src/verify/gates/audit-client-tests.ts");
    const { gate: plugin } = await import("../../../../tooling/src/verify/gates/plugin-dump-guard.ts");
    known = [plugin, audit];
    orders = [[audit]];
  } else {
    const { gate } = await import("../../../../tooling/src/verify/gates/test-production-clone.ts");
    known = [gate];
    orders = [[gate]];
  }
  const context = projectCtx(root);
  const { openInventoryDatabase, latestInventoryGeneration, readInventoryGeneration } = await import(
    "../../../../tooling/src/floor/code-facts/semantic-inventory-database.ts"
  );
  const checker = context.project.getTypeChecker;
  let checkerReads = 0;
  let exportReads = 0;
  Object.defineProperty(context.project, "getTypeChecker", {
    value: () => {
      checkerReads++;
      throw new Error("ordinary policy checker fallback");
    },
  });
  const clone = mode.startsWith("clone-") ? context.project.getSourceFileOrThrow(join(root, "packages/kit/src/rule.ts")) : undefined;
  const exports = clone?.getExportedDeclarations;
  if (clone !== undefined) {
    Object.defineProperty(clone, "getExportedDeclarations", {
      value: () => {
        exportReads++;
        throw new Error("ordinary clone export fallback");
      },
    });
  }
  try {
    const passes = orders.map((policies, index) => {
      const before = requests.length;
      const grant = {
        id: "member-native-probe",
        policyId: "single-stream-transport",
        subject: "packages/server/src/transport/trpc/routers/probe.ts",
        operation: "sse-subscription:live",
        why: "native fixture grant identity control",
        endsWhen: "this fixture stops declaring its probe subscription",
      };
      let selectedGrant = grant;
      if (index === 1) {
        selectedGrant = { ...grant, operation: "sse-subscription:other" };
      } else if (index === 2) {
        selectedGrant = { ...grant, subject: "packages/server/src/transport/trpc/routers/chat.ts" };
      }
      let reviewedGrants: ReturnType<typeof reviewedGrantsFor> = [];
      if (mode === "member-orders") {
        reviewedGrants = reviewedGrantsFor(policies);
      } else if (mode === "member-grants") {
        reviewedGrants = [...reviewedGrantsFor(policies), selectedGrant];
      }
      const result = runPolicyPass({
        root,
        project: context.project,
        ...nativeTypeFactOptions(context),
        knownPolicies: known,
        policies,
        ...(mode.startsWith("callable-waiver-") ? { requestedPaths: ["tests/server/helper.test.ts"] } : {}),
        reviewedGrants,
        failOnWarnings: false,
      });
      let timeline:
        | { readonly generation: number; readonly programs: readonly { readonly program: string; readonly families: readonly string[] }[] }
        | undefined;
      if (mode === "cast-orders") {
        using db = openInventoryDatabase(join(root, ".cache/semantic-inventory.sqlite"));
        const generation = latestInventoryGeneration(db);
        timeline = {
          generation,
          programs: readInventoryGeneration(db, generation)
            .map(({ program, families }) => ({ program, families }))
            .toSorted((a, b) => a.program.localeCompare(b.program)),
        };
      }
      return {
        errors: result.toolErrors,
        policies: result.policies.map(({ owner, findings }) => [owner.status, findings.length]),
        rows: result.policies.map(({ id, findings, receipts }) => ({ id, tokens: findings.map(({ token }) => token).toSorted(), receipts })),
        workers: requests.length - before,
        timeline,
        findings: result.policies.flatMap(({ findings }) => findings.map(({ file, token, message }) => ({ file, token, message }))),
        effective: result.authority.effectiveFindings.map(({ file, token }) => [file, token]),
        effectivePolicies: result.authority.effectiveFindings.map(({ policyId, file, token }) => [policyId, file, token]),
        successes: result.policies.every(({ owner }) => owner.status === "success"),
        granted: result.authority.grantedFindings.length,
        staleFixtureGrant: result.authority.authorityAlarms.some((alarm) => alarm.kind === "stale-reviewed-grant" && alarm.grantId === grant.id),
        waived: result.authority.waivedFindings.length,
        effectiveCount: result.authority.effectiveFindings.length,
        alarms: result.authority.authorityAlarms.length,
        noAlarms: result.authority.authorityAlarms.length === 0,
      };
    });
    return {
      mode,
      passes,
      requests,
      checkerReads,
      exportReads,
      ...(mode === "cast-orders" ? { sameGeneration: new Set(passes.map((pass) => pass.timeline?.generation)).size === 1 } : {}),
    };
  } finally {
    Object.defineProperty(context.project, "getTypeChecker", { value: checker });
    if (clone !== undefined && exports !== undefined) {
      Object.defineProperty(clone, "getExportedDeclarations", { value: exports });
    }
    Object.defineProperty(childProcess, "spawnSync", { value: spawn });
  }
}

if (process.argv[1] === import.meta.filename) {
  const mode = process.argv[2];
  const root = process.argv[3];
  const result = process.argv[4];
  if (mode === undefined || !NATIVE_POLICY_CASES.some((value) => value === mode) || root === undefined || result === undefined) {
    throw new Error("native policy case requires its closed mode and subject paths");
  }
  writeFileSync(result, JSON.stringify(await run(mode, root)));
}
