// entry — search on a FRESH install, over the whole composition root. Boot seeds the owner's local-light encoder
// and the demo library, the autoindex embeds the cards (which pins a target generation), and Memory is off by
// default. Search reads only a generation whose cards, memory and documents scopes all landed, so boot has to
// schedule those sweeps itself; nothing else would. The embed path is the offline scripted cache.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EMBED_SPACE_DIMS } from "@orb/contracts/inference";
import { fakeLocalLightCache } from "@orb/tooling/seed";
import { afterAll, vi } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

const TEMP_DIR = mkdtempSync(join(tmpdir(), "orb-fresh-search-"));
const POLL_DELAY_MS = 500;
const POLL_ATTEMPTS = 90;
const TEST_TIMEOUT_MS = 60_000;
const REINDEXING = "search_space_reindexing";

vi.stubEnv("DATA_DIR", TEMP_DIR);
vi.stubEnv("AUTH_MODE", "single-user");
vi.stubEnv("LOCAL_LIGHT_PREFETCH", "off");
vi.stubEnv("CORPUS_AUTOINDEX", "true");
vi.stubEnv("EGRESS_ALLOWLIST", "localhost");

const { createLifecycle } = await import("../../../packages/server/src/entry/lifecycle.ts").catch((error: unknown) => {
  rmSync(TEMP_DIR, { force: true, recursive: true });
  throw error;
});

const lifecycle = createLifecycle({ listenPort: 0, providerSeams: { localLight: { cache: fakeLocalLightCache(EMBED_SPACE_DIMS) } } });

afterAll(async () => {
  try {
    await lifecycle.shutdown();
  } finally {
    rmSync(TEMP_DIR, { force: true, recursive: true });
  }
});

interface SearchReply {
  readonly result?: { readonly data?: { readonly hits?: readonly unknown[] } };
  readonly error?: { readonly data?: { readonly reason?: string } };
}

async function searchCharacters(base: string): Promise<SearchReply> {
  const input = JSON.stringify({ query: "a friendly guide", topN: 3, over: "characters", scope: { kind: "owner" } });
  const res = await fetch(`${base}/api/trpc/search.search?input=${encodeURIComponent(input)}`);
  return (await res.json()) as SearchReply;
}

test(
  "a fresh install's search answers once boot's own sweeps land, instead of refusing as reindexing",
  async () => {
    await lifecycle.boot();
    const address = lifecycle.listeningAddress();
    if (address === null) {
      throw new Error("boot completed without publishing the bound listener address");
    }
    const base = `http://localhost:${String(address.port)}`;
    let reply = await searchCharacters(base);
    for (let attempt = 0; reply.error?.data?.reason === REINDEXING && attempt < POLL_ATTEMPTS; attempt += 1) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, POLL_DELAY_MS);
      });
      reply = await searchCharacters(base);
    }
    expect(reply.error).toBeUndefined();
    expect(reply.result?.data?.hits?.length ?? 0).toBeGreaterThan(0);
  },
  TEST_TIMEOUT_MS,
);
