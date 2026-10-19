// Shared shape discovery and exact structural analysis for the respell command.

import type { Node, Project } from "ts-morph";
import type { AssignabilityChecker, AssignabilityRefusalKind } from "../../floor/code-facts/assignability.ts";
import { readAssignabilityChecker } from "../../floor/code-facts/assignability.ts";
import { shapesIdentical } from "../../floor/code-facts/shape-copy.ts";
import { shapeDerivesFrom } from "../../floor/code-facts/shape-derivation.ts";
import { readShapeFields } from "../../floor/code-facts/shape-facts.ts";
import type { ShapeField as FieldPair } from "../../floor/code-facts/shape-fields.ts";
import type { SourceCorpus } from "../../floor/compiler/ts-workspace.ts";
import type { Hit } from "../contract/types.ts";
import { hitOf } from "./emit.ts";
import { exitToolError } from "./ledger.ts";
import { TEST_FILE_RE } from "./root.ts";
import { ownExports } from "./scope.ts";

/** How many properties a shape needs before an exact structural match means anything. */
export const RESPELL_PROPERTY_FLOOR = 3;

export type { ShapeField as FieldPair } from "../../floor/code-facts/shape-fields.ts";

export interface ShapeEntry {
  readonly name: string;
  readonly decl: Node;
  readonly signature: string;
  readonly names: ReadonlySet<string>;
  readonly fields: readonly FieldPair[];
}

/** The tool error for a TypeScript build without the assignability primitive. */
export const PRIMITIVE_ABSENT =
  "ast respell: this TypeScript build exposes no `checker.isTypeAssignableTo` (a TS internal this lens depends on) — the comparison cannot run. Re-verify the API after a TypeScript bump; tooling/src/floor/code-facts/assignability.ts.";

/** The checker's assignability primitive, resolved once. Its ABSENCE is a tool error (exit 2), never a silent
 *  zero — a lens that quietly stops comparing is worse than no lens. */
export function assignabilityChecker(project: Pick<Project, "getTypeChecker">): AssignabilityChecker {
  const checker = readAssignabilityChecker(project.getTypeChecker());
  if (checker === undefined) {
    exitToolError(PRIMITIVE_ABSENT);
  }
  return checker;
}

const DECLARATION_REFUSALS: Readonly<Record<AssignabilityRefusalKind, string>> = {
  "primitive-absent": PRIMITIVE_ABSENT,
  "no-shared-program": "ast respell: compared declarations share no native compiler program",
  "programs-disagree": "ast respell: native compiler programs disagree about declaration assignability",
};

function refuseDeclarationComparison(kind: AssignabilityRefusalKind): never {
  return exitToolError(DECLARATION_REFUSALS[kind]);
}

const RESPELL_PAIR_VERDICTS = ["derived", "identical", "distinct"] as const;
type RespellPairVerdict = (typeof RESPELL_PAIR_VERDICTS)[number];

/** The exact tier's pair verdict, shared by `--near` so it excludes exactly what this tier reports or exempts.
 *  Identity is the floor comparer's: the same field names and mutual assignability, never alias-sensitive type text. */
export function exactTierResolves(checker: AssignabilityChecker | undefined, domainShape: ShapeEntry, twin: ShapeEntry): RespellPairVerdict {
  if (shapeDerivesFrom(domainShape.decl, twin.decl)) {
    return "derived";
  }
  const context = { ...(checker === undefined ? {} : { checker }), refuse: refuseDeclarationComparison };
  return shapesIdentical(context, { decl: domainShape.decl, fields: domainShape.names }, { decl: twin.decl, fields: twin.names }) ? "identical" : "distinct";
}

/** Every exported declaration of the files under `prefix` that HAS a shape signature. */
export function shapesUnder(project: SourceCorpus, prefix: string): ShapeEntry[] {
  const out: ShapeEntry[] = [];
  for (const sf of project.getSourceFiles()) {
    const fp = sf.getFilePath();
    if (!fp.includes(prefix) || TEST_FILE_RE.test(fp)) {
      continue;
    }
    for (const { name, decl } of ownExports(sf)) {
      const discovered = readShapeFields(decl, "respell");
      const fields =
        discovered !== undefined && discovered.length >= RESPELL_PROPERTY_FLOOR
          ? discovered.map((property) => ({ name: property.name, type: property.type }))
          : undefined;
      if (fields !== undefined) {
        const signature = fields
          .map((field) => field.name)
          .sort((left, right) => left.localeCompare(right))
          .join("|");
        out.push({ name, decl, signature, names: new Set(fields.map((field) => field.name)), fields });
      }
    }
  }
  return out;
}

const DOMAIN_CONTRACT_DIR_RE = /\/packages\/server\/src\/domain\/(?<domain>[^/]+)\/contract\//u;

/** Domain dirs under `packages/server/src/domain/` that have a `contract/`, filtered by an optional arg. */
export function domainsWithContracts(project: SourceCorpus, arg: string): string[] {
  const found = new Set<string>();
  for (const sf of project.getSourceFiles()) {
    const domain = DOMAIN_CONTRACT_DIR_RE.exec(sf.getFilePath())?.groups?.["domain"];
    if (domain !== undefined && (arg === "" || domain === arg)) {
      found.add(domain);
    }
  }
  return [...found].sort();
}

/** ONE domain's structural twins, excluding aliases with the same direct target or resolved generic
 *  `typeof` provenance because those already derive from the shared declaration. */
export function respellHitsFor(project: SourceCorpus, checker: AssignabilityChecker | undefined, domain: string): Hit[] {
  const contractsShapes = shapesUnder(project, `/packages/contracts/src/${domain}/`);
  if (contractsShapes.length === 0) {
    return [];
  }
  const bySignature = new Map<string, ShapeEntry[]>();
  for (const shape of contractsShapes) {
    bySignature.set(shape.signature, [...(bySignature.get(shape.signature) ?? []), shape]);
  }
  const hits: Hit[] = [];
  for (const domainShape of shapesUnder(project, `/packages/server/src/domain/${domain}/contract/`)) {
    for (const twin of bySignature.get(domainShape.signature) ?? []) {
      if (exactTierResolves(checker, domainShape, twin) !== "identical") {
        continue;
      }
      const hit = hitOf(domainShape.decl, domainShape.name === twin.name ? "respell-same-name" : "respell-renamed");
      hit.text = `${domainShape.name}  ≡  @orb/contracts/${domain}::${twin.name}`;
      hits.push(hit);
    }
  }
  return hits;
}
