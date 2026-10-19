// Pure Jaccard candidate analysis for `ast respell --near`.

import { Node } from "ts-morph";
import type { AssignabilityChecker, AssignabilityRefusalKind, FieldIdentity, RefuseAssignability } from "../../floor/code-facts/assignability.ts";
import { fieldTypesAgree } from "../../floor/code-facts/assignability.ts";
import { compareShapeFields, sharedFieldNames } from "../../floor/code-facts/shape-copy.ts";
import { shapeFactsOf } from "../../floor/code-facts/shape-facts.ts";
import { collectingShapeQueries } from "../../floor/code-facts/shape-inventory-scope.ts";
import type { SourceCorpus } from "../../floor/compiler/ts-workspace.ts";
import type { NearFieldDiff, NearPairCandidate } from "../contract/types.ts";
import { exitToolError } from "./ledger.ts";
import type { ShapeEntry } from "./respell-shapes.ts";
import { exactTierResolves, PRIMITIVE_ABSENT, shapesUnder } from "./respell-shapes.ts";

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

function nameOnlyJaccardPct(domainShape: ShapeEntry, contractsShape: ShapeEntry): number {
  const sharedCount = sharedFieldNames(domainShape.names, contractsShape.names).length;
  return (sharedCount / (domainShape.names.size + contractsShape.names.size - sharedCount)) * PCT_SCALE;
}

function nearAdmissionOf(checker: AssignabilityChecker | undefined, domainShape: ShapeEntry, contractsShape: ShapeEntry): NearAdmission {
  const comparison = compareShapeFields(
    { decl: domainShape.decl, fields: domainShape.names },
    { decl: contractsShape.decl, fields: contractsShape.names },
    (domainDecl, contractsDecl, name) => semanticallyEqualFieldType(checker, { decl: domainDecl, name }, { decl: contractsDecl, name }),
  );
  const sharedNames = new Set(comparison.agreeing);
  const sharedCount = sharedNames.size;
  const totalFields = domainShape.names.size + contractsShape.names.size - sharedCount;
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
  const contractsRemainder = contractsFields.filter((field) => !sharedNames.has(field));
  const renamed: { from: string; to: string }[] = [];
  const domainOnly: string[] = [];
  for (const domainField of domainFields.filter((field) => !sharedNames.has(field))) {
    const match = contractsRemainder.find(
      (contractsField) =>
        contractsField !== domainField &&
        !renamed.some((rename) => rename.to === contractsField) &&
        semanticallyEqualFieldType(checker, { decl: domainDecl, name: domainField }, { decl: contractsDecl, name: contractsField }),
    );
    if (match === undefined) {
      domainOnly.push(domainField);
      continue;
    }
    renamed.push({ from: domainField, to: match });
  }
  const renamedTo = new Set(renamed.map((rename) => rename.to));
  const contractsOnly = contractsRemainder.filter((field) => !renamedTo.has(field));
  return { pct, sharedCount, totalFields, renamed, domainOnly, contractsOnly };
}

interface NearPairScope {
  readonly checker: AssignabilityChecker | undefined;
  readonly domain: string;
  readonly thresholdPct: number;
  readonly domainShape: ShapeEntry;
  readonly twin: ShapeEntry;
}

function nearCandidateForPair(scope: NearPairScope): NearPairCandidate | undefined {
  const { checker, domain, thresholdPct, domainShape, twin } = scope;
  let candidate: NearPairCandidate | undefined;
  // The name-only bound asks the checker nothing, so it runs before the exact tier's verdict.
  if (nameOnlyJaccardPct(domainShape, twin) >= thresholdPct && exactTierResolves(checker, domainShape, twin) === "distinct") {
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
    for (const twin of contractsShapes) {
      const candidate = nearCandidateForPair({ checker, domain, thresholdPct, domainShape, twin });
      if (candidate !== undefined) {
        out.push(candidate);
      }
    }
  }
  return out;
}
