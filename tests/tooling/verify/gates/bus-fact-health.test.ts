// Conformance entry for the bus PRODUCER family: the one generic producer-coverage policy and the hard
// fact-health support policy that withholds it. This file used to run the five per-union coverage modules
// (`bus-coverage`, `rpg-bus-coverage`, `automation-bus-coverage`, `domain-events-coverage`,
// `user-bus-coverage`); their proof rows moved onto `bus-producer-coverage` intact when the five collapsed
// into one policy quantified over the belted roster, so the family's accumulated evidence is preserved
// rather than re-founded. The arms a proof row cannot express — the two REFUSALS that carry the retired
// `bus-coverage-owner`'s guarantee — are pinned through `runPolicyPass` here.
import { Project } from "ts-morph";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as busFactHealth } from "../../../../tooling/src/verify/gates/bus-fact-health.ts";
import { gate as busProducerCoverage } from "../../../../tooling/src/verify/gates/bus-producer-coverage.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { policyProofRows } from "../../../../tooling/src/verify/lib/policy-proof-rows.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const ROOT = "/bus-producers";
// The whole family's proof set runs inside ONE test, so the default per-TEST budget is the wrong number:
// it already walked a sibling family into a timeout that reads exactly like an assertion failure.
const CONFORMANCE_TIMEOUT_MS = scaledBudget(240_000);
const PER_ROW_TIMEOUT_MS = scaledBudget(60_000);
const FAMILY = [busFactHealth, busProducerCoverage];

function passOf(policy: GatePolicy, files: Readonly<Record<string, string>>): ReturnType<typeof runPolicyPass> {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return runPolicyPass({ knownPolicies: [policy], policies: [policy], root: ROOT, project, reviewedGrants: [], failOnWarnings: false });
}

test(
  "bus producer policies preserve their founding and nearest-legal fixtures",
  () => {
    expect(verifyPolicyProofs(FAMILY)).toEqual([]);
  },
  CONFORMANCE_TIMEOUT_MS,
);

/** Relative specifiers that reach nothing, over an EXACT set of files. A specifier answered by a
 *  neighbouring row's file is the false green this control exists to refuse, so rows are never merged. */
function danglingSpecifiers(files: readonly import("ts-morph").SourceFile[]): readonly string[] {
  return files
    .flatMap((sourceFile) => sourceFile.getImportDeclarations())
    .filter((declaration) => declaration.getModuleSpecifierValue().startsWith(".") && declaration.getModuleSpecifierSourceFile() === undefined)
    .map((declaration) => `${declaration.getSourceFile().getFilePath()} -> ${declaration.getModuleSpecifierValue()}`);
}

test(
  "every proof fixture's relative import resolves inside the virtual project",
  () => {
    // ONE project for the whole sweep, emptied between rows, isolated by a UNIQUE ROOT per row.
    const shared = new Project({ useInMemoryFileSystem: true });
    const dangling: string[] = [];
    let sequence = 0;
    for (const policy of FAMILY) {
      for (const { proof } of policyProofRows(policy)) {
        sequence += 1;
        const root = `${ROOT}-proof-${sequence}`;
        const files = Object.entries(proof.files).map(([path, source]) => shared.createSourceFile(`${root}/${path}`, source));
        dangling.push(...danglingSpecifiers(files).map((row) => `${policy.id}: ${row}`));
        for (const file of files) {
          shared.removeSourceFile(file);
        }
      }
    }
    // A specifier that reaches nothing makes an identity row pass by fail-closure while conformance is green.
    expect(dangling).toEqual([]);
    // AND THE SWEEP ACTUALLY RAN: emptying one project between rows buys speed at the cost of a silent
    // failure mode a fresh-project loop did not have. The count is derived from the descriptors.
    const declared = FAMILY.reduce((sum, policy) => sum + policyProofRows(policy).length, 0);
    expect(sequence).toBe(declared);
    expect(sequence).toBeGreaterThan(0);
  },
  PER_ROW_TIMEOUT_MS,
);

test(
  "a corpus with no BELTED bus REFUSES instead of reporting every bus covered",
  () => {
    // THE RETIRED OWNER GATE'S GUARANTEE, half one. `bus-coverage-owner` existed because five per-union
    // policies could not notice a belted bus nobody quantified over. The generic policy's denominator IS
    // the belted roster, so the failure mode inverts: an EMPTY roster is "I could not look", and it must
    // refuse rather than report a clean tree. A bus union with no belt is exactly that corpus.
    const unbelted = { "packages/contracts/src/probe/index.ts": 'export type ProbeBusEvent = { type: "a" };\n' };
    const result = passOf(busProducerCoverage, unbelted);

    expect(result.policies[0]?.owner.status).toBe("incomplete");
    expect(result.authority.effectiveFindings).toEqual([]);
    expect(result.toolErrors.map(({ phase }) => phase)).toEqual(["evaluate"]);
    expect(result.toolErrors[0]?.message).toContain("bus definition fact is incomplete");
  },
  PER_ROW_TIMEOUT_MS,
);

test(
  "a bus the PRODUCER fact belts and the definition fact cannot see REFUSES — the two rosters must agree",
  () => {
    // THE RETIRED OWNER GATE'S GUARANTEE, half three, and the one direction a fixture can actually reach:
    // the definition fact collects union ALIASES from `packages/contracts/src/` only, so a union declared
    // outside it whose belt lives inside it is belted for the producer fact and INVISIBLE to the definition
    // family's belt/consumer ratchets. Judged here, unratcheted there — which is the shape of a bus nobody
    // is quantifying over, so the run refuses instead of reporting the rest of the corpus clean.
    //
    // The assertion is on the MESSAGE, not merely on `incomplete`: this corpus also has a definition-fact
    // refusal behind it, so a run that has lost the roster check still refuses — with the OTHER message.
    // Neutering `assertRosterAgreement` therefore reds this row rather than sliding past it.
    const divergent = {
      "packages/server/src/domain/x/bus.ts": 'export type XBusEvent = { type: "changed" };\n',
      "packages/contracts/src/x/index.ts":
        'import type { XBusEvent } from "../../../server/src/domain/x/bus.ts";\nexport const X_EVENT_TYPES = { changed: true } satisfies Record<XBusEvent["type"], true>;\n',
    };
    const result = passOf(busProducerCoverage, divergent);

    expect(result.policies[0]?.owner.status).toBe("incomplete");
    expect(result.authority.effectiveFindings).toEqual([]);
    expect(result.toolErrors.map(({ phase }) => phase)).toEqual(["evaluate"]);
    expect(result.toolErrors[0]?.message).toContain("bus rosters disagree about belted unions");
    expect(result.toolErrors[0]?.message).toContain("is belted for the producer fact and invisible to the definition fact");
  },
  PER_ROW_TIMEOUT_MS,
);

test(
  "the owner deferral is keyed by (union, member): the SAME member name on another bus is still reported",
  () => {
    // The deferral list is `(union, member)` rows, and this is the row that says why. `connectionsChanged` is
    // deferred on the USER bus (#1822). A different belted bus declaring a member of the same NAME has no
    // deferral at all, so it must still be reported — while the user bus's own member stays silent. A
    // bare-name key passes the second assertion and FAILS the first, which is the cross-bus leak.
    const sameNameTwoBuses = {
      "packages/contracts/src/user-bus/index.ts":
        'export type UserBusEvent = { type: "connectionsChanged" };\nexport const USER_BUS_EVENT_TYPES = { connectionsChanged: true } satisfies Record<UserBusEvent["type"], true>;\n',
      "packages/contracts/src/chat/bus.ts":
        'export type ChatBusEvent = { type: "connectionsChanged" };\nexport const CHAT_BUS_EVENT_TYPES = { connectionsChanged: true } satisfies Record<ChatBusEvent["type"], true>;\n',
    };
    const findings = passOf(busProducerCoverage, sameNameTwoBuses).authority.effectiveFindings;

    expect(findings.map(({ message }) => message ?? "")).toEqual([expect.stringContaining("Union: ChatBusEvent. Member: connectionsChanged")]);
    expect(findings.map(({ message }) => message ?? "").filter((message) => message.includes("Union: UserBusEvent"))).toEqual([]);
  },
  PER_ROW_TIMEOUT_MS,
);

test(
  "ONE policy quantifies over EVERY belted union: a new bus is covered the day its belt lands",
  () => {
    // THE RETIRED OWNER GATE'S GUARANTEE, half two — and the property that made the owner gate structural
    // rather than semantic. Neither of these two unions is named anywhere in the policy; both are judged.
    const twoBuses = {
      "packages/contracts/src/chat/bus.ts":
        'export type ChatBusEvent = { type: "opened" };\nexport const CHAT_BUS_EVENT_TYPES = { opened: true } satisfies Record<ChatBusEvent["type"], true>;\n',
      "packages/contracts/src/automation/index.ts":
        'export type AutomationBusEvent = { type: "rulesChanged" };\nexport const AUTOMATION_BUS_EVENT_TYPES = { rulesChanged: true } satisfies Record<AutomationBusEvent["type"], true>;\n',
    };
    const findings = passOf(busProducerCoverage, twoBuses).authority.effectiveFindings;

    expect(findings.map(({ message }) => message ?? "").toSorted((left, right) => left.localeCompare(right))).toEqual([
      expect.stringContaining("Union: AutomationBusEvent. Member: rulesChanged"),
      expect.stringContaining("Union: ChatBusEvent. Member: opened"),
    ]);
  },
  PER_ROW_TIMEOUT_MS,
);
