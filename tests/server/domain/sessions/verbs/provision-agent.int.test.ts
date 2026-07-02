// verb: provisionAgentPrincipal (D60; agent-principal-design/01 §4) — the agent-principal MINT (the ONLY site
// that writes a kind:'agent' row). Gates the owner (human + enabled), inserts the agent users row + the
// agent_principals satellite atomically, audits AGENT_PRINCIPAL_MINTED. Idempotent by the deterministic
// __agent__ handle. FLAG[PD-17]: unwired to a production caller until AP3 (seatAgent) — tested directly here.

import type { Db } from "@orb/db";
import { agentPrincipals, auditLogs, users } from "@orb/db";
import { DomainForbiddenError, DomainNotFoundError } from "@orb/kit/errors";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { SessionsService } from "@orb/server/domain/sessions";
import { createSessionsService } from "@orb/server/domain/sessions";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { createFrozenClock } from "../../../../support/clock";
import { freshDb } from "../../../../support/db";
import { expect, test } from "../../../../support/fixtures";

const PEPPER = "test-session-secret-at-least-32-chars-long";
const OWNER = castId<UserId>("user_owner");
const MINTED = "AGENT_PRINCIPAL_MINTED";

let db: Db;
let svc: SessionsService;
const clock = createFrozenClock();

beforeEach(async () => {
  db = await freshDb();
  svc = createSessionsService({ db, now: clock.now, sessionSecret: PEPPER });
  await db.insert(users).values({ id: OWNER, handle: castId<Handle>("owner") });
});

describe("sessions.provisionAgentPrincipal", () => {
  test("mints a loginless, owned agent principal + satellite + audit (created:true)", async () => {
    const { agentUserId, created } = await svc.provisionAgentPrincipal({
      ownerUserId: OWNER,
      sourceKind: "buddy",
    });
    expect(created).toBe(true);
    const u = (await db.select().from(users).where(eq(users.id, agentUserId)))[0];
    // The structural agent shape (the users_agent_shape CHECK also enforces it): loginless, unprivileged, owned.
    expect(u?.kind).toBe("agent");
    expect(u?.role).toBe("user");
    expect(u?.ownerUserId).toBe(OWNER);
    expect(u?.passwordHash).toBeNull();
    expect(u?.externalId).toBeNull();
    expect(u?.handle).toBe(`__agent__buddy__${OWNER}`);
    const sat = (
      await db.select().from(agentPrincipals).where(eq(agentPrincipals.userId, agentUserId))
    )[0];
    expect(sat?.sourceKind).toBe("buddy");
    const audits = await db.select().from(auditLogs).where(eq(auditLogs.action, MINTED));
    expect(audits).toHaveLength(1);
    expect(audits[0]?.entityId).toBe(agentUserId);
  });

  test("is idempotent — a re-call ADOPTS the existing row (created:false, same id, one satellite, no 2nd audit)", async () => {
    const first = await svc.provisionAgentPrincipal({ ownerUserId: OWNER, sourceKind: "buddy" });
    const second = await svc.provisionAgentPrincipal({ ownerUserId: OWNER, sourceKind: "buddy" });
    expect(second.created).toBe(false);
    expect(second.agentUserId).toBe(first.agentUserId);
    expect(await db.select().from(agentPrincipals)).toHaveLength(1);
    expect(await db.select().from(auditLogs).where(eq(auditLogs.action, MINTED))).toHaveLength(1);
  });

  test("refuses an unknown owner (leak-free not-found)", async () => {
    await expect(
      svc.provisionAgentPrincipal({
        ownerUserId: castId<UserId>("user_ghost"),
        sourceKind: "buddy",
      }),
    ).rejects.toThrow(DomainNotFoundError);
  });

  test("refuses a NON-HUMAN owner — no nested agents (not-found)", async () => {
    const agent = await svc.provisionAgentPrincipal({ ownerUserId: OWNER, sourceKind: "buddy" });
    await expect(
      svc.provisionAgentPrincipal({ ownerUserId: agent.agentUserId, sourceKind: "buddy" }),
    ).rejects.toThrow(DomainNotFoundError);
  });

  test("refuses a DISABLED human owner (forbidden — a disabled human cannot mint hands)", async () => {
    await db.update(users).set({ enabled: false }).where(eq(users.id, OWNER));
    await expect(
      svc.provisionAgentPrincipal({ ownerUserId: OWNER, sourceKind: "buddy" }),
    ).rejects.toThrow(DomainForbiddenError);
    expect(await db.select().from(users).where(eq(users.kind, "agent"))).toHaveLength(0);
  });
});
