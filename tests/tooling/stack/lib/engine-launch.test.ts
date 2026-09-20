// The launch-decision pins (#764). These exercise the REAL decision with the REAL health and adoption
// probes over a planted `fetch` — no module mocks, and nothing imports the launcher program. The behaviour
// they hold is the one f9280b4bd added and the deleted `engines-port-health.test.ts` used to cover: an
// occupied-but-UNPROVEN port is refused before the VRAM budget is read and before anything is spawned.

import type { EngineLaunchModels, EngineLaunchProbes, PortHealth } from "@orb/tooling/stack";
import { classifyEngineBoot, decideEngineLaunch, ENGINE_LAUNCH_IDENTITY_FAILURE, expectedAdoptionModels, probeEngineAdoption } from "@orb/tooling/stack";
import type { WakeBudgetVerdict } from "@orb/tooling/stack/lib/engine-fleet";
import { probePortHealth } from "../../../../tooling/src/stack/lib/port-health.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const LAUNCH: EngineLaunchModels = { embedModel: "embed-model", rerankModel: "rerank-model", genModel: "org/gen-model" };

const CONNECTION_REFUSED = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:8881"), { cause: { code: "ECONNREFUSED" } });

/** A loopback stand-in: `/health`, `/v1/models` and `/openapi.json` answered from planted values. */
function plantedFetch(served: { readonly health: Response | Error; readonly modelIds?: readonly string[]; readonly paths?: readonly string[] }): typeof fetch {
  return ((input: Parameters<typeof fetch>[0]): Promise<Response> => {
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

// ── #1494: the fleet VERDICT must match what the fleet did ──────────────────────────────────────────
//
// `waitHealthy` returned the moment the child had exited, the caller reported that as `identityFailed:
// false`, and only identity failures reached `EXIT.toolError` — so an engine that DIED during boot fell
// through to `EXIT.clean` and the launcher printed `booted 2/3` while telling the operator the fleet was
// up. These pin the classification, which is where the collapse happened; the launcher itself is a
// PROGRAM that spawns real vLLM and is never run from a test (`.claude/rules/lane-standing-facts.md`).

test("an engine that EXITED during boot FAILS the fleet and is named (#1494)", () => {
  const outcome = classifyEngineBoot("gen", "spawn", { wait: "exited", identityCaptured: false });
  expect(outcome.kind, "a dead engine is a boot failure, not a silent omission from the tally").toBe("failed");
  expect(outcome.kind === "failed" ? outcome.reason : "").toContain("gen EXITED before becoming healthy");
  // The operator's next step has to be IN the line — the log is the only place the reason exists.
  expect(outcome.kind === "failed" ? outcome.reason : "").toContain("vllm-gen.log");
});

test("a health-poll TIMEOUT is still `booted` — the #1165 booted-late ruling survives (#1494 planted control)", () => {
  // The opposite fact, and the reason the wait reports three states instead of a boolean: the poll ceiling
  // is a BOUND, not a liveness verdict. An engine still coming up past it answers later and is exit-0.
  expect(classifyEngineBoot("embed", "spawn", { wait: "timeout", identityCaptured: true })).toEqual({ kind: "booted" });
  expect(classifyEngineBoot("embed", "spawn", { wait: "healthy", identityCaptured: true })).toEqual({ kind: "booted" });
});

test("a spawned engine with no safe launch identity FAILS the fleet — alive is not the same as ours (#1494)", () => {
  const outcome = classifyEngineBoot("rerank", "spawn", { wait: "healthy", identityCaptured: false });
  expect(outcome.kind).toBe("failed");
  expect(outcome.kind === "failed" ? outcome.reason : "").toContain("neither recorded nor signalled");
});

test("a no-spawn decision still fails the fleet exactly as its own tier ruled (#1494)", () => {
  // `classifyEngineBoot` must not re-decide this: it reads the decision tier's mapped Record, so adding a
  // new action still forces a ruling there and only there.
  expect(classifyEngineBoot("embed", "adopt", null)).toEqual({ kind: "no-spawn" });
  expect(classifyEngineBoot("embed", "skip", null)).toEqual({ kind: "no-spawn" });
  expect(classifyEngineBoot("embed", "refuse", null).kind).toBe("failed");
  for (const action of ["adopt", "refuse", "skip", "spawn"] as const) {
    expect(classifyEngineBoot("embed", action, null).kind === "failed", `${action} must agree with its own ruling`).toBe(
      ENGINE_LAUNCH_IDENTITY_FAILURE[action],
    );
  }
});
