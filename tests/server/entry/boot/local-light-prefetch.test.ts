// entry/boot/local-light-prefetch — WHICH model slots this box warms after the listener binds. The decision
// is a RESOLVER read over the principal's bindings (inference program §8.3), so the pins here are about the
// verdict, not about downloading: a box whose vector tasks resolve onto a hosted row plans NOTHING (its
// weights would be dead bytes), `LOCAL_LIGHT_PREFETCH=off` plans nothing, a principal with NO binding plans
// nothing (`no-connection` is the ordinary answer), and a local-light box plans its slots smallest-weights-first
// with the model the resolver actually chose.

import type { Principal } from "@orb/contracts/identity";
import type { RoutableTask } from "@orb/contracts/inference";
import type { InferenceRuntime } from "@orb/inference";
import { DEFAULT_EMBED_MODEL, DEFAULT_RERANK_MODEL, NoConnectionError } from "@orb/inference";
import type { Handle, ModelId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { planLocalLightPrefetch } from "@orb/server/entry/boot";
import type { Mock } from "vitest";
import { describe, vi } from "vitest";
import { principal } from "../../../support/factories/principal.ts";
import { makeResolved } from "../../../support/factories/resolved-connection.ts";
import { expect, test } from "../../../support/fixtures.ts";

const OWNER: Principal = principal(castId<UserId>("usr_owner"), { role: "owner", handle: castId<Handle>("owner") });

/** Where each task resolves: a built-in provider id + the model, or `null` for `no-connection`. */
type Landing = Readonly<Record<string, { readonly providerId: string; readonly model: string } | null>>;

/** A `runtime.resolve` stand-in over a per-task landing table — the resolver's OWN fold is pinned in
 *  `tests/inference`; this plan only asks it where each task lands. */
function resolverFor(landing: Landing): Mock<InferenceRuntime["resolve"]> {
  return vi.fn<InferenceRuntime["resolve"]>(({ task }) => {
    const row = landing[task];
    if (row === null || row === undefined) {
      return Promise.reject(new NoConnectionError(`${task}: no connection`));
    }
    const resolved = makeResolved({ task: task as RoutableTask, providerId: row.providerId, model: castId<ModelId>(row.model) });
    return Promise.resolve({ resolved, warnings: [] });
  });
}

const local = (model: string): { readonly providerId: string; readonly model: string } => ({ providerId: "local-light", model });
const hosted = { providerId: "openrouter", model: "openai/text-embedding-3-large" };
const ALL_LOCAL_LIGHT: Landing = { embed: local(DEFAULT_EMBED_MODEL), imageEmbed: local(DEFAULT_EMBED_MODEL), rerank: local(DEFAULT_RERANK_MODEL) };
const ALL_HOSTED: Landing = { embed: hosted, imageEmbed: hosted, rerank: { providerId: "openrouter", model: "cohere/rerank-v3.5" } };
const UNBOUND: Landing = { embed: null, imageEmbed: null, rerank: null };
const IMAGE_EMBED_ONLY: Landing = { embed: hosted, imageEmbed: local(DEFAULT_EMBED_MODEL), rerank: hosted };

describe("planLocalLightPrefetch", () => {
  test("plans nothing when LOCAL_LIGHT_PREFETCH is off — and does not even ask the resolver", async () => {
    const resolve = resolverFor(ALL_LOCAL_LIGHT);

    const plan = await planLocalLightPrefetch({ resolve, principals: [OWNER], enabled: false });

    expect(plan).toEqual([]);
    expect(resolve).not.toHaveBeenCalled();
  });

  test("plans nothing when every vector task resolves onto a hosted row (a cloud box downloads no CPU weights)", async () => {
    const plan = await planLocalLightPrefetch({ resolve: resolverFor(ALL_HOSTED), principals: [OWNER], enabled: true });

    expect(plan).toEqual([]);
  });

  test("plans nothing for a principal with NO bindings — `no-connection` is the ordinary answer, never a boot failure", async () => {
    const plan = await planLocalLightPrefetch({ resolve: resolverFor(UNBOUND), principals: [OWNER], enabled: true });

    expect(plan).toEqual([]);
  });

  test("plans nothing with NO principals to read (an empty box has no bindings to ask about)", async () => {
    const resolve = resolverFor(ALL_LOCAL_LIGHT);

    const plan = await planLocalLightPrefetch({ resolve, principals: [], enabled: true });

    expect(plan).toEqual([]);
    expect(resolve).not.toHaveBeenCalled();
  });

  // The matte model has no caller while the expressions program is parked (docs/work/0049-expressions-program.md),
  // so a local-light box warms the embedder and reranker only.
  test("plans rerank → embed (smallest first) with the seeded rows on a local-light box, and never the matte model", async () => {
    const plan = await planLocalLightPrefetch({ resolve: resolverFor(ALL_LOCAL_LIGHT), principals: [OWNER], enabled: true });

    expect(plan).toEqual([
      { slot: "rerank", modelId: DEFAULT_RERANK_MODEL },
      { slot: "embed", modelId: DEFAULT_EMBED_MODEL },
    ]);
  });

  test("embed and imageEmbed share ONE slot — the same jina weights are never planned twice", async () => {
    const resolve = resolverFor(ALL_LOCAL_LIGHT);

    const plan = await planLocalLightPrefetch({ resolve, principals: [OWNER], enabled: true });

    expect(plan.filter((t) => t.slot === "embed")).toHaveLength(1);
    // `imageEmbed` is never asked once `embed` has claimed the slot.
    expect(resolve.mock.calls.map(([args]) => args.task)).toEqual(["rerank", "embed"]);
  });

  test("imageEmbed alone on local-light still claims the embed slot", async () => {
    const plan = await planLocalLightPrefetch({ resolve: resolverFor(IMAGE_EMBED_ONLY), principals: [OWNER], enabled: true });

    expect(plan).toEqual([{ slot: "embed", modelId: DEFAULT_EMBED_MODEL }]);
  });

  test("carries the connection's OWN model id, not the builtin default", async () => {
    const plan = await planLocalLightPrefetch({
      resolve: resolverFor({ ...ALL_HOSTED, embed: local("Xenova/some-other-encoder") }),
      principals: [OWNER],
      enabled: true,
    });

    expect(plan.find((t) => t.slot === "embed")?.modelId).toBe("Xenova/some-other-encoder");
  });

  test("a THROWING resolver is 'not local-light', never a boot failure", async () => {
    const resolve = vi.fn<InferenceRuntime["resolve"]>(() => Promise.reject(new Error("resolver exploded")));

    const plan = await planLocalLightPrefetch({ resolve, principals: [OWNER], enabled: true });

    expect(plan).toEqual([]);
  });
});
