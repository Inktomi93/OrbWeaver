// The D48 generate_image tool projection (imagery-design/04 §1). Unit test (no db): the registered def's
// shape + the handler's arg→param mapping onto the injected generatePicture op, and the non-chat refusal.

import { IMAGERY_GENERATE_IMAGE_TOOL_DESCRIPTION } from "@orb/contracts/imagery";
import type { AssetId, ChatId, ImageryGenerationId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { projectJsonSchema } from "@orb/kit/json-schema";
import type { GeneratedPicture, GeneratePictureParams } from "@orb/server/domain/imagery";
import { imageryToolDefinitions } from "@orb/server/domain/imagery";
import type { ToolExecutionContext } from "@orb/server/domain/tool-use";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";
import { principal } from "./_support.ts";

const OWNER = castId<UserId>("user_owner");
const CHAT = castId<ChatId>("chat_room");

interface Recorder {
  readonly op: (p: GeneratePictureParams) => Promise<GeneratedPicture>;
  readonly calls: GeneratePictureParams[];
}

/** A recording fake generatePicture that returns one image and captures the params the tool mapped. */
function fakeGeneratePicture(): Recorder {
  const calls: GeneratePictureParams[] = [];
  const op = (p: GeneratePictureParams): Promise<GeneratedPicture> => {
    calls.push(p);
    const assetId = castId<AssetId>("asset_1");
    return Promise.resolve({
      images: [
        {
          assetId,
          generationId: castId<ImageryGenerationId>("imagery_generation_1"),
          block: { kind: "media", media: "image", src: { kind: "asset", assetId }, alt: "x" },
        },
      ],
      prompt: p.prompt ?? "",
      promptSource: "user",
      mode: p.mode,
      model: "img-model",
      costUsd: 0.02,
      reused: false,
      warnings: [],
    });
  };
  return { calls, op };
}

function exec(chatId: ChatId | null): ToolExecutionContext {
  return { principal: principal(OWNER), triggeredBy: OWNER, chatId, turnId: null, membership: null };
}

describe("generate_image tool", () => {
  test("registers ONE def: name generate_image, member-floor ceiling, builtin source", () => {
    const defs = imageryToolDefinitions({ generatePicture: fakeGeneratePicture().op });
    expect(defs).toHaveLength(1);
    expect(defs[0]?.name).toBe("generate_image");
    expect(defs[0]?.capability).toBeNull();
    expect(defs[0]?.source).toBe("builtin");
  });

  // #578 — the description now reads the PROSE-1 slot (`imagery.tool.generateImageDescription`); this pins the
  // wire is byte-identical to the pre-slot inline literal.
  test("the model-facing description is the imagery.tool.generateImageDescription slot's shipped default", () => {
    const [def] = imageryToolDefinitions({ generatePicture: fakeGeneratePicture().op });
    expect(def?.description).toBe(IMAGERY_GENERATE_IMAGE_TOOL_DESCRIPTION);
    expect(def?.description).toBe(
      "Generate an image in the current chat from a text prompt. Use when the user asks you to draw, paint, " +
        'show, or picture something. `mode:"free"` uses `prompt` verbatim; the portrait/scene modes derive the ' +
        "prompt from the conversation. Posts one message with the image(s) attached.",
    );
  });

  test("the args schema projects to JSON Schema (no unrepresentable transform — the D48 registry requirement)", () => {
    const [def] = imageryToolDefinitions({ generatePicture: fakeGeneratePicture().op });
    // The registry computes this at register(); the strict-parse subjectCharacterId transform would throw here.
    expect(() => projectJsonSchema(def?.argsSchema as never)).not.toThrow();
  });

  test("maps args onto GeneratePictureParams (caller/chat from exec) + returns the asset ids", async () => {
    const fake = fakeGeneratePicture();
    const [def] = imageryToolDefinitions({ generatePicture: fake.op });
    const result = await def?.handler({ mode: "free", prompt: "a castle", n: 2, reuse: "prefer" }, exec(CHAT));

    expect(result).toEqual({ ok: true, value: { assetIds: [castId<AssetId>("asset_1")], reused: false, warnings: [] } });
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]).toMatchObject({ caller: { userId: OWNER }, chatId: CHAT, mode: "free", prompt: "a castle", n: 2, reuse: "prefer" });
  });

  test("refuses (ok:false, never throws) when the exec context has no chat", async () => {
    const fake = fakeGeneratePicture();
    const [def] = imageryToolDefinitions({ generatePicture: fake.op });
    const result = await def?.handler({ mode: "free", prompt: "x", n: 1, reuse: "prefer" }, exec(null));

    expect(result).toMatchObject({ ok: false });
    expect(fake.calls).toHaveLength(0);
  });
});
