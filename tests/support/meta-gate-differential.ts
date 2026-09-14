import type { GatePolicy } from "../../tooling/src/verify/contract/policy.ts";
import { verifyGateProofs } from "../../tooling/src/verify/ops/conformance.ts";
import type { Files, Label } from "./legacy-differential.ts";
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
}

function findingIdentities(labels: readonly string[]): readonly FindingIdentity[] {
  return labels.map((label) => JSON.parse(label) as FindingIdentity);
}

function normalizedAnchors(labels: readonly string[]): readonly string[] {
  return findingIdentities(labels)
    .map((finding) => JSON.stringify({ ...finding, line: Math.max(1, finding.line) }))
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

/** Replay every frozen proof row through both production runtimes on identical bytes. The proof arm is the
 *  classification: mustFlag rows retain one exact non-empty catch; mustPass rows remain exact zeroes. */
export async function verifyMetaGateConversion({ scratch, base, legacyPath, policy, expectedRows }: MetaGateConversionOptions): Promise<number> {
  const legacy = await frozenFilesystemLegacyGate(scratch, base, legacyPath);
  expect(legacy.mustFlag).toHaveLength(expectedRows.mustFlag);
  expect(legacy.mustPass).toHaveLength(expectedRows.mustPass);
  expect(verifyGateProofs([legacy]), "the frozen parent proof expectations remain executable").toEqual([]);

  const differential = createTmpdirDifferential((owner, phase, message) => `${owner}/${phase}: ${message}`);
  const examples = legacyScenarios(legacy, legacyPath);
  expect(examples).toHaveLength(expectedRows.mustFlag + expectedRows.mustPass);
  for (const [index, original] of examples.entries()) {
    const row = [...legacy.mustFlag, ...legacy.mustPass][index];
    const tag = `${policy.id} ${index < expectedRows.mustFlag ? "mustFlag" : "mustPass"}[${String(
      index < expectedRows.mustFlag ? index : index - expectedRows.mustFlag,
    )}] — ${row?.why ?? "missing row"}`;
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
      normalizedAnchors(before.findings),
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
    expect(before.findings.length > 0, `${tag} classification remains occupied exactly for mustFlag rows`).toBe(index < expectedRows.mustFlag);
  }
  return examples.length;
}
