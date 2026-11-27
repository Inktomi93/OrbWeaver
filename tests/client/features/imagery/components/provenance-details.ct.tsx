// @subject packages/client/src/features/imagery/components/provenance-strip.tsx
// The lightbox's provenance strip over a picture the production imagery verb generated and recorded: the negative prompt,
// the token and cache detail, the character it is of and when it was made, each only when the picture carries it. Only the
// provider's physical reply is scripted.

import type { ImageSubject } from "@orb/client/state";
import type { AssetId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import { routeAuthConfig, routeTrpc, SECTION_PROCEDURES, SHELL_MOUNT_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { present } from "@orb/testkit/iso";
import type { ChatRoot } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_PROVIDER_ENDPOINT,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createChatRoot,
  createCorpusProviderExecution,
  makeAssetBytes,
} from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import type { ImageDetailShellStory } from "./_provenance-stories.tsx";

const STORY = "tests/client/features/imagery/components/_provenance-stories/ImageDetailShellStory";
const IMAGE_MODEL = "provenance-image-v1";
const IMAGES_PATH = "/v1/images/generations";
const PROMPT = "A keeper lighting the observatory lamp";
const EXTRA_NEGATIVE = "extra fingers";
const TOKENS_IN = 120;
const TOKENS_OUT = 1290;
const CACHED = 64;
const READS = [
  "persona.list",
  "notifications.list",
  "plugin.listCommands",
  "databank.bankHealth",
  "rosterPreset.count",
  "connection.list",
  "connection.listBindings",
  "imagery.readProvenance",
] as const;

interface PictureRoom {
  readonly room: ChatRoot;
  readonly assetId: AssetId;
}

/** A room with one picture of its character, generated through the production verb over the images wire. The provider's
 *  reply carries a usage report with a cache read, or none. */
async function pictureRoom(reportsUsage: boolean): Promise<PictureRoom & AsyncDisposable> {
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
    chatText: "The keeper nods.",
  });
  let pixels: Uint8Array = new Uint8Array();
  const imageReply = (): Response =>
    Response.json({
      created: 0,
      data: [{ ["b64_json"]: Buffer.from(pixels).toString("base64") }],
      ...(reportsUsage
        ? {
            usage: {
              ["input_tokens"]: TOKENS_IN,
              ["output_tokens"]: TOKENS_OUT,
              ["input_tokens_details"]: { ["cached_tokens"]: CACHED },
            },
          }
        : {}),
    });
  await using construction = new AsyncDisposableStack();
  const room = construction.use(
    await createChatRoot({
      providerFetch: async (input, init) => {
        const request = new Request(input, init);
        return request.method === "POST" && new URL(request.url).pathname === IMAGES_PATH ? imageReply() : await physical.execute(request);
      },
    }),
  );
  pixels = makeAssetBytes(room.root.idSource.typeId(ID_PREFIX.asset));
  const connection = await room.root.services.connection.create({
    principal: room.owner,
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: CORPUS_PROVIDER_ENDPOINT,
    model: IMAGE_MODEL,
    allowBackground: true,
    declared: {
      kind: "generation",
      generation: { context: { window: 32_000 }, output: { modalities: ["image"] } },
      features: { detectServer: false, images: "images-api" },
    },
  });
  await room.caller.connection.setBinding({ task: "generateImage", connectionId: connection.id });
  const picture = await room.root.services.imagery.generatePicture({
    signal: new AbortController().signal,
    caller: room.owner,
    chatId: room.chatId,
    mode: "character",
    subjectCharacterId: present(room.characters[0]).id,
    prompt: PROMPT,
    negative: EXTRA_NEGATIVE,
    n: 1,
  });
  const lifetime = construction.move();
  return { room, assetId: present(picture.images[0]).assetId, [Symbol.asyncDispose]: () => lifetime.disposeAsync() };
}

async function serveLightbox({ room }: PictureRoom, page: Page): Promise<void> {
  await routeAuthConfig(page, await (await room.root.http.request("/api/auth/config")).text());
  await routeTrpc(page, serveCorpusProcedures(room.caller, [...SECTION_PROCEDURES, ...SHELL_MOUNT_PROCEDURES, ...READS]));
}

function subjectOf({ room, assetId }: PictureRoom): ImageSubject {
  return { assetId, chatId: room.chatId, url: "/census-image.png", alt: "Generated image", dims: { w: 64, h: 64 } };
}

test("a generated picture's strip shows its negative prompt, token and cache detail, character and creation time", async ({ mount, page }) => {
  await using held = await pictureRoom(true);
  const recorded = present(await held.room.caller.imagery.readProvenance({ assetId: held.assetId }));
  // The controls on the premise: the recorded row carries each fact, so an absent line is the strip's omission.
  expect(recorded.negativePrompt).toContain(EXTRA_NEGATIVE);
  expect(recorded.usage.tokensIn).toBe(TOKENS_IN);
  expect(recorded.usage.cacheReadTokens).toBe(CACHED);
  const name = present(held.room.characters[0]).name;
  await serveLightbox(held, page);
  await mount<typeof ImageDetailShellStory>(STORY, { subject: subjectOf(held) });

  const strip = page.locator('[data-slot="provenance"]');
  await expect(strip.locator('[data-slot="provenance-prompt"]')).toHaveText(PROMPT);
  await expect(strip.locator('[data-slot="provenance-negative"]')).toContainText(EXTRA_NEGATIVE);
  const usage = strip.locator('[data-slot="provenance-usage"]');
  for (const figure of [TOKENS_IN, TOKENS_OUT, CACHED]) {
    await expect(usage).toContainText(String(figure));
  }
  await expect(strip.locator('[data-slot="provenance-subject"]')).toHaveText(name);
  await expect(strip.locator('[data-slot="provenance-created"]')).not.toBeEmpty();
});

test("a picture whose provider reported no usage shows no token line, and the rest of the strip still shows", async ({ mount, page }) => {
  await using held = await pictureRoom(false);
  const recorded = present(await held.room.caller.imagery.readProvenance({ assetId: held.assetId }));
  expect(recorded.usage.tokensIn).toBeNull();
  await serveLightbox(held, page);
  await mount<typeof ImageDetailShellStory>(STORY, { subject: subjectOf(held) });

  const strip = page.locator('[data-slot="provenance"]');
  await expect(strip.locator('[data-slot="provenance-subject"]')).toBeVisible();
  await expect(strip.locator('[data-slot="provenance-created"]')).toBeVisible();
  await expect(strip.locator('[data-slot="provenance-usage"]')).toHaveCount(0);
});
