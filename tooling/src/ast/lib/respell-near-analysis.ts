// Pure Jaccard candidate analysis for `ast respell --near`.

import type { Node } from "ts-morph";
import type { SourceCorpus } from "../../_shared/ts-workspace.ts";
import { coLocatedSemanticNodes } from "../../_shared/ts-workspace.ts";
import type { NearFieldDiff, NearPairCandidate } from "../contract/types.ts";
import { declKey } from "./keys.ts";
import { exitToolError } from "./ledger.ts";
import type { AssignabilityChecker, FieldPair, ShapeEntry } from "./respell-shapes.ts";
import { assignabilityChecker, directDerivationTargetKeys, mutuallyAssignable, shapesUnder } from "./respell-shapes.ts";

export const RESPELL_NEAR_PROPERTY_FLOOR = 4;
const PCT_SCALE = 100;

interface FieldIdentity {
  readonly decl: Node;
  readonly name: string;
}

interface NearAdmission {
  readonly pct: number;
  readonly sharedCount: number;
  readonly totalFields: number;
  readonly sharedNames: ReadonlySet<string>;
}

function fieldIdentityLabel(field: FieldIdentity): string {
  return `${field.decl.getSymbol()?.getName() ?? field.decl.getKindName()}.${field.name}`;
}

/** Whether two fields are mutually assignable in every native compiler program that owns both. */
function semanticallyEqualFieldType(checker: AssignabilityChecker, leftField: FieldIdentity, rightField: FieldIdentity): boolean {
  const compare = (effectiveChecker: AssignabilityChecker, left: Node, right: Node): boolean => {
    const leftType = left.getType().getProperty(leftField.name)?.getTypeAtLocation(left).compilerType;
    const rightType = right.getType().getProperty(rightField.name)?.getTypeAtLocation(right).compilerType;
    return (
      leftType !== undefined &&
      rightType !== undefined &&
      effectiveChecker.isTypeAssignableTo(leftType, rightType) &&
      effectiveChecker.isTypeAssignableTo(rightType, leftType)
    );
  };
  const colocated = coLocatedSemanticNodes(leftField.decl, rightField.decl);
  if (colocated.length === 0) {
    if (leftField.decl.getProject() !== rightField.decl.getProject()) {
      exitToolError("ast respell --near: compared fields share no native compiler program");
    }
    return compare(checker, leftField.decl, rightField.decl);
  }
  const answers = colocated.map(({ project, left, right }) => compare(assignabilityChecker(project), left, right));
  if (new Set(answers).size !== 1) {
    const perProgram = answers.map((answer, index) => `program ${String(index + 1)}=${String(answer)}`).join(", ");
    exitToolError(
      `ast respell --near: native compiler programs disagree about field assignability for ${fieldIdentityLabel(leftField)} ↔ ${fieldIdentityLabel(rightField)} (${perProgram})`,
    );
  }
  return answers[0] === true;
}

function nameOnlyJaccardPct(domainFields: readonly FieldPair[], contractsFields: readonly FieldPair[]): number {
  const contractsNames = new Set(contractsFields.map((field) => field.name));
  const sharedCount = domainFields.filter((field) => contractsNames.has(field.name)).length;
  return (sharedCount / (domainFields.length + contractsFields.length - sharedCount)) * PCT_SCALE;
}

function nearAdmissionOf(checker: AssignabilityChecker, domainShape: ShapeEntry, contractsShape: ShapeEntry): NearAdmission {
  const { fields: domainFields, decl: domainDecl } = domainShape;
  const { fields: contractsFields, decl: contractsDecl } = contractsShape;
  const sharedNames = new Set(
    domainFields
      .filter((domainField) => {
        const contractsField = contractsFields.find((candidate) => candidate.name === domainField.name);
        return (
          contractsField !== undefined &&
          semanticallyEqualFieldType(checker, { decl: domainDecl, name: domainField.name }, { decl: contractsDecl, name: contractsField.name })
        );
      })
      .map((field) => field.name),
  );
  const sharedCount = sharedNames.size;
  const totalFields = domainFields.length + contractsFields.length - sharedCount;
  const pct = totalFields === 0 ? 0 : (sharedCount / totalFields) * PCT_SCALE;
  return { pct, sharedCount, totalFields, sharedNames };
}

function nearFieldDiffOf(checker: AssignabilityChecker, domainShape: ShapeEntry, contractsShape: ShapeEntry, admission: NearAdmission): NearFieldDiff {
  const { fields: domainFields, decl: domainDecl } = domainShape;
  const { fields: contractsFields, decl: contractsDecl } = contractsShape;
  const { pct, sharedCount, totalFields, sharedNames } = admission;
  const contractsRemainder = contractsFields.filter((field) => !sharedNames.has(field.name));
  const renamed: { from: string; to: string; type: string }[] = [];
  const domainOnly: string[] = [];
  for (const domainField of domainFields.filter((field) => !sharedNames.has(field.name))) {
    const matchAt = contractsRemainder.findIndex(
      (contractsField) =>
        contractsField.name !== domainField.name &&
        !renamed.some((rename) => rename.to === contractsField.name) &&
        semanticallyEqualFieldType(checker, { decl: domainDecl, name: domainField.name }, { decl: contractsDecl, name: contractsField.name }),
    );
    if (matchAt === -1) {
      domainOnly.push(domainField.name);
      continue;
    }
    const match = contractsRemainder[matchAt] as FieldPair;
    renamed.push({ from: domainField.name, to: match.name, type: domainField.type });
  }
  const renamedTo = new Set(renamed.map((rename) => rename.to));
  const contractsOnly = contractsRemainder.filter((field) => !renamedTo.has(field.name)).map((field) => field.name);
  return { pct, sharedCount, totalFields, renamed, domainOnly, contractsOnly };
}

interface NearPairScope {
  readonly checker: AssignabilityChecker;
  readonly domain: string;
  readonly thresholdPct: number;
  readonly derivedFrom: ReadonlySet<string>;
  readonly domainShape: ShapeEntry;
  readonly twin: ShapeEntry;
}

function nearCandidateForPair(scope: NearPairScope): NearPairCandidate | undefined {
  const { checker, domain, thresholdPct, derivedFrom, domainShape, twin } = scope;
  let candidate: NearPairCandidate | undefined;
  const belowNameBound = nameOnlyJaccardPct(domainShape.fields, twin.fields) < thresholdPct;
  if (!(derivedFrom.has(declKey(twin.decl)) || belowNameBound)) {
    const exact = twin.signature === domainShape.signature && mutuallyAssignable(checker, domainShape.decl, twin.decl);
    if (!exact) {
      const admission = nearAdmissionOf(checker, domainShape, twin);
      if (admission.pct >= thresholdPct) {
        candidate = {
          domain,
          domainName: domainShape.name,
          domainDecl: domainShape.decl,
          contractsName: twin.name,
          contractsDecl: twin.decl,
          diff: nearFieldDiffOf(checker, domainShape, twin, admission),
        };
      }
    }
  }
  return candidate;
}

/** One domain's near-tier candidates, excluding exact/derived matches and shapes below the field floor. */
export function respellNearCandidatesFor(project: SourceCorpus, checker: AssignabilityChecker, domain: string, thresholdPct: number): NearPairCandidate[] {
  const contractsShapes = shapesUnder(project, `/packages/contracts/src/${domain}/`).filter((shape) => shape.fields.length >= RESPELL_NEAR_PROPERTY_FLOOR);
  if (contractsShapes.length === 0) {
    return [];
  }
  const out: NearPairCandidate[] = [];
  for (const domainShape of shapesUnder(project, `/packages/server/src/domain/${domain}/contract/`)) {
    if (domainShape.fields.length < RESPELL_NEAR_PROPERTY_FLOOR) {
      continue;
    }
    const derivedFrom = directDerivationTargetKeys(domainShape.decl);
    for (const twin of contractsShapes) {
      const candidate = nearCandidateForPair({ checker, domain, thresholdPct, derivedFrom, domainShape, twin });
      if (candidate !== undefined) {
        out.push(candidate);
      }
    }
  }
  return out;
}
