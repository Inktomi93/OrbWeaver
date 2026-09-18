// entry/boot/local-light-prefetch — WHICH model slots this box warms after the listener binds. The decision
// is a resolver read, so the pins here are about the verdict, not about downloading: a vLLM/cloud box plans
// NOTHING (its weights would be dead bytes), `LOCAL_LIGHT_PREFETCH=off` plans nothing, and a local-light box
// plans its slots smallest-weights-first with the model the resolver actually chose.

import type { CredentialSource } from "@orb/contracts/credentials";
import type { Principal } from "@orb/contracts/identity";
import type { Handle, ModelId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ConnectionService } from "@orb/server/domain/connection";
import { planLocalLightPrefetch } from "@orb/server/entry/boot";
import { DEFAULT_EMBED_MODEL, DEFAULT_MATTE_MODEL, DEFAULT_RERANK_MODEL } from "@orb/server/infra/providers";
import type { Mock } from "vitest";
import { describe, vi } from "vitest";
import { principal } from "../../../support/factories/principal.ts";
import { makeResolvedConnection, makeResolvedCredential } from "../../../support/factories/resolved-connection.ts";
import { expect, test } from "../../../support/fixtures.ts";

const OWNER: Principal = principal(castId<UserId>("usr_owner"), { role: "owner", handle: castId<Handle>("owner") });

/** A `resolveRole` stand-in: every role resolves onto `source`, carrying the config-derived empty model id a
 *  real local-light/vllm resolution produces (the pin that the fallback-to-builtin path is the normal one). */
function resolverFor(sourceByRole: Record<string, CredentialSource>, model = ""): Mock<ConnectionService["resolveRole"]> {
  return vi.fn<ConnectionService["resolveRole"]>(({ role }) =>
    Promise.resolve(
      makeResolvedConnection({
        model: castId<ModelId>(model),
        credential: makeResolvedCredential(keylessSourceFor(sourceByRole[role])),
      }),
    ),
  );
}

/** The factory's keyless-credential builder covers exactly the sources this plan can meet as "not a keyed
 *  cloud connection"; a KEYED source (openrouter here) only has to be non-local-light for these pins, so it
 *  stands in as `vllm` — the verdict is identical and the keyed builders carry secrets this never needs. */
function keylessSourceFor(source: CredentialSource | undefined): "vllm" | "local-light" | "max-pro-sub" {
  return source === "local-light" || source === "max-pro-sub" ? source : "vllm";
}

const ALL_LOCAL_LIGHT: Record<string, CredentialSource> = { embed: "local-light", imageEmbed: "local-light", rerank: "local-light" };
const ALL_VLLM: Record<string, CredentialSource> = { embed: "vllm", imageEmbed: "vllm", rerank: "vllm" };
const ALL_CLOUD: Record<string, CredentialSource> = { embed: "openrouter", imageEmbed: "openrouter", rerank: "openrouter" };
const IMAGE_EMBED_ONLY: Record<string, CredentialSource> = { embed: "vllm", imageEmbed: "local-light", rerank: "vllm" };

describe("planLocalLightPrefetch", () => {
  test("plans nothing when LOCAL_LIGHT_PREFETCH is off — and does not even ask the resolver", async () => {
    const resolveRole = resolverFor(ALL_LOCAL_LIGHT);

    const plan = await planLocalLightPrefetch({ resolveRole, principal: OWNER, enabled: false });

    expect(plan).toEqual([]);
    expect(resolveRole).not.toHaveBeenCalled();
  });

  test("plans nothing when every derive role resolves onto vLLM (a GPU box downloads no CPU weights)", async () => {
    const plan = await planLocalLightPrefetch({
      resolveRole: resolverFor(ALL_VLLM),
      principal: OWNER,
      enabled: true,
    });

    // Including `matte`: RMBG has no role to resolve, so it rides the same verdict rather than downloading
    // unconditionally on a box that serves nothing else from the in-process tier.
    expect(plan).toEqual([]);
  });

  test("plans nothing when the derive roles resolve onto a cloud gateway", async () => {
    const plan = await planLocalLightPrefetch({
      resolveRole: resolverFor(ALL_CLOUD),
      principal: OWNER,
      enabled: true,
    });

    expect(plan).toEqual([]);
  });

  test("plans rerank → embed → matte (smallest first) with the builtins on a local-light box", async () => {
    const plan = await planLocalLightPrefetch({ resolveRole: resolverFor(ALL_LOCAL_LIGHT), principal: OWNER, enabled: true });

    expect(plan).toEqual([
      { slot: "rerank", modelId: DEFAULT_RERANK_MODEL },
      { slot: "embed", modelId: DEFAULT_EMBED_MODEL },
      { slot: "matte", modelId: DEFAULT_MATTE_MODEL },
    ]);
  });

  test("embed and imageEmbed share ONE slot — the same jina weights are never planned twice", async () => {
    const resolveRole = resolverFor(ALL_LOCAL_LIGHT);

    const plan = await planLocalLightPrefetch({ resolveRole, principal: OWNER, enabled: true });

    expect(plan.filter((t) => t.slot === "embed")).toHaveLength(1);
    // `imageEmbed` is never asked once `embed` has claimed the slot.
    expect(resolveRole.mock.calls.map(([params]) => params.role)).toEqual(["rerank", "embed"]);
  });

  test("imageEmbed alone on local-light still claims the embed slot", async () => {
    const plan = await planLocalLightPrefetch({
      resolveRole: resolverFor(IMAGE_EMBED_ONLY),
      principal: OWNER,
      enabled: true,
    });

    expect(plan).toEqual([
      { slot: "embed", modelId: DEFAULT_EMBED_MODEL },
      { slot: "matte", modelId: DEFAULT_MATTE_MODEL },
    ]);
  });

  test("carries the resolver's EXPLICIT model id when one is pinned, not the builtin", async () => {
    const plan = await planLocalLightPrefetch({
      resolveRole: resolverFor(ALL_LOCAL_LIGHT, "Xenova/some-other-encoder"),
      principal: OWNER,
      enabled: true,
    });

    expect(plan.find((t) => t.slot === "embed")?.modelId).toBe("Xenova/some-other-encoder");
  });

  test("a THROWING resolver is 'not local-light', never a boot failure", async () => {
    const plan = await planLocalLightPrefetch({
      resolveRole: vi.fn<ConnectionService["resolveRole"]>(() => Promise.reject(new Error("no credential for source"))),
      principal: OWNER,
      enabled: true,
    });

    expect(plan).toEqual([]);
  });
});
