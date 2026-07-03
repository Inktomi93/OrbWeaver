// agent-principals.int — the D60 agent-principal registry satellite (agent-principal-design/01 §2). Real
// libSQL :memory: (FK enforcement ON via freshDb). Covers: the source_kind CHECK + the AGENT_SOURCE_KINDS
// test-mirror (db === contracts), a valid row (keyed on a kind='agent' users row), and the CASCADE (delete the
// agent users row → the satellite row vanishes). FLAG[PD-17]: the table is born EMPTY at AP0 —
// provisionAgentPrincipal (AP1) is the only real INSERT site; these hand-insert to pin the schema in isolation.

import { AGENT_SOURCE_KINDS } from "@orb/contracts/identity";
import { agentPrincipals, isConstraintViolation, users } from "@orb/db";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { freshDb } from "../../support/db";
import { expect, test } from "../../support/fixtures";

// Seed a human owner + an owned `kind='agent'` users row (the satellite's FK target; the agent-shape CHECK).
async function seedAgentUser(db: Awaited<ReturnType<typeof freshDb>>): Promise<UserId> {
  const ownerId = castId<UserId>("user_owner");
  await db.insert(users).values({ id: ownerId, handle: castId<Handle>("owner") });
  const agentId = castId<UserId>("user_agent");
  await db.insert(users).values({
    id: agentId,
    handle: castId<Handle>("__agent__buddy__user_owner"),
    role: "user",
    kind: "agent",
    ownerUserId: ownerId,
  });
  return agentId;
}

test("test-mirror: agent_principals.sourceKind derives the canonical AGENT_SOURCE_KINDS tuple", () => {
  expect([...agentPrincipals.sourceKind.enumValues]).toEqual([...AGENT_SOURCE_KINDS]);
});

test("a valid agent_principals row inserts (keyed on the agent users row)", async () => {
  const db = await freshDb();
  const agentId = await seedAgentUser(db);
  await db.insert(agentPrincipals).values({ userId: agentId, sourceKind: "buddy" });
  const rows = await db.select().from(agentPrincipals).where(eq(agentPrincipals.userId, agentId));
  expect(rows).toHaveLength(1);
  expect(rows[0]?.sourceKind).toBe("buddy");
  expect(rows[0]?.createdAt).toBeTypeOf("number");
});

test("the source_kind CHECK rejects an off-enum source", async () => {
  const db = await freshDb();
  const agentId = await seedAgentUser(db);
  const bad: string = "webhook";
  let caught: unknown;
  try {
    await db
      .insert(agentPrincipals)
      .values({ userId: agentId, sourceKind: bad as (typeof AGENT_SOURCE_KINDS)[number] });
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)?.kind).toBe("check");
});

test("deleting the agent users row CASCADEs the satellite (no orphan)", async () => {
  const db = await freshDb();
  const agentId = await seedAgentUser(db);
  await db.insert(agentPrincipals).values({ userId: agentId, sourceKind: "buddy" });
  await db.delete(users).where(eq(users.id, agentId));
  const rows = await db.select().from(agentPrincipals).where(eq(agentPrincipals.userId, agentId));
  expect(rows).toHaveLength(0);
});
