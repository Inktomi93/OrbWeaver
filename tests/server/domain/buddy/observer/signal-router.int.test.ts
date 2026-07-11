// observer/signal-router — owner/host resolution + THE BELT (agent-principal-design/04 §6: a seated buddy
// must not quip-react to its OWN room events). Runs the router over a real db + fake reads, asserting a quip
// lands for the resolved owner/host and is DROPPED when the acting principal is the host's own agent.

import type { Db } from "@orb/db";
import type { BuddyQuipId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import type {
  BuddyBusEvent,
  BuddyObserverEnv,
  BuddyObserverReads,
  LiteChatEvent,
} from "../../../../../packages/server/src/domain/buddy/index.ts";
import { createSignalRouter } from "../../../../../packages/server/src/domain/buddy/observer/signal-router.ts";
import {
  insertBuddy,
  loadRecentQuips,
} from "../../../../../packages/server/src/domain/buddy/persistence/queries.ts";
import { roll } from "../../../../../packages/server/src/domain/buddy/substrate/roll.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { seedUser } from "../_support.ts";

const NOW = 1_750_000_000_000;

type ReactorDeps = Pick<BuddyObserverEnv, "db" | "now" | "newQuipId" | "summarize" | "emit">;

async function seedBuddy(db: Db, userId: UserId): Promise<void> {
  const { bones } = roll(userId);
  await insertBuddy(db, {
    userId,
    name: "Pip",
    personality: "small and curious",
    rarity: bones.rarity,
    species: bones.species,
    eye: bones.eye,
    hat: bones.hat,
    shiny: bones.shiny,
    stats: bones.stats,
    createdAt: NOW,
  });
}

function reactorDeps(db: Db, events: BuddyBusEvent[]): ReactorDeps {
  let n = 0;
  return {
    db,
    now: (): number => NOW,
    newQuipId: (): BuddyQuipId => {
      n += 1;
      return castId<BuddyQuipId>(`buddy_quip_${n}`);
    },
    summarize: () =>
      Promise.resolve({
        items: [{ text: "!", usage: { tokensIn: null, tokensOut: null, costUsd: null } }],
        model: "vllm-local",
      }),
    emit: (e: BuddyBusEvent): void => {
      events.push(e);
    },
  };
}

/** A fake reads bundle; each test overrides the hop it exercises. */
function fakeReads(over: Partial<BuddyObserverReads> = {}): BuddyObserverReads {
  return {
    resolveWorkloadOwner: () => Promise.resolve(null),
    resolveChatHost: () => Promise.resolve(null),
    ...over,
  };
}

// The belt's agent-owner hop is an injected env op (reads `users` at the entry root); a fake here.
const NO_AGENT_OWNER = (): Promise<UserId | null> => Promise.resolve(null);

function chatEvent(over: Partial<LiteChatEvent> = {}): LiteChatEvent {
  return { chatId: "chat_1", kind: "turn-completed", actingUserId: null, at: NOW, ...over };
}

// The router dispatches through `react()` fire-and-forget; give the microtasks a beat to drain.
async function drain(): Promise<void> {
  await new Promise((r) => setTimeout(r, 20));
}

describe("buddy observer signal router", () => {
  test("a chat turn reacts on the resolved HOST's buddy", async () => {
    const db = await freshDb();
    const host = await seedUser(db, { id: "user_host" });
    await seedBuddy(db, host);
    const events: BuddyBusEvent[] = [];
    const router = createSignalRouter({
      ...reactorDeps(db, events),
      reads: fakeReads({ resolveChatHost: () => Promise.resolve(host) }),
      resolveAgentOwner: NO_AGENT_OWNER,
    });

    router.routeChat(chatEvent());
    await drain();

    expect(await loadRecentQuips(db, host, 10)).toHaveLength(1);
  });

  test("no host resolved → no reaction", async () => {
    const db = await freshDb();
    const host = await seedUser(db, { id: "user_host" });
    await seedBuddy(db, host);
    const events: BuddyBusEvent[] = [];
    const router = createSignalRouter({
      ...reactorDeps(db, events),
      reads: fakeReads(), // resolveChatHost → null
      resolveAgentOwner: NO_AGENT_OWNER,
    });

    router.routeChat(chatEvent());
    await drain();

    expect(await loadRecentQuips(db, host, 10)).toHaveLength(0);
  });

  // THE BELT: an event the host's OWN agent acted is dropped (a seated buddy doesn't react to itself).
  test("belt: the host's own agent's event is dropped", async () => {
    const db = await freshDb();
    const host = await seedUser(db, { id: "user_host" });
    await seedBuddy(db, host);
    const agent = castId<UserId>("user_agent");
    const events: BuddyBusEvent[] = [];
    const router = createSignalRouter({
      ...reactorDeps(db, events),
      reads: fakeReads({ resolveChatHost: () => Promise.resolve(host) }),
      // the acting agent is OWNED BY the host → the belt drops it.
      resolveAgentOwner: (uid) => Promise.resolve(uid === agent ? host : null),
    });

    router.routeChat(chatEvent({ actingUserId: agent }));
    await drain();

    expect(await loadRecentQuips(db, host, 10)).toHaveLength(0);
  });

  // The belt does NOT drop a DIFFERENT owner's agent (or a human) acting in the host's room.
  test("belt: another principal's agent still reacts", async () => {
    const db = await freshDb();
    const host = await seedUser(db, { id: "user_host" });
    await seedBuddy(db, host);
    const otherAgent = castId<UserId>("user_other_agent");
    const otherOwner = castId<UserId>("user_other_owner");
    const events: BuddyBusEvent[] = [];
    const router = createSignalRouter({
      ...reactorDeps(db, events),
      reads: fakeReads({ resolveChatHost: () => Promise.resolve(host) }),
      resolveAgentOwner: (uid) => Promise.resolve(uid === otherAgent ? otherOwner : null),
    });

    router.routeChat(chatEvent({ actingUserId: otherAgent }));
    await drain();

    expect(await loadRecentQuips(db, host, 10)).toHaveLength(1);
  });
});
