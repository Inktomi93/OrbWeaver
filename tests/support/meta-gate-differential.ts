import type { GateDescriptor } from "../../tooling/src/verify/contract/gate.ts";
import type { GatePolicy } from "../../tooling/src/verify/contract/policy.ts";
import { verifyGateProofs } from "../../tooling/src/verify/ops/conformance.ts";
import type { Files, Label, TmpdirDifferential } from "./legacy-differential.ts";
import { createTmpdirDifferential, frozenFilesystemLegacyGate, legacyScenarios } from "./legacy-differential.ts";
import { expect } from "./tool-fixtures.ts";

const RESOURCE_ANCHOR = "docs/architecture/core/__meta_gate_differential.md";
const CATALOG = "docs/catalog/catalog.json";

const exactFinding: Label = (finding) => JSON.stringify({ file: finding.file, line: finding.line, token: finding.token ?? null, message: finding.message });

interface FindingIdentity {
  readonly file: string;
  readonly line: number;
  readonly token: string | null;
  readonly message: string;
}

interface MetaGateConversionOptions {
  readonly scratch: string;
  readonly base: string;
  readonly legacyPath: string;
  readonly policy: GatePolicy;
  readonly expectedRows: { readonly mustFlag: number; readonly mustPass: number };
  /** RETIRED ROWS (#2359): frozen-legacy row indices (0-based, per array) to EXCLUDE from the parity replay
   *  — for a capability deliberately retired post-conversion and superseded by a different, stronger
   *  mechanism, so the frozen legacy fixture no longer has a live final-side counterpart to agree with.
   *  Defaults to nothing excluded, so every other caller is byte-identical. The function asserts the
   *  number of rows it actually skipped equals this list's total length, so a stale or out-of-range index
   *  cannot silently exclude zero rows. */
  readonly retiredRows?: { readonly mustFlag?: readonly number[]; readonly mustPass?: readonly number[] };
  /** MESSAGE DELTA (#2359): a named transform applied to the frozen LEGACY message text before the
   *  parent-to-final identity comparison — never to the final side. A live descriptor message that keeps
   *  describing a retired arm is a drifted-diagnostic defect, so the message is allowed to legitimately
   *  change at retirement; this hook lets the differential compare the RETIREMENT rather than being fed
   *  the stale sentence as if it were still true. Defaults to identity (no other caller is affected). The
   *  function asserts the transform actually changes the frozen legacy message, so a sentence that drifts
   *  out from under the transform reds instead of silently degrading to a no-op. */
  readonly legacyMessageTransform?: (message: string) => string;
}

function findingIdentities(labels: readonly string[]): readonly FindingIdentity[] {
  return labels.map((label) => JSON.parse(label) as FindingIdentity);
}

function normalizedAnchors(labels: readonly string[], transformMessage: (message: string) => string = (message) => message): readonly string[] {
  return findingIdentities(labels)
    .map((finding) => JSON.stringify({ ...finding, line: Math.max(1, finding.line), message: transformMessage(finding.message) }))
    .toSorted();
}

function resourceCompletion(files: Files, policyId: string): Files {
  const documents = [...new Set([...Object.keys(files).filter((path) => path.startsWith("docs/") && path.endsWith(".md")), RESOURCE_ANCHOR])].toSorted();
  const gateAnchor =
    policyId === "gate-modernization"
      ? {
          "tooling/src/verify/gates/__meta_differential_anchor.ts":
            'export const gate = { name: "__meta_differential_anchor", docRow: "x", message: "m", mustFlag: [1], mustPass: [1] };\n',
        }
      : {};
  return {
    ...files,
    ...gateAnchor,
    [RESOURCE_ANCHOR]: "# Meta-gate differential resource anchor\n",
    [CATALOG]: `${JSON.stringify({ documents: documents.map((path) => ({ path })) })}\n`,
  };
}

function expectedResourceSubjects(files: Files): readonly string[] {
  return Object.keys(files)
    .filter((path) => path === CATALOG || (path.startsWith("docs/") && path.endsWith(".md")))
    .toSorted((left, right) => left.localeCompare(right));
}

function expectedFinalSourcePopulation(files: Files): number {
  return Object.keys(files).filter((path) => /^tooling\/src\/verify\/gates\/[^/]+[.]ts$/u.test(path) && !path.endsWith(".d.ts")).length;
}

/** Is this combined mustFlag/mustPass example index one of the retired rows? Extracted so the skip check
 *  reads once at the call site instead of repeating the mustFlag/mustPass split inline in the loop body. */
function isRetiredExample(index: number, mustFlagCount: number, retiredMustFlag: ReadonlySet<number>, retiredMustPass: ReadonlySet<number>): boolean {
  return index < mustFlagCount ? retiredMustFlag.has(index) : retiredMustPass.has(index - mustFlagCount);
}

interface RowParityArgs {
  readonly differential: TmpdirDifferential;
  readonly legacy: GateDescriptor;
  readonly policy: GatePolicy;
  readonly row: { readonly why?: string } | undefined;
  readonly original: Files;
  readonly index: number;
  readonly mustFlagCount: number;
  readonly transformLegacyMessage: (message: string) => string;
}

/** One frozen row's parent-to-final parity assertions, extracted from the loop body purely to keep the
 *  driver function's cognitive complexity under the house ceiling — no behavior moved, only the call site. */
function assertRowParity({ differential, legacy, policy, row, original, index, mustFlagCount, transformLegacyMessage }: RowParityArgs): void {
  const tag = `${policy.id} ${index < mustFlagCount ? "mustFlag" : "mustPass"}[${String(index < mustFlagCount ? index : index - mustFlagCount)}] — ${
    row?.why ?? "missing row"
  }`;
  const files = resourceCompletion(original, policy.id);
  const originalBefore = differential.legacyReplay(legacy, original, exactFinding);
  const before = differential.legacyReplay(legacy, files, exactFinding);
  const beforeWithoutIndex = differential.legacyReplay(legacy, files, exactFinding, { index: false });
  const after = differential.finalReplay([policy], files, exactFinding);

  expect(originalBefore.thrown, `${tag} original legacy refusal`).toBeUndefined();
  expect(before.thrown, `${tag} completed legacy refusal`).toBeUndefined();
  expect(after.thrown, `${tag} final refusal`).toBeUndefined();
  expect(originalBefore.toolErrors, `${tag} original legacy tool errors`).toEqual([]);
  expect(before.toolErrors, `${tag} completed legacy tool errors`).toEqual([]);
  expect(after.toolErrors, `${tag} final tool errors`).toEqual([]);
  expect(before.findings, `${tag} resource completion is inert on the parent`).toEqual(originalBefore.findings);
  expect(beforeWithoutIndex.findings, `${tag} the final runtime's Git index is inert on the parent`).toEqual(before.findings);
  expect(normalizedAnchors(after.findings), `${tag} exact parent-to-final identity after the required 0-to-1 coordinate floor`).toEqual(
    normalizedAnchors(before.findings, transformLegacyMessage),
  );
  const legacyZeroAnchors = findingIdentities(before.findings).filter(({ line }) => line === 0);
  expect(
    findingIdentities(after.findings).filter(({ line }) => line === 0),
    `${tag} final findings never retain legacy line zero`,
  ).toEqual([]);
  for (const legacyFinding of legacyZeroAnchors) {
    expect(findingIdentities(after.findings), `${tag} legacy line-zero finding moves to the final runtime's valid line-one anchor`).toContainEqual({
      ...legacyFinding,
      line: 1,
    });
  }
  expect(after.raw, `${tag} hard meta-policy has no hidden authority delta`).toEqual(after.findings);
  expect(after.granted, `${tag} hard meta-policy consumes no reviewed grant`).toEqual([]);
  expect(after.population, `${tag} final population is the exact loader-shaped top-level gate corpus`).toBe(expectedFinalSourcePopulation(files));
  expect(before.population, `${tag} parent fs-backed population contains the final gate corpus plus any fixture support modules`).toBeGreaterThanOrEqual(
    after.population,
  );
  expect(before.subjects, `${tag} parent owns no resource subject`).toEqual([]);
  expect(after.subjects, `${tag} final document resource subjects`).toEqual(expectedResourceSubjects(files));
  expect(before.findings.length > 0, `${tag} classification remains occupied exactly for mustFlag rows`).toBe(index < mustFlagCount);
}

/** Replay every frozen proof row through both production runtimes on identical bytes. The proof arm is the
 *  classification: mustFlag rows retain one exact non-empty catch; mustPass rows remain exact zeroes.
 *  `retiredRows`/`legacyMessageTransform` (#2359) let a caller exclude rows for a deliberately retired arm
 *  superseded by a different mechanism, and compare the RETIREMENT rather than being fed a stale message —
 *  both default to no-op, so every other caller stays byte-identical. */
export async function verifyMetaGateConversion({
  scratch,
  base,
  legacyPath,
  policy,
  expectedRows,
  retiredRows,
  legacyMessageTransform,
}: MetaGateConversionOptions): Promise<number> {
  const legacy = await frozenFilesystemLegacyGate(scratch, base, legacyPath);
  expect(legacy.mustFlag).toHaveLength(expectedRows.mustFlag);
  expect(legacy.mustPass).toHaveLength(expectedRows.mustPass);
  expect(verifyGateProofs([legacy]), "the frozen parent proof expectations remain executable").toEqual([]);

  const transformLegacyMessage = legacyMessageTransform ?? ((message: string): string => message);
  expect(
    legacyMessageTransform === undefined || transformLegacyMessage(legacy.message) !== legacy.message,
    "the legacy message transform must actually change the frozen legacy message — a drifted sentence must red, not silently no-op",
  ).toBe(true);

  const retiredMustFlag = new Set(retiredRows?.mustFlag ?? []);
  const retiredMustPass = new Set(retiredRows?.mustPass ?? []);

  const differential = createTmpdirDifferential((owner, phase, message) => `${owner}/${phase}: ${message}`);
  const examples = legacyScenarios(legacy, legacyPath);
  expect(examples).toHaveLength(expectedRows.mustFlag + expectedRows.mustPass);
  let retired = 0;
  for (const [index, original] of examples.entries()) {
    if (isRetiredExample(index, expectedRows.mustFlag, retiredMustFlag, retiredMustPass)) {
      retired += 1;
      continue;
    }
    const row = [...legacy.mustFlag, ...legacy.mustPass][index];
    assertRowParity({ differential, legacy, policy, row, original, index, mustFlagCount: expectedRows.mustFlag, transformLegacyMessage });
  }
  expect(retired, "retired-row exclusion list must match the count of rows actually skipped — a stale index excludes nothing").toBe(
    retiredMustFlag.size + retiredMustPass.size,
  );
  return examples.length;
}
