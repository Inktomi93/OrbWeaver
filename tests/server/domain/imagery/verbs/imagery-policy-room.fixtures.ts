// The host-funded imagery room the generation-policy and picture-spend suites share: a priced Utility connection, an
// image connection, a seated portrait subject and an invited member, over one finite physical reply plan.

import { createCharacterSchema } from "@orb/contracts/character";
import type { Principal } from "@orb/contracts/identity";
import { IMAGERY_NEGATIVE_SLOT_ID } from "@orb/contracts/imagery";
import { modelIdSchema } from "@orb/contracts/inference";
import type { UserCredentialId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import { finiteReplies } from "@orb/testkit/iso";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import {
  CORPUS_PROVIDER_ENDPOINT,
  createCorpusProviderExecution,
  makeAssetBytes,
  seedChatInvite,
  seedCorpusConnections,
  seedInvitedChatParticipant,
} from "@orb/testkit/node/composed";
import { proseOverrideFromLegacy } from "#contracts/prose-slot/index.ts";

export const HOST_MODEL = modelIdSchema.parse("imagery-host-utility");
export const LIVE_MODEL = modelIdSchema.parse("imagery-host-utility-live");
export const IMAGE_MODEL = modelIdSchema.parse("imagery-host-image");
export const HOST_CAPTION = "Describe the host portrait.";
export const HOST_TEMPLATE = "Extract the host portrait.";
export const HOST_NEGATIVE = "host excluded detail";
export const HOST_KEY = "imagery-host-funded-key";
export const CAPTION = "  traveller, blue coat  ";
export const CAPTION_MODE = "character_multimodal";

/** The image generations path the room's image connection posts to. */
const IMAGE_GENERATIONS_PATH = "/v1/images/generations";

/** The room's finite physical provider; `onImageCall` runs as each image call arrives, so a case can let time pass inside it. */
export function physicalExecution(
  replies: readonly string[],
  onImageCall: () => void = () => undefined,
): Disposable & { execute: typeof fetch; requests: Request[]; images: Uint8Array[] } {
  using construction = new DisposableStack();
  const nextReply = construction.use(finiteReplies("imagery completion", replies)).take;
  const requests: Request[] = [];
  const images: Uint8Array[] = [];
  const provider = createCorpusProviderExecution({
    modelIds: [HOST_MODEL, LIVE_MODEL, IMAGE_MODEL],
    embedding: [1, 0, 0],
    chatText: () => nextReply(),
    structuredReplies: new Map(),
    images,
    usage: { promptTokens: 40, completionTokens: 15 },
  });
  const execute: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    if (request.method === "POST") {
      requests.push(request.clone());
    }
    if (new URL(request.url).pathname === IMAGE_GENERATIONS_PATH) {
      onImageCall();
    }
    return await provider.execute(request);
  };
  const lifetime = construction.move();
  return {
    [Symbol.dispose]: () => lifetime.dispose(),
    execute,
    requests,
    images,
  };
}

/** Admit the corpus provider's private host, as the box owner does in settings. */
export async function allowCorpusEndpoint(root: ServerTestHarness): Promise<void> {
  await root.services.settings.updateAppSettings({
    principal: await root.principalFor(root.ownerId),
    partial: { privateEndpointAllowlist: [new URL(CORPUS_PROVIDER_ENDPOINT).hostname] },
  });
}

/** The host's unpriced images-api connection, bound to image generation under `credentialId`. */
export async function seedImageBinding(root: ServerTestHarness, host: Principal, credentialId: UserCredentialId): Promise<void> {
  const image = await root.services.connection.create({
    principal: host,
    providerId: "custom-openai",
    credentialId,
    baseUrl: CORPUS_PROVIDER_ENDPOINT,
    model: IMAGE_MODEL,
    allowBackground: true,
    declared: {
      kind: "generation",
      generation: { context: { window: 32_000 }, output: { modalities: ["image"] } },
      features: { detectServer: false, images: "images-api" },
    },
  });
  await root.services.connection.setBinding({ principal: host, task: "generateImage", connectionId: image.id });
}

/** The room over a fresh host, or over `hostPrincipal` when a case needs the box owner to fund it. */
export async function policyRoom(
  root: ServerTestHarness,
  hostPrincipal?: Principal,
): Promise<{
  host: Principal;
  member: Principal;
  character: Awaited<ReturnType<ServerTestHarness["services"]["character"]["create"]>>;
  chat: Awaited<ReturnType<ServerTestHarness["services"]["chat"]["startChat"]>>["chat"];
  utility: Awaited<ReturnType<ServerTestHarness["services"]["connection"]["create"]>>;
  avatarBytes: Uint8Array;
}> {
  const host = hostPrincipal ?? (await root.principalFor((await root.actor()).id));
  const member = await root.principalFor((await root.actor()).id);
  await allowCorpusEndpoint(root);
  await seedCorpusConnections(root, host);
  const credential = await root.services.credentials.add({ principal: host, provider: "custom-openai", key: HOST_KEY });
  const utility = await root.services.connection.create({
    principal: host,
    providerId: "custom-openai",
    credentialId: credential.id,
    baseUrl: CORPUS_PROVIDER_ENDPOINT,
    model: HOST_MODEL,
    allowBackground: true,
    declared: {
      kind: "generation",
      generation: { input: ["text", "image"], context: { window: 32_000 }, sampling: { temperature: { min: 0, max: 2 } } },
      features: { detectServer: false, pricing: { inputPerMTok: 1, outputPerMTok: 2 } },
    },
  });
  await root.services.connection.setBinding({ principal: host, task: "chat", connectionId: utility.id });
  await root.services.connection.setBinding({ principal: host, task: "summarize", connectionId: utility.id });
  await seedImageBinding(root, host, credential.id);
  const avatarBytes = makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset));
  const avatar = await root.services.assets.store({ principal: host, bytes: avatarBytes, kind: "avatar", mime: "image/png", enforceMagic: true });
  const character = await root.services.character.create({
    principal: host,
    input: createCharacterSchema.parse({
      handle: "policy-portrait",
      name: "Traveller",
      description: "A traveller in a blue coat.",
      avatarAssetId: avatar.assetId,
    }),
  });
  const { chat } = await root.services.chat.startChat({ principal: host, characterIds: [character.id], opening: "none" });
  const invite = await seedChatInvite(root, { principal: host, chatId: chat.id, input: { invitedHandle: member.handle } });
  await seedInvitedChatParticipant(root, { principal: member, inviteId: invite.invite.id });
  await root.services.chat.commitMessage({ principal: host, chatId: chat.id, content: "The traveller stands beside the loom." });
  await root.services.settings.updateUserSettingsSection({
    principal: member,
    input: { section: "imagery", patch: { templates: { character: "Member extraction." }, captions: { [CAPTION_MODE]: "Member caption." } } },
  });
  await root.services.settings.updateUserSettingsSection({
    principal: member,
    input: { section: "prose", patch: { [IMAGERY_NEGATIVE_SLOT_ID]: proseOverrideFromLegacy("member excluded detail") } },
  });
  return { host, member, character, chat, utility, avatarBytes };
}
