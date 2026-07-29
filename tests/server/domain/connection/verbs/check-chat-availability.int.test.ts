// verb: checkChatAvailability — the honest-refusal pre-send gate (#54). The DETERMINISTIC serveability
// verdict for a chat's own resolved connection, WITHOUT firing a turn or an API call. Engine-agnostic: the
// unavailable causes are (a) a local engine that's off, (b) an unconfigured/incoherent connection. A present
// engine (incl. ASLEEP — availability is presence, not wakefulness) and a configured hosted connection both
// read available; a hosted api is NEVER pre-flighted here.

import { createConnectionService } from "@orb/server/domain/connection";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeConnHarness, principal } from "../_support.ts";

describe("checkChatAvailability — the deterministic pre-send serveability verdict (#54)", () => {
  test("a vllm chat with the engine OFF is unavailable (engine-off)", async () => {
    const h = makeConnHarness(await freshDb());
    h.setRoleDefaults({ chat: { api: "chat-completions", source: "vllm" } });
    h.setVllmAvailable(false); // ENGINES_POSTURE=off / no GPU — the vllm backend is absent from the registry
    const svc = createConnectionService(h.ctx);

    const verdict = await svc.checkChatAvailability({ principal: principal("user_1"), routableChat: {} });

    expect(verdict).toEqual({ available: false, cause: "engine-off" });
  });

  test("a vllm chat with the engine PRESENT (incl. asleep — presence, not wakefulness) is available", async () => {
    const h = makeConnHarness(await freshDb());
    h.setRoleDefaults({ chat: { api: "chat-completions", source: "vllm" } });
    // vllmAvailable defaults to true — the backend is registered. A sleeping engine wakes on the turn; we do
    // NOT refuse it (there is no separate "asleep" fact — availability is "the backend is present/enabled").
    const svc = createConnectionService(h.ctx);

    const verdict = await svc.checkChatAvailability({ principal: principal("user_1"), routableChat: {} });

    expect(verdict).toEqual({ available: true });
  });

  test("a configured HOSTED connection (openrouter) is available — never pre-flighted", async () => {
    const h = makeConnHarness(await freshDb());
    h.setRoleDefaults({ chat: { api: "chat-completions", source: "openrouter" } });
    const svc = createConnectionService(h.ctx);

    const verdict = await svc.checkChatAvailability({ principal: principal("user_1"), routableChat: {} });

    expect(verdict).toEqual({ available: true });
    // The credential row was READ (the deterministic presence check), but no upstream API call is implied —
    // the harness's resolveCredential is a pure fake, mirroring the real DB-only read.
    expect(h.credentialCalls).toContain("openrouter");
  });

  test("a hosted connection with NO configured credential is unavailable (no-connection)", async () => {
    const h = makeConnHarness(await freshDb());
    h.setRoleDefaults({ chat: { api: "chat-completions", source: "openrouter" } });
    h.setNoCredentialSource("openrouter"); // no key on file — the deterministic "nothing to serve with" case
    const svc = createConnectionService(h.ctx);

    const verdict = await svc.checkChatAvailability({ principal: principal("user_1"), routableChat: {} });

    expect(verdict).toEqual({ available: false, cause: "no-connection" });
  });

  test("an incoherent routing selection is unavailable (no-connection)", async () => {
    const h = makeConnHarness(await freshDb());
    // chat-completions × max-pro-sub is incoherent (the sub runs on agent-sdk only) — resolveChat throws
    // ConnectionRoutingError, which the gate reads as "no working connection".
    h.setRoleDefaults({ chat: { api: "chat-completions", source: "max-pro-sub" } });
    const svc = createConnectionService(h.ctx);

    const verdict = await svc.checkChatAvailability({ principal: principal("user_1"), routableChat: {} });

    expect(verdict).toEqual({ available: false, cause: "no-connection" });
  });

  test("the chat-row routing overlay BEATS the roleDefault — a row pinning vllm on an off engine refuses", async () => {
    const h = makeConnHarness(await freshDb());
    // The user default is a configured hosted connection (would be available)…
    h.setRoleDefaults({ chat: { api: "chat-completions", source: "openrouter" } });
    h.setVllmAvailable(false);
    const svc = createConnectionService(h.ctx);

    // …but THIS chat pins the local engine, which is off — the overlay wins, so the verdict is engine-off.
    const verdict = await svc.checkChatAvailability({
      principal: principal("user_1"),
      routableChat: { api: "chat-completions", source: "vllm" },
    });

    expect(verdict).toEqual({ available: false, cause: "engine-off" });
  });
});
