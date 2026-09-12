// Conformance entry for the bus PRODUCER family: the one generic producer-coverage policy and the hard
// fact-health support policy that withholds it. This file used to run the five per-union coverage modules
// (`bus-coverage`, `rpg-bus-coverage`, `automation-bus-coverage`, `domain-events-coverage`,
// `user-bus-coverage`); their proof rows moved onto `bus-producer-coverage` intact when the five collapsed
// into one policy quantified over the belted roster, so the family's accumulated evidence is preserved
// rather than re-founded. The arms a proof row cannot express — the two REFUSALS that carry the retired
// `bus-coverage-owner`'s guarantee — are pinned through `runPolicyPass` here.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { Project } from "ts-morph";
import type { GateDescriptor } from "../../../../tooling/src/verify/contract/gate.ts";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as busFactHealth } from "../../../../tooling/src/verify/gates/bus-fact-health.ts";
import { gate as busProducerCoverage } from "../../../../tooling/src/verify/gates/bus-producer-coverage.ts";
import { runPass } from "../../../../tooling/src/verify/lib/pass.ts";
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

// ─── §4.6 SPLIT-ARM DIFFERENTIAL for `bus-fact-health` (#2000, p-parity-tier1) ──────────────────────────
// `bus-fact-health` is the SUCCESSOR to the BLINDNESS half of the five per-bus legacy coverage gates. That
// half did not live in a gate module at all: it was the pair of early returns at the top of the shared
// `reconcileBusCoverage` (`lib/bus-coverage.ts`), which each thin gate inherited —
//
//     canonical bus contracts home is missing for <CONST>
//     canonical bus event belt <CONST> is missing or empty
//
// — and which said "I could not read this bus's census" in the same breath, and the same finding list, as
// "this member has no emit site". The conversion split those two jobs by AUTHORITY and SUBJECT: the census
// question became one `hard` policy over a SHARED FACT covering every bus at once, and the coverage verdict
// became `bus-producer-coverage` over that fact's roster. This section proves the census half.
//
// SCOPE, stated so the green is not read as more than it is: the five-legacy-gates-into-one
// `bus-producer-coverage` MERGE is a different differential and not this lane's (#2000 Tier 1 covers the
// eight `-health` siblings). What is compared here is the BLINDNESS ARM — every corpus on which the legacy
// reconcile refused to read a census, against what `bus-fact-health` says about the same bytes.
//
// THE CLASSIFIED DIFFERENCES:
//   1. PER-SPEC → SHARED FACT. The legacy arm fired once per BusCoverageSpec and named the spec's belt const
//      (`CHAT_BUS_EVENT_TYPES`); the final fires once for the whole population and names the failure class
//      (`bus fact empty: union/missing: …`). Comparison is therefore "did exactly one blindness verdict
//      come out of this corpus", not message equality.
//   2. THE FINDING ANCHOR. The legacy reported on the spec's `reportFile` — a path it declared, which need
//      not exist. The final anchors on a real file from its own effective population (`ctx.files[0]`).
//   3. THE FINAL IS STRICTLY LOUDER: IDENTITY, NOT SPELLING. The legacy read the belt by TEXT SHAPE, so a
//      bare `{ emitted: "emitted" } as const` with no bus union anywhere read as a healthy census and the
//      gate proceeded to judge coverage against it. The final fact requires a real exported bus union, so
//      the SAME BYTES now REFUSE. Every legacy `bus-coverage` example is that shape, which is why this
//      section replays the blindness CONDITIONS rather than the example corpus — and the third test asserts
//      the strengthening on the legacy gate's own mustPass fixture rather than letting it look like a loss.
const LEGACY_BUS_BASE = "f287dc6dbb2dc4959a0bf4bd5698fea70fa03df8";
const LEGACY_BUS_PATH = "tooling/src/verify/gates/bus-coverage.ts";
const DIFF_ROOT = "/bus-fact-health-differential";

function diffProjectOf(files: Readonly<Record<string, string>>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${DIFF_ROOT}/${path}`, source);
  }
  return project;
}

/** The legacy blindness verdicts a corpus produced — the two early returns of `reconcileBusCoverage`, told
 *  apart from the per-member coverage verdicts they shared a finding list with. */
function legacyBlindness(gate: GateDescriptor, files: Readonly<Record<string, string>>): readonly string[] {
  const project = diffProjectOf(files);
  const result = runPass([gate], {
    root: DIFF_ROOT,
    project,
    scope: { kind: "project" },
    files: project.getSourceFiles(),
    checker: () => project.getTypeChecker(),
  });
  expect(result.toolErrors).toEqual([]);
  return (result.gates[0]?.findings ?? [])
    .map((finding) => finding.message ?? "")
    .filter((message) => message.startsWith("canonical bus"))
    .toSorted((left, right) => left.localeCompare(right));
}

/** The final census verdicts for the same bytes. */
function finalBlindness(files: Readonly<Record<string, string>>): readonly string[] {
  const result = runPolicyPass({
    knownPolicies: [busFactHealth],
    policies: [busFactHealth],
    root: DIFF_ROOT,
    project: diffProjectOf(files),
    reviewedGrants: [],
    failOnWarnings: false,
  });
  expect(result.toolErrors).toEqual([]);
  expect(result.factErrors).toEqual([]);
  expect(result.policies[0]?.owner.status).toBe("success");
  return result.authority.effectiveFindings.map((finding) => finding.message ?? busFactHealth.message).toSorted((left, right) => left.localeCompare(right));
}

async function frozenBusCoverage(scratch: string): Promise<GateDescriptor> {
  const source = execFileSync("git", ["show", `${LEGACY_BUS_BASE}:${LEGACY_BUS_PATH}`], { encoding: "utf8" });
  const target = join(scratch, basename(LEGACY_BUS_PATH));
  const href = (rel: string): string => JSON.stringify(pathToFileURL(join(process.cwd(), "tooling/src/verify", rel)).href);
  // `lib/bus-coverage.ts` changed only in its HEADER COMMENT since BASE (it is retired residue now), and
  // `contract/readers.ts` still exports `BusCoverageSpec`, so the frozen gate runs BASE's behaviour.
  const rewritten = source
    .replace('from "../contract/gate.ts"', `from ${href("contract/gate.ts")}`)
    .replace('from "../contract/readers.ts"', `from ${href("contract/readers.ts")}`)
    .replace('from "../lib/bus-coverage.ts"', `from ${href("lib/bus-coverage.ts")}`);
  writeFileSync(target, rewritten);
  return ((await import(`${pathToFileURL(target).href}?frozen=${basename(LEGACY_BUS_PATH)}`)) as { readonly gate: GateDescriptor }).gate;
}

const CHAT_BUS_FILE = "packages/contracts/src/chat/bus.ts";
/** The shape the final fact requires: a real exported union plus a belt that `satisfies` it. */
const TYPED_HEALTHY_BUS =
  'export type ChatBusEvent = { type: "emitted" };\nexport const CHAT_BUS_EVENT_TYPES = { emitted: true } satisfies Record<ChatBusEvent["type"], true>;\n';

test(
  "every corpus the legacy reconcile refused to read a census from is a census refusal for bus-fact-health too",
  async ({ scratch }) => {
    const legacy = await frozenBusCoverage(scratch);
    const corpora: readonly { readonly why: string; readonly files: Readonly<Record<string, string>>; readonly legacyText: string }[] = [
      {
        why: "THE CONTRACTS HOME IS GONE — no file matches the spec's `contractsFile`, so no belt can be read at all",
        files: { "packages/contracts/src/probe/index.ts": "export const noBusUnion = true;\n" },
        legacyText: "canonical bus contracts home is missing for CHAT_BUS_EVENT_TYPES",
      },
      {
        why: "THE BELT IS EMPTY — the home exists and declares the const, but it carries no discriminator",
        files: { [CHAT_BUS_FILE]: "export const CHAT_BUS_EVENT_TYPES = {} as const;\n" },
        legacyText: "canonical bus event belt CHAT_BUS_EVENT_TYPES is missing or empty",
      },
      {
        why: "THE BELT IS ABSENT — the home exists and declares nothing the spec names",
        files: { [CHAT_BUS_FILE]: "export const unrelated = 1;\n" },
        legacyText: "canonical bus event belt CHAT_BUS_EVENT_TYPES is missing or empty",
      },
    ];
    for (const corpus of corpora) {
      // LEGACY: exactly one blindness verdict, naming the spec's belt const.
      expect(legacyBlindness(legacy, corpus.files), `legacy: ${corpus.why}`).toEqual([corpus.legacyText]);
      // FINAL: exactly one census refusal for the same bytes — classified difference 1, so the assertion is
      // on the CLASS and the count, not on the legacy's per-spec wording.
      const after = finalBlindness(corpus.files);
      expect(after, `final: ${corpus.why}`).toHaveLength(1);
      expect(after[0], `final: ${corpus.why}`).toContain("shared bus fact is incomplete");
      expect(after[0], `final: ${corpus.why}`).toContain("bus fact empty");
    }
  },
  PER_ROW_TIMEOUT_MS,
);

test(
  "a healthy typed census is silent on both sides — the control the refusals above depend on",
  async ({ scratch }) => {
    const legacy = await frozenBusCoverage(scratch);
    const files = { [CHAT_BUS_FILE]: TYPED_HEALTHY_BUS };
    // The legacy reconcile reads the belt and proceeds (its per-member coverage verdict is
    // `bus-producer-coverage`'s business now, and is filtered out here): NO blindness.
    expect(legacyBlindness(legacy, files)).toEqual([]);
    expect(finalBlindness(files)).toEqual([]);
  },
  PER_ROW_TIMEOUT_MS,
);

test(
  "CLASSIFIED STRENGTHENING: the legacy read an untyped `as const` belt as a healthy census; the final REFUSES it",
  async ({ scratch }) => {
    const legacy = await frozenBusCoverage(scratch);
    // The legacy gate's OWN mustPass[0] bytes: a belt with no bus union anywhere. Every legacy example in
    // this family is this shape, which is why the section above replays the blindness CONDITIONS instead of
    // the example corpus.
    const files = {
      [CHAT_BUS_FILE]: 'export const CHAT_BUS_EVENT_TYPES = { emitted: "emitted" } as const;\n',
      "packages/server/src/domain/chat/x.ts": 'const emit = deps.emit;\nemit({ type: "emitted" });\n',
    };
    // LEGACY: a text-shaped read is satisfied, so it declares the census readable and judges coverage.
    expect(legacyBlindness(legacy, files)).toEqual([]);
    // FINAL: identity, not spelling — no exported bus union exists, so the fact is EMPTY and the hard health
    // policy refuses rather than letting a downstream coverage verdict be trusted. Strictly louder: the
    // difference is a finding the conversion GAINED, never one it lost.
    const after = finalBlindness(files);
    expect(after).toHaveLength(1);
    expect(after[0]).toContain("no exported bus union exists in the effective population");
  },
  PER_ROW_TIMEOUT_MS,
);
