// The PERMANENT PIN for the `eslint-grant-liveness` policy, migrated to the final `defineGate` contract
// (#1930). Every native-population shape (a dead file selector, a local ignore with no member inside its
// parent scope, the value-and-position identity, the live twin) is proven through the policy's own
// `mustFlag`/`mustPass` rows against `verifyPolicyProofs`, which the family conformance test
// `tests/tooling/verify/gates/grant-liveness-family.suite.test.ts` runs. (#1932 correction: this header used to
// cite `tests/tooling/verify/ops/policy-conformance.test.ts` as that harness. It is not — that file proves
// `verifyPolicyProofs` ITSELF against synthetic policies and imports no gate module, so until the family
// test landed, NO committed test executed this policy's proofs.)
// What THIS file keeps is what those isolated resource fixtures cannot show: a MISSING or malformed
// `eslint.config.js` REFUSES the whole run as a population-phase TOOL ERROR — the fail-LOUD requirement is
// now the runtime's own refusal (`resolveResourceDeclarations` throws on a non-ready declared resource),
// which the final proof harness has no "expect a tool error" arm to express.
//
// THE REAL-ROOT ARM IS BACK (#1947, 2026-09-11). The #1932 lane retired it and recorded the retirement as
// a law about this policy: `native-config`'s resolved resource population is the WHOLE tracked+untracked
// repository inventory (`lib/policy-repo-inventory.ts`), one member of which is the tracked SYMLINK
// `.codex/agent-doctrine.md` that `ops/resource-reader.ts` refuses by design — so `runPolicyPass` at the
// real root threw `ordinary waiver resource population has no exact text carrier: .codex/agent-doctrine.md`
// after ~4.2s and the plan classified exit 2. The MEASUREMENT was right and the DIAGNOSIS was right; the
// RULING ("no `native-config` policy can run at repository scope") was a defect in `lib/policy-pass.ts`,
// which demanded an ordinary-waiver text carrier from EVERY completed owner's resource population. Only an
// ORDINARY policy has a waiver door, so only it can demand one. The whole-inventory observation window stays
// exactly as `ops/resource-native-config.ts` declares it. Real-tree finding correctness for a resource
// policy is the ORCHESTRATOR's `pnpm check:structure` floor; this file pins that the policy RESOLVES AND
// RUNS at repository scope at all — the exact thing that was dead.
//
// THE REAL-TREE VERDICT MOVED TO THE FRONT DOOR (#1584 mixed runtime, 2026-09-11). While the production
// loader was legacy-only this arm also asserted `effectiveFindings` empty, because nothing else executed the
// policy on the real corpus. The mixed `pnpm check:structure` now runs it there on every invocation, and the
// transfer was PROVEN before the stopgap line was deleted (owner challenge: "zero findings doesn't mean remove
// it"): the run manifest roster names `eslint-grant-liveness` (contract final, owner success, population
// complete, 108 native-config rows over 9,426 tracked files), and a dead file-exact selector planted in the
// real `eslint.config.js` was reported by the mixed run at its config-entry token, then restored — the receipt
// is in the commit that deleted the line. The runnability arms below stay: they are what a planted temp root
// cannot show.
//
// THE GRANT ARMS (#1922 / #2147, 2026-09-13) REPLACE THE RATIFIED VALUE-AT-INDEX ARMS (#2302's residual). The
// ruling above stands and its INPUT changed: the gate-local positional `RATIFIED` table is gone, its seven
// rows are exact `(policy, subject, operation)` rows in `lib/reviewed-grants.ts`, and the stale half of the
// retired table is the central engine's `stale-reviewed-grant` alarm. The #2302 properties survive one for
// one, now driven through the SHIPPED grant rows and the production authority path rather than through an
// in-module `MSG_STALE`: every grant names today's zero-member selector at its recorded index; each formerly
// suppressed site is consumed by exactly one grant; an index-0 insert stales every grant; an in-place value
// change stales exactly one; an append stales none; a wrong operation or a renamed subject licenses nothing.
// Finding correctness for every NON-GRANTED selector stays with the front door, unchanged — no arm here
// asserts the blanket effective set.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Project } from "ts-morph";
import type { ReviewedGateGrant } from "../../../../tooling/src/verify/contract/gate-authority.ts";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { defineGate } from "../../../../tooling/src/verify/contract/policy.ts";
import type { PolicyPassResult } from "../../../../tooling/src/verify/contract/policy-pass.ts";
import { gate, selectorIdentity, selectorOperation } from "../../../../tooling/src/verify/gates/eslint-grant-liveness.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { readyResourceValue, resolveResourceDeclarations } from "../../../../tooling/src/verify/lib/resource-declaration.ts";
import { reviewedGrantsFor } from "../../../../tooling/src/verify/lib/reviewed-grants.ts";
import { createResourceHost } from "../../../../tooling/src/verify/ops/resource-host.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const CONFIG_REL = "eslint.config.js";

test("a MISSING eslint.config.js refuses the whole run as a population-phase TOOL ERROR", ({ scratch }) => {
  const project = new Project({ useInMemoryFileSystem: true });
  const result = runPolicyPass({ knownPolicies: [gate], policies: [gate], root: scratch, project, reviewedGrants: [], failOnWarnings: false });
  expect(result.toolErrors).toHaveLength(1);
  expect(result.toolErrors[0]).toMatchObject({ policyId: gate.id, phase: "population" });
  expect(result.toolErrors[0]?.message).toContain("is missing");
});

// ── THE SHIPPED GRANTS AGAINST THE REAL CONFIG ───────────────────────────────────────────────────────
// Every pass below runs the REAL config through the PRODUCTION resource selection: the counterfactuals go
// through `resourceOptions.overlay`, which stages the real authored transaction and runs the native ESLint
// loader inside it. Nothing here edits a tracked file.

/** This policy's rows of the ONE central table — never a re-spelled copy, which would assert its own hazard. */
const GRANTS: readonly ReviewedGateGrant[] = reviewedGrantsFor([gate]);
const GRANT_IDS = GRANTS.map(({ id }) => id).toSorted();

// UNIQUE anchors, asserted unique before use: `    ignores: [` alone occurs more than once in the real config,
// and a cut harness that patches the wrong one measures nothing (§6.1's own false-clean rule).
const INDEX_ZERO_ANCHOR = '      "**/node_modules/**",\n';
const CACHE_SELECTOR = '      "**/.cache/**",\n';
const ARRAY_END_ANCHOR = '      "packages/ui/src/styles/theme.css",\n    ],\n';

function realConfig(repoRoot: string, from: string, to: string): string {
  const text = readFileSync(join(repoRoot, CONFIG_REL), "utf8");
  expect(text.split(from).length - 1, `the counterfactual anchor must occur EXACTLY once: ${from.trim()}`).toBe(1);
  return text.replace(from, to);
}

// THE `.cache` SELECTOR'S OWN INDEX in the first config's `ignores` array — DERIVED, never typed.
//
// It was `5` as a literal until 2026-09-19, and the literal rotted exactly the way an index literal does:
// the `__g_` planter-suite ignore sat at index 3 until #2176 retired those suites, and deleting it slid
// every row below it up one. The pin then filtered for a subject no finding carried and asserted `[]`
// against a one-row expectation — a red that says nothing about the property under test. The index is a
// fact of the array's MEMBERSHIP, so it is read off the array.
function cacheIgnoreIndex(repoRoot: string): number {
  const text = readFileSync(join(repoRoot, CONFIG_REL), "utf8");
  const start = text.indexOf("    ignores: [");
  const entries = [...text.slice(start, text.indexOf("],", start)).matchAll(/^ {6}"([^"]+)",$/gmu)].map((match) => match[1]);
  const index = entries.indexOf(CACHE_SELECTOR.trim().slice(1, -2));
  expect(index, "the `.cache` ignore must still be a member of the first config's ignores array").toBeGreaterThanOrEqual(0);
  return index;
}

interface Drive {
  readonly result: PolicyPassResult;
  /** `subject operation` of every effective finding this policy produced. */
  readonly effective: readonly string[];
  readonly granted: readonly string[];
  readonly stale: readonly string[];
  readonly overBroad: readonly string[];
}

function identity(subject: string | undefined, operation: string | undefined): string {
  return `${subject ?? "<no subject>"} ${operation ?? "<no operation>"}`;
}

function drive(repoRoot: string, grants: readonly ReviewedGateGrant[], overlay?: string): Drive {
  const result = runPolicyPass({
    knownPolicies: [gate],
    policies: [gate],
    root: repoRoot,
    project: new Project({ useInMemoryFileSystem: true }),
    reviewedGrants: grants,
    failOnWarnings: false,
    ...(overlay === undefined ? {} : { resourceOptions: { overlay: { [CONFIG_REL]: overlay } } }),
  });
  expect(result.toolErrors, "a counterfactual that tool-errors measures the harness, not the policy").toEqual([]);
  expect(result.policies[0]?.owner).toMatchObject({ status: "success" });
  const { authority } = result;
  expect([...authority.effectiveFindings, ...authority.grantedFindings.map(({ finding }) => finding)].every(({ file }) => file === CONFIG_REL)).toBe(true);
  return {
    result,
    effective: authority.effectiveFindings.map(({ subject, operation }) => identity(subject, operation)),
    granted: authority.grantedFindings.map(({ grantId }) => grantId).toSorted(),
    stale: authority.authorityAlarms.flatMap((alarm) => (alarm.kind === "stale-reviewed-grant" ? [alarm.grantId] : [])).toSorted(),
    overBroad: authority.authorityAlarms.flatMap((alarm) => (alarm.kind === "over-broad-reviewed-grant" ? [alarm.grantId] : [])).toSorted(),
  };
}

// The mechanism and its receipt live at `lib/policy-pass.ts#ordinaryWaiverAcquisition`. The real inventory read
// plus the native ESLint config load measures ~4.0s on a quiet box, so every real-root arm carries an explicit
// load-scaled budget rather than sitting one contention spike away from vitest's 5s default.
test("the REAL repository root resolves and runs to a receipted, successful owner, consuming EVERY shipped grant exactly once", {
  timeout: scaledBudget(120_000),
}, ({ repoRoot }) => {
  // An empty table would satisfy every assertion below by vacuity, and the table is the subject.
  expect(GRANTS.length).toBeGreaterThan(0);

  const { result, granted, stale, overBroad } = drive(repoRoot, GRANTS);

  // The population IS the whole authored transaction; a scoped subset here would mean the deliberate
  // `resource-native-config.ts` observation window had silently narrowed.
  expect(result.policies[0]?.population.effectiveResourcePaths.length).toBeGreaterThan(1000);
  expect(result.policies[0]?.receipts.some(({ kind }) => kind === "resource")).toBe(true);
  // Only an ordinary policy has a waiver door, so this population demands no ordinary-waiver text carrier.
  expect(result.waiverCarrierRefusals).toEqual([]);
  expect({ granted, stale, overBroad }).toEqual({ granted: GRANT_IDS, stale: [], overBroad: [] });
});

test("every shipped grant names the RECORDED zero-member selector at its index, and without grants each is exactly one raw finding", {
  timeout: scaledBudget(120_000),
}, ({ repoRoot }) => {
  // RED-FIRST FOUND THIS ARM VACUOUS: with no shipped rows both maps below are `[]` and the loop never runs.
  expect(GRANTS.length).toBeGreaterThan(0);
  const invocation = createResourceHost({ root: repoRoot });
  // The policy's OWN declaration decides what is reachable; this is the production selection, not a read.
  expect(resolveResourceDeclarations(invocation.host, gate.resources)).toContain(CONFIG_REL);
  const live = new Map(readyResourceValue(invocation.host.nativeConfig("eslint")).selectors.map((row) => [selectorIdentity(row), row]));

  expect(GRANTS.map(({ subject, operation }) => ({ subject, operation, members: 0 }))).toEqual(
    GRANTS.map(({ subject }) => {
      const row = live.get(subject);
      return { subject, operation: row === undefined ? undefined : selectorOperation(row.value), members: row?.members };
    }),
  );

  // THE PER-ROW PERMISSION DIFFERENTIAL (§6.4 exemption-mechanism move): each site the retired table hid
  // is one raw finding carrying exactly its grant's identity — never zero (a dead grant), never two (an
  // over-broad one).
  const { effective } = drive(repoRoot, []);
  for (const grant of GRANTS) {
    expect(
      effective.filter((row) => row === identity(grant.subject, grant.operation)),
      grant.id,
    ).toHaveLength(1);
  }
});

test("an ignore inserted at index 0 of the REAL config re-points EVERY granted subject, and every grant goes stale", { timeout: scaledBudget(180_000) }, ({
  repoRoot,
}) => {
  // Non-vacuity: `stale: []` equals `GRANT_IDS` when there are no rows (red-first measured it passing).
  expect(GRANTS.length).toBeGreaterThan(0);
  const shifted = realConfig(repoRoot, INDEX_ZERO_ANCHOR, `      "__cbx_index0_control/**",\n${INDEX_ZERO_ANCHOR}`);

  const { granted, stale } = drive(repoRoot, GRANTS, shifted);

  expect({ granted, stale }).toEqual({ granted: [], stale: GRANT_IDS });
});

test("changing ONE granted selector's text IN PLACE stales exactly that grant and leaves its selector effective", { timeout: scaledBudget(180_000) }, ({
  repoRoot,
}) => {
  // The `.cache` row keeps its POSITION and its zero population; only its VALUE moves — the #2213 coupled
  // site. The position itself is read off the array rather than typed (see `cacheIgnoreIndex`).
  const subject = `config[0].ignores[${String(cacheIgnoreIndex(repoRoot))}]`;
  const moved = realConfig(repoRoot, CACHE_SELECTOR, '      "**/.cache-cbx-control/**",\n');

  const { effective, granted, stale } = drive(repoRoot, GRANTS, moved);

  expect(stale).toEqual(["eslint-grant-liveness:cache"]);
  expect(granted).toEqual(GRANT_IDS.filter((id) => id !== "eslint-grant-liveness:cache"));
  expect(effective.filter((row) => row.startsWith(`${subject} `))).toEqual([identity(subject, selectorOperation("**/.cache-cbx-control/**"))]);
});

test("an ignore APPENDED at the array's end re-points nothing: every grant is still consumed and only the new selector is effective", {
  timeout: scaledBudget(180_000),
}, ({ repoRoot }) => {
  const appended = realConfig(repoRoot, ARRAY_END_ANCHOR, '      "packages/ui/src/styles/theme.css",\n      "__cbx_append_control/**",\n    ],\n');
  const baseline = drive(repoRoot, GRANTS);

  const { effective, granted, stale } = drive(repoRoot, GRANTS, appended);

  expect({ granted, stale }).toEqual({ granted: GRANT_IDS, stale: [] });
  const added = effective.filter((row) => !baseline.effective.includes(row));
  expect(added).toHaveLength(1);
  expect(added[0]?.endsWith(` ${selectorOperation("__cbx_append_control/**")}`)).toBe(true);
});

test("a WRONG operation or a RENAMED subject on the shipped rows licenses nothing: every finding stays effective and every row goes stale", {
  timeout: scaledBudget(180_000),
}, ({ repoRoot }) => {
  // Non-vacuity, as above: with no rows every mutation maps nothing and both runs trivially agree.
  expect(GRANTS.length).toBeGreaterThan(0);
  const wrongOperation = drive(
    repoRoot,
    GRANTS.map((grant) => ({ ...grant, operation: `${grant.operation}-cbx-wrong` })),
  );
  const renamedSubject = drive(
    repoRoot,
    GRANTS.map((grant) => ({ ...grant, subject: grant.subject.replace("config[0]", "config[99]") })),
  );

  for (const run of [wrongOperation, renamedSubject]) {
    expect({ granted: run.granted, stale: run.stale }).toEqual({ granted: [], stale: GRANT_IDS });
    for (const grant of GRANTS) {
      expect(run.effective, grant.id).toContain(identity(grant.subject, grant.operation));
    }
  }
});

test("a NARROWED declaration cannot hide the config: dropping `native-config` REFUSES instead of passing", ({ repoRoot }) => {
  // The declared scope is what makes the config readable at all. A policy that stopped declaring it must
  // not come back clean over a population it can no longer see — the whole point of the binding fence.
  // Re-branded through `defineGate` because the dispatcher refuses an unbranded lookalike, which is the
  // same refusal one directory over: a spread copy is not a loaded policy.
  const narrowed: GatePolicy = defineGate({ ...gate, resources: [{ kind: "tracked-files" }] });

  const result = runPolicyPass({
    knownPolicies: [narrowed],
    policies: [narrowed],
    root: repoRoot,
    project: new Project({ useInMemoryFileSystem: true }),
    reviewedGrants: [],
    failOnWarnings: false,
  });

  expect(result.toolErrors).toHaveLength(1);
  expect(result.toolErrors[0]).toMatchObject({ policyId: gate.id, phase: "evaluate" });
  expect(result.toolErrors[0]?.message).toContain("resource request native-config:eslint is undeclared");
  expect(result.policies[0]?.owner).not.toMatchObject({ status: "success" });
  expect(result.authority.effectiveFindings).toEqual([]);
});
