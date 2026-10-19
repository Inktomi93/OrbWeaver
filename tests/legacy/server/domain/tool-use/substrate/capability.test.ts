// substrate/capability — the declarative can() ceiling check (belt one). Pure. Pins: null capability (member
// floor) always passes without consulting can(), a global-scope ceiling calls can() with a global resource, a
// chat-scoped ceiling with no roster (executed outside a chat) refuses BEFORE reaching can(), and a chat-scoped
// ceiling with a roster forwards it verbatim.

import type { Can } from "@orb/contracts/identity";
import { DomainForbiddenError } from "@orb/kit/errors";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe, vi } from "vitest";
import { checkToolCapability } from "#server/domain/tool-use/substrate/capability.ts";
import { execOf } from "../_support.ts";

test("a null capability (member floor) passes without calling can()", () => {
  const can = vi.fn() as unknown as Can;
  expect(() => checkToolCapability(null, execOf(), can)).not.toThrow();
  expect(can).not.toHaveBeenCalled();
});

describe("global scope", () => {
  test("calls can() with a global resource and the declared action", () => {
    const can = vi.fn() as unknown as Can;
    const exec = execOf();
    checkToolCapability({ scope: "global", action: "admin" }, exec, can);
    expect(can).toHaveBeenCalledWith(exec.principal, "admin", { kind: "global" });
  });

  test("a can() denial propagates (the caller catches and converts to errors-as-data)", () => {
    const can: Can = ((): void => {
      throw new DomainForbiddenError("nope");
    }) as unknown as Can;
    expect(() => checkToolCapability({ scope: "global", action: "admin" }, execOf(), can)).toThrow(DomainForbiddenError);
  });
});

describe("chat scope", () => {
  test("a chat-scoped ceiling with NO membership (executed outside a chat) refuses BEFORE calling can()", () => {
    const can = vi.fn() as unknown as Can;
    expect(() => checkToolCapability({ scope: "chat", action: "host" }, execOf({ membership: null }), can)).toThrow(DomainForbiddenError);
    expect(can).not.toHaveBeenCalled();
  });

  test("a chat-scoped ceiling with a membership forwards it verbatim to can()", () => {
    const can = vi.fn() as unknown as Can;
    const membership = { role: "member" as const };
    const exec = execOf({ chatId: castId("chat_x"), membership });
    checkToolCapability({ scope: "chat", action: "host" }, exec, can);
    expect(can).toHaveBeenCalledWith(exec.principal, "host", { kind: "chat", membership });
  });
});
