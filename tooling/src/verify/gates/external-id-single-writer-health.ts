// Gate: external-id-single-writer-health — the WHOLE-POPULATION half of the `external-id-single-writer`
// family (Spine-Identity-and-Auth.md U1). `external-id-single-writer.ts` judges each file's own writes;
// this sibling proves the carve-out ITSELF is still earned: each of the two sanctioned files must still
// contain an externalId write (a dead carve-out is RED — GATE-AUTHORING.md §4.4a mode A), and
// link-external-id.ts must still call the one atomic claim writer (mode A for the caller half). Both
// checks only fire when their target file is actually present in this run's resolved population — a
// narrower request that never reaches these files is not a stale claim, so `execution: "entire-population"`
// (not a runtime scope flag, which the final context does not expose) is what keeps a real narrow run from
// silently deferring rather than false-alarming: a request smaller than the full population defers this
// policy entirely (policy-pass.ts), so it only ever judges a COMPLETE view of `@backend`.
//
// The tiny detection predicates below are a DELIBERATE COPY of the sibling's, not an import: the two
// modules are the family's whole membership, each is a self-contained proof, and there is no third
// consumer that would justify a new shared-lib home for four one-line node-shape checks (GATE-AUTHORING.md
// "a unique policy algorithm may live in verify/lib" — reserved for primitives more than one FAMILY needs).
// COMMENT POSTURE: comment-SAFE — pure node-kind subscription, no file text is matched.
import type { Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { unwrapExpression } from "../lib/ast-read.ts";

const KEYS: ReadonlySet<string> = new Set(["externalId", "external_id"]);
const WRITE_VERBS: ReadonlySet<string> = new Set(["insertUser", "updateUser", "set", "values", "onConflictDoUpdate"]);
const SESSIONS = "packages/server/src/domain/sessions/";
const LINK_CAPABILITY = `${SESSIONS}verbs/link-external-id.ts`;
const PROVISION_CAPABILITY = `${SESSIONS}verbs/provision-identity.ts`;
const CLAIM_WRITER = "claimExternalIdIfUnbound";
/** The two physical externalId writers. Named individually so a stale finding can name the dead one. */
const SANCTIONED_FILES = [PROVISION_CAPABILITY, `${SESSIONS}persistence/users.ts`] as const;

const STALE_PREFIX =
  "stale sanctioned-writer — this file no longer writes `users.externalId`, so its carve-out is dead (either the U1 detector broke, or the writer moved — ratchet down / re-point): ";
const LINK_STALE = `${LINK_CAPABILITY} no longer calls ${CLAIM_WRITER} — the U1 admin link capability lost its atomic writer, or the writer was renamed`;

function calleeName(call: Node): string | undefined {
  if (!call.isKind(SyntaxKind.CallExpression)) {
    return;
  }
  const callee = call.getExpression();
  if (callee.isKind(SyntaxKind.PropertyAccessExpression)) {
    return callee.getName();
  }
  return callee.isKind(SyntaxKind.Identifier) ? callee.getText() : undefined;
}

function isNullish(value: Node | undefined): boolean {
  if (value === undefined) {
    return false;
  }
  const inner = unwrapExpression(value);
  return inner.isKind(SyntaxKind.NullKeyword) || (inner.isKind(SyntaxKind.Identifier) && inner.getText() === "undefined");
}

function isExternalIdWriteKey(node: Node): boolean {
  if (node.isKind(SyntaxKind.PropertyAssignment)) {
    if (!KEYS.has(node.getNameNode().getText().replace(/["']/gu, "")) || isNullish(node.getInitializer())) {
      return false;
    }
  } else if (node.isKind(SyntaxKind.ShorthandPropertyAssignment)) {
    if (!KEYS.has(node.getNameNode().getText())) {
      return false;
    }
  } else {
    return false;
  }
  const enclosingCall = node.getFirstAncestorByKind(SyntaxKind.CallExpression);
  return enclosingCall !== undefined && WRITE_VERBS.has(calleeName(enclosingCall) ?? "");
}

function isExternalIdAssignment(node: Node): boolean {
  if (!node.isKind(SyntaxKind.BinaryExpression) || node.getOperatorToken().getKind() !== SyntaxKind.EqualsToken) {
    return false;
  }
  const lhs = node.getLeft();
  return lhs.isKind(SyntaxKind.PropertyAccessExpression) && KEYS.has(lhs.getName()) && !isNullish(node.getRight());
}

function isClaimWriterCall(node: Node): boolean {
  return node.isKind(SyntaxKind.CallExpression) && calleeName(node) === CLAIM_WRITER;
}

export const gate = defineGate({
  id: "external-id-single-writer-health",
  family: "external-id-single-writer",
  authority: "hard",
  severity: "error",
  population: "@backend",
  analysis: "syntax",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: "the U1 externalId single-writer carve-out no longer matches the tree it exempts (Spine-Identity-and-Auth.md).",
  fix: "if the sanctioned file genuinely stopped writing externalId, delete its row in external-id-single-writer.ts / external-id-single-writer-health.ts; if it moved, re-point the path in both files.",
  create: (ctx) => {
    const sanctionedWrites = new Set<string>();
    let linkCallsClaim = false;
    return {
      visitors: [
        {
          kinds: [SyntaxKind.PropertyAssignment, SyntaxKind.ShorthandPropertyAssignment, SyntaxKind.BinaryExpression, SyntaxKind.CallExpression],
          visit: (node, sourceFile) => {
            const rel = ctx.relativePath(sourceFile);
            if (isClaimWriterCall(node)) {
              if (rel === LINK_CAPABILITY) {
                linkCallsClaim = true;
              }
              return;
            }
            if ((isExternalIdWriteKey(node) || isExternalIdAssignment(node)) && SANCTIONED_FILES.includes(rel as (typeof SANCTIONED_FILES)[number])) {
              sanctionedWrites.add(rel);
            }
          },
        },
      ],
      evaluate: () => {
        for (const rel of SANCTIONED_FILES) {
          if (!sanctionedWrites.has(rel)) {
            ctx.report.file(rel, { line: 1, message: `${STALE_PREFIX}"${rel}"` });
          }
        }
        if (!linkCallsClaim) {
          ctx.report.file(LINK_CAPABILITY, { line: 1, message: LINK_STALE });
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "source",
      files: {
        [PROVISION_CAPABILITY]:
          "export async function bindOwnerSubject(): Promise<void> {\n  // the writer moved away; nothing here binds externalId any more\n}\n",
        "packages/server/src/domain/sessions/persistence/users.ts":
          'import { users } from "@orb/db";\nexport const claimExternalIdIfUnbound = (db: DB, id: string, sub: string) => db.update(users).set({ externalId: sub });\n',
        [LINK_CAPABILITY]:
          'import { claimExternalIdIfUnbound } from "../persistence/users.ts";\n' +
          "export async function linkExternalId(db: D, userId: U, externalId: E): Promise<void> {\n" +
          "  await claimExternalIdIfUnbound(db, userId, externalId, 0);\n" +
          "}\n",
      },
      expect: { count: 1, messageIncludes: "provision-identity.ts" },
      why: "MODE A: the sanctioned provision-identity.ts stopped writing externalId — the carve-out is dead and must announce itself, never stay silently ✓",
    },
    {
      mode: "source",
      files: {
        [PROVISION_CAPABILITY]:
          'import { claimExternalIdIfUnbound } from "../persistence/users.ts";\n' +
          "export async function bindOwnerSubject(db: D, ownerId: U, externalId: E): Promise<boolean> {\n" +
          "  const changes: { externalId?: E } = {};\n" +
          "  changes.externalId = externalId;\n" +
          "  return await claimExternalIdIfUnbound(db, ownerId, externalId, 0);\n" +
          "}\n",
        "packages/server/src/domain/sessions/persistence/users.ts":
          'import { users } from "@orb/db";\nexport const claimExternalIdIfUnbound = (db: DB, id: string, sub: string) => db.update(users).set({ externalId: sub });\n',
        [LINK_CAPABILITY]: "export async function linkExternalId(): Promise<void> {\n  // no longer calls the atomic writer\n}\n",
      },
      expect: { count: 1, messageIncludes: "no longer calls" },
      why: "MODE A for the caller half: link-external-id.ts stopped calling claimExternalIdIfUnbound — the admin link path lost its bind-once guard, and that must RED rather than read as health",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        [PROVISION_CAPABILITY]:
          'import { claimExternalIdIfUnbound } from "../persistence/users.ts";\n' +
          "export async function bindOwnerSubject(db: D, ownerId: U, externalId: E): Promise<boolean> {\n" +
          "  const changes: { externalId?: E } = {};\n" +
          "  changes.externalId = externalId;\n" +
          "  return await claimExternalIdIfUnbound(db, ownerId, externalId, 0);\n" +
          "}\n",
        "packages/server/src/domain/sessions/persistence/users.ts":
          'import { users } from "@orb/db";\nexport const claimExternalIdIfUnbound = (db: DB, id: string, sub: string) => db.update(users).set({ externalId: sub });\n',
        [LINK_CAPABILITY]:
          'import { claimExternalIdIfUnbound } from "../persistence/users.ts";\n' +
          "export async function linkExternalId(db: D, userId: U, externalId: E): Promise<void> {\n" +
          "  await claimExternalIdIfUnbound(db, userId, externalId, 0);\n" +
          "}\n",
      },
      why: "the healthy real shape: both sanctioned files still write, and the admin link capability still calls the atomic writer — no stale finding",
    },
    {
      mode: "source",
      files: {
        [PROVISION_CAPABILITY]:
          'import { claimExternalIdIfUnbound } from "../persistence/users.ts";\n' +
          "export async function bindOwnerSubject(db: D, ownerId: U, externalId: E): Promise<boolean> {\n" +
          "  const changes: { externalId?: E } = {};\n" +
          "  changes.externalId = externalId;\n" +
          "  return await claimExternalIdIfUnbound(db, ownerId, externalId, 0);\n" +
          "}\n",
        "packages/server/src/domain/sessions/persistence/users.ts":
          'import { users } from "@orb/db";\nexport const claimExternalIdIfUnbound = (db: DB, id: string, sub: string) => db.update(users).set({ externalId: sub });\n' +
          "export const read = (db: DB) => db.select({ id: 1, externalId: 2 });\n",
        [LINK_CAPABILITY]:
          'import { claimExternalIdIfUnbound } from "../persistence/users.ts";\n' +
          "export async function linkExternalId(db: D, userId: U, externalId: E): Promise<void> {\n" +
          "  await claimExternalIdIfUnbound(db, userId, externalId, 0);\n" +
          "}\n",
      },
      why: "a READ column map living beside the real write in the same sanctioned file does not count toward, or against, its carve-out — the health check reuses the exact write predicate the sibling detector uses, so a read cannot inflate the write it did not make",
    },
  ],
});
