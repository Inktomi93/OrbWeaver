// Gate: membership-write-fan (#1734) — a verb that WRITES a (b) MEMBERSHIP-class table (its scope resolves
// through `chat_participants`, so its rows are state more than one human can see) and announces that write
// ONLY through the per-PERSON emit has told exactly one human: every OTHER member of the room keeps the
// pre-write projection until they reload. The sibling `membership-fan-guard` bans `emitUserEvent` under
// `domain/chat/**` by PATH; this policy asks the same question by MUTATED SUBJECT, which is how the class
// escapes a path fence — the room-affecting write is raised from ANOTHER domain through an injected op
// (`domain/regex/verbs/attachments/attach-to-chat.ts`, #1733, was the founding instance).
// ARMS: one per FILE — a membership-class write ∧ a per-person emit ∧ no other emit at all. Anchored on the
// FIRST per-person emit (the actor-only announcement is the defect), so one file is one grantable finding.
// DECLARED LIMITS, each with a mustPass row: an UNRESOLVABLE write target is out of this arm (the sibling
// `owner-scoped-writes` already reports one over the same `@server` population, so it is not a hole); a
// membership write with NO emit at all is the per-DOMAIN question `domain-freshness-plane` owns; a fan
// raised through an op whose callee is not `emit*` reads as no fan.
// FAMILY: `tenancy-scope` — the shared canonical declarations are `lib/tenancy-scope.ts`'s
// `schemaTableIdents` / `reportBlindWhenEmpty` and `lib/tenancy-read.ts`'s `tableTargetOf`, all three of
// which `owner-scoped-writes` also reaches from its production hooks. The (b)-class half of the registry
// (`membershipScopedTableIdents`) landed with this policy beside the (a)-class half it mirrors.
// POPULATION: NEW policy, no legacy predecessor and therefore no port. `@server` under `domain/**` MINUS
// `domain/chat/**`: inside chat the stronger `membership-fan-guard` bans the identifier outright, and both
// policies reporting one site would be two findings for one predicate.
// AUTHORITY: `reviewed-grant`. The two live sites are an OWNER-DEFERRED gap, not fixable debt — the databank
// room-reach row is a named candidate on the entity→room bridge (bridge design §8 + fork F-E, 2026-08-14),
// recorded identically in `domain-freshness-plane`'s `databank` row. Each carries its `why` + `endsWhen` in
// `lib/reviewed-grants-membership-write-fan.ts`; central liveness reports the row stale the day the bridge
// row lands, which is the tripwire a prose deferral cannot give.
import type { CallExpression, Node as MorphNode, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { recordReadySchemaFact } from "../contract/schema-fact.ts";
import { drizzleSchemaFact } from "../lib/schema-fact.ts";
import { readMemberAccess } from "../lib/symbol-reference.ts";
import { isDrizzleWriteStatement, tableTargetOf } from "../lib/tenancy-read.ts";
import { membershipScopedTableIdents, reportBlindWhenEmpty, schemaTableIdents } from "../lib/tenancy-scope.ts";

/** The drizzle write verbs whose first argument is the table. `insert` is IN (unlike `owner-scoped-writes`,
 *  whose question is a WHERE predicate `insert` cannot carry): attaching a row to a room is precisely the
 *  member-visible change this policy is about. */
const WRITE_VERBS: ReadonlySet<string> = new Set(["insert", "update", "delete"]);

/** The emits that address ONE human. `emitUserEvent` is the per-person user-bus op every single-owner domain
 *  verb closes over; `emitNotification` is per-RECIPIENT by construction (the durable inbox is delivered to a
 *  user, never rendered as room state — `domain-freshness-plane`'s `notifications` row). Every other `emit*`
 *  callee announces on a shared plane and acquits the file. */
const PER_PERSON_EMITS: ReadonlySet<string> = new Set(["emitUserEvent", "emitNotification"]);

const EMIT_PREFIX = "emit";
const OPERATION = "membership-write-per-person-emit";

const MESSAGE =
  "a MEMBERSHIP-class write announced ONLY to its actor — this verb writes a table whose scope resolves " +
  "through chat_participants (state every member of the room can see) and its only announcement is the " +
  "per-person emit, so every OTHER member keeps the pre-write projection until they reload. Member-visible " +
  "state rides a room fan (the chat bus, an injected room-fan op, or a roomEntityChanged bridge emit) — the " +
  "per-person channel cannot reach a co-member by construction. The class registry is " +
  "tooling/src/verify/lib/tenancy-scope.ts.";

const FIX =
  "emit a ROOM fan beside the per-person one: the chat bus, the domain's injected room-fan op (the shape " +
  "`domain/regex/verbs/attachments/attach-to-chat.ts` took at #1733 with `emitRoomRegexChanged`), or the " +
  "entity→room bridge's `roomEntityChanged` if this domain is on it. A deliberate, owner-ruled gap is an " +
  "exact row in tooling/src/verify/lib/reviewed-grants-membership-write-fan.ts carrying `why` AND " +
  "`endsWhen` — never a silent per-person emit.";

const BLIND =
  "membership-write-fan derived ZERO membership-class tables from the schema — the gate has gone blind (the " +
  "schema shape or the class registry moved, and a gate that matches nothing reports ✓ forever). Re-derive " +
  "it in tooling/src/verify/lib/tenancy-scope.ts (`membershipScopedTableIdents`)";

/** What one FILE proved. The conjunction is per file because that is the unit a verb occupies: the write and
 *  its announcement are authored together, and one finding per file is what keeps a grant from matching two
 *  candidates (an over-broad grant licenses NOTHING — contract/gate-authority.ts). */
interface FileFacts {
  /** The first membership-class write's local table binding — the grant subject's discriminator. */
  writeIdent: string | undefined;
  /** The first per-person emit's callee NAME node — the report anchor and its authored token. */
  perPersonEmit: MorphNode | undefined;
  /** Did any OTHER `emit*` callee occur in this file? One is enough to acquit: it announces on a plane the
   *  per-person channel is not. */
  roomFan: boolean;
}

/** The callee's name for `ctx.emitX(...)` — EVERY spelling, through the shared `readMemberAccess`
 *  (`ctx["emitUserEvent"](…)` and `ctx?.emitUserEvent(…)` included) — and for a bare `emitX(...)`. A
 *  `PropertyAccessExpression`-only read here is the #1506 spelling hole the twins census reds. */
function calleeName(call: CallExpression): string | undefined {
  const callee = call.getExpression();
  const read = readMemberAccess(callee);
  if (read !== undefined) {
    return read.name;
  }
  return Node.isIdentifier(callee) ? callee.getText() : undefined;
}

/** The node the finding anchors on: `ctx.emitUserEvent(...)` reports at `emitUserEvent` and
 *  `ctx["emitUserEvent"](...)` at `"emitUserEvent"` — in both cases the AUTHORED slice a waiver-style
 *  position would have to name, quotes included. */
function calleeNameNode(call: CallExpression): MorphNode {
  const callee = call.getExpression();
  const read = readMemberAccess(callee);
  return read === undefined ? callee : read.nameNode;
}

export const gate = defineGate({
  id: "membership-write-fan",
  family: "tenancy-scope",
  authority: "reviewed-grant",
  severity: "error",
  population: {
    in: ["@server"],
    under: ["packages/server/src/domain/**"],
    notUnder: ["packages/server/src/domain/chat/**"],
  },
  analysis: "types",
  // The (b)-class set is a whole-SCHEMA derivation through the shared drizzle fact, exactly as the three
  // `owner-scoped-*` siblings consume it; a narrowed request would judge writes against a fraction of the
  // class registry and acquit by blindness.
  execution: "entire-population",
  facts: [drizzleSchemaFact],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const byFile = new Map<object, FileFacts>();
    const candidates: { readonly file: SourceFile; readonly arg: MorphNode; readonly call: CallExpression }[] = [];
    const factsFor = (sourceFile: SourceFile): FileFacts => {
      const key = sourceFile.compilerNode;
      const existing = byFile.get(key);
      if (existing !== undefined) {
        return existing;
      }
      const created: FileFacts = { writeIdent: undefined, perPersonEmit: undefined, roomFan: false };
      byFile.set(key, created);
      return created;
    };

    return {
      visitors: [
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node, sourceFile) => {
            if (!Node.isCallExpression(node)) {
              return;
            }
            const name = calleeName(node);
            if (name === undefined) {
              return;
            }
            if (name.startsWith(EMIT_PREFIX)) {
              const facts = factsFor(sourceFile);
              if (PER_PERSON_EMITS.has(name)) {
                facts.perPersonEmit ??= calleeNameNode(node);
              } else {
                facts.roomFan = true;
              }
              return;
            }
            const arg = node.getArguments()[0];
            // The table class is not resolvable until the schema fact is ready, so the walk only records.
            // The write verb must be a MEMBER call (`db.insert(T)` / `db["insert"](T)`), never a bare
            // `insert(T)`: the receiver is what makes it a drizzle builder rather than a local helper.
            if (WRITE_VERBS.has(name) && arg !== undefined && readMemberAccess(node.getExpression()) !== undefined) {
              candidates.push({ file: sourceFile, arg, call: node });
            }
          },
        },
      ],
      evaluate: () => {
        const schemaFact = ctx.fact(drizzleSchemaFact).schema();
        recordReadySchemaFact(ctx, schemaFact);
        const membershipIdents = membershipScopedTableIdents(schemaFact.value);
        const allIdents = schemaTableIdents(schemaFact.value);
        for (const candidate of candidates) {
          const target = tableTargetOf(candidate.arg, membershipIdents, allIdents);
          // `unresolvable` is deliberately NOT an arm here (see the header's declared limits): the sibling
          // `owner-scoped-writes` reports an unreadable write target over this same `@server` population, so
          // silence here is a seam, not a fail-open.
          if (target?.kind === "in-class" && isDrizzleWriteStatement(candidate.call)) {
            const facts = factsFor(candidate.file);
            facts.writeIdent ??= target.ident;
          }
        }
        for (const [, facts] of byFile) {
          if (facts.writeIdent === undefined || facts.perPersonEmit === undefined || facts.roomFan) {
            continue;
          }
          const anchor = facts.perPersonEmit;
          ctx.report.node(anchor, {
            token: anchor.getText(),
            offset: 0,
            subject: `${ctx.relativePath(anchor.getSourceFile())}#${facts.writeIdent}`,
            operation: OPERATION,
          });
        }
        reportBlindWhenEmpty(ctx, schemaFact, membershipIdents, BLIND);
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: {
        "packages/db/src/schema/databank.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const chatDocuments = sqliteTable("chat_documents", { chatId: text("chat_id"), documentId: text("document_id") });\n',
        "packages/server/src/domain/databank/verbs/attach/attach-to-chat.ts":
          'import { chatDocuments } from "@orb/db";\nexport function attach(ctx: C) {\n  return async ({ ownerId, chatId, documentId }: P) => {\n    await ctx.db.insert(chatDocuments).values({ chatId, documentId }).returning({ documentId: chatDocuments.documentId });\n    ctx.emitUserEvent(ownerId, { type: "databankChanged", documentId });\n  };\n}\n',
      },
      expect: { count: 1, token: "emitUserEvent" },
      grant: { subject: "packages/server/src/domain/databank/verbs/attach/attach-to-chat.ts#chatDocuments", operation: OPERATION },
      why: "THE FOUNDING SHAPE, and it is a LIVE site: the host attaches a document to a room (`chat_documents` is (b) membership-class) and the only announcement is the per-person `databankChanged`, so every co-member's rack stays pre-attach. The witness is the exact central grant identity the owner-deferred bridge row carries, so the row proves BOTH that the catch fires ungranted and that the emitted `(subject, operation)` is bindable at all",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/databank.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const chatDocuments = sqliteTable("chat_documents", { chatId: text("chat_id"), documentId: text("document_id") });\n',
        "packages/server/src/domain/databank/verbs/attach/detach.ts":
          'import { chatDocuments as rack } from "@orb/db";\nexport function detach(ctx: C) {\n  return async ({ ownerId, chatId, documentId }: P) => {\n    await ctx.db.delete(rack).where(eq(rack.chatId, chatId)).returning({ documentId: rack.documentId });\n    ctx.emitUserEvent(ownerId, { type: "databankChanged", documentId });\n  };\n}\n',
      },
      expect: { count: 1, token: "emitUserEvent" },
      why: "the DELETE arm through an IMPORT ALIAS — a detach removes member-visible state exactly as an attach adds it, and renaming the local binding cannot change the table's class. Both halves of one bypass: the write verb and the identifier spelling",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/databank.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const chatDocuments = sqliteTable("chat_documents", { chatId: text("chat_id"), documentId: text("document_id") });\n',
        "packages/server/src/domain/databank/verbs/attach/notify-only.ts":
          'import { chatDocuments } from "@orb/db";\nexport function attach(ctx: C) {\n  return async ({ ownerId, chatId, documentId }: P) => {\n    await ctx.db.insert(chatDocuments).values({ chatId, documentId }).returning({ documentId: chatDocuments.documentId });\n    ctx.emitNotification(ownerId, { kind: "databank-attached" });\n  };\n}\n',
      },
      expect: { count: 1, token: "emitNotification" },
      why: "the SECOND per-person spelling: the durable inbox is delivered to ONE recipient, so announcing a room-visible write through it reaches no co-member either. Without this member of PER_PERSON_EMITS a verb could swap one single-human channel for another and go green",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/db/src/schema/regex.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const chatRegexScripts = sqliteTable("chat_regex_scripts", { chatId: text("chat_id"), scriptId: text("script_id") });\n',
        "packages/server/src/domain/regex/verbs/attachments/attach-to-chat.ts":
          'import { chatRegexScripts } from "@orb/db";\nexport function attach(ctx: C) {\n  return async ({ ownerId, chatId, scriptId }: P) => {\n    await ctx.db.insert(chatRegexScripts).values({ chatId, scriptId }).returning({ scriptId: chatRegexScripts.scriptId });\n    ctx.emitUserEvent(ownerId, { type: "regexChanged", scriptId });\n    ctx.emitRoomRegexChanged(chatId);\n  };\n}\n',
      },
      why: "THE REMEDIATED FOUNDING INSTANCE (#1733) — the per-person emit is FINE beside a room fan; what this policy bans is the per-person emit ALONE. This is the row that dies if the `roomFan` acquittal is cut, and it is the live shape of the fix the message prescribes",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/character.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characterDocuments = sqliteTable("character_documents", { characterId: text("character_id"), documentId: text("document_id") });\n',
        "packages/server/src/domain/databank/verbs/attach/attach-to-character.ts":
          'import { characterDocuments } from "@orb/db";\nexport function attach(ctx: C) {\n  return async ({ ownerId, characterId, documentId }: P) => {\n    await ctx.db.insert(characterDocuments).values({ characterId, documentId }).returning({ documentId: characterDocuments.documentId });\n    ctx.emitUserEvent(ownerId, { type: "databankChanged", documentId });\n  };\n}\n',
      },
      why: "THE CLASS FENCE, and the row that dies the moment the policy reads the (c) junction rows too: `character_documents` is a JUNCTION on a single-owned card, so the per-person emit reaches exactly the human who can see it. Widening past `membership` would red every character/persona/preset attachment verb in the tree — 17 junction tables' worth of correct code",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/databank.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const chatDocuments = sqliteTable("chat_documents", { chatId: text("chat_id"), documentId: text("document_id") });\n',
        "packages/server/src/domain/databank/persistence/queries.ts":
          'import { chatDocuments } from "@orb/db";\nexport async function purge(db: D, chatId: string) {\n  return db.delete(chatDocuments).where(eq(chatDocuments.chatId, chatId));\n}\n',
      },
      why: "DECLARED LIMIT — a membership write with NO emit at all is the per-DOMAIN question `domain-freshness-plane` owns (does this domain announce ANYTHING), not this per-verb one. A persistence helper called by an emitting verb is the common shape; accusing it would relocate every finding away from the verb that owns the announcement",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/databank.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const chatDocuments = sqliteTable("chat_documents", { chatId: text("chat_id"), documentId: text("document_id") });\n',
        "packages/server/src/domain/databank/verbs/attach/generic.ts":
          'export function attach(ctx: C) {\n  return async ({ ownerId, table, row }: P) => {\n    await ctx.db.insert(table).values(row).returning({ id: table.id });\n    ctx.emitUserEvent(ownerId, { type: "databankChanged" });\n  };\n}\n',
      },
      why: "DECLARED LIMIT — an UNRESOLVABLE write target is out of this arm. It is NOT a fail-open: `owner-scoped-writes` reports exactly this shape over the same `@server` population, so the unreadable-target verdict has an owner and this policy does not double-report it. The row dies if the `in-class` narrowing is opened to `unresolvable`",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/chat.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const chatDocuments = sqliteTable("chat_documents", { chatId: text("chat_id") });\n',
        "packages/server/src/domain/databank/verbs/attach/anchor.ts": "export const clean = true;\n",
        "packages/server/src/domain/chat/verbs/attach.ts":
          'import { chatDocuments } from "@orb/db";\nexport function attach(ctx: C) {\n  return async ({ ownerId, chatId }: P) => {\n    await ctx.db.insert(chatDocuments).values({ chatId }).returning({ chatId: chatDocuments.chatId });\n    ctx.emitUserEvent(ownerId, { type: "databankChanged" });\n  };\n}\n',
      },
      why: "THE POPULATION SEAM, with an ADMITTED anchor file beside the subtracted one (a fixture holding only the `notUnder` path admits nothing and comes back an empty-population tool error, proving no fence): inside `domain/chat/**` this exact shape is `membership-fan-guard`'s, which bans the identifier outright. Two policies reporting one site would be two findings for one predicate and an unwaivable pair",
    },
  ],
});
