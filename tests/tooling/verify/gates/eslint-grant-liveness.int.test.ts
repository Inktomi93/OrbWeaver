// The PERMANENT PIN for the `eslint-grant-liveness` policy, migrated to the final `defineGate` contract
// (#1930). Every native-population shape (a dead file selector, a local ignore with no member inside its
// parent scope, both live twins) is proven through the policy's own `mustFlag`/`mustPass` rows against
// `verifyPolicyProofs`, which the family conformance test
// `tests/tooling/verify/gates/grant-liveness-family.test.ts` runs. (#1932 correction: this header used to
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
// which demanded an ordinary-waiver text carrier from EVERY completed owner's resource population. A HARD
// policy has no waiver door, so it can demand none. The whole-inventory observation window stays exactly as
// `ops/resource-native-config.ts` declares it. The old test's ASSERTION ("only the five ratified zero
// populations") is NOT restored here: real-tree finding correctness for a resource policy is the
// ORCHESTRATOR's `pnpm check:structure` floor. What this file pins is that the policy RESOLVES AND RUNS at
// repository scope at all — the exact thing that was dead.
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
// AND THE RATIFIED VALUE-AT-INDEX IS BACK, NARROWLY (#2302's residual, 2026-09-13). The ruling above stands
// and its INPUT changed. What it ruled — "real-tree finding correctness for a resource policy is the
// ORCHESTRATOR's `pnpm check:structure` floor" — still owns the BLANKET verdict, and this file still does
// not assert `effectiveFindings` empty over the whole corpus. What the reconciliation of 2026-09-13 found
// (`docs/reviews/gate-runtime/adj-ledger-reconcile-2026-09-13.md`, its #2302 section) is that the deferral
// swallowed a NARROWER property with it: `RATIFIED` is keyed by POSITION, so nothing scoped ever asked
// whether today's table names today's `eslint.config.js` VALUES — the module's own `mustFlag` rows prove the
// re-pointing hazard on a SYNTHETIC config only. The four arms at the bottom of this file assert exactly
// that property and nothing wider: value-at-index per RATIFIED key, the stale-arm token set, and two
// counterfactuals of the REAL config through the production overlay door. Finding correctness for every
// NON-RATIFIED selector stays with the front door, unchanged.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Project } from "ts-morph";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { defineGate } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate, MSG_STALE, RATIFIED, selectorIdentity } from "../../../../tooling/src/verify/gates/eslint-grant-liveness.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { readyResourceValue, resolveResourceDeclarations } from "../../../../tooling/src/verify/lib/resource-declaration.ts";
import { createResourceHost } from "../../../../tooling/src/verify/ops/resource-host.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

test("a MISSING eslint.config.js refuses the whole run as a population-phase TOOL ERROR", ({ scratch }) => {
  const project = new Project({ useInMemoryFileSystem: true });
  const result = runPolicyPass({ knownPolicies: [gate], policies: [gate], root: scratch, project, reviewedGrants: [], failOnWarnings: false });
  expect(result.toolErrors).toHaveLength(1);
  expect(result.toolErrors[0]).toMatchObject({ policyId: gate.id, phase: "population" });
  expect(result.toolErrors[0]?.message).toContain("is missing");
});

// The mechanism and its receipt live at `lib/policy-pass.ts#ordinaryWaiverAcquisition`.
// The real inventory read plus the native ESLint config load measures ~4.0s on a quiet box, so this arm carries an
// explicit load-scaled budget rather than sitting one contention spike away from vitest's 5s default.
test("the REAL repository root: this hard policy resolves and runs to a receipted, successful owner", { timeout: scaledBudget(60_000) }, ({ repoRoot }) => {
  const project = new Project({ useInMemoryFileSystem: true });
  const result = runPolicyPass({ knownPolicies: [gate], policies: [gate], root: repoRoot, project, reviewedGrants: [], failOnWarnings: false });

  expect(result.toolErrors).toEqual([]);
  expect(result.policies[0]?.owner).toMatchObject({ status: "success" });
  // The population IS the whole authored transaction; a scoped subset here would mean the deliberate
  // `resource-native-config.ts` observation window had silently narrowed.
  expect(result.policies[0]?.population.effectiveResourcePaths.length).toBeGreaterThan(1000);
  expect(result.policies[0]?.receipts.some(({ kind }) => kind === "resource")).toBe(true);
  // A hard policy has no waiver door, so its population demands no ordinary-waiver text carrier.
  expect(result.waiverCarrierRefusals).toEqual([]);
  // The BLANKET real-tree verdict (zero effective findings over every selector) is still not asserted here:
  // the mixed front door runs this policy on the real corpus on every `pnpm check:structure` and owns
  // finding correctness for the NON-RATIFIED selectors — see the header. What the four arms below add is
  // the narrower property that ruling never covered: RATIFIED value-at-index against the real config.
});

// ── THE SCOPED REAL-CONFIG PROOF (#2302's residual, 2026-09-13) ───────────────────────────────────────
// `RATIFIED` is keyed by POSITION. The module's own `mustFlag` rows prove that an index-0 insert re-points
// every key beneath it — but they prove it on a SYNTHETIC config, so nothing scoped ever asked whether
// TODAY'S table names TODAY'S `eslint.config.js` values. That question is what the row asked for and what
// the four arms below answer, all four driven over the REAL config through the PRODUCTION resource
// selection: the paths come from `resolveResourceDeclarations` over the policy's OWN `resources`
// declaration, and the counterfactuals go through `resourceOptions.overlay`, which stages the real
// authored transaction and runs the native ESLint loader inside it. Nothing here edits a tracked file.
const CONFIG_REL = "eslint.config.js";
// A UNIQUE anchor, asserted unique before use: `    ignores: [` alone occurs TWICE in the real config, and
// a cut harness that patches the wrong one measures nothing (§4's own false-clean rule).
const INDEX_ZERO_ANCHOR = '      "**/node_modules/**",\n';
const CACHE_SELECTOR = '      "**/.cache/**",\n';

function realConfig(repoRoot: string, from: string, to: string): string {
  const text = readFileSync(join(repoRoot, CONFIG_REL), "utf8");
  expect(text.split(from).length - 1, `the counterfactual anchor must occur EXACTLY once: ${from.trim()}`).toBe(1);
  return text.replace(from, to);
}

function staleTokens(repoRoot: string, overlay?: string): { readonly stale: readonly string[]; readonly findings: number } {
  const result = runPolicyPass({
    knownPolicies: [gate],
    policies: [gate],
    root: repoRoot,
    project: new Project({ useInMemoryFileSystem: true }),
    reviewedGrants: [],
    failOnWarnings: false,
    ...(overlay === undefined ? {} : { resourceOptions: { overlay: { [CONFIG_REL]: overlay } } }),
  });
  expect(result.toolErrors, "a counterfactual that tool-errors measures the harness, not the policy").toEqual([]);
  expect(result.policies[0]?.owner).toMatchObject({ status: "success" });
  const findings = result.policies[0]?.findings ?? [];
  expect(findings.every(({ file }) => file === CONFIG_REL)).toBe(true);
  return {
    stale: findings.filter(({ message }) => message === MSG_STALE).flatMap(({ token }) => (token === undefined ? [] : [token])),
    findings: findings.length,
  };
}

test("every RATIFIED index names the RECORDED selector in the REAL eslint.config.js", { timeout: scaledBudget(120_000) }, ({ repoRoot }) => {
  const invocation = createResourceHost({ root: repoRoot });
  // The policy's OWN declaration decides what is reachable; this is the production selection, not a read.
  expect(resolveResourceDeclarations(invocation.host, gate.resources)).toContain(CONFIG_REL);
  const selectors = readyResourceValue(invocation.host.nativeConfig("eslint")).selectors;
  const live = new Map(selectors.map((row) => [selectorIdentity(row), row]));
  const ratified = Object.entries(RATIFIED);
  // An empty table would satisfy every assertion below by vacuity, and the table is the subject.
  expect(ratified.length).toBeGreaterThan(0);

  expect(ratified.map(([key, row]) => ({ key, value: row.value, members: 0 }))).toEqual(
    ratified.map(([key]) => ({ key, value: live.get(key)?.value, members: live.get(key)?.members })),
  );
  // …and the policy AGREES on the unmodified config: no RATIFIED identity is stale. Narrower than the
  // blanket verdict the header assigns to `check:structure`, and it is the arm the two controls falsify.
  expect(staleTokens(repoRoot).stale).toEqual([]);
});

test("an ignore inserted at index 0 of the REAL config re-points EVERY ratified key, and the policy names them", { timeout: scaledBudget(180_000) }, ({
  repoRoot,
}) => {
  const shifted = realConfig(repoRoot, INDEX_ZERO_ANCHOR, `      "__cbx_index0_control/**",\n${INDEX_ZERO_ANCHOR}`);

  const { stale } = staleTokens(repoRoot, shifted);

  expect(stale.toSorted()).toEqual(Object.keys(RATIFIED).toSorted());
});

test("changing ONE ratified selector's text IN PLACE stales exactly that key", { timeout: scaledBudget(180_000) }, ({ repoRoot }) => {
  // Index 5 keeps its position and its zero population; only its VALUE moves — the #2213 coupled site,
  // now driven against the real config instead of a fixture copy of it.
  const moved = realConfig(repoRoot, CACHE_SELECTOR, '      "**/.cache-cbx-control/**",\n');

  const { stale, findings } = staleTokens(repoRoot, moved);

  expect(stale).toEqual(["config[0].ignores[5]"]);
  // TWO findings on one identity, exactly as `mustFlag[2]` records: the value no longer matches, so the
  // selector is also reported as an ordinary UNRATIFIED dead selector. Asserting one would let the other rot.
  expect(findings).toBe(2);
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
