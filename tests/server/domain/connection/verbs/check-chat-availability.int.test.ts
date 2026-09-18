// verb: checkChatAvailability — the honest-refusal pre-send gate (#54). The DETERMINISTIC serveability
// verdict for a chat's own resolved connection, WITHOUT firing a turn or an API call. Engine-agnostic. For the
// LOCAL vllm arm the causes are posture+reachability-keyed: OFF → engine-off; adopt-only + a DOWN gen engine
// (passive posture, never self-recovers) → engine-down; adopt-or-start + DOWN → AVAILABLE (the fleet manager
// spawns on the turn); asleep/warming/up → available (asleep wakes on the turn). An unconfigured/incoherent
// connection → no-connection. A configured hosted connection is available and NEVER pre-flighted.

import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createConnectionService } from "@orb/server/domain/connection";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeConnHarness, principal } from "../_support.ts";

describe("checkChatAvailability — the deterministic pre-send serveability verdict (#54)", () => {
  test("a vllm chat with the engine posture OFF is unavailable (engine-off)", async () => {
    const h = makeConnHarness(await freshDb());
    h.setRoleDefaults({ chat: { api: "chat-completions", source: "vllm" } });
    h.setEnginesPosture("off"); // ENGINES_POSTURE=off — the vllm backend is absent from the registry
    const svc = createConnectionService(h.ctx);

    const verdict = await svc.checkChatAvailability({ principal: principal(castId<UserId>("user_1")), routableChat: {} });

    expect(verdict).toEqual({ available: false, cause: "engine-off" });
  });

  test("no GPU (!vllmAvailable) is engine-off even when posture registers a backend", async () => {
    const h = makeConnHarness(await freshDb());
    h.setRoleDefaults({ chat: { api: "chat-completions", source: "vllm" } });
    h.setVllmAvailable(false); // no GPU — the derive fallback disables the local engine
    const svc = createConnectionService(h.ctx);

    const verdict = await svc.checkChatAvailability({ principal: principal(castId<UserId>("user_1")), routableChat: {} });

    expect(verdict).toEqual({ available: false, cause: "engine-off" });
  });

  // THE ABSENT-ENGINE ARM OF THE BORN DEFAULT (#196). The unconfigured chat default is now local vLLM for
  // EVERY principal role, and a generation role never falls back to local-light (it cannot generate) — so on a
  // GPU-less box a never-configured install must refuse HONESTLY here rather than fail late at the engine.
  // This is the whole degrade story for the flip: the composer disables send and names the cause.
  test.each([
    ["a member", principal(castId<UserId>("user_1"))],
    ["the OWNER", principal(castId<UserId>("owner_1"), "owner")],
  ] as const)("%s with NO routing configured at all on a GPU-less box reads engine-off (never a late failure)", async (_who, actor) => {
    const h = makeConnHarness(await freshDb());
    h.setVllmAvailable(false); // no GPU, and nothing configured — the fresh-install worst case
    const svc = createConnectionService(h.ctx);

    const verdict = await svc.checkChatAvailability({ principal: actor, routableChat: {} });

    expect(verdict).toEqual({ available: false, cause: "engine-off" });
  });

  test("adopt-only + a DOWN gen engine is unavailable (engine-down) — the passive posture never self-recovers", async () => {
    const h = makeConnHarness(await freshDb());
    h.setRoleDefaults({ chat: { api: "chat-completions", source: "vllm" } });
    h.setEnginesPosture("adopt-only");
    h.setGenReachability("down");
    const svc = createConnectionService(h.ctx);

    const verdict = await svc.checkChatAvailability({ principal: principal(castId<UserId>("user_1")), routableChat: {} });

    expect(verdict).toEqual({ available: false, cause: "engine-down" });
  });

  test("adopt-only + an ASLEEP gen engine is available — it wakes on the turn (never refuse a sleeper)", async () => {
    const h = makeConnHarness(await freshDb());
    h.setRoleDefaults({ chat: { api: "chat-completions", source: "vllm" } });
    h.setEnginesPosture("adopt-only");
    h.setGenReachability("asleep");
    const svc = createConnectionService(h.ctx);

    const verdict = await svc.checkChatAvailability({ principal: principal(castId<UserId>("user_1")), routableChat: {} });

    expect(verdict).toEqual({ available: true });
  });

  test("adopt-only + an UP gen engine is available", async () => {
    const h = makeConnHarness(await freshDb());
    h.setRoleDefaults({ chat: { api: "chat-completions", source: "vllm" } });
    h.setEnginesPosture("adopt-only");
    h.setGenReachability("up");
    const svc = createConnectionService(h.ctx);

    const verdict = await svc.checkChatAvailability({ principal: principal(castId<UserId>("user_1")), routableChat: {} });

    expect(verdict).toEqual({ available: true });
  });

  test("adopt-or-start + a DOWN gen engine is AVAILABLE — the fleet manager spawns it on the turn", async () => {
    const h = makeConnHarness(await freshDb());
    h.setRoleDefaults({ chat: { api: "chat-completions", source: "vllm" } });
    h.setEnginesPosture("adopt-or-start");
    h.setGenReachability("down");
    const svc = createConnectionService(h.ctx);

    const verdict = await svc.checkChatAvailability({ principal: principal(castId<UserId>("user_1")), routableChat: {} });

    expect(verdict).toEqual({ available: true });
  });

  test("a configured HOSTED connection (openrouter) is available — never pre-flighted", async () => {
    const h = makeConnHarness(await freshDb());
    h.setRoleDefaults({ chat: { api: "chat-completions", source: "openrouter" } });
    const svc = createConnectionService(h.ctx);

    const verdict = await svc.checkChatAvailability({ principal: principal(castId<UserId>("user_1")), routableChat: {} });

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

    const verdict = await svc.checkChatAvailability({ principal: principal(castId<UserId>("user_1")), routableChat: {} });

    expect(verdict).toEqual({ available: false, cause: "no-connection" });
  });

  test("an incoherent routing selection is unavailable (no-connection)", async () => {
    const h = makeConnHarness(await freshDb());
    // chat-completions × max-pro-sub is incoherent (the sub runs on agent-sdk only) — resolveChat throws
    // ConnectionRoutingError, which the gate reads as "no working connection".
    h.setRoleDefaults({ chat: { api: "chat-completions", source: "max-pro-sub" } });
    const svc = createConnectionService(h.ctx);

    const verdict = await svc.checkChatAvailability({ principal: principal(castId<UserId>("user_1")), routableChat: {} });

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
      principal: principal(castId<UserId>("user_1")),
      routableChat: { api: "chat-completions", source: "vllm" },
    });

    expect(verdict).toEqual({ available: false, cause: "engine-off" });
  });

  // 2026-09-18 — the max-pro-sub twin of `engine-off`. The backend became OPTIONAL (registered only when a
  // Claude subscription credential is present, or CLAUDE_BACKEND=on), and `resolveChat` cannot see that: the
  // max-pro-sub credential mint is OWNER-gated, not backend-gated, so it resolves perfectly on a box with no
  // backend at all. Without this arm the composer reads AVAILABLE and the send fails LATE at `requireBackend`
  // — the exact "the button lied" shape this gate exists to prevent.
  test("a chat routed to the sub is unavailable when the host-Claude backend is absent (host-claude)", async () => {
    const h = makeConnHarness(await freshDb());
    h.setRoleDefaults({ chat: { api: "agent-sdk", source: "max-pro-sub" } });
    h.setHostClaude(false, "auto");
    const svc = createConnectionService(h.ctx);

    const verdict = await svc.checkChatAvailability({ principal: principal(castId<UserId>("user_1")), routableChat: {} });

    expect(verdict).toEqual({ available: false, cause: "host-claude" });
  });

  // POSITIVE CONTROL — the arm keys on the REGISTRATION fact, not on the source: an available sub still sends.
  test("the same chat is AVAILABLE when the host-Claude backend is registered", async () => {
    const h = makeConnHarness(await freshDb());
    h.setRoleDefaults({ chat: { api: "agent-sdk", source: "max-pro-sub" } });
    const svc = createConnectionService(h.ctx);

    const verdict = await svc.checkChatAvailability({ principal: principal(castId<UserId>("user_1")), routableChat: {} });

    expect(verdict).toEqual({ available: true });
  });
});
