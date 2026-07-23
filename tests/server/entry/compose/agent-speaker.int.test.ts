// entry/compose/agent-speaker — the compose-root, source-blind speaker dispatch (D60; agent-principal-design/
// 04 §5). Proves the chain chat injects: an agent's userId → its sourceKind + owner (walked through the FK
// chain, never re-stamped) → the registered soul resolver. The registry's exhaustive-dispatch discipline is a
// tsc property at the services.ts call site; here we exercise the read + dispatch + the fail-closed arms.

import type { AgentSpeakerIdentity } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import { agentPrincipals, users } from "@orb/db";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach, describe } from "vitest";
import { createAgentCardViewResolver, createAgentSpeakerResolver } from "../../../../packages/server/src/entry/compose/agent-speaker.ts";
import { freshDb } from "../../../support/db";
import { expect, test } from "../../../support/fixtures";

const OWNER = castId<UserId>("user_owner");
const AGENT = castId<UserId>("user_agent");
const SOUL: AgentSpeakerIdentity = { displayName: "Pip", systemPrompt: "You are Pip, small and curious.", avatarAssetId: null };

let db: Db;

beforeEach(async () => {
  db = await freshDb();
  await db.insert(users).values({ id: OWNER, handle: castId<Handle>("owner") });
});

/** Seed a minted agent principal owned by OWNER (the `provisionAgentPrincipal` product, seeded directly). */
async function seedAgentPrincipal(): Promise<void> {
  await db.insert(users).values({ id: AGENT, handle: castId<Handle>("__agent__buddy__owner"), role: "user", kind: "agent", ownerUserId: OWNER });
  await db.insert(agentPrincipals).values({ userId: AGENT, sourceKind: "buddy", createdAt: 0 });
}

describe("createAgentSpeakerResolver — the compose-root speaker dispatch", () => {
  test("resolves a seated agent → its OWNER → the registered soul resolver", async () => {
    await seedAgentPrincipal();
    const seen: UserId[] = [];
    const resolve = createAgentSpeakerResolver(db, {
      buddy: (ownerUserId) => {
        seen.push(ownerUserId);
        return Promise.resolve(SOUL);
      },
    });

    expect(await resolve(AGENT)).toStrictEqual(SOUL);
    // The owner-scoping flowed through the FK chain — the resolver saw the OWNER's id, never the agent's.
    expect(seen).toEqual([OWNER]);
  });

  test("an unhatched source (resolver → null) yields null — chat skips voicing the seat", async () => {
    await seedAgentPrincipal();
    const resolve = createAgentSpeakerResolver(db, { buddy: () => Promise.resolve(null) });
    expect(await resolve(AGENT)).toBeNull();
  });

  test("fail-closed: an id with no agent_principals row never reaches a resolver", async () => {
    let called = false;
    const resolve = createAgentSpeakerResolver(db, {
      buddy: () => {
        called = true;
        return Promise.resolve(SOUL);
      },
    });
    expect(await resolve(AGENT)).toBeNull();
    expect(called).toBe(false);
  });
});

describe("createAgentCardViewResolver — the compose-root D22 roster-chip projection (doc 06 §5)", () => {
  test("resolves the FIXED view: soul display name + sourceKind + owner handle (never the soul prompt)", async () => {
    await seedAgentPrincipal();
    const resolve = createAgentCardViewResolver(db, { buddy: () => Promise.resolve(SOUL) });

    const view = await resolve(AGENT);
    // Only the three allowlisted fields — no systemPrompt, no avatar. Owner handle walked via the FK chain.
    expect(view).toEqual({ displayName: SOUL.displayName, sourceKind: "buddy", ownerHandle: castId<Handle>("owner") });
  });

  test("an unhatched source (soul resolver → null) yields null", async () => {
    await seedAgentPrincipal();
    const resolve = createAgentCardViewResolver(db, { buddy: () => Promise.resolve(null) });
    expect(await resolve(AGENT)).toBeNull();
  });

  test("fail-closed: an id with no agent_principals row never reaches a resolver", async () => {
    let called = false;
    const resolve = createAgentCardViewResolver(db, {
      buddy: () => {
        called = true;
        return Promise.resolve(SOUL);
      },
    });
    expect(await resolve(AGENT)).toBeNull();
    expect(called).toBe(false);
  });
});
