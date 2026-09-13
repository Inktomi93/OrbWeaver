// createProviderDiagnostics — the diagnostic FRONT DOOR. Binds a wired registry of FAKE backends and
// asserts the bound surface routes probe/accountCredits/generationCost/inspect on `credential.source` and
// fetchOrCatalog to the OpenRouter backend, fail-closing (typed ProviderError) on an unwired backend or a
// backend that doesn't implement the verb. Exercises the dispatch seam without any real backend.

import type { ModelCatalogEntry } from "@orb/contracts/connection";
import type { CredentialHealth, ResolvedCredential } from "@orb/contracts/credentials";
import type { AccountCredits, EndpointInspection, GenerationCost } from "@orb/contracts/providers";
import type { GenerationCostRequest, InspectRequest, ProviderBackend } from "@orb/server/infra/providers";
import { createProviderDiagnostics, ProviderError } from "@orb/server/infra/providers";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

// The dispatch reads only `credential.source`; the brand is irrelevant at runtime (esbuild, not tsc), so
// a cast keeps the fakes terse.
function cred(source: ResolvedCredential["source"]): ResolvedCredential {
  // @orb-waive no-test-fabrication(unknown): ResolvedCredential is brand-sealed (unique symbol) — only the domain mint factory can produce one. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  return { source, credentialId: null } as unknown as ResolvedCredential;
}

const HEALTH: CredentialHealth = { status: "ok", checkedAt: 1 };
const CREDITS: AccountCredits = { total: 10, used: 3 };
const COST: GenerationCost = { totalCost: 0.012, tokensPrompt: 100, tokensCompletion: 40 };
const INSPECTION: EndpointInspection = {
  ok: true,
  request: { url: "https://x.example/chat/completions", headers: {}, body: "{}" },
  response: { status: 200, statusText: "OK", bodyPreview: "" },
};
const CATALOG: ModelCatalogEntry[] = [];

/** An openrouter backend that records which diagnostic verb fired so routing is observable. */
function orBackend(calls: string[]): ProviderBackend {
  return {
    key: "openrouter",
    probe: (): Promise<CredentialHealth> => {
      calls.push("openrouter:probe");
      return Promise.resolve(HEALTH);
    },
    accountCredits: (): Promise<AccountCredits> => {
      calls.push("openrouter:accountCredits");
      return Promise.resolve(CREDITS);
    },
    generationCost: (req: GenerationCostRequest): Promise<GenerationCost> => {
      calls.push(`openrouter:generationCost:${req.generationId}`);
      return Promise.resolve(COST);
    },
    fetchCatalog: (): Promise<ModelCatalogEntry[]> => {
      calls.push("openrouter:fetchCatalog");
      return Promise.resolve(CATALOG);
    },
  };
}

/** A custom-byo backend that records its inspect call. */
function byoBackend(calls: string[]): ProviderBackend {
  return {
    key: "custom-openai",
    inspect: (req: InspectRequest): Promise<EndpointInspection> => {
      calls.push(`custom-openai:inspect:${req.model}`);
      return Promise.resolve(INSPECTION);
    },
  };
}

/** A vllm backend that implements NO diagnostic verb (the unbuilt-probe fail-closed case). */
function vllmBackend(): ProviderBackend {
  return { key: "vllm" };
}

function fullRegistry(calls: string[]): Map<ProviderBackend["key"], ProviderBackend> {
  return new Map([
    ["openrouter", orBackend(calls)],
    ["custom-openai", byoBackend(calls)],
    ["vllm", vllmBackend()],
  ]);
}

describe("createProviderDiagnostics — source → the sealed backend's diagnostic verb", () => {
  test("openrouter probe / accountCredits / generationCost route to the openrouter backend", async () => {
    const calls: string[] = [];
    const diag = createProviderDiagnostics({ backends: fullRegistry(calls) });

    expect(await diag.probe({ credential: cred("openrouter") })).toEqual(HEALTH);
    expect(await diag.accountCredits({ credential: cred("openrouter") })).toEqual(CREDITS);
    expect(await diag.generationCost({ credential: cred("openrouter"), generationId: "gen-1" })).toEqual(COST);

    expect(calls).toEqual(["openrouter:probe", "openrouter:accountCredits", "openrouter:generationCost:gen-1"]);
  });

  test("inspect with a custom_openai credential routes to the custom-byo backend, carrying the model", async () => {
    const calls: string[] = [];
    const diag = createProviderDiagnostics({ backends: fullRegistry(calls) });
    expect(await diag.inspect({ credential: cred("custom_openai"), model: "my-model" })).toEqual(INSPECTION);
    expect(calls).toEqual(["custom-openai:inspect:my-model"]);
  });

  test("fetchOrCatalog is OpenRouter-fixed (no credential) and routes to the openrouter backend", async () => {
    const calls: string[] = [];
    const diag = createProviderDiagnostics({ backends: fullRegistry(calls) });
    expect(await diag.fetchOrCatalog({})).toEqual(CATALOG);
    expect(calls).toEqual(["openrouter:fetchCatalog"]);
  });
});

describe("createProviderDiagnostics — fail-closed (typed ProviderError, never a silent undefined)", () => {
  test("an UNWIRED backend fail-closes (a missing composition-root wire)", async () => {
    const diag = createProviderDiagnostics({ backends: new Map() });
    await expect(diag.probe({ credential: cred("openrouter") })).rejects.toBeInstanceOf(ProviderError);
    await expect(diag.fetchOrCatalog({})).rejects.toBeInstanceOf(ProviderError);
  });

  test("an unbuilt probe fail-closes: vllm/local-light/custom_openai/max-pro-sub have NO probe", async () => {
    const calls: string[] = [];
    const diag = createProviderDiagnostics({ backends: fullRegistry(calls) });
    // vllm backend is wired but implements no probe → requireRoleImpl throws (not a call on undefined).
    await expect(diag.probe({ credential: cred("vllm") })).rejects.toBeInstanceOf(ProviderError);
    expect(calls).toEqual([]);
  });

  test("accountCredits / generationCost off a non-openrouter source fail-close (OR-only today)", async () => {
    const calls: string[] = [];
    const diag = createProviderDiagnostics({ backends: fullRegistry(calls) });
    await expect(diag.accountCredits({ credential: cred("vllm") })).rejects.toBeInstanceOf(ProviderError);
    await expect(diag.generationCost({ credential: cred("vllm"), generationId: "g" })).rejects.toBeInstanceOf(ProviderError);
    expect(calls).toEqual([]);
  });

  test("inspect off a non-custom_openai source fail-closes (only custom-byo serves it)", async () => {
    const calls: string[] = [];
    const diag = createProviderDiagnostics({ backends: fullRegistry(calls) });
    // openrouter backend has no inspect impl → fail-closed.
    await expect(diag.inspect({ credential: cred("openrouter"), model: "m" })).rejects.toBeInstanceOf(ProviderError);
    expect(calls).toEqual([]);
  });
});
