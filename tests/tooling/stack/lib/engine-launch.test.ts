// The launch-decision pins (#764). These exercise the REAL decision with the REAL health and adoption
// probes over a planted `fetch` — no module mocks, and nothing imports the launcher program. The behaviour
// they hold is the one f9280b4bd added and the deleted `engines-port-health.test.ts` used to cover: an
// occupied-but-UNPROVEN port is refused before the VRAM budget is read and before anything is spawned.
import type { WakeBudgetVerdict } from "@orb/server/infra/providers/vllm/engine";
import type { EngineLaunchModels, EngineLaunchProbes, PortHealth } from "@orb/tooling/stack";
import { decideEngineLaunch, ENGINE_LAUNCH_IDENTITY_FAILURE, expectedAdoptionModels, probeEngineAdoption } from "@orb/tooling/stack";
import { probePortHealth } from "../../../../tooling/src/stack/lib/port-health.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const LAUNCH: EngineLaunchModels = { embedModel: "embed-model", rerankModel: "rerank-model", genModel: "org/gen-model" };

const CONNECTION_REFUSED = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:8881"), { cause: { code: "ECONNREFUSED" } });

/** A loopback stand-in: `/health`, `/v1/models` and `/openapi.json` answered from planted values. */
function plantedFetch(served: { readonly health: Response | Error; readonly modelIds?: readonly string[]; readonly paths?: readonly string[] }): typeof fetch {
  return ((input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    if (url.endsWith("/health")) {
      return served.health instanceof Error ? Promise.reject(served.health) : Promise.resolve(served.health);
    }
    if (url.endsWith("/v1/models")) {
      return Promise.resolve(Response.json({ data: (served.modelIds ?? []).map((id) => ({ id })) }));
    }
    return Promise.resolve(Response.json({ paths: Object.fromEntries((served.paths ?? []).map((servedPath) => [servedPath, {}])) }));
  }) as typeof fetch;
}

interface ProbeCounts {
  adoption: number;
  headroom: number;
}

/** The production probes over a planted `fetch`, plus call counters — the "was it even asked?" evidence. */
function probesOver(request: typeof fetch, headroom: WakeBudgetVerdict, counts: ProbeCounts): EngineLaunchProbes {
  return {
    health: (port): Promise<PortHealth> => probePortHealth(port, request),
    adoption: (engine, port, expectedModels): Promise<string | null> => {
      counts.adoption += 1;
      return probeEngineAdoption(engine, port, expectedModels, request);
    },
    headroom: (): Promise<WakeBudgetVerdict> => {
      counts.headroom += 1;
      return Promise.resolve(headroom);
    },
  };
}

const BUDGET_OK: WakeBudgetVerdict = { ok: true };
const BUDGET_SHORT: WakeBudgetVerdict = { ok: false, shortfalls: [], message: "gpu0 short 12000MiB (held by comfyui)" };

test("an occupied-unproven port is refused before headroom or spawn, and fails the fleet", async () => {
  const counts: ProbeCounts = { adoption: 0, headroom: 0 };
  const decision = await decideEngineLaunch({
    engine: "embed",
    port: 8881,
    launch: LAUNCH,
    probes: probesOver(plantedFetch({ health: new Response(null, { status: 503 }) }), BUDGET_OK, counts),
  });

  expect(decision.action).toBe("refuse");
  expect(decision.message).toBe(
    "embed: ADOPTION REFUSED on :8881 — health probe failed (health endpoint answered 503); occupied listener state is unproven and no duplicate will spawn.",
  );
  // The whole point of the refusal: the ambiguous mid-boot VRAM read never happens, so it can never talk
  // the launcher into a duplicate fleet.
  expect(counts).toEqual({ adoption: 0, headroom: 0 });
  // …and the launcher turns this into EXIT.toolError rather than reporting a booted fleet.
  expect(ENGINE_LAUNCH_IDENTITY_FAILURE[decision.action]).toBe(true);
});

test("a healthy listener is adopted only once it proves both model identity and role capability", async () => {
  const counts: ProbeCounts = { adoption: 0, headroom: 0 };
  const proven = plantedFetch({ health: new Response(null, { status: 200 }), modelIds: ["embed-model"], paths: ["/v1/embeddings"] });
  const adopted = await decideEngineLaunch({ engine: "embed", port: 8881, launch: LAUNCH, probes: probesOver(proven, BUDGET_OK, counts) });
  expect(adopted).toEqual({ action: "adopt", message: "embed already serving (:8881) — adopted in place, no spawn." });
  expect(counts).toEqual({ adoption: 1, headroom: 0 });

  const foreign = plantedFetch({ health: new Response(null, { status: 200 }), modelIds: ["someone-elses-model"], paths: ["/v1/embeddings"] });
  const refused = await decideEngineLaunch({ engine: "embed", port: 8881, launch: LAUNCH, probes: probesOver(foreign, BUDGET_OK, counts) });
  expect(refused.action).toBe("refuse");
  expect(refused.message).toContain("ADOPTION REFUSED on :8881 — model mismatch");
  expect(refused.message).toContain("occupied listener left untouched.");
  expect(ENGINE_LAUNCH_IDENTITY_FAILURE[refused.action]).toBe(true);
});

test("an absent port spawns only when the VRAM budget covers the boot", async () => {
  const counts: ProbeCounts = { adoption: 0, headroom: 0 };
  const nothingListening = plantedFetch({ health: CONNECTION_REFUSED });

  const spawn = await decideEngineLaunch({ engine: "gen", port: 8883, launch: LAUNCH, probes: probesOver(nothingListening, BUDGET_OK, counts) });
  expect(spawn).toEqual({ action: "spawn", message: "starting gen :8883" });

  const skipped = await decideEngineLaunch({ engine: "gen", port: 8883, launch: LAUNCH, probes: probesOver(nothingListening, BUDGET_SHORT, counts) });
  expect(skipped).toEqual({ action: "skip", message: "gen: BOOT REFUSED — gpu0 short 12000MiB (held by comfyui)" });
  // A headroom refusal is a clean, deliberate no-boot — it must NOT fail the fleet the way a refused
  // (occupied) port does.
  expect(ENGINE_LAUNCH_IDENTITY_FAILURE[skipped.action]).toBe(false);
  expect(counts).toEqual({ adoption: 0, headroom: 2 });
});

test("gen is adoptable under both its bare and org-qualified served model names", () => {
  expect(expectedAdoptionModels("embed", LAUNCH)).toEqual(["embed-model"]);
  expect(expectedAdoptionModels("rerank", LAUNCH)).toEqual(["rerank-model"]);
  expect(expectedAdoptionModels("gen", LAUNCH)).toEqual(["gen-model", "org/gen-model"]);
});
