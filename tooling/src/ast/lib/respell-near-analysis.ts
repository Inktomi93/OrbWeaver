// Pure Jaccard candidate analysis for `ast respell --near`.

import { Node } from "ts-morph";
import type { AssignabilityChecker, AssignabilityRefusalKind, FieldIdentity, RefuseAssignability } from "../../floor/code-facts/assignability.ts";
import { fieldTypesAgree } from "../../floor/code-facts/assignability.ts";
import { inventoryDeclarationKey } from "../../floor/code-facts/semantic-inventory-reader.ts";
import { directDerivationTargetKeys } from "../../floor/code-facts/shape-derivation.ts";
import { shapeFactsOf } from "../../floor/code-facts/shape-facts.ts";
import { collectingShapeQueries } from "../../floor/code-facts/shape-inventory-scope.ts";
import type { SourceCorpus } from "../../floor/compiler/ts-workspace.ts";
import type { NearFieldDiff, NearPairCandidate } from "../contract/types.ts";
import { exitToolError } from "./ledger.ts";
import type { FieldPair, ShapeEntry } from "./respell-shapes.ts";
import { mutuallyAssignable, PRIMITIVE_ABSENT, shapesUnder } from "./respell-shapes.ts";

export const RESPELL_NEAR_PROPERTY_FLOOR = 4;
const PCT_SCALE = 100;

interface NearAdmission {
  readonly pct: number;
  readonly sharedCount: number;
  readonly totalFields: number;
  readonly sharedNames: ReadonlySet<string>;
}

function fieldIdentityLabel(field: FieldIdentity): string {
  return `${(Node.hasName(field.decl) ? field.decl.getName() : undefined) ?? field.decl.getKindName()}.${field.name}`;
}

/** Whether two fields are mutually assignable in every native compiler program that owns both. */
function semanticallyEqualFieldType(checker: AssignabilityChecker | undefined, leftField: FieldIdentity, rightField: FieldIdentity): boolean {
  const refuse: RefuseAssignability = (kind, answers) => {
    const perProgram = answers.map((answer, index) => `program ${String(index + 1)}=${String(answer)}`).join(", ");
    const messages: Readonly<Record<AssignabilityRefusalKind, string>> = {
      "primitive-absent": PRIMITIVE_ABSENT,
      "no-shared-program": "ast respell --near: compared fields share no native compiler program",
      "programs-disagree": `ast respell --near: native compiler programs disagree about field assignability for ${fieldIdentityLabel(leftField)} ↔ ${fieldIdentityLabel(rightField)} (${perProgram})`,
    };
    return exitToolError(messages[kind]);
  };
  return fieldTypesAgree({ ...(checker === undefined ? {} : { checker }), refuse }, leftField, rightField);
}

function nameOnlyJaccardPct(domainFields: readonly FieldPair[], contractsFields: readonly FieldPair[]): number {
  const contractsNames = new Set(contractsFields.map((field) => field.name));
  const sharedCount = domainFields.filter((field) => contractsNames.has(field.name)).length;
  return (sharedCount / (domainFields.length + contractsFields.length - sharedCount)) * PCT_SCALE;
}

function nearAdmissionOf(checker: AssignabilityChecker | undefined, domainShape: ShapeEntry, contractsShape: ShapeEntry): NearAdmission {
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

function nearFieldDiffOf(
  checker: AssignabilityChecker | undefined,
  domainShape: ShapeEntry,
  contractsShape: ShapeEntry,
  admission: NearAdmission,
): NearFieldDiff {
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
  readonly checker: AssignabilityChecker | undefined;
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
  if (!(derivedFrom.has(inventoryDeclarationKey(twin.decl)) || belowNameBound)) {
    const exact = twin.signature === domainShape.signature && mutuallyAssignable(checker, domainShape.decl, twin.decl);
    if (!exact) {
      const admission = nearAdmissionOf(checker, domainShape, twin);
      if (admission.pct >= thresholdPct || collectingShapeQueries(shapeFactsOf(domainShape.decl))) {
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
export function respellNearCandidatesFor(
  project: SourceCorpus,
  checker: AssignabilityChecker | undefined,
  domain: string,
  thresholdPct: number,
): NearPairCandidate[] {
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
