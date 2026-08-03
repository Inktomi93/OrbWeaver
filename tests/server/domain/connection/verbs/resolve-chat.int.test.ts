// verb: resolveChat — the chat overlay. The chat row's fields BEAT the UserSettings roleDefaults.chat
// overlay; an empty row falls through to the settings default. Delegates to resolveRole (one home).

import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createConnectionService } from "@orb/server/domain/connection";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeConnHarness, principal } from "../_support.ts";

describe("resolveChat — row beats settings", () => {
  test("the chat row's source beats the UserSettings default", async () => {
    const h = makeConnHarness(await freshDb());
    h.setRoleDefaults({
      chat: { api: "agent-sdk", source: "max-pro-sub", model: "claude-opus-4-8" },
    });
    const svc = createConnectionService(h.ctx);

    const conn = await svc.resolveChat({
      principal: principal(castId<UserId>("user_1")),
      routableChat: { api: "agent-sdk", source: "openrouter", model: "claude-sonnet-5" },
    });

    // row source openrouter beat the settings max-pro-sub; row model won the agent-sdk heal.
    expect(conn.credential.source).toBe("openrouter");
    expect(conn.api).toBe("agent-sdk");
    expect(conn.model).toBe("claude-sonnet-5");
  });

  test("an empty chat row falls through to the UserSettings default", async () => {
    const h = makeConnHarness(await freshDb());
    h.setRoleDefaults({ chat: { source: "vllm" } });
    const svc = createConnectionService(h.ctx);

    const conn = await svc.resolveChat({ principal: principal(castId<UserId>("user_1")), routableChat: {} });

    expect(conn.credential.source).toBe("vllm");
  });
});
