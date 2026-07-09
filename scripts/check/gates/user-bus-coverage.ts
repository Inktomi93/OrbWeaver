// Gate: user-bus-coverage (PD user-bus lane) — the `UserBusEvent` emit-coverage RATCHET, the twin of
// `bus-coverage.ts` (ledger D50) for the per-USER bus. The union is compile-exhaustive on the CONSUMER side
// (`USER_BUS_EVENT_TYPES satisfies Record<…>`; the client `USER_BUS_FILTERS` mapped type), but nothing
// machine-checks the PRODUCER side — a member can be declared, mapped on the client, and NEVER EMITTED by a
// domain verb (silently dead wire: device B's edit never reaches device A). This gate closes that: every
// discriminator in `USER_BUS_EVENT_TYPES` (parsed from the contracts source, the one home) must have a
// server-side emit site (the discriminator string appearing in a `domain/` or `transport/` code literal —
// the verbs' `emitUserEvent(userId, { type: "…" })` calls) OR an entry in the DEFERRED map below carrying
// its citation.
//
// The DEFERRED map is a RATCHET, self-cleaning in both directions: a member that loses its emit site goes
// RED (regression), and a DEFERRED member that GAINS one goes RED too ("stale allowlist — delete the
// entry"). Today all members but `connectionsChanged` have a producer; `connectionsChanged` is DEFERRED
// (no per-user connection store exists yet — a user's connection config lives in USER SETTINGS, so
// `settingsChanged` covers it, and the model catalog is admin/global; see @orb/contracts/user-bus).
import type { SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { Check, Violation } from "../harness.ts";

const CONTRACTS_USER_BUS = /\/packages\/contracts\/src\/user-bus\/index\.ts$/u;
const EMIT_SCOPE = /\/packages\/server\/src\/(?:domain|transport)\//u;
const TYPES_CONST = "USER_BUS_EVENT_TYPES";

/** Declared-not-emitted members, each with its tracked citation. Delete an entry the moment its emit site
 *  lands (the gate flags a stale entry — the STALE arm). */
const DEFERRED: Record<string, string> = {
  connectionsChanged:
    "no per-user connection store exists — connection config lives in USER SETTINGS (settingsChanged); the model catalog is admin/global (refreshCatalog). Wire the emit when a per-user connection entity lands. See @orb/contracts/user-bus.",
};

const MISSING_MESSAGE_PREFIX =
  "UserBusEvent member has NO server emit site and no DEFERRED entry — a declared-never-emitted user-bus member is silently dead wire (a second device's write never reaches this device). Wire the verb's `emitUserEvent` or add a cited DEFERRED entry in user-bus-coverage.ts (see @orb/contracts/user-bus + packages/client/src/data/invalidation.ts): ";
const STALE_MESSAGE_PREFIX =
  "DEFERRED user-bus member now HAS an emit site — delete its stale allowlist entry in user-bus-coverage.ts (see @orb/contracts/user-bus): ";

/** Parse the discriminator keys out of the USER_BUS_EVENT_TYPES object literal (the one home). */
function userBusEventTypes(contracts: SourceFile): string[] {
  const decl = contracts.getVariableDeclaration(TYPES_CONST);
  if (decl === undefined) {
    return [];
  }
  const obj = decl.getFirstDescendantByKind(SyntaxKind.ObjectLiteralExpression);
  if (obj === undefined) {
    return [];
  }
  return obj.getProperties().flatMap((p) => {
    if (!p.isKind(SyntaxKind.PropertyAssignment)) {
      return [];
    }
    return [p.getName()];
  });
}

/** Every string-ish literal in the server emit scope, concatenated per file (comments excluded). */
function literalCorpus(project: { getSourceFiles: () => SourceFile[] }): string {
  const parts: string[] = [];
  for (const sf of project.getSourceFiles()) {
    if (!EMIT_SCOPE.test(sf.getFilePath())) {
      continue;
    }
    for (const kind of [
      SyntaxKind.StringLiteral,
      SyntaxKind.NoSubstitutionTemplateLiteral,
    ] as const) {
      for (const lit of sf.getDescendantsOfKind(kind)) {
        parts.push(lit.getLiteralText());
      }
    }
  }
  return ` ${parts.join(" ")} `;
}

export const userBusCoverage: Check = {
  name: "user-bus-coverage",
  run: ({ project }): Violation[] => {
    const contracts = project
      .getSourceFiles()
      .find((sf) => CONTRACTS_USER_BUS.test(sf.getFilePath()));
    if (contracts === undefined) {
      return []; // contracts not in the project (placeholder tree) — vacuous
    }
    const keys = userBusEventTypes(contracts);
    if (keys.length === 0) {
      return []; // the union hasn't landed — vacuous
    }
    const corpus = literalCorpus(project);
    const violations: Violation[] = [];
    const file = "packages/contracts/src/user-bus/index.ts";
    for (const key of keys) {
      const emitted = corpus.includes(` ${key} `);
      const deferred = key in DEFERRED;
      if (!(emitted || deferred)) {
        violations.push({ file, line: 1, message: MISSING_MESSAGE_PREFIX + key });
      }
      if (emitted && deferred) {
        violations.push({ file, line: 1, message: STALE_MESSAGE_PREFIX + key });
      }
    }
    return violations;
  },
};
