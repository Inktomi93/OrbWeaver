// resolveEngineDeploymentFacts — the env-only DEPLOYMENT-fact projection (port + store path per engine) the
// admin panel shows read-only. With an explicit storeRoot override, resolveStoreRoot short-circuits (no git
// shell), so this is a pure deterministic mapping test: each engine gets its own port and the shared store
// root.

import { resolveEngineDeploymentFacts } from "@orb/server/infra/providers";
import { describe } from "vitest";
import { expect, test } from "../../../../../support/fixtures";

describe("resolveEngineDeploymentFacts", () => {
  test("maps each engine to its serve port and the shared (overridden) store root", () => {
    const facts = resolveEngineDeploymentFacts({
      repoRoot: "/repo",
      deployment: { storeRoot: "/shared/store" },
      ports: { embed: 8701, rerank: 8702, gen: 8703 },
    });

    expect(facts.embed).toEqual({ port: 8701, storePath: "/shared/store" });
    expect(facts.rerank).toEqual({ port: 8702, storePath: "/shared/store" });
    expect(facts.gen).toEqual({ port: 8703, storePath: "/shared/store" });
  });
});
