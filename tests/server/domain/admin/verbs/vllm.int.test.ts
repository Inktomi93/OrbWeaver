// verbs: vllmEngines / restartVllmEngine — admin-gated delegation to the injected VllmSupervisorPort.
// vllmEngines is a read (no audit); restartVllmEngine audits and translates a supervisor failure into a
// typed DomainOperationError(restart_engine) with the original error preserved as `cause`.

import { DomainForbiddenError, DomainOperationError } from "@orb/kit/errors";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createAdminService } from "@orb/server/domain/admin";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, principal, seedUser } from "../_support.ts";

describe("admin vllm verbs", () => {
  test("vllmEngines returns the supervisor snapshot (no audit)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createAdminService(h.ctx);
    const admin = await seedUser(db, { id: "user_adm", role: "admin", handle: castId<Handle>("adm") });
    const statuses = await svc.vllmEngines({ principal: principal(admin, "admin") });
    expect(statuses["chat"]?.status).toBe("owned");
    // The read-only DEPLOYMENT facts (port + store path) ride the same snapshot the panel renders.
    expect(statuses["chat"]?.port).toBe(8701);
    expect(statuses["chat"]?.storePath).toBe("/srv/orb/store");
    expect(h.audits).toHaveLength(0);
  });

  test("restartVllmEngine returns the status line, records the restart, and audits", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createAdminService(h.ctx);
    const admin = await seedUser(db, { id: "user_adm", role: "admin", handle: castId<Handle>("adm") });
    const line = await svc.restartVllmEngine({
      principal: principal(admin, "admin"),
      engine: "chat",
    });
    expect(line).toContain("chat");
    expect(h.restarted).toContain("chat");
    expect(h.audits.map((a) => a.entry.action)).toContain("admin.restartVllmEngine");
  });

  test("a supervisor failure becomes DomainOperationError(restart_engine) with the cause preserved", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const cause = new Error("supervisor exploded");
    h.setRestartError(cause);
    const svc = createAdminService(h.ctx);
    const admin = await seedUser(db, { id: "user_adm", role: "admin", handle: castId<Handle>("adm") });
    const err = await svc
      .restartVllmEngine({ principal: principal(admin, "admin"), engine: "chat" })
      .then(() => undefined)
      .catch((e: unknown): unknown => e);
    expect(err).toBeInstanceOf(DomainOperationError);
    expect((err as DomainOperationError).code).toBe("restart_engine");
    expect((err as DomainOperationError).cause).toBe(cause);
  });

  test("a plain user is denied", async () => {
    const db = await freshDb();
    const svc = createAdminService(makeHarness(db).ctx);
    const u = await seedUser(db, { id: "user_u", role: "user", handle: castId<Handle>("u") });
    await expect(svc.vllmEngines({ principal: principal(u, "user") })).rejects.toThrow(DomainForbiddenError);
  });
});
