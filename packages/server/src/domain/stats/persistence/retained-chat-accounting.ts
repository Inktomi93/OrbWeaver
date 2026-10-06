// A scope snapshot travels with its exact-set SQL fence, so authority changes cannot redirect retained economics.
import type { ResolveRetainedChatAccountingScope, ResolveRetainedChatRebase, SettleRetainedChatRebase } from "@orb/contracts/stats";
import type { Db } from "@orb/db";
import {
  characterStats,
  characters,
  chatGenerationObservations,
  chatParticipants,
  chats,
  compactionSpend,
  embeddingCalls,
  messages,
  messageVariants,
  ownerStats,
} from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import type { CharacterId, UserId } from "@orb/kit/ids";
import type { SQL, Table } from "drizzle-orm";
import { and, asc, eq, getTableColumns, inArray, or, sql } from "drizzle-orm";
import { chatOwnerIds, ownerChatIds, retainedCharacterSeatPredicate } from "../substrate/owner-chat-scope.ts";
import { retainedRebaseProjection } from "../substrate/retained-chat-accounting.ts";

/** Compose-built private accounting scope; caller has already admitted the retained source operation. */
export function createResolveRetainedChatAccountingScope(db: Db): ResolveRetainedChatAccountingScope<SQL> {
  return async (chatId, characterId) => {
    const owners = await db
      .selectDistinct({ ownerId: characters.ownerId })
      .from(characters)
      .where(sql`${characters.ownerId} in (${chatOwnerIds(chatId)})`)
      .orderBy(characters.ownerId);
    const ownerIds = owners.map((row) => row.ownerId);
    // @orb-waive owner-scoped-reads(characters): compose-private retained canon accounting; chat's admitted operation supplies the canonical voice id, and this returns only its actual owner while the write fence pins that owner. Ends if external ids or an unbounded reader can reach this op.
    const voice = characterId === null ? [] : await db.select({ ownerId: characters.ownerId }).from(characters).where(eq(characters.id, characterId)).limit(1);
    const characterOwnerId = voice[0]?.ownerId ?? null;
    return {
      ownerIds,
      characterOwnerId,
      predicate: sql`${and(
        sql`exists (select 1 from ${chats} where ${chats.id} = ${chatId} and ${chats.startedAt} is not null)`,
        sql`(select count(*) from (${chatOwnerIds(chatId)})) = ${ownerIds.length}`,
        ...ownerIds.map((ownerId) => sql`${ownerId} in (${chatOwnerIds(chatId)})`),
        characterId === null
          ? undefined
          : sql`(select ${characters.ownerId} from ${characters} where ${characters.id} = ${characterId}) is ${characterOwnerId}`,
      )}`,
    };
  };
}

const TUPLE_ALIAS = "retained_tuple";

/** SQLite records its own driver representation; parsed JSON fields cannot change the immutable witness. */
function rowTuple<T extends Table>(table: T): SQL.Aliased<string> {
  return sql<string>`json_array(${sql.join(Object.values(getTableColumns(table)), sql`, `)})`.as(TUPLE_ALIAS);
}

/** One bounded predicate instead of one SQL clause/parameter per historic message field. */
function immutableCollection(query: SQL, tuples: readonly string[]): SQL {
  return sql`(select coalesce(json_group_array(snapshot.${sql.identifier(TUPLE_ALIAS)}), '[]') from (${query}) as snapshot) = ${JSON.stringify(tuples)}`;
}

/** The accepted copy's scope and canon freeze together; pending paid facts do not participate in this rebase. */
export function createResolveRetainedChatRebase(
  db: Db,
): ResolveRetainedChatRebase<typeof chats.$inferSelect, typeof messages.$inferSelect, typeof messageVariants.$inferSelect, SQL> {
  return async (rekeys) => {
    const copiedIds = [...rekeys.characters.values()];
    const roomQuery = db
      .select({ row: chats, tuple: rowTuple(chats) })
      .from(chats)
      .where(eq(chats.id, rekeys.chatId));
    const seatQuery = db
      .select({ row: chatParticipants, tuple: rowTuple(chatParticipants) })
      .from(chatParticipants)
      .where(eq(chatParticipants.chatId, rekeys.chatId))
      .orderBy(chatParticipants.id);
    const slotQuery = db
      .select({ row: messages, tuple: rowTuple(messages) })
      .from(messages)
      .where(eq(messages.chatId, rekeys.chatId))
      .orderBy(asc(messages.seq), messages.id);
    const variantQuery = db
      .select({ row: messageVariants, tuple: rowTuple(messageVariants) })
      .from(messageVariants)
      .innerJoin(messages, eq(messages.id, messageVariants.messageId))
      .where(eq(messages.chatId, rekeys.chatId))
      .orderBy(messageVariants.id);
    // @orb-waive owner-scoped-reads(characters): chat's admitted copy/rekey plan supplies copied ids; all other ids derive from this retained room's seats/canon. The immutable accepted-plan fence pins the owner projection. Ends if external or unbounded ids can reach this private op.
    const cardQuery = db
      .select({ id: characters.id, ownerId: characters.ownerId, tuple: sql<string>`json_array(${characters.id}, ${characters.ownerId})`.as(TUPLE_ALIAS) })
      .from(characters)
      .where(
        or(
          sql`${characters.id} in (select ${chatParticipants.characterId} from ${chatParticipants} where ${chatParticipants.chatId} = ${rekeys.chatId})`,
          sql`${characters.id} in (select ${messages.characterId} from ${messages} where ${messages.chatId} = ${rekeys.chatId})`,
          copiedIds.length === 0 ? undefined : inArray(characters.id, copiedIds),
        ),
      )
      .orderBy(characters.id);
    const [rooms, owners, seatRows, slotRows, variantRows, cardOwners] = await db.batch([
      roomQuery,
      db
        .selectDistinct({ ownerId: characters.ownerId })
        .from(characters)
        .where(sql`${characters.ownerId} in (${chatOwnerIds(rekeys.chatId)})`)
        .orderBy(characters.ownerId),
      seatQuery,
      slotQuery,
      variantQuery,
      cardQuery,
    ]);
    const chat = rooms[0]?.row;
    if (chat === undefined || chat.startedAt === null) {
      return null;
    }
    const { planStillMatches, ...projection } = retainedRebaseProjection({
      rekeys,
      ownerIds: owners.map((row) => row.ownerId),
      seats: seatRows.map((row) => row.row),
      slots: slotRows.map((row) => row.row),
      variants: variantRows.map((row) => row.row),
      cardOwners,
    });
    return {
      chat,
      ...projection,
      predicate: sql`${and(
        sql`${planStillMatches ? 1 : 0} = 1`,
        immutableCollection(
          roomQuery.getSQL(),
          rooms.map((row) => row.tuple),
        ),
        immutableCollection(
          seatQuery.getSQL(),
          seatRows.map((row) => row.tuple),
        ),
        immutableCollection(
          slotQuery.getSQL(),
          slotRows.map((row) => row.tuple),
        ),
        immutableCollection(
          variantQuery.getSQL(),
          variantRows.map((row) => row.tuple),
        ),
        immutableCollection(
          cardQuery.getSQL(),
          cardOwners.map((row) => row.tuple),
        ),
      )}`,
    };
  };
}

function characterSeatRooms(characterId: CharacterId): SQL {
  return sql`select distinct ch.id from chat_participants cp join chats ch on ch.id = cp.chat_id
    join characters c on c.id = cp.character_id
    where cp.character_id = ${characterId} and ${retainedCharacterSeatPredicate(sql`c.owner_id`)}`;
}

function characterAuthoredMessages(characterId: CharacterId): SQL {
  return sql`select m.id from messages m where m.character_id = ${characterId} and m.role = 'assistant'
    and m.chat_id in (${ownerChatIds(sql`(select owner_id from characters where id = ${characterId})`)})`;
}

function retainedLegActivity(messageIds: SQL): SQL {
  return sql`select cast(json_extract(leg.value, '$.observedAt') as integer) as at
    from message_variants v, json_each(v.metadata, '$.usageLegs') leg
    where v.message_id in (${messageIds}) and json_type(leg.value, '$.observedAt') = 'integer'`;
}

function ownerActivity(ownerId: UserId): SQL {
  const roomIds = ownerChatIds(ownerId);
  const messageIds = sql`select id from messages where chat_id in (${roomIds})`;
  return sql`select max(at) from (
    select updated_at as at from chats where id in (${roomIds})
    union all select created_at as at from messages where id in (${messageIds})
    union all ${retainedLegActivity(messageIds)}
    union all select ${compactionSpend.createdAt} as at from ${compactionSpend} where ${compactionSpend.ownerId} = ${ownerId}
    union all select ${embeddingCalls.createdAt} as at from ${embeddingCalls} where ${embeddingCalls.ownerId} = ${ownerId}
    union all select ${chatGenerationObservations.observedAt} as at from ${chatGenerationObservations} where ${chatGenerationObservations.funderUserId} = ${ownerId}
  )`;
}

/** Money and counters were already rebased; extrema must read the committed-in-batch retained relations. */
export const settleRetainedChatRebase: SettleRetainedChatRebase<BatchStmt[], Db> = (batch, db, scope): void => {
  for (const ownerId of scope.ownerIds) {
    batch.push(
      db
        .update(ownerStats)
        .set({
          firstChatAt: sql`(select min(created_at) from chats where id in (${ownerChatIds(ownerId)}))`,
          lastActivityAt: sql`(${ownerActivity(ownerId)})`,
          maxContextTokens: sql`(select max(v.context_window) from messages m left join message_variants v on v.id = m.selected_variant_id
        where m.chat_id in (${ownerChatIds(ownerId)}))`,
        })
        .where(eq(ownerStats.ownerId, ownerId)),
    );
  }
  for (const characterId of scope.characterIds) {
    const roomIds = characterSeatRooms(characterId);
    const messageIds = characterAuthoredMessages(characterId);
    batch.push(
      db
        .update(characterStats)
        .set({
          firstChatAt: sql`(select min(created_at) from chats where id in (${roomIds}))`,
          lastActivityAt: sql`(select max(at) from (
        select updated_at as at from chats where id in (${roomIds})
        union all select created_at as at from messages where id in (${messageIds})
        union all ${retainedLegActivity(messageIds)}
      ))`,
        })
        .where(eq(characterStats.characterId, characterId)),
    );
    batch.push(
      db
        .delete(characterStats)
        .where(
          and(
            eq(characterStats.characterId, characterId),
            sql`not exists (select 1 from chats where id in (${roomIds}))`,
            sql`not exists (select 1 from messages where id in (${messageIds}))`,
          ),
        ),
    );
  }
};
