// The PERMANENT PIN for the `biome-grant-liveness` PAIR, migrated to the final `defineGate` contract
// (#2021). Every arm the policies can express — a dead file-exact grant, a dead glob grant, the
// negated-entry limit, the directory oracle, the one-finding-per-grant-identity rule, and the `-health`
// sibling's classifier-rot tripwire — is proven by the policies' own `mustFlag`/`mustPass` rows, which
// `tests/tooling/verify/gates/grant-liveness-family.suite.test.ts` runs through `verifyPolicyProofs`.
//
// This integration file pins runtime refusal shape and repository-scope runnability beyond the policy's
// declared rows. Missing or unparseable `biome.json` and an empty tracked corpus produce population-phase
// tool errors; the live-root twin proves both policies complete, traverse the real inventory, consume the
// grant table without alarms, and leave no effective findings (proof law §6.3).
//
// ONE REFUSAL IS NOT PINNED HERE AND CANNOT BE, recorded rather than faked (#2121). The policy now THROWS
// when `authoredText([biome.json])` refuses a config whose owning `json` declaration already resolved —
// two doors disagreeing about one acquired path. There is no fixture: both doors sit on the SAME
// `ResourceReader`, and `authored-text` serves a path exactly because another declaration admitted it, so
// a proof or scratch tree cannot make them disagree. The verbatim refusal is
// `the authored-text door refused <path> after its owning resource declaration resolved it (…) — two doors
// disagree about one acquired path, so this run is NOT a verdict`. §4.5b: measure it by hand, record it,
// and do not invent a row that does not discriminate.
//
// ARM SIX IS GONE, AND SO ARE ITS PINS. The #1158 RULE-liveness arm — strip the rule-off grants from a copy
// of biome.json, run the real biome binary over the granted files, call a grant that suppresses zero
// diagnostics dead — wrote a probe config into the repository ROOT and spawned a subprocess. §12.3 bans a
// filesystem READ from a policy, so a write plus a spawn is not convertible, and it was deleted with its
// reader rather than carried. Its planted controls in both directions and its truncation/broken-config
// refusal pins went with it. The property it held is REAL and is now unpoliced: path liveness proves the
// granted SUBJECT exists and never that the granted RULE still fires. Its successor belongs in a verify OP
// on the static tier, where `ops/config-snapshot.ts` already spawns a child for exactly this class.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { Project } from "ts-morph";
import { gate } from "../../../../tooling/src/verify/gates/biome-grant-liveness.ts";
import { gate as health } from "../../../../tooling/src/verify/gates/biome-grant-liveness-health.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { reviewedGrantsFor } from "../../../../tooling/src/verify/lib/reviewed-grants.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const POLICIES = [gate, health] as const;

function drive(root: string): ReturnType<typeof runPolicyPass> {
  const project = new Project({ useInMemoryFileSystem: true });
  return runPolicyPass({
    knownPolicies: [...POLICIES],
    policies: [...POLICIES],
    root,
    project,
    reviewedGrants: reviewedGrantsFor([...POLICIES]),
    failOnWarnings: false,
  });
}

test("a MISSING biome.json refuses the whole run as a population-phase TOOL ERROR", ({ scratch }) => {
  const result = drive(scratch);
  expect(result.toolErrors.length).toBeGreaterThan(0);
  expect(result.toolErrors[0]).toMatchObject({ phase: "population" });
  expect(result.toolErrors.map(({ message }) => message).join("\n")).toContain("is missing");
});

test("an UNPARSEABLE biome.json refuses the same way — never a silent default-fallback", ({ scratch }) => {
  // biome.json is STRICT JSON, so a JSONC comment is a parse error rather than a nuance.
  writeConfig(scratch, '{\n  // strict JSON rejects this\n  "overrides": []\n}\n');
  const result = drive(scratch);
  expect(result.toolErrors.length).toBeGreaterThan(0);
  expect(result.toolErrors.map(({ message }) => message).join("\n")).toContain("did not parse as strict JSON");
});

test("an EMPTY TRACKED CORPUS refuses at the population phase — the CORPUS-BLIND successor (#2125)", ({ scratch }) => {
  // A READABLE biome.json with no git work tree at all: the `json` resource resolves, so this is the
  // tracked-files refusal specifically, not the missing-config one above. The legacy descriptor reported
  // this as a finding (MSG_CORPUS_BLIND); the conversion moved it to a non-ready resource, which is louder
  // and unprovable by a proof row (§4.5b) — so it is asserted HERE or by nothing, which is what it was.
  writeConfig(scratch, '{\n  "overrides": [{ "includes": ["packages/client/src/live.ts"], "linter": { "rules": {} } }]\n}\n');
  const result = drive(scratch);
  expect(result.toolErrors.length).toBeGreaterThan(0);
  expect(result.toolErrors[0]).toMatchObject({ phase: "population" });
  const message = result.toolErrors.map(({ message: text }) => text).join("\n");
  expect(message).not.toContain("is missing");
  expect(message.toLowerCase()).toContain("git");
});

// The real inventory read plus the config parse measures well under a second, but the arm carries an
// explicit load-scaled budget rather than sitting one contention spike away from vitest's 5s default.
test("the REAL repository root: both policies resolve, run, and land their verdict through the grant table", { timeout: scaledBudget(60_000) }, ({
  repoRoot,
}) => {
  const result = drive(repoRoot);

  expect(result.toolErrors).toEqual([]);
  expect(result.policies.map(({ owner }) => owner.status)).toEqual(["success", "success"]);
  expect(result.policies[0]?.population.effectiveResourcePaths.length).toBeGreaterThan(1000);
  // A reviewed-grant policy demands no ordinary-waiver text carrier, which is what keeps the whole-inventory
  // `tracked-files` population from throwing on a tracked symlink (#1947).
  expect(result.waiverCarrierRefusals).toEqual([]);
  // The two-sided half the retired EXEMPT table owned by hand is now central: a grant consumed zero times
  // is STALE and alarms. Zero alarms here IS that arm passing on the real tree.
  expect(result.authority.authorityAlarms).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
});

function writeConfig(root: string, text: string): void {
  writeFileSync(join(root, "biome.json"), text);
}
