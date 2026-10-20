// substrate/capability — the declarative can() ceiling check (belt one). Pure. Pins: null capability (member
// floor) always passes without consulting can(), a global-scope ceiling calls can() with a global resource, a
// chat-scoped ceiling with no roster (executed outside a chat) refuses BEFORE reaching can(), and a chat-scoped
// ceiling with a roster forwards it verbatim.

import type { Can } from "@orb/contracts/identity";
import { DomainForbiddenError } from "@orb/kit/errors";
import { castId } from "@orb/kit/ids";
import { freshDb } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe, vi } from "vitest";
import { checkToolCapability } from "#server/domain/tool-use/substrate/capability.ts";
import { seatRoles } from "../../chat/_support.ts";
import { execOf } from "../_support.ts";

// Seat roles are captured row data: one in-memory room supplies the host and member roles these checks read.
const ROLES = await seatRoles(await freshDb());

test("a null capability (member floor) passes without calling can()", async () => {
  const can = vi.fn() as unknown as Can;
  const exec = await execOf(await freshDb());
  expect(() => checkToolCapability(null, exec, can)).not.toThrow();
  expect(can).not.toHaveBeenCalled();
});

describe("global scope", () => {
  test("calls can() with a global resource and the declared action", async () => {
    const db = await freshDb();
    const can = vi.fn() as unknown as Can;
    const exec = await execOf(db);
    checkToolCapability({ scope: "global", action: "admin" }, exec, can);
    expect(can).toHaveBeenCalledWith(exec.principal, "admin", { kind: "global" });
  });

  test("a can() denial propagates (the caller catches and converts to errors-as-data)", async () => {
    const can: Can = ((): void => {
      throw new DomainForbiddenError("nope");
    }) as unknown as Can;
    const exec = await execOf(await freshDb());
    expect(() => checkToolCapability({ scope: "global", action: "admin" }, exec, can)).toThrow(DomainForbiddenError);
  });
});

describe("chat scope", () => {
  test("a chat-scoped ceiling with NO membership (executed outside a chat) refuses BEFORE calling can()", async () => {
    const can = vi.fn() as unknown as Can;
    const exec = await execOf(await freshDb(), { membership: null });
    expect(() => checkToolCapability({ scope: "chat", action: "host" }, exec, can)).toThrow(DomainForbiddenError);
    expect(can).not.toHaveBeenCalled();
  });

  test("a chat-scoped ceiling with a membership forwards it verbatim to can()", async () => {
    const db = await freshDb();
    const can = vi.fn() as unknown as Can;
    const membership = { role: ROLES.member };
    const exec = await execOf(db, { chatId: castId("chat_x"), membership });
    checkToolCapability({ scope: "chat", action: "host" }, exec, can);
    expect(can).toHaveBeenCalledWith(exec.principal, "host", { kind: "chat", membership });
  });
});
