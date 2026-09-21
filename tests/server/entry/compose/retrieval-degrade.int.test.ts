// entry/compose — the IN-TURN RETRIEVAL DEGRADE seam (#2510), COMPOSED-REAL (`services` fixture, real
// `createServices`, vLLM disabled).
//
// THE DEFECT THIS PINS. `domain/search/substrate/space.ts` refuses a query whose owner's vector space is not
// jointly complete (`SEARCH_SPACE_REINDEXING`) or has no embed binding at all (`SEARCH_NO_SPACE`). That
// read-side refusal is CORRECT for a search surface — a half-migrated geometry returns dimensionally valid,
// semantically meaningless rankings, and a named refusal is the only honest answer. Its REACH was not: the
// two in-turn GATHER ops (`{{memory}}` recall and the `{{databank}}` slot) await search with no catch, so the
// refusal travelled out of the assembly and killed the whole turn with a 400. A turn's retrieval is an
// ENHANCEMENT to the turn; it is not the turn.
//
// WHY THESE TWO ARMS ARE THE ORDINARY STATE, NOT AN OUTAGE (the reason this is a wall and not a blip):
//   • "moving" — `embed_space_state` rows are written only by `markGenerationComplete`, whose `memory` and
//     `documents` callers are reindex-sweep tail verbs. `VECTOR_SCOPES_BY_TASK.embed` needs cards ∪ memory ∪
//     documents to agree, so an owner who merely USES the app (first character indexed ⇒ an
//     `embed_generation_targets` row exists) reads "moving" permanently.
//   • "no space" — the local-light convenience rows are ordinary `user_connections` a user may delete
//     (`entry/boot/seed-local-light.ts` header); with no embed binding the read is `unrecorded` + no
//     connection ⇒ `SEARCH_NO_SPACE`.
//
// WHY `previewAssembly` IS THE OBSERVATION. It runs the REAL `gatherAll` (both gather ops, both compose
// bindings) through the REAL composition root and needs no engine — the faithful, model-free seam. A bankless
// room is deliberate: `search.documents` short-circuits an empty allowlist, so this arm proves the space read
// no longer precedes that short-circuit.

// COMPOSED-REAL: the server graph loads in the untimed IMPORT phase, never inside the first test's timeout (#2386 — support/composed-real.ts).
import "../../../support/composed-real.ts";
import type { Principal } from "@orb/contracts/identity";
import { providerIdSchema } from "@orb/contracts/inference";
import type { Db } from "@orb/db";
import { connectionBindings, embedGenerations, embedGenerationTargets, userConnections } from "@orb/db";
import type { ChatId, ConnectionBindingId, EmbedGenerationId, Handle, UserConnectionId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { Services } from "@orb/server/transport/trpc";
import { describe } from "vitest";
import { TEST_PROVIDER_ID } from "../../../support/factories/resolved-connection.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { seedCharacter, seedChat, seedMessage, seedParticipant, seedUser } from "../../domain/chat/_support.ts";

const FROZEN_AT = 1_700_000_000_000;

function hostPrincipal(userId: UserId): Principal {
  return { userId, role: "user", handle: castId<Handle>("host"), externalId: null, via: "header" };
}

/** Insert one `user_connections` row plus a binding for `task`. The two arms below bind the SAME owner to
 *  different tasks deliberately: `chat` is what `resolvePreviewInputs` resolves before any gather runs (with
 *  none, the preview refuses for an unrelated reason and would pin nothing), while the `embed` binding is
 *  exactly the axis under test — the "no space" arm must NOT have one. */
async function seedBoundConnection(db: Db, ownerId: UserId, task: "chat" | "embed", label: string): Promise<UserConnectionId> {
  const connectionId = castId<UserConnectionId>(`user_connection_${task}_${ownerId}`);
  await db.insert(userConnections).values({
    id: connectionId,
    ownerId,
    label,
    providerId: providerIdSchema.parse(TEST_PROVIDER_ID),
    model: `test-${task}-model`,
  });
  await db.insert(connectionBindings).values({
    id: castId<ConnectionBindingId>(`connection_binding_${task}_${ownerId}`),
    actorKind: "user",
    userId: ownerId,
    ruleId: null,
    pluginId: null,
    task,
    connectionId,
  });
  return connectionId;
}

/** A host-owned room with one seated character and one committed user turn — the minimum a gather assembles. */
async function seedRoom(db: Db, key: string, host: UserId): Promise<ChatId> {
  const chatId = await seedChat(db, key);
  const character = await seedCharacter(db, host, `${key}_char`);
  await seedParticipant(db, { chatId, key: `${key}_h`, userId: host, role: "host" });
  await seedParticipant(db, { chatId, key: `${key}_c`, characterId: character });
  await seedMessage(db, chatId, 1, { role: "user", authorUserId: host, content: "what do you remember about the ferry?" });
  await seedBoundConnection(db, host, "chat", "preview chat connection");
  return chatId;
}

/** The ORDINARY "moving" state, seeded exactly as live usage reaches it: an embed binding plus the
 *  `embed_generation_targets` row the first indexed write stamps, and NO `embed_space_state` row — because
 *  nothing has run a full cards ∪ memory ∪ documents sweep. `readGeneration` reads that as "moving". */
async function seedMovingEmbedSpace(db: Db, ownerId: UserId): Promise<void> {
  const connectionId = await seedBoundConnection(db, ownerId, "embed", "moving-space embedder");
  const generationId = castId<EmbedGenerationId>(`embed_generation_moving_${ownerId}`);
  await db.insert(embedGenerations).values({
    id: generationId,
    ownerId,
    task: "embed",
    via: "embed",
    connectionId,
    connectionRef: connectionId,
    fingerprint: `fingerprint_${ownerId}`,
    space: "test-embed-model@f32",
    createdAt: FROZEN_AT,
  });
  await db.insert(embedGenerationTargets).values({ ownerId, task: "embed", generationId, epoch: 1 });
}

describe("in-turn retrieval degrades instead of killing the turn (#2510)", () => {
  test("an owner whose embed space is MID-MOVE still assembles a turn", async ({ services, db }: { services: Services; db: Db }) => {
    const host = await seedUser(db, castId<Handle>("movinghost"));
    const chatId = await seedRoom(db, "movingroom", host);
    await seedMovingEmbedSpace(db, host);

    const preview = await services.chat.previewAssembly({ principal: hostPrincipal(host), chatId });
    expect(typeof preview.prompt.static).toBe("string");
  });

  test("an owner with NO embed binding at all still assembles a turn", async ({ services, db }: { services: Services; db: Db }) => {
    const host = await seedUser(db, castId<Handle>("spacelesshost"));
    const chatId = await seedRoom(db, "spacelessroom", host);

    const preview = await services.chat.previewAssembly({ principal: hostPrincipal(host), chatId });
    expect(typeof preview.prompt.static).toBe("string");
  });
});
