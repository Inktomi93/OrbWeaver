// verb: listMyAgents (D67 amendment) — the owner's agent principals (kind='agent' rows they own + the
// satellite sourceKind), for the connections pane's per-agent connection table. sessions is the sanctioned
// users reader. Scoped by ownerUserId (the caller's own id) — returns ONLY the caller's agents.

import type { Db } from "@orb/db";
import { users } from "@orb/db";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { SessionsService } from "@orb/server/domain/sessions";
import { beforeEach, describe } from "vitest";
import { freshDb } from "../../../../support/db";
import { expect, test } from "../../../../support/fixtures";
import { makeService } from "../_support.ts";

const OWNER = castId<UserId>("user_owner");
const OTHER = castId<UserId>("user_other");

let db: Db;
let svc: SessionsService;

beforeEach(async () => {
  db = await freshDb();
  ({ svc } = makeService(db));
  await db.insert(users).values({ id: OWNER, handle: castId<Handle>("owner") });
  await db.insert(users).values({ id: OTHER, handle: castId<Handle>("other") });
});

describe("sessions.listMyAgents", () => {
  test("returns the caller's OWN agents (agentUserId + sourceKind)", async () => {
    const { agentUserId } = await svc.provisionAgentPrincipal({ ownerUserId: OWNER, sourceKind: "buddy" });

    const agents = await svc.listMyAgents(OWNER);

    expect(agents).toEqual([{ agentUserId, sourceKind: "buddy" }]);
  });

  test("is empty when the caller has provisioned no agent principal (buddy exists only after first seat)", async () => {
    expect(await svc.listMyAgents(OWNER)).toEqual([]);
  });

  test("is scoped to the caller — never another owner's agents", async () => {
    await svc.provisionAgentPrincipal({ ownerUserId: OTHER, sourceKind: "buddy" });

    // OWNER owns nothing; OTHER's agent must not leak into OWNER's list.
    expect(await svc.listMyAgents(OWNER)).toEqual([]);
    expect(await svc.listMyAgents(OTHER)).toHaveLength(1);
  });
});
