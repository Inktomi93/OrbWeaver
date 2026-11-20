// @subject packages/server/src/domain/chat/engine/engine.ts
// The "Takes images" switch states one stored fact, the image member of the connection's declared `generation.input`.
// A turn on a model its provider reported nothing about sends an attached image under the assumed answer and under an
// explicit yes, and withholds it with the `image_dropped` warning under an explicit no.
import type { ChatBusEvent } from "@orb/contracts/chat";
import type { DeclaredCapability } from "@orb/contracts/inference";
import { ID_PREFIX } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { CORPUS_PROVIDER_ENDPOINT, CORPUS_TEXT_MODEL, makeAssetBytes } from "@orb/testkit/node/composed";
import { coreHttpRoom, coreProse } from "./core-physical.ts";

const WINDOW = 32_000;
type DeclaredInput = NonNullable<NonNullable<DeclaredCapability["generation"]>["input"]>[number];

/** What the switch writes for each answer on a row whose input the fold assumed as text, image and video. */
const SWITCH_ON = ["text", "video", "image"] as const;
const SWITCH_OFF = ["text", "video"] as const;

const ANSWERS = [
  { name: "the provider reported nothing and nothing is declared, so the assumed answer sends the image", input: undefined, sent: true },
  { name: "the switch on states yes, so the image is sent", input: SWITCH_ON, sent: true },
  { name: "the switch off states no, so the image is withheld and the room is told once", input: SWITCH_OFF, sent: false },
] as const;

async function bind(h: ChatRoot, input: readonly DeclaredInput[] | undefined): Promise<void> {
  const declared: DeclaredCapability = {
    kind: "generation",
    generation: { context: { window: WINDOW }, ...(input === undefined ? {} : { input: [...input] }) },
    features: { detectServer: false },
  };
  const connection = await h.root.services.connection.create({
    principal: h.owner,
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: CORPUS_PROVIDER_ENDPOINT,
    model: CORPUS_TEXT_MODEL,
    declared,
  });
  await h.caller.connection.setBinding({ task: "chat", connectionId: connection.id });
}

for (const answer of ANSWERS) {
  test(`a turn with an attached image: ${answer.name}`, async () => {
    await using h = await coreHttpRoom([(): Response => coreProse("seen")]);
    await bind(h, answer.input);
    const asset = await h.root.app.assets.store({
      principal: h.owner,
      kind: "attachment",
      mime: "image/png",
      bytes: makeAssetBytes(h.root.idSource.typeId(ID_PREFIX.asset)),
    });
    const events: ChatBusEvent[] = [];
    using subscription = new DisposableStack();
    subscription.defer(
      h.root.app.liveBuses.chat.subscribeAllChatEvents(({ event }) => {
        if (event.chatId === h.chatId) {
          events.push(event);
        }
      }),
    );
    const outcome = await h.root.services.chat.send({
      principal: h.owner,
      chatId: h.chatId,
      content: "Look at this.",
      attachmentAssetIds: [asset.assetId],
    });
    expect(outcome.aborted).toBe(false);

    const requests = h.requests.filter((request) => request.method === "POST" && new URL(request.url).pathname.endsWith("/chat/completions"));
    expect(requests).toHaveLength(1);
    const body = (await requests[0]?.clone().text()) ?? "";
    const dropped = events.filter((event) => event.type === "warning" && event.code === "image_dropped");
    // Each side asserts its own presence and its absence, so a body that carries the part and a warning that fires are
    // never both read as the answer.
    expect(body.includes('"image_url"')).toBe(answer.sent);
    expect(dropped).toHaveLength(answer.sent ? 0 : 1);
  });
}
