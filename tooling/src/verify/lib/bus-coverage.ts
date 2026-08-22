// Shared producer-coverage reconcile for the per-bus emit-coverage ratchets (ledger D50 + its twins).
// A bus's event union is compile-exhaustive on the CONSUMER side (the client's total map), but nothing
// machine-checks the PRODUCER side — a member can be declared, replay-guarded/reduced, and never emitted
// (silently dead wire). Each bus's thin gate (tooling/src/verify/gates/{bus-coverage,user-bus-coverage}.ts)
// supplies a `BusCoverageSpec`; THIS module owns the ONE reconcile so a new bus is a spec, not a third
// copy of the belt logic (derive, not re-declare — docs/architecture/core/AGENTS.md §0.1.2 /
// lock-the-extensible-shape). Two shapes of `*_EVENT_TYPES` belt are supported: an object literal
// (`{ delta: true, … } satisfies Record<X["type"], true>` — chat/user) and an array literal
// (`[…] as const satisfies readonly X["type"][]` — the array-shape twin, currently unused).
import type { Project, SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { Violation } from "../contract/harness.ts";
import type { BusCoverageSpec } from "../contract/readers.ts";

/** The DEFAULT server tiers where a bus event's discriminator must appear as an emit literal: the two tiers
 *  that own business writes. `entry/compose` is excluded on purpose — the user-bus survey's ruling (§1.2):
 *  the ratchet quantifies VERB-side emits, and counting the composition root would let a member whose only
 *  producer is a compose-side wrapper read as covered while every domain writer stayed silent. A bus with a
 *  LEGITIMATE composition-root producer overrides it per spec (see `BusCoverageSpec.emitScope`). */
const DEFAULT_EMIT_SCOPE = /\/packages\/server\/src\/(?:domain|transport)\//u;
/** Parse the discriminator keys out of the belt const, per the bus's `keyShape`. Vacuous ([]) when the
 *  const / its literal isn't present (a synthetic or placeholder tree). */
function busEventKeys(contracts: SourceFile, spec: BusCoverageSpec): string[] {
  const decl = contracts.getVariableDeclaration(spec.typesConst);
  if (decl === undefined) {
    return [];
  }
  if (spec.keyShape === "object") {
    const obj = decl.getFirstDescendantByKind(SyntaxKind.ObjectLiteralExpression);
    if (obj === undefined) {
      return [];
    }
    return obj.getProperties().flatMap((p) => (p.isKind(SyntaxKind.PropertyAssignment) ? [p.getName()] : []));
  }
  const arr = decl.getFirstDescendantByKind(SyntaxKind.ArrayLiteralExpression);
  if (arr === undefined) {
    return [];
  }
  return arr
    .getElements()
    .flatMap((el) => (el.isKind(SyntaxKind.StringLiteral) || el.isKind(SyntaxKind.NoSubstitutionTemplateLiteral) ? [el.getLiteralText()] : []));
}

/** Every string-ish literal in the server emit scope, concatenated (comments excluded) — the emit corpus. */
function literalCorpus(project: Project, emitScope: RegExp): string {
  const parts: string[] = [];
  for (const sf of project.getSourceFiles()) {
    if (!emitScope.test(sf.getFilePath())) {
      continue;
    }
    for (const kind of [SyntaxKind.StringLiteral, SyntaxKind.NoSubstitutionTemplateLiteral] as const) {
      for (const lit of sf.getDescendantsOfKind(kind)) {
        parts.push(lit.getLiteralText());
      }
    }
  }
  return ` ${parts.join(" ")} `;
}

/** The whole-tree reconciliation: every belt key must be emitted (in the server literal corpus) OR
 *  DEFERRED; a DEFERRED-and-emitted key is a stale entry. Vacuous when the contracts file / belt isn't
 *  loaded (a placeholder tree). */
export function reconcileBusCoverage(project: Project, spec: BusCoverageSpec): Violation[] {
  const contracts = project.getSourceFiles().find((sf) => spec.contractsFile.test(sf.getFilePath()));
  if (contracts === undefined) {
    return []; // contracts not in the project (placeholder tree) — vacuous
  }
  const keys = busEventKeys(contracts, spec);
  if (keys.length === 0) {
    return []; // the union/belt hasn't landed — vacuous
  }
  const corpus = literalCorpus(project, spec.emitScope ?? DEFAULT_EMIT_SCOPE);
  const violations: Violation[] = [];
  for (const key of keys) {
    const emitted = corpus.includes(` ${key} `);
    const deferred = key in spec.deferred;
    if (!(emitted || deferred)) {
      violations.push({ file: spec.reportFile, line: 1, message: spec.missingPrefix + key });
    }
    if (emitted && deferred) {
      violations.push({ file: spec.reportFile, line: 1, message: spec.stalePrefix + key });
    }
  }
  return violations;
}
