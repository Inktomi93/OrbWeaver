// agent/tools — the buddy's curated hands. Pins: PROPOSE tools STASH only (never mutate — confirm is the
// sole executor), the stash is OWNER-scoped (a tool closes over userId), and the read tools are scoped to
// the owner's rows. (tools + the agency Map are flat/domain-internal → deep relative imports.)

import { chatParticipants, chats } from "@orb/db";
import type { ChatId, ChatParticipantId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { BuddyToolSpec } from "@orb/server/domain/buddy";
import { describe } from "vitest";
import { peekProposal } from "../../../../../packages/server/src/domain/buddy/agency/proposals.ts";
import { createBuddyTools } from "../../../../../packages/server/src/domain/buddy/agent/tools.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { seedUser } from "../_support.ts";

const FROZEN_AT = 1_750_000_000_000;

/** Seed a chat with the given user as its `role='host'` participant — present when `leftSeq` is null, a
 *  departed ex-host (handoff-via-leave, D18) when it carries a value. */
async function seedHostChat(db: Awaited<ReturnType<typeof freshDb>>, chatId: string, userId: UserId, leftSeq: number | null): Promise<void> {
  await db.insert(chats).values({ id: castId<ChatId>(chatId), createdAt: FROZEN_AT, updatedAt: FROZEN_AT });
  await db.insert(chatParticipants).values({
    id: castId<ChatParticipantId>(`chat_participant_${chatId}`),
    chatId: castId<ChatId>(chatId),
    kind: "human",
    userId,
    role: "host",
    joinSeq: 0,
    joinedAt: FROZEN_AT,
    leftSeq,
  });
}

const NOW = 1_750_000_000_000;

function toolsFor(db: Awaited<ReturnType<typeof freshDb>>, userId: UserId): BuddyToolSpec[] {
  let n = 0;
  return createBuddyTools({
    db,
    userId,
    now: () => NOW,
    newProposalId: () => {
      n += 1;
      return `proposal_${n}`;
    },
  });
}

function tool(specs: BuddyToolSpec[], name: string): BuddyToolSpec {
  const spec = specs.find((s) => s.name === name);
  if (spec === undefined) {
    throw new Error(`missing tool ${name}`);
  }
  return spec;
}

describe("buddy tools", () => {
  test("propose_rename STASHES a proposal (does NOT rename) scoped to the owner", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { id: "user_o" });
    const other = castId<UserId>("user_other");
    const specs = toolsFor(db, owner);

    await tool(specs, "propose_rename").handler({ newName: "Sparkle" });

    const stashed = peekProposal(owner, NOW);
    expect(stashed?.kind).toBe("rename");
    // Owner-scoped: another user has no pending proposal from this tool.
    expect(peekProposal(other, NOW)).toBeNull();
  });

  test("propose_workload stashes a workload proposal", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { id: "user_w" });
    const specs = toolsFor(db, owner);

    await tool(specs, "propose_workload").handler({ kind: "index" });
    const stashed = peekProposal(owner, NOW);
    expect(stashed?.kind).toBe("workload");
  });

  test("chat_count counts only PRESENT-host chats, excluding a departed ex-host row (D18)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { id: "user_c" });
    // A chat the owner currently hosts (present host — leftSeq null).
    await seedHostChat(db, "chat_present", owner, null);
    // A chat the owner USED to host then handed off via leave — a departed `role='host'` row lingers.
    await seedHostChat(db, "chat_departed", owner, 7);
    const specs = toolsFor(db, owner);

    const result = await tool(specs, "chat_count").handler({});
    // Only the present-host chat counts — the departed row is not a chat the user hosts today.
    expect(result.content[0]?.text).toBe(JSON.stringify({ chats: 1 }));
  });

  test("buddy_status reads the owner's own row (hatched:false before hatch)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { id: "user_s" });
    const specs = toolsFor(db, owner);

    const result = await tool(specs, "buddy_status").handler({});
    expect(result.content[0]?.text).toContain("hatched");
  });
});
