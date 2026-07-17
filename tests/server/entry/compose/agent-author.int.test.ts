// entry/compose/agent-author — the compose-root, source-blind AUTHOR-provenance dispatch (D60; PD-17). Proves
// the chain export injects: an agent's userId → its sourceKind + owner (walked through the FK chain, never
// re-stamped) → the registered source resolver → the LEAK-SAFE {name, sourceKind}. The load-bearing pin is the
// leak boundary: the source resolver hands back a full AgentSpeakerIdentity (name + soul systemPrompt), but
// only displayName crosses — the soul is dropped here and the owner id never appears in the product.

import type { AgentSpeakerIdentity } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import { agentPrincipals, users } from "@orb/db";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach, describe } from "vitest";
import { createAgentAuthorResolver } from "../../../../packages/server/src/entry/compose/agent-author.ts";
import { freshDb } from "../../../support/db";
import { expect, test } from "../../../support/fixtures";

const OWNER = castId<UserId>("user_owner");
const AGENT = castId<UserId>("user_agent");
// The soul carries a secret-shaped systemPrompt: the leak pin asserts NONE of it survives into the provenance.
const SOUL: AgentSpeakerIdentity = { displayName: "Pip", systemPrompt: "You are Pip. SECRET-SOUL-TOKEN.", avatarAssetId: null };

let db: Db;

beforeEach(async () => {
  db = await freshDb();
  await db.insert(users).values({ id: OWNER, handle: castId<Handle>("owner") });
});

async function seedAgentPrincipal(): Promise<void> {
  await db.insert(users).values({ id: AGENT, handle: castId<Handle>("__agent__buddy__owner"), role: "user", kind: "agent", ownerUserId: OWNER });
  await db.insert(agentPrincipals).values({ userId: AGENT, sourceKind: "buddy", createdAt: 0 });
}

describe("createAgentAuthorResolver — the compose-root author-provenance dispatch", () => {
  test("resolves a seated agent → owner → source resolver, dropping the soul + owner", async () => {
    await seedAgentPrincipal();
    const seen: UserId[] = [];
    const resolve = createAgentAuthorResolver(db, {
      buddy: (ownerUserId) => {
        seen.push(ownerUserId);
        return Promise.resolve(SOUL);
      },
    });

    const provenance = await resolve(AGENT);
    // Provenance is EXACTLY name + sourceKind — no systemPrompt, no avatar, no owner.
    expect(provenance).toStrictEqual({ name: "Pip", sourceKind: "buddy" });
    // The owner-scoping flowed through the FK chain — the resolver saw the OWNER's id, never the agent's.
    expect(seen).toEqual([OWNER]);
    // Leak pin: the soul prompt and the owner id are structurally absent from the serialized product.
    const bytes = JSON.stringify(provenance);
    expect(bytes).not.toContain("SECRET-SOUL-TOKEN");
    expect(bytes).not.toContain(OWNER);
  });

  test("an unhatched source (resolver → null) yields null — export degrades to the character fallback", async () => {
    await seedAgentPrincipal();
    const resolve = createAgentAuthorResolver(db, { buddy: () => Promise.resolve(null) });
    expect(await resolve(AGENT)).toBeNull();
  });

  test("fail-closed: an id with no agent_principals row never reaches a resolver", async () => {
    let called = false;
    const resolve = createAgentAuthorResolver(db, {
      buddy: () => {
        called = true;
        return Promise.resolve(SOUL);
      },
    });
    expect(await resolve(AGENT)).toBeNull();
    expect(called).toBe(false);
  });
});
