// biome-ignore-all lint/style/useNamingConvention: synthetic SDK message fixtures use the SDK's
// snake_case wire fields (session_id, total_cost_usd, is_error, …).
//
// The host-Claude auth verify (verify-auth.ts via the backend's `verifyAuth`), driven by a fake `query`.
// Load-bearing: the spawn goes through the FIREWALL BASE (tools disabled, strict MCP, no settings — the
// same disciplineOptions a real turn uses) with NO session resume; the init frame's apiKeySource is
// surfaced verbatim ("none" = healthy host login); a clean-but-failed result reports ok:false (never a
// fake success); the result is the USER-vocab `source: "max-pro-sub"` arm.

import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { VerifyAuthResult } from "@orb/contracts/providers";
import { createAgentSdkBackend } from "@orb/server/infra/providers/backends/agent-sdk";
import { describe, vi } from "vitest";
import { makeResolvedCredential } from "../../../../../support/factories/resolved-connection.ts";
import { expect, test } from "../../../../../support/fixtures.ts";
import { streamOf } from "./_support.ts";

const MODEL = "claude-haiku-test";
const SESSION_ID = "sess-verify";

/** The max-pro-sub host mint. */
const SUB_CRED = makeResolvedCredential("max-pro-sub");
const MISSING_APIKEY_RE = /apiKeySource/u;

/** The wired verify fn (the backend always sets it; the cast drops the contract's `| undefined` — the
 *  runner.test ChatTurn precedent). */
type VerifyFn = (req: { readonly credential: ResolvedCredential; readonly model: string }) => Promise<VerifyAuthResult>;

/** Wrap a stream into a fake SDK `Query` that ALSO exposes an `accountInfo` control method — the live-Query
 *  shape `verifyAuth` probes. A bare `streamOf` (no method) exercises the "no control channel" absence path;
 *  the caller supplies `accountInfo` so a test can make it resolve or throw. */
function queryOf(messages: readonly unknown[], accountInfo: () => Promise<unknown>): AsyncGenerator<never> {
  const stream = streamOf(messages) as AsyncGenerator<never> & {
    accountInfo: () => Promise<unknown>;
  };
  stream.accountInfo = accountInfo;
  return stream;
}

/** The identity/plan fields `accountInfo()` returns (the SDK also carries `tokenSource`/`apiKeySource`
 *  internals the SDK-free mapper deliberately drops). */
const ACCOUNT_INFO_RESPONSE = {
  email: "owner@example.com",
  organization: "Acme",
  subscriptionType: "max",
  apiProvider: "firstParty",
  tokenSource: "oauth", // dropped by the mapper (not in the contract shape)
};

const initMsg = { type: "system", subtype: "init", session_id: SESSION_ID, apiKeySource: "none" };
const assistantMsg = {
  type: "assistant",
  session_id: SESSION_ID,
  message: { content: [{ type: "text", text: " ok " }], stop_reason: "end_turn" },
};
const successResult = {
  type: "result",
  subtype: "success",
  session_id: SESSION_ID,
  is_error: false,
  total_cost_usd: 0.0004,
};

describe("agent-sdk verifyAuth", () => {
  test("a healthy host-login probe: apiKeySource surfaced, reply trimmed, cost reported, account enriched", async () => {
    const accountInfo = vi.fn(() => Promise.resolve(ACCOUNT_INFO_RESPONSE));
    const fakeQuery = vi.fn((_args: { options?: Record<string, unknown> }) => queryOf([initMsg, assistantMsg, successResult], accountInfo));
    const backend = createAgentSdkBackend({
      now: () => 0,
      query: fakeQuery as never,
      refreshHostSubToken: () => Promise.resolve(false),
    });

    const result = await (backend.verifyAuth as VerifyFn)({ credential: SUB_CRED, model: MODEL });

    // The account probe enriches the result with the SDK-free identity/plan fields (SDK `tokenSource`
    // internal is dropped by the mapper).
    expect(result).toEqual({
      source: "max-pro-sub",
      ok: true,
      apiKeySource: "none",
      model: MODEL,
      reply: "ok",
      costUsd: 0.0004,
      account: {
        email: "owner@example.com",
        organization: "Acme",
        subscriptionType: "max",
        apiProvider: "firstParty",
      },
    });
    expect(accountInfo).toHaveBeenCalledOnce();
    // The spawn goes through the FIREWALL BASE with no resume (a probe never touches session lineage).
    const options = fakeQuery.mock.calls[0]?.[0]?.options ?? {};
    expect(options["tools"]).toEqual([]);
    expect(options["strictMcpConfig"]).toBe(true);
    expect(options["settingSources"]).toEqual([]);
    expect(options["maxTurns"]).toBe(1);
    expect(options["model"]).toBe(MODEL);
    expect(options["resume"]).toBeUndefined();
    expect(options["sessionStore"]).toBeUndefined();
  });

  test("a throwing accountInfo probe leaves `account` ABSENT — the verify turn still reports", async () => {
    const accountInfo = vi.fn(() => Promise.reject(new Error("control channel down")));
    const fakeQuery = vi.fn(() => queryOf([initMsg, assistantMsg, successResult], accountInfo));
    const backend = createAgentSdkBackend({
      now: () => 0,
      query: fakeQuery as never,
      refreshHostSubToken: () => Promise.resolve(false),
    });

    const result = await (backend.verifyAuth as VerifyFn)({ credential: SUB_CRED, model: MODEL });

    // The probe failed — `account` absent, but the health verdict is intact.
    expect(result.account).toBeUndefined();
    expect(result.ok).toBe(true);
    expect(result.reply).toBe("ok");
  });

  test("no accountInfo control method (a bare stream) → `account` absent, verdict intact", async () => {
    const fakeQuery = vi.fn(() => streamOf([initMsg, assistantMsg, successResult]));
    const backend = createAgentSdkBackend({
      now: () => 0,
      query: fakeQuery as never,
      refreshHostSubToken: () => Promise.resolve(false),
    });

    const result = await (backend.verifyAuth as VerifyFn)({ credential: SUB_CRED, model: MODEL });

    expect(result.account).toBeUndefined();
    expect(result.ok).toBe(true);
  });

  test("an is_error result reports ok:false (never a fake success)", async () => {
    const errorResult = {
      type: "result",
      subtype: "success",
      session_id: SESSION_ID,
      is_error: true,
      total_cost_usd: 0,
    };
    const fakeQuery = vi.fn(() => streamOf([initMsg, errorResult]));
    const backend = createAgentSdkBackend({
      now: () => 0,
      query: fakeQuery as never,
      refreshHostSubToken: () => Promise.resolve(false),
    });

    const result = await (backend.verifyAuth as VerifyFn)({ credential: SUB_CRED, model: MODEL });

    expect(result.ok).toBe(false);
    expect(result.reply).toBe("");
  });

  test("the init shape guard fires on a malformed init frame", async () => {
    const badInit = { type: "system", subtype: "init", session_id: SESSION_ID }; // no apiKeySource
    const fakeQuery = vi.fn(() => streamOf([badInit]));
    const backend = createAgentSdkBackend({
      now: () => 0,
      query: fakeQuery as never,
      refreshHostSubToken: () => Promise.resolve(false),
    });

    await expect((backend.verifyAuth as VerifyFn)({ credential: SUB_CRED, model: MODEL })).rejects.toThrow(MISSING_APIKEY_RE);
  });
});
