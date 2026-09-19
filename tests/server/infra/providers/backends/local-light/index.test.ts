// Unit tests for the local-light family barrel — the sealed-backend SHAPE. Asserts the backend
// registers under the "local-light" key, WIRES exactly the three derive roles (embed/rerank/imageEmbed),
// and OMITS chat/agent/summarize/generateImage (absent methods → the role dispatcher's `requireRoleImpl`
// throws a typed not-supported, matching the firewall's local-light policy). Lazy by construction: the
// default (no-cache) build does not load any model.

import type { ModelId } from "@orb/kit/ids";
import type { EmbedRequest, EmbedResult, ImageEmbedRequest, ImageEmbedResult } from "@orb/server/infra/providers";
import type { LocalLightModelCache } from "@orb/server/infra/providers/backends/local-light";
import {
  createLocalLightBackend,
  DEFAULT_EMBED_MODEL,
  DEFAULT_IMAGE_EMBED_MODEL,
  DEFAULT_RERANK_MODEL,
  localLightEmbedSpace,
} from "@orb/server/infra/providers/backends/local-light";
import { describe } from "vitest";
import { makeResolvedCredential } from "../../../../../support/factories/resolved-connection.ts";
import { expect, test } from "../../../../../support/fixtures.ts";

// The #2417 default. A LITERAL on purpose: the default IS the owner ruling, so flipping
// `LOCAL_LIGHT_EMBED_DTYPE` must red these rather than silently follow it.
const DEFAULT_EMBED_DTYPE = "q8";
const CRED = makeResolvedCredential("local-light");

/** A cache that returns one 1-dim vector per input — enough to read the result's `model` tag. */
function stubCache(): LocalLightModelCache {
  const one = (): Promise<Float32Array[]> => Promise.resolve([Float32Array.from([1])]);
  return {
    embedTexts: one,
    embedClipTexts: one,
    embedImages: one,
    scorePairs: (): Promise<number[]> => Promise.resolve([]),
    removeBackground: (): Promise<Uint8Array> => Promise.resolve(new Uint8Array()),
    preload: (): Promise<void> => Promise.resolve(),
  };
}

// The narrowed role callables are given their DECLARED signature rather than the inferred one (the
// `embedOf` precedent in `embed.test.ts`): biome's type service does not follow `ProviderBackend`'s
// optional role members through the undefined-narrowing, and reads the `await` as awaiting a plain value.
async function embedTag(model: string, dtype?: "fp32"): Promise<string> {
  const backend = createLocalLightBackend({ cache: stubCache(), ...(dtype === undefined ? {} : { dtype }) });
  const embed: ((req: EmbedRequest) => Promise<EmbedResult>) | undefined = backend.embed;
  if (embed === undefined) {
    throw new Error("local-light backend did not wire the embed role");
  }
  return (await embed({ credential: CRED, model: model as ModelId, input: "x" })).model;
}

async function imageEmbedTag(model: string): Promise<string> {
  const backend = createLocalLightBackend({ cache: stubCache() });
  const imageEmbed: ((req: ImageEmbedRequest) => Promise<ImageEmbedResult>) | undefined = backend.imageEmbed;
  if (imageEmbed === undefined) {
    throw new Error("local-light backend did not wire the imageEmbed role");
  }
  return (await imageEmbed({ credential: CRED, model: model as ModelId, input: { kind: "text", input: "x" } })).model;
}

// THE VECTOR-SPACE IDENTITY (owner ruling 2026-09-19, #2417). A re-quantised encoder is a different space,
// so the dtype rides in the `model` tag every vector row is keyed on — and the WRITE side (this backend's
// result) and the READ side (`localLightEmbedSpace`, which the composition root's `embedModel` getter
// answers with) must produce the SAME string, or the box purges and re-embeds its whole corpus forever.
describe("the local-light embed space tag", () => {
  test("defaults to q8 — the quantized encoder is the box's space, not an option nobody selected", async () => {
    expect(await embedTag(DEFAULT_EMBED_MODEL)).toBe(`${DEFAULT_EMBED_MODEL}@${DEFAULT_EMBED_DTYPE}`);
  });

  test("fp32 stays selectable and NAMES ITSELF — the knob moves the space, it does not hide in it", async () => {
    expect(await embedTag(DEFAULT_EMBED_MODEL, "fp32")).toBe(`${DEFAULT_EMBED_MODEL}@fp32`);
    // ...and the two dtypes are therefore DIFFERENT spaces, which is the whole mechanism: the staleness
    // and purge predicates compare this string.
    expect(await embedTag(DEFAULT_EMBED_MODEL, "fp32")).not.toBe(await embedTag(DEFAULT_EMBED_MODEL));
  });

  test("the imageEmbed role reports the IDENTICAL tag — one model, one joint text/image space", async () => {
    expect(await imageEmbedTag(DEFAULT_IMAGE_EMBED_MODEL)).toBe(await embedTag(DEFAULT_EMBED_MODEL));
  });

  test("the read side agrees with the write side for a resolved model id", async () => {
    expect(localLightEmbedSpace(DEFAULT_EMBED_MODEL)).toBe(await embedTag(DEFAULT_EMBED_MODEL));
  });

  // The case that made this function necessary rather than tidy: `resolve-role.ts` hands local-light an
  // EMPTY model id (the in-process tier serves its builtin; the user has no choice), the backend
  // self-defaults, and before #2417 the active-space read answered "" while the rows said
  // "jinaai/jina-clip-v2" — a corpus permanently in a space the box did not think it was in.
  test("an EMPTY resolved model id lands on the same tag on both sides, not on the empty string", async () => {
    expect(localLightEmbedSpace("")).toBe(await embedTag(""));
    expect(localLightEmbedSpace("")).toBe(`${DEFAULT_EMBED_MODEL}@${DEFAULT_EMBED_DTYPE}`);
  });
});

describe("createLocalLightBackend", () => {
  test("registers under the local-light key and wires only the three derive roles", () => {
    const backend = createLocalLightBackend();

    expect(backend.key).toBe("local-light");
    expect(backend.embed).toBeTypeOf("function");
    expect(backend.rerank).toBeTypeOf("function");
    expect(backend.imageEmbed).toBeTypeOf("function");
  });

  test("omits chat/agent/summarize/generateImage (the chat-less tier serves none of them)", () => {
    const backend = createLocalLightBackend();

    expect(backend.runChatTurn).toBeUndefined();
    expect(backend.runAgentTurn).toBeUndefined();
    expect(backend.summarize).toBeUndefined();
    expect(backend.generateImage).toBeUndefined();
  });

  test("exposes a default model id per derive role for the boot binder", () => {
    expect(DEFAULT_EMBED_MODEL.length).toBeGreaterThan(0);
    expect(DEFAULT_RERANK_MODEL.length).toBeGreaterThan(0);
    expect(DEFAULT_IMAGE_EMBED_MODEL.length).toBeGreaterThan(0);
  });
});
