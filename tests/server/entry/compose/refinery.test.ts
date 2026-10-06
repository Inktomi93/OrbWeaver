// entry/compose/refinery — the seam that assembles the refinery domain's TWO halves side by side: the
// principal-taking SERVICE (tRPC) and the principal-LESS workload deps the `refine-score-sweep` library pass
// closes over. The whole point of the file is that those two bundles are DIFFERENT, and the difference is a
// security property, not a tidiness one: the queue's own actor gets no session minters, no apply-path
// character ops and no clock — so a sweep that grew a write path would have to come back through this seam
// and be seen, instead of quietly inheriting the service's authority (the principal-less-ops rule).
//
// The other two pins are the ones a compose seam gets wrong silently:
//   • `roleClientsFor` is threaded VERBATIM (never wrapped, memoized or read at compose time — the getter
//     collapse, §7.5-1b: the six per-role getters, including the old `summarizerContextTokens` thunk, folded
//     into ONE `resolved(task)` read), so a role re-point takes effect on the very next call.
//   • the per-user prose resolver is CALLER-SCOPED — it reads the settings of the userId it is handed, and
//     it is the SAME function object in both halves (one home for the resolution).

import type { GenerationCapability } from "@orb/contracts/inference";
import { SCORE_MAX, SCORE_MIN } from "@orb/contracts/refinery";
import type { UserSettings } from "@orb/contracts/settings";
import type { Db } from "@orb/db";
import type { Resolved } from "@orb/inference";
import { createInferenceRuntime } from "@orb/inference";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { projectJsonSchema } from "@orb/kit/json-schema";
import { publishUserEvent } from "@orb/server/transport/trpc";
import { describe, vi } from "vitest";
import { z } from "zod";
import type { RefineryComposeDeps } from "../../../../packages/server/src/entry/compose/refinery.ts";
import { buildRefinery, createResolveStructuredBinding } from "../../../../packages/server/src/entry/compose/refinery.ts";
import { FROZEN_NOW, fakeConnection, fakeDeps, memoryStores, newUserId } from "../../../inference/_support.ts";
import { principal } from "../../../support/factories/principal.ts";
import { makeCapability, makeGenerationCapability, makeResolved, TEST_OWNER_ID } from "../../../support/factories/resolved-connection.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { testModelId } from "../../../support/inference-identities.ts";

const USER = castId<UserId>("usr_author");
const OTHER = castId<UserId>("usr_other");

// @orb-waive no-test-fabrication(unknown): never dereferenced — the seam only threads `db` into the factories it builds. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
const NO_DB = {} as unknown as Db;

/** The EXACT dep set the workload half is allowed to close over (R4). */
const WORKLOAD_KEYS = [
  "roleClientsFor",
  "resolveUtilityPresetParams",
  "resolveUserProse",
  "listRefineryScoreTargets",
  "stampRefinerySignals",
  "emitUserEvent",
] as const;

interface Harness {
  readonly deps: RefineryComposeDeps;
  readonly roleClientsFor: ReturnType<typeof vi.fn>;
  readonly loadUserSettings: ReturnType<typeof vi.fn>;
  readonly resolveUtilityPresetParams: ReturnType<typeof vi.fn>;
}

function harness(prose: UserSettings["prose"] = {}): Harness {
  const roleClientsFor = vi.fn<RefineryComposeDeps["roleClientsFor"]>();
  const loadUserSettings = vi.fn((userId: UserId) => Promise.resolve({ prose: userId === USER ? prose : {} }));
  const resolveUtilityPresetParams = vi.fn(() => Promise.resolve({}));
  // @orb-waive no-test-fabrication(unknown): the seam stores the character front door and the db and calls neither here. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  const deps = {
    db: NO_DB,
    now: () => 1000,
    roleClientsFor,
    character: { snapshot: vi.fn(), update: vi.fn(), get: vi.fn(), duplicate: vi.fn() },
    resolveUtilityPresetParams,
    loadUserSettings,
  } as unknown as RefineryComposeDeps;
  return { deps, roleClientsFor, loadUserSettings, resolveUtilityPresetParams };
}

describe("buildRefinery — the queue's actor gets a SMALLER bundle than the service", () => {
  test("the workload half closes over exactly the six library-pass deps — no minters, no clock, no apply ops", () => {
    const { refineryWorkloads } = buildRefinery(harness().deps);

    expect(Object.keys(refineryWorkloads).sort()).toStrictEqual([...WORKLOAD_KEYS].sort());
  });

  test("neither the apply-path character verbs nor an id minter leak into the workload bundle", () => {
    const { refineryWorkloads } = buildRefinery(harness().deps);
    const keys = Object.keys(refineryWorkloads);

    for (const forbidden of ["snapshotCharacter", "updateCharacter", "duplicateCharacter", "getCharacter", "newRefinerySessionId", "now"]) {
      expect(keys).not.toContain(forbidden);
    }
  });

  test("both halves are returned (the service is composed, not replaced by the workload bundle)", () => {
    const built = buildRefinery(harness().deps);

    expect(typeof built.refinery.startSession).toBe("function");
    expect(typeof built.refineryWorkloads.listRefineryScoreTargets).toBe("function");
  });
});

describe("buildRefinery — the summarizer binding stays LIVE (a role re-point must reach the sweep)", () => {
  test("roleClientsFor is threaded verbatim into the workload bundle — a role re-point reaches the sweep on the very next call", () => {
    const roleClientsFor = vi.fn<RefineryComposeDeps["roleClientsFor"]>();
    // @orb-waive no-test-fabrication(unknown): the seam stores the character front door and the db and calls neither here. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    const deps = {
      db: NO_DB,
      now: () => 1000,
      roleClientsFor,
      character: { snapshot: vi.fn(), update: vi.fn(), get: vi.fn(), duplicate: vi.fn() },
      resolveUtilityPresetParams: vi.fn(() => Promise.resolve({})),
      loadUserSettings: vi.fn(() => Promise.resolve({ prose: {} })),
    } as unknown as RefineryComposeDeps;

    const { refineryWorkloads } = buildRefinery(deps);

    // The compose seam threads the SAME function object through — never wrapped, memoized or read at
    // compose time — so a later role re-point (a new `roleClientsFor` binding replacing this reference
    // upstream) governs the sweep's very next call, exactly like the service half (role-clients.ts: "a
    // re-pointed binding governs the very next call, no restart, no invalidation hook to forget").
    expect(refineryWorkloads.roleClientsFor).toBe(roleClientsFor);
  });
});

describe("buildRefinery — the prose resolver is caller-scoped and single-homed", () => {
  test("it reads the settings of the userId it is handed, and returns that user's prose overrides", async () => {
    // @orb-waive no-test-fabrication(UserSettings["prose"]): a hand-shaped prose OVERRIDE map — the point is an arbitrary authored slot, which is Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    // exactly what an override is; the resolver must return it verbatim for its own user and nothing for another.
    const authored = { "some.slot": "authored" } as UserSettings["prose"];
    const h = harness(authored);
    const { refineryWorkloads } = buildRefinery(h.deps);

    expect(await refineryWorkloads.resolveUserProse(USER)).toStrictEqual({ "some.slot": "authored" });
    expect(await refineryWorkloads.resolveUserProse(OTHER)).toStrictEqual({});
    expect(h.loadUserSettings.mock.calls.map((c) => c[0])).toStrictEqual([USER, OTHER]);
  });

  test("the caller's preset params op is threaded verbatim (the distill rung reads the CARD OWNER's)", () => {
    const h = harness();
    const { refineryWorkloads } = buildRefinery(h.deps);

    expect(refineryWorkloads.resolveUtilityPresetParams).toBe(h.resolveUtilityPresetParams);
  });
});

describe("buildRefinery — the freshness plane is the house injected emit, not a transport reach", () => {
  test("the workload half emits through `publishUserEvent` (the domain never imports transport)", () => {
    const { refineryWorkloads } = buildRefinery(harness().deps);

    expect(refineryWorkloads.emitUserEvent).toBe(publishUserEvent);
  });
});

// The refinery editor's plan preview over a real resolved connection: the outcome is the structured planner's own,
// so a schema the planner sends on a tool is never reported as refused, and a refusal names its reason in the
// author's words.

/** A projected draft of `n` optional string fields: 30 is past Anthropic's 24-optional ceiling. */
function optionalFields(n: number): ReturnType<typeof projectJsonSchema> {
  return projectJsonSchema(z.object(Object.fromEntries(Array.from({ length: n }, (_, i) => [`f${String(i)}`, z.string().optional()]))));
}

const CLAUDE_OUTPUT: GenerationCapability["output"] = {
  maxTokens: { min: 1, max: 8192 },
  structured: true,
  modalities: ["text"],
  structuredLimitsFrom: "anthropic-format",
};

function previewOn(
  connection: Resolved | null,
  params: RefineryComposeDeps["resolveUtilityPresetParams"],
): ReturnType<typeof buildRefinery>["refinery"]["previewSchemaPlan"] {
  return buildRefinery({ ...harness().deps, resolveStructuredBinding: () => Promise.resolve(connection), resolveUtilityPresetParams: params }).refinery
    .previewSchemaPlan;
}

function scoreDraft(schema: ReturnType<typeof projectJsonSchema>): Record<string, unknown> {
  const properties = z.record(z.string(), z.unknown()).parse(schema["properties"] ?? {});
  const required = z.array(z.string()).parse(schema["required"] ?? []);
  return {
    type: "object",
    properties: { ...properties, overallScore: { type: "number", minimum: SCORE_MIN, maximum: SCORE_MAX } },
    required: [...required, "overallScore"],
  };
}

function planOn(connection: Resolved | null): ReturnType<ReturnType<typeof buildRefinery>["refinery"]["previewSchemaPlan"]> {
  return previewOn(connection, () => Promise.resolve(undefined))({
    principal: principal(TEST_OWNER_ID),
    stage: "score",
    schema: scoreDraft(optionalFields(30)),
  });
}

/** A bound `structured` row that allows background work, as every refinery run needs. */
function bound(overrides: Parameters<typeof makeResolved>[0]): Resolved {
  return makeResolved({ allowBackground: true, ...overrides });
}

test("over Anthropic's ceilings on a model that takes tools, the plan rides a tool call and is not reported refused", async () => {
  const claude = bound({
    providerId: "anthropic",
    capability: makeCapability(makeGenerationCapability({ output: CLAUDE_OUTPUT, tools: { parallel: true } })),
  });
  expect(await planOn(claude)).toEqual({ outcome: "sends", model: "test-model", carrier: "tool" });
});

test("the Utility default reasoning off admits the same conditional tool fallback in the schema preview", async () => {
  const connection = bound({
    providerId: "openai",
    model: testModelId("gpt-6-sol"),
    capability: makeCapability(
      makeGenerationCapability({
        reasoning: { mode: "effort", enabled: true, effortLevels: ["low", "medium", "high"] },
        tools: { parallel: true, requiresReasoningOff: true },
        output: { maxTokens: { min: 1, max: 8192 }, structured: true, modalities: ["text"], structuredLimits: { maxObjectProps: 1 } },
      }),
    ),
  });
  const params = vi.fn<RefineryComposeDeps["resolveUtilityPresetParams"]>().mockResolvedValue(undefined);
  const preview = previewOn(connection, params);
  const planSchema = (owner: UserId, draft: ReturnType<typeof projectJsonSchema>): ReturnType<typeof preview> =>
    preview({ principal: principal(owner), stage: "score", schema: scoreDraft(draft) });
  const schema = projectJsonSchema(z.object({ a: z.string(), b: z.string() }));
  expect(await planSchema(TEST_OWNER_ID, schema)).toEqual({ outcome: "sends", model: "gpt-6-sol", carrier: "tool" });
  expect(params).toHaveBeenLastCalledWith(TEST_OWNER_ID);
  params.mockResolvedValue({ effort: "medium" });
  expect(await planSchema(TEST_OWNER_ID, schema)).toMatchObject({ outcome: "refused", model: "gpt-6-sol" });
  params.mockResolvedValue({ effort: "none" });
  expect(await planSchema(TEST_OWNER_ID, schema)).toEqual({ outcome: "sends", model: "gpt-6-sol", carrier: "tool" });
});

test("with no tools to fall back on, the refusal names the reason in the author's words, never the planner's vocabulary", async () => {
  const claude = bound({ providerId: "anthropic", capability: makeCapability(makeGenerationCapability({ output: CLAUDE_OUTPUT })) });
  const plan = await planOn(claude);
  expect(plan).toMatchObject({ outcome: "refused", model: "test-model" });
  const reasons = plan?.outcome === "refused" ? plan.reasons : [];
  expect(reasons).toHaveLength(1);
  expect(reasons[0]).toMatch(/\b30\b.*\b24\b/u);
  expect(JSON.stringify(plan)).not.toMatch(/optional-props|anthropic-format|hosted-common/u);
});

test("a local target with no stated ceiling takes the shape natively; no bound connection says it depends on one", async () => {
  const local = bound({
    capability: makeCapability(makeGenerationCapability({ output: { maxTokens: { min: 1, max: 8192 }, structured: true, modalities: ["text"] } })),
  });
  expect(await planOn(local)).toEqual({ outcome: "sends", model: "test-model", carrier: "native" });
  expect(await planOn(null)).toEqual({ outcome: "unbound" });
});

test("the plan preview reads only the facts already cached, so a dead endpoint is never re-dialed per keystroke", async () => {
  const stores = memoryStores();
  const ownerId = newUserId();
  const row = fakeConnection({ ownerId, providerId: "custom-openai", model: "local-model", baseUrl: "http://127.0.0.1:1", allowBackground: true });
  stores.connections.rows.set(row.id, row);
  // `structured` rides the Utility (`summarize`) binding.
  stores.bindings.bind({ actorKind: "user", actorId: ownerId, task: "summarize", connectionId: row.id });
  let clock = FROZEN_NOW;
  let dials = 0;
  const deadServer: typeof fetch = () => {
    dials += 1;
    return Promise.reject(new TypeError("fetch failed: connect ECONNREFUSED 127.0.0.1:1"));
  };
  const runtime = await createInferenceRuntime({ ...fakeDeps({ stores, fetch: deadServer }), now: () => clock });
  const resolveStructuredBinding = createResolveStructuredBinding(runtime, (userId) => Promise.resolve(principal(userId)));

  for (let ask = 0; ask < 4; ask += 1) {
    expect(await resolveStructuredBinding(ownerId)).toMatchObject({ model: "local-model" });
    // Past the mirror's failed-warm hold, so a dialing resolve would dial again.
    clock += 11_000;
  }
  expect(dials).toBe(0);
});

test("a model with no way to return a structured answer is named as the problem, not the schema", async () => {
  const plain = bound({
    providerId: "anthropic",
    capability: makeCapability(makeGenerationCapability({ output: { maxTokens: { min: 1, max: 8192 }, modalities: ["text"] } })),
  });
  expect(await planOn(plain)).toEqual({ outcome: "no-structured", model: "test-model" });
});

test("a bound model whose connection withholds background work is named as such, not as unbound", async () => {
  const local = bound({
    allowBackground: false,
    capability: makeCapability(makeGenerationCapability({ output: { maxTokens: { min: 1, max: 8192 }, structured: true, modalities: ["text"] } })),
  });
  expect(await planOn(local)).toEqual({ outcome: "background-refused", model: "test-model" });
});
