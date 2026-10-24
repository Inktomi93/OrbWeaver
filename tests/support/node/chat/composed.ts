// A room is authored through the real server graph; only physical provider execution is scripted.
import type { CharacterDetail, CreateCharacterInput } from "@orb/contracts/character";
import { createCharacterSchema } from "@orb/contracts/character";
import type { GroupConfigInput } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import type { CreatePersonaInput } from "@orb/contracts/persona";
import type { PromptConfig } from "@orb/contracts/preset";
import type { MemoryDefaults } from "@orb/contracts/settings";
import type { ChatId } from "@orb/kit/ids";
import { seedCorpusActors } from "../corpus-actors.ts";
import type { TranscriptLine } from "../factories/chat.ts";
import { seedTranscript } from "../factories/chat.ts";
import type { AppCaller } from "../fixtures.ts";
import type { ServerHarnessOptions, ServerTestHarness } from "../server.ts";
import { createServerHarness } from "../server.ts";

export interface ChatRootOptions {
  readonly providerFetch: typeof fetch;
  readonly server?: Omit<ServerHarnessOptions, "providerFetch">;
  readonly characters?: readonly CreateCharacterInput[];
  readonly promptConfig?: PromptConfig;
  readonly group?: GroupConfigInput;
  readonly memoryEnabled?: boolean;
  readonly memoryDefaults?: MemoryDefaults;
  /** Owner personas created before the room, so a transcript line can name one as its author. */
  readonly personas?: readonly CreatePersonaInput[];
  /** Prior canon: the room is born through the native chat import instead of `startChat`. */
  readonly transcript?: readonly TranscriptLine[];
}

export interface ChatRoot extends AsyncDisposable {
  readonly root: ServerTestHarness;
  readonly owner: Principal;
  readonly caller: AppCaller;
  readonly chatId: ChatId;
  readonly characters: readonly CharacterDetail[];
  readonly requests: readonly Request[];
}

/** Own the real graph and room; recorded requests are actual physical provider inputs, never TurnPrep replicas. */
export async function createChatRoot(options: ChatRootOptions): Promise<ChatRoot> {
  await using construction = new AsyncDisposableStack();
  const requests: Request[] = [];
  const providerFetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    requests.push(request.clone());
    return await options.providerFetch(request);
  };
  const root = construction.use(await createServerHarness({ startJobs: false, ...options.server, providerFetch }));
  const { owner } = await seedCorpusActors(root);
  const caller = await root.internalCallerFor(owner.userId);
  const preset = await caller.preset.create({
    name: "Composed turn preset",
    kind: "custom",
    ...(options.promptConfig === undefined ? {} : { config: options.promptConfig }),
  });
  await caller.settings.updateUserSettingsSection({ section: "seeds", patch: { defaultPresetId: preset.id } });
  if (options.memoryEnabled !== undefined) {
    await caller.settings.updateUserSettingsSection({ section: "memory", patch: { enabled: options.memoryEnabled } });
  }
  if (options.memoryDefaults !== undefined) {
    await caller.settings.updateAppSettings({ partial: { memoryDefaults: options.memoryDefaults } });
  }
  const characters: CharacterDetail[] = [];
  for (const input of options.characters ?? [createCharacterSchema.parse({ handle: "aria", name: "Aria", description: "A bold knight." })]) {
    characters.push(await caller.character.create({ input }));
  }
  for (const input of options.personas ?? []) {
    await caller.persona.create({ input });
  }
  const chatId =
    options.transcript === undefined
      ? (await caller.chat.startChat({ characterIds: characters.map(({ id }) => id), opening: "none" })).chat.id
      : (await seedTranscript(root, { ownerId: owner.userId, characterHandles: characters.map(({ handle }) => handle), lines: options.transcript })).chatId;
  if (options.group !== undefined) {
    await caller.chat.setGroupConfig({ chatId, config: options.group });
  }
  await root.settleBackground();
  const lifetime = construction.move();
  return { root, owner, caller, chatId, characters, requests, [Symbol.asyncDispose]: () => lifetime.disposeAsync() };
}
