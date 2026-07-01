// Unit tests for the local-light family barrel — the sealed-backend SHAPE. Asserts the backend
// registers under the "local-light" key, WIRES exactly the three derive roles (embed/rerank/imageEmbed),
// and OMITS chat/agent/summarize/generateImage (absent methods → the role dispatcher's `requireRoleImpl`
// throws a typed not-supported, matching the firewall's local-light policy). Lazy by construction: the
// default (no-cache) build does not load any model.

import {
  createLocalLightBackend,
  DEFAULT_EMBED_MODEL,
  DEFAULT_IMAGE_EMBED_MODEL,
  DEFAULT_RERANK_MODEL,
} from "@orb/server/infra/providers/backends/local-light";
import { describe } from "vitest";
import { expect, test } from "../../../../../support/fixtures";

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
