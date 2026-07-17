// Gate: bus-coverage (ledger D50) — the ChatBusEvent emit-coverage ratchet. The union is
// compile-exhaustive on the CONSUMER side, but nothing checked the PRODUCER side — a member can be
// declared, replay-guarded, reduced, and never emitted (silently dead wire). Every discriminator in
// `CHAT_BUS_EVENT_TYPES` must have a server-side emit site OR a cited DEFERRED entry. DEFERRED is a
// ratchet, self-cleaning in both directions (a lost emit site or a gained one on a deferred member is RED).
import type { Project, SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";
import type { Violation } from "../harness.ts";

const CONTRACTS_CHAT = /\/packages\/contracts\/src\/chat\/index\.ts$/u;
const EMIT_SCOPE = /\/packages\/server\/src\/(?:domain|transport)\//u;
const TYPES_CONST = "CHAT_BUS_EVENT_TYPES";

/** Declared-not-emitted members, each with its tracked citation. Delete an entry the moment its
 *  emit site lands (the gate flags a stale entry). */
const DEFERRED: Record<string, string> = {
  expression:
    "classify emit site unbuilt — the member rides the baseline (union↔chat_events CHECK mirror); the emit lands with expressions E3 (expressions-design/02 §4; the chatOpened precedent)",
};

const MISSING_MESSAGE_PREFIX =
  "ChatBusEvent member has NO server emit site and no DEFERRED entry — a declared-never-emitted bus member is silently dead wire (D50 — see Core-Laws-and-Precedents.md §7 D50). Wire the emit or add a cited DEFERRED entry: ";
const STALE_MESSAGE_PREFIX = "DEFERRED bus member now HAS an emit site — delete its stale allowlist entry in bus-coverage.ts: ";

/** Parse the discriminator keys out of the CHAT_BUS_EVENT_TYPES object literal (the one home). */
function busEventTypes(contracts: SourceFile): string[] {
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
    for (const kind of [SyntaxKind.StringLiteral, SyntaxKind.NoSubstitutionTemplateLiteral] as const) {
      for (const lit of sf.getDescendantsOfKind(kind)) {
        parts.push(lit.getLiteralText());
      }
    }
  }
  return ` ${parts.join(" ")} `;
}

/** The whole-tree reconciliation shared by the legacy Check and the single-pass `run` descriptor:
 *  every CHAT_BUS_EVENT_TYPES key must be emitted (in the server literal corpus) OR DEFERRED; a
 *  DEFERRED-and-emitted key is a stale entry. Vacuous when the contracts file / union isn't loaded. */
function reconcileBusCoverage(project: Project): Violation[] {
  const contracts = project.getSourceFiles().find((sf) => CONTRACTS_CHAT.test(sf.getFilePath()));
  if (contracts === undefined) {
    return []; // contracts not in the project (placeholder tree) — vacuous
  }
  const keys = busEventTypes(contracts);
  if (keys.length === 0) {
    return []; // the union hasn't landed — vacuous
  }
  const corpus = literalCorpus(project);
  const violations: Violation[] = [];
  const file = "packages/contracts/src/chat/index.ts";
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
}

export const gate: GateDescriptor = {
  name: "bus-coverage",
  docRow: "ledger D50 (Core-Laws-and-Precedents.md §7 D50)",
  status: "active",
  scopeSafety: "whole-project",
  message: MISSING_MESSAGE_PREFIX,
  fix: "wire the server emit site for the bus member, or add a cited DEFERRED entry in bus-coverage.ts.",
  run: (ctx) => {
    for (const v of reconcileBusCoverage(ctx.project)) {
      ctx.report({ file: v.file, line: v.line, column: 0, message: v.message });
    }
  },
  mustFlag: [
    {
      files: {
        "packages/contracts/src/chat/index.ts": 'export const CHAT_BUS_EVENT_TYPES = { neverEmitted: "neverEmitted" } as const;\n',
        "packages/server/src/domain/chat/x.ts": 'export const q = "somethingElse";\n',
      },
      expect: { messageIncludes: "NO server emit site" },
      why: "a CHAT_BUS_EVENT_TYPES member with no server emit site + no DEFERRED entry — silent dead wire",
    },
  ],
  mustPass: [
    {
      files: {
        "packages/contracts/src/chat/index.ts": 'export const CHAT_BUS_EVENT_TYPES = { emitted: "emitted" } as const;\n',
        "packages/server/src/domain/chat/x.ts": 'export const q = "emitted";\n',
      },
      why: "the member's discriminator appears as a server emit literal — covered, passes",
    },
    {
      files: {
        "packages/contracts/src/chat/index.ts": 'export const CHAT_BUS_EVENT_TYPES = { expression: "expression" } as const;\n',
        "packages/server/src/domain/chat/x.ts": 'export const q = "somethingElse";\n',
      },
      why: "a member with NO emit site but a DEFERRED entry present (expression) — the deferred-covers-it branch, passes",
    },
  ],
};
