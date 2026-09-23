// catalog/listing — the ONE model-list read, driven through the runtime front door (`catalogs.models`) with a
// DRAFT: no connection row exists for any arm below. One arm per catalog strategy (builtin, the keyless
// OpenRouter mirror, a hosted `/v1/models`, an endpoint's own `/v1/models`, the Anthropic list, the agent-sdk
// daemon), then the two properties the pane depends on:
//   • a failed dial is `listed: false` WITH ITS REASON, never an empty success;
//   • a planted secret never reaches the reason or a log line, on every keyed arm.
// The credential arms also pin WHOSE credential is read: the caller's, by id, through the credentials door.

import type { ResolvedSecret } from "@orb/contracts/credentials";
import type { Principal } from "@orb/contracts/identity";
import type { ModelListing, ProviderId } from "@orb/contracts/inference";
import { providerIdSchema } from "@orb/contracts/inference";
import { createInferenceRuntime, DEFAULT_EMBED_MODEL, DEFAULT_RERANK_MODEL, ProviderError } from "@orb/inference";
import type { UserCredentialId, UserId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { describe } from "vitest";
import type { InferenceDeps, InferenceLog } from "../../../packages/inference/src/deps.ts";
import { principal } from "../../support/factories/principal.ts";
import { expect, test } from "../../support/fixtures.ts";
import { fakeApiKeySecret, fakeDeps, newUserId } from "../_support.ts";

const PLANTED = "sk-planted-0123456789abcdef0123456789abcdef";
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const ENDPOINT_BASE = "http://box.local:8000/v1";

interface Recorded {
  readonly url: string;
  readonly headers: Record<string, string>;
}

interface Route {
  readonly match: string;
  readonly status?: number;
  readonly json?: unknown;
  /** Echo the request's own auth header back in the error body — the reflected-secret case. */
  readonly echoAuth?: boolean;
}

function headersOf(init: RequestInit | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  new Headers(init?.headers).forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

function scriptedFetch(routes: readonly Route[], log: Recorded[]): typeof fetch {
  return (input, init) => {
    const url = input instanceof Request ? input.url : input.toString();
    const headers = headersOf(init);
    log.push({ url, headers });
    const route = routes.find((candidate) => url.includes(candidate.match));
    if (route === undefined) {
      return Promise.reject(new Error(`tests/inference: unscripted ${url}`));
    }
    const body = route.echoAuth === true ? { error: `rejected request headers ${Object.values(headers).join(" ")}` } : (route.json ?? {});
    return Promise.resolve(new Response(JSON.stringify(body), { status: route.status ?? 200, headers: { "content-type": "application/json" } }));
  };
}

function capturingLog(): InferenceLog & { readonly text: () => string } {
  const lines: string[] = [];
  const push =
    (level: string): InferenceLog["info"] =>
    (fields, message): void => {
      lines.push(
        `${level} ${message} ${JSON.stringify(fields, (_key, value: unknown) => (value instanceof Error ? `${value.message} ${String(value.cause)}` : value))}`,
      );
    };
  return { debug: push("debug"), info: push("info"), warn: push("warn"), error: push("error"), text: () => lines.join("\n") };
}

interface CredentialRead {
  readonly credentialId: UserCredentialId | null;
  readonly ownerId: UserId;
  readonly providerId: ProviderId;
}

interface Stage {
  readonly alice: Principal;
  readonly credentialId: UserCredentialId;
  readonly requests: Recorded[];
  readonly credentialReads: CredentialRead[];
  readonly log: ReturnType<typeof capturingLog>;
  readonly deps: InferenceDeps;
}

/** A runtime whose credentials door hands out ONE secret, and only to its owner — any other owner is refused,
 *  which is how the credentials domain answers a credential that is not the caller's. */
function stage(options: { routes?: readonly Route[]; claudeExecutable?: string; agentSdkQuery?: unknown } = {}): Stage {
  const aliceId = newUserId();
  const credentialId = mintTypeId(ID_PREFIX.userCredential);
  const requests: Recorded[] = [];
  const credentialReads: CredentialRead[] = [];
  const log = capturingLog();
  const base = fakeDeps({
    fetch: scriptedFetch(options.routes ?? [], requests),
    log,
    ...(options.claudeExecutable !== undefined ? { claudeExecutable: options.claudeExecutable } : {}),
    ...(options.agentSdkQuery !== undefined ? { agentSdkQuery: options.agentSdkQuery } : {}),
  });
  const deps: InferenceDeps = {
    ...base,
    resolveCredential: (args): Promise<ResolvedSecret> => {
      credentialReads.push(args);
      if (args.credentialId === null) {
        return base.resolveCredential(args);
      }
      return args.credentialId === credentialId && args.ownerId === aliceId
        ? Promise.resolve(fakeApiKeySecret(PLANTED))
        : Promise.reject(new Error(`no credential for ${args.providerId}`));
    },
  };
  return { alice: principal(aliceId), credentialId, requests, credentialReads, log, deps };
}

function provider(id: string): ProviderId {
  return providerIdSchema.parse(id);
}

function listedIds(listing: ModelListing): readonly string[] {
  if (!listing.listed) {
    throw new Error(`expected a listed catalog, got listed:false (${listing.reason})`);
  }
  return listing.models.map((model) => model.id);
}

function reasonOf(listing: ModelListing): string {
  if (listing.listed) {
    throw new Error("expected listed:false, got a listed catalog");
  }
  return listing.reason;
}

const OPENROUTER_ROUTES: readonly Route[] = [
  { match: `${OPENROUTER_BASE}/models?output_modalities=embeddings`, json: { data: [] } },
  { match: `${OPENROUTER_BASE}/models?output_modalities=rerank`, json: { data: [] } },
  { match: `${OPENROUTER_BASE}/models`, json: { data: [{ id: "anthropic/claude-opus-5", name: "Claude Opus 5" }] } },
];

describe("a draft lists by the provider's catalog strategy, with no connection row", () => {
  test("builtin: the curated rows with their kinds, and nothing is dialed", async () => {
    const s = stage();
    const runtime = await createInferenceRuntime(s.deps);
    const listing = await runtime.catalogs.models({ principal: s.alice, providerId: provider("local-light"), secret: { credentialId: null }, baseUrl: null });
    expect(listedIds(listing)).toContain(DEFAULT_EMBED_MODEL);
    expect(listing).toMatchObject({ listed: true, models: expect.arrayContaining([expect.objectContaining({ id: DEFAULT_RERANK_MODEL, kind: "rerank" })]) });
    expect(s.requests).toEqual([]);
  });

  test("openrouter: the keyless enriched catalog, dialed with no credential attached", async () => {
    const s = stage({ routes: OPENROUTER_ROUTES });
    const runtime = await createInferenceRuntime(s.deps);
    const listing = await runtime.catalogs.models({
      principal: s.alice,
      providerId: provider("openrouter"),
      secret: { credentialId: s.credentialId },
      baseUrl: null,
    });
    expect(listing).toMatchObject({ listed: true, models: [{ id: "anthropic/claude-opus-5", name: "Claude Opus 5" }] });
    expect(s.requests.every((request) => request.headers["authorization"] === undefined)).toBe(true);
  });

  test("a hosted openai-compatible provider: its FIXED /v1/models with the caller's key", async () => {
    const s = stage({ routes: [{ match: "https://api.openai.com/v1/models", json: { data: [{ id: "gpt-6" }] } }] });
    const runtime = await createInferenceRuntime(s.deps);
    const listing = await runtime.catalogs.models({
      principal: s.alice,
      providerId: provider("openai"),
      secret: { credentialId: s.credentialId },
      baseUrl: null,
    });
    expect(listedIds(listing)).toEqual(["gpt-6"]);
    expect(s.requests.map((request) => [request.url, request.headers["authorization"]])).toEqual([["https://api.openai.com/v1/models", `Bearer ${PLANTED}`]]);
    expect(s.credentialReads).toEqual([{ credentialId: s.credentialId, ownerId: s.alice.userId, providerId: provider("openai") }]);
  });

  test("an endpoint provider: the draft's OWN server, keyed by a raw draft key", async () => {
    const s = stage({ routes: [{ match: `${ENDPOINT_BASE}/models`, json: { data: [{ id: "qwen3", max_model_len: 32_768 }] } }] });
    const runtime = await createInferenceRuntime(s.deps);
    const listing = await runtime.catalogs.models({ principal: s.alice, providerId: provider("vllm"), secret: { key: PLANTED }, baseUrl: ENDPOINT_BASE });
    expect(listing).toMatchObject({ listed: true, models: [{ id: "qwen3", contextLength: 32_768 }] });
    expect(s.requests.at(0)?.headers["authorization"]).toBe(`Bearer ${PLANTED}`);
    expect(s.credentialReads).toEqual([]);
  });

  test("anthropic: GET /v1/models under the caller's key, re-read by id through the credentials door", async () => {
    const s = stage({ routes: [{ match: "https://api.anthropic.com/v1/models", json: { data: [{ id: "claude-opus-5", display_name: "Claude Opus 5" }] } }] });
    const runtime = await createInferenceRuntime(s.deps);
    const listing = await runtime.catalogs.models({
      principal: s.alice,
      providerId: provider("anthropic"),
      secret: { credentialId: s.credentialId },
      baseUrl: null,
    });
    expect(listing).toMatchObject({ listed: true, models: [{ id: "claude-opus-5", name: "Claude Opus 5" }] });
    expect(s.requests.map((request) => [request.url, request.headers["x-api-key"]])).toEqual([["https://api.anthropic.com/v1/models", PLANTED]]);
    expect(s.credentialReads).toEqual([{ credentialId: s.credentialId, ownerId: s.alice.userId, providerId: provider("anthropic") }]);
  });

  test("agent-sdk: the daemon's list under the caller's token, re-read by id", async () => {
    const tokens: string[] = [];
    const query = (args: { options: { env?: Record<string, string | undefined> } }): unknown => {
      tokens.push(args.options.env?.["CLAUDE_CODE_OAUTH_TOKEN"] ?? "");
      return {
        supportedModels: () => Promise.resolve([{ value: "opus", displayName: "Opus", description: "the big one" }]),
        interrupt: (): Promise<void> => Promise.resolve(),
      };
    };
    const s = stage({ claudeExecutable: "/usr/bin/claude", agentSdkQuery: query });
    const runtime = await createInferenceRuntime(s.deps);
    const listing = await runtime.catalogs.models({
      principal: s.alice,
      providerId: provider("claude-sub"),
      secret: { credentialId: s.credentialId },
      baseUrl: null,
    });
    expect(listing).toMatchObject({ listed: true, models: [{ id: "opus", name: "Opus" }] });
    expect(tokens).toEqual([PLANTED]);
    expect(s.credentialReads).toEqual([{ credentialId: s.credentialId, ownerId: s.alice.userId, providerId: provider("claude-sub") }]);
  });
});

describe("a failed dial is listed:false with its reason — never an empty success", () => {
  test("openrouter answering 500", async () => {
    const s = stage({ routes: [{ match: OPENROUTER_BASE, status: 500, json: { error: "upstream exploded" } }] });
    const runtime = await createInferenceRuntime(s.deps);
    const listing = await runtime.catalogs.models({ principal: s.alice, providerId: provider("openrouter"), secret: { credentialId: null }, baseUrl: null });
    expect(reasonOf(listing)).toMatch(/HTTP 500/u);
  });

  test("an endpoint answering 500, and an endpoint that lists nothing, are two different reasons", async () => {
    const failing = stage({ routes: [{ match: ENDPOINT_BASE, status: 500, json: { error: "boom" } }] });
    const failed = await (await createInferenceRuntime(failing.deps)).catalogs.models({
      principal: failing.alice,
      providerId: provider("vllm"),
      secret: { credentialId: null },
      baseUrl: ENDPOINT_BASE,
    });
    const empty = stage({ routes: [{ match: ENDPOINT_BASE, json: { data: [] } }] });
    const none = await (await createInferenceRuntime(empty.deps)).catalogs.models({
      principal: empty.alice,
      providerId: provider("vllm"),
      secret: { credentialId: null },
      baseUrl: ENDPOINT_BASE,
    });
    expect(reasonOf(failed)).toMatch(/HTTP 500/u);
    expect(reasonOf(none)).toBe("the provider listed no models");
  });

  test("agent-sdk without the bundled runtime says so instead of listing nothing", async () => {
    const s = stage();
    const runtime = await createInferenceRuntime(s.deps);
    const listing = await runtime.catalogs.models({
      principal: s.alice,
      providerId: provider("claude-sub"),
      secret: { credentialId: s.credentialId },
      baseUrl: null,
    });
    expect(reasonOf(listing)).toMatch(/runtime/u);
  });

  test("a raw draft key cannot reach a wire that authenticates only through a saved credential", async () => {
    const s = stage({ claudeExecutable: "/usr/bin/claude" });
    const runtime = await createInferenceRuntime(s.deps);
    const listing = await runtime.catalogs.models({ principal: s.alice, providerId: provider("anthropic"), secret: { key: PLANTED }, baseUrl: null });
    expect(reasonOf(listing)).toMatch(/saved credential/u);
    expect(s.requests).toEqual([]);
  });
});

describe("a planted secret reaches neither the reason nor a log line", () => {
  test("anthropic reflecting the key in a 401 body", async () => {
    const s = stage({ routes: [{ match: "https://api.anthropic.com/v1/models", status: 401, echoAuth: true }] });
    const runtime = await createInferenceRuntime(s.deps);
    const listing = await runtime.catalogs.models({
      principal: s.alice,
      providerId: provider("anthropic"),
      secret: { credentialId: s.credentialId },
      baseUrl: null,
    });
    const reason = reasonOf(listing);
    // The control: the reflected body really carried the key, so a clean reason is the scrub, not an absence.
    expect(s.requests.at(0)?.headers["x-api-key"]).toBe(PLANTED);
    expect(reason).toMatch(/HTTP 401/u);
    expect(reason).not.toContain(PLANTED);
    expect(s.log.text()).not.toContain(PLANTED);
  });

  test("an endpoint reflecting the raw draft key in a 500 body", async () => {
    const s = stage({ routes: [{ match: ENDPOINT_BASE, status: 500, echoAuth: true }] });
    const runtime = await createInferenceRuntime(s.deps);
    const listing = await runtime.catalogs.models({ principal: s.alice, providerId: provider("vllm"), secret: { key: PLANTED }, baseUrl: ENDPOINT_BASE });
    const reason = reasonOf(listing);
    expect(s.requests.at(0)?.headers["authorization"]).toBe(`Bearer ${PLANTED}`);
    expect(reason).toMatch(/HTTP 500/u);
    expect(reason).not.toContain(PLANTED);
    expect(s.log.text()).not.toContain(PLANTED);
  });

  test("the agent-sdk daemon naming the token in its failure", async () => {
    const query = (): unknown => ({
      supportedModels: () => Promise.reject(new Error(`auth rejected for ${PLANTED}`)),
      interrupt: (): Promise<void> => Promise.resolve(),
    });
    const s = stage({ claudeExecutable: "/usr/bin/claude", agentSdkQuery: query });
    const runtime = await createInferenceRuntime(s.deps);
    const listing = await runtime.catalogs.models({
      principal: s.alice,
      providerId: provider("claude-sub"),
      secret: { credentialId: s.credentialId },
      baseUrl: null,
    });
    const reason = reasonOf(listing);
    expect(reason).toMatch(/auth rejected/u);
    expect(reason).not.toContain(PLANTED);
    // The control: the mirror DID log this failure, so a clean log is the scrub, not silence.
    expect(s.log.text()).toContain("auth rejected");
    expect(s.log.text()).not.toContain(PLANTED);
  });
});

describe("refusals are thrown, not listed", () => {
  test("a credential the caller does not hold is refused before any dial", async () => {
    const s = stage({ routes: [{ match: "https://api.anthropic.com/v1/models", json: { data: [] } }] });
    const runtime = await createInferenceRuntime(s.deps);
    const stranger = principal(newUserId());
    await expect(
      runtime.catalogs.models({ principal: stranger, providerId: provider("anthropic"), secret: { credentialId: s.credentialId }, baseUrl: null }),
    ).rejects.toThrow(/no credential/u);
    expect(s.requests).toEqual([]);
  });

  test("an unregistered provider is a typed refusal", async () => {
    const s = stage();
    const runtime = await createInferenceRuntime(s.deps);
    await expect(
      runtime.catalogs.models({ principal: s.alice, providerId: provider("no-such-provider"), secret: { credentialId: null }, baseUrl: null }),
    ).rejects.toBeInstanceOf(ProviderError);
  });
});
