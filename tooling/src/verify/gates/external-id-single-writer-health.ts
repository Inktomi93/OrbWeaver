// Gate: external-id-single-writer-health — the WHOLE-POPULATION half of the `external-id-single-writer`
// family (Spine-Identity-and-Auth.md U1). `external-id-single-writer.ts` judges each file's own writes;
// this sibling proves the carve-out ITSELF is still earned: each of the two sanctioned files must still
// contain an externalId write (a dead carve-out is RED — tooling/src/verify/gates/GATE-AUTHORING.md §4.4a mode A), and
// link-external-id.ts must still call the one atomic claim writer (mode A for the caller half). Both
// checks only fire when their target file is actually present in this run's resolved population — a
// narrower request that never reaches these files is not a stale claim, so `execution: "entire-population"`
// (not a runtime scope flag, which the final context does not expose) is what keeps a real narrow run from
// silently deferring rather than false-alarming: a request smaller than the full population defers this
// policy entirely (policy-pass.ts), so it only ever judges a COMPLETE view of `@server`.
//
// FAMILY (fixed 2026-09-11, #1937): this policy and its sibling `external-id-single-writer.ts` both read
// `verify/lib/external-id-writer.ts` — the ONE shared reader for the write-shape predicate, the sanctioned
// files, and the atomic-claim-writer name. The prior conversion declared the same `family` id while each
// module carried its OWN copy of the predicate; that is a shared THEME, not a shared reader, and the design
// doc is explicit that a family means the latter (gate-runtime-standardization.md).
//
// ABSENT-SUBJECT ARM (fixed 2026-09-11, #1937): `ctx.report.file(path, …)` requires `path` to belong to
// this policy's own effective population. The prior version anchored EACH stale/link finding on the exact
// file it was ABOUT (`LINK_CAPABILITY`, a `SANCTIONED_FILES` entry) — so the one real scenario this gate
// exists to catch (the subject file itself DELETED) made the anchor throw "file is outside the effective
// population" instead of reporting red: a deleted sanctioned writer or a deleted link-external-id.ts is
// exactly a dead carve-out, and the detector must never turn that into an incomplete non-verdict. Every
// finding here anchors on `ctx.files[0]` instead (own-tables-only.ts's anchor pattern) — a file that is
// ALWAYS a member of `@server`'s resolved population when this whole-population policy runs at all, so an
// absent subject can never make the anchor itself unresolvable.
//
// POPULATION CORRECTION: reverted from the prior conversion's `@backend` to `@server`, matching the sibling
// detector's reasoning (this file's header, external-id-single-writer.ts) — no writer of this family's
// shape lives outside `packages/server/src`.
//
// AUTHORITY: `hard`, matching the sibling detector — the legacy pre-cutover descriptor carried no explicit
// authority/severity field at all (that axis did not exist in the old contract), so this is the FIRST
// explicit statement of the invariant's authority. It is deliberately "hard": the legacy gate offered no
// suppression vocabulary for a dead carve-out or a broken caller either (its `finalize` unconditionally
// reported), so `hard` preserves rather than escalates the legacy behavior.
// COMMENT POSTURE: comment-SAFE — pure node-kind subscription, no file text is matched.
// LEGACY SHA: (35bf7d328^) — the parent of the commit that split this policy out. Note what that sentence
// is doing, because it is the `contract-banned-shapes` shape and not a mis-assignment: THIS FILE DOES NOT
// EXIST AT THE CITED SHA. It was BORN FINAL at `35bf7d328` (`git show 35bf7d328^:<this file>` refuses with
// "exists on disk, but not in 35bf7d328^" — that refusal is the receipt), so the sha names the LEGACY
// MODULE this half was split out of, never this file's own predecessor.
// POPULATION PORT: INHERITED, not ported. This half never had a legacy population of its own; it declares
// `@server` because its occurrence sibling does, and the two MUST be identical — a two-sided ratchet is
// only a ratchet while both halves judge the same writer set. The legacy predicate behind that `@server`
// is the sibling's `scanRoot: (p) => p.startsWith("packages/server/src/")`, byte-identical, recorded in
// `external-id-single-writer.ts`.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `external-id-single-writer` descriptor at 9377887c0edb28a63931b57f697b0c1596d5aa72, the parent of the conversion
// `35bf7d328`; this module did not exist there, so it is measured against the module it was carved from,
// `external-id-single-writer` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`).
// Over the SAME 7,356 harness candidates at that tree (`git ls-tree` ∩ `_shared/ts-workspace.ts#harnessGlobs`),
// legacy `scanRoot` admits 1,493 and final `population` admits 1,493. legacy − final = ∅. final − legacy = ∅.
// Controls: inside `packages/server/src/domain/admin/__cbbhr_in_context.ts` (virtual) admitted by both; outside
// `packages/client/src/agent-handles/__cbbhr_out_index.ts` (virtual) rejected by both.
// CONVERSION-COMMIT PORT (verifier cb-v-header-residue L5): the figures above resolve TODAY'S declaration. The split
// `35bf7d328` itself declared `@backend`: legacy 1,493 vs final 1,640, legacy − final = ∅, final − legacy = 147
// (`packages/contracts/src` 105, `packages/db/src` 42). Later change, recorded separately: `841d080a9` (#1937)
// reverted it to `@server`, which gives the ∅/∅ above.
import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import {
  CLAIM_WRITER,
  EXTERNAL_ID_SANCTIONED_FILES,
  isClaimWriterCall,
  isExternalIdAssignment,
  isExternalIdWriteKey,
  LINK_CAPABILITY,
  PROVISION_CAPABILITY,
} from "../lib/external-id-writer.ts";

const STALE_PREFIX =
  "stale sanctioned-writer — this file no longer writes `users.externalId`, so its carve-out is dead (either the U1 detector broke, or the writer moved — ratchet down / re-point): ";
const LINK_STALE = `${LINK_CAPABILITY} no longer calls ${CLAIM_WRITER} — the U1 admin link capability lost its atomic writer, or the writer was renamed`;

export const gate = defineGate({
  id: "external-id-single-writer-health",
  family: "external-id-single-writer",
  authority: "hard",
  severity: "error",
  population: "@server",
  analysis: "syntax",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: "the U1 externalId single-writer carve-out no longer matches the tree it exempts (Spine-Identity-and-Auth.md).",
  fix: "if the sanctioned file genuinely stopped writing externalId, delete its row in external-id-single-writer.ts / external-id-single-writer-health.ts (and verify/lib/external-id-writer.ts); if it moved, re-point the path in all three.",
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
            if (
              (isExternalIdWriteKey(node) || isExternalIdAssignment(node)) &&
              EXTERNAL_ID_SANCTIONED_FILES.includes(rel as (typeof EXTERNAL_ID_SANCTIONED_FILES)[number])
            ) {
              sanctionedWrites.add(rel);
            }
          },
        },
      ],
      evaluate: () => {
        // ABSENT-SUBJECT ANCHOR: a file always present in this policy's own resolved `@server` population —
        // never one of the subjects under judgment, which may themselves be the thing that vanished.
        const anchorFile = ctx.files[0];
        if (anchorFile === undefined) {
          throw new Error("external-id-single-writer-health received an empty effective population");
        }
        const anchor = ctx.relativePath(anchorFile);
        for (const rel of EXTERNAL_ID_SANCTIONED_FILES) {
          if (!sanctionedWrites.has(rel)) {
            ctx.report.file(anchor, { line: 1, message: `${STALE_PREFIX}"${rel}"` });
          }
        }
        if (!linkCallsClaim) {
          ctx.report.file(anchor, { line: 1, message: LINK_STALE });
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
      },
      expect: { count: 1, messageIncludes: "no longer calls" },
      why: "ABSENT-SUBJECT ARM: both sanctioned writers are intact (still writing) and link-external-id.ts is entirely DELETED from this run's population — the exact scenario the health check exists for. It must REPORT RED anchored on a file inside the resolved population (never throw 'outside the effective population')",
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
      why: "the healthy real shape (SUBJECT PRESENT): both sanctioned files still write, and the admin link capability still calls the atomic writer — no stale finding",
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
