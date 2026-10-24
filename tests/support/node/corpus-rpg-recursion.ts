// Native react admission and registry execution drive the engine's actual second depth and folded lineage.
import { createCharacterSchema } from "@orb/contracts/character";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { CORPUS_PROVIDER_ENDPOINT } from "./corpus-provider.ts";
import { RPG_RECURSION_CARD, RPG_RECURSION_CUE, RPG_RECURSION_MODEL } from "./corpus-rpg-flight-wire.ts";
import { captureRpgRows, captureRpgTurnToolCalls } from "./factories/rows/rpg.ts";
import { captureTurnRows, seedRpgGameRows } from "./factories/rows.ts";
import type { ServerTestHarness } from "./server.ts";

type Caller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>;
interface CorpusRpgRecursion {
  readonly character: Awaited<ReturnType<Caller["character"]["create"]>>;
  readonly room: Awaited<ReturnType<Caller["chat"]["startChat"]>>;
  readonly connection: Awaited<ReturnType<ServerTestHarness["services"]["connection"]["create"]>>;
  readonly game: Awaited<ReturnType<typeof seedRpgGameRows>>;
  readonly turn: Awaited<ReturnType<ServerTestHarness["services"]["chat"]["send"]>>;
  readonly canon: Awaited<ReturnType<typeof captureTurnRows>>;
  readonly rows: Awaited<ReturnType<typeof captureRpgRows>>;
  readonly calls: Awaited<ReturnType<typeof captureRpgTurnToolCalls>>;
  readonly tracker: Awaited<ReturnType<Caller["rpg"]["getTrackerView"]>>;
  readonly reactions: Awaited<ReturnType<Caller["chat"]["listReactions"]>>;
  readonly trace: ReturnType<NonNullable<ServerTestHarness["app"]["rpgTrace"]>["recent"]>;
}

/** Host-owned settings admit a real builtin; only raw vendor replies choose its name-based arguments. */
export async function seedCorpusRpgRecursion(root: ServerTestHarness): Promise<CorpusRpgRecursion> {
  const principal = await root.principalFor(root.ownerId);
  const caller = await root.internalCallerFor(root.ownerId);
  const preset = await caller.preset.create({ name: "Recursive RPG corpus", kind: "custom" });
  await caller.settings.updateUserSettingsSection({ section: "seeds", patch: { defaultPresetId: preset.id } });
  const connection = await root.services.connection.create({
    principal,
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: CORPUS_PROVIDER_ENDPOINT,
    model: RPG_RECURSION_MODEL,
    allowBackground: true,
    declared: {
      kind: "generation",
      generation: { input: ["text"], context: { window: 32_000 }, tools: { parallel: true, silencesProse: false, requiredChoice: true } },
      features: { detectServer: false },
    },
  });
  await caller.connection.setBinding({ task: "chat", connectionId: connection.id });
  const character = await caller.character.create({
    input: createCharacterSchema.parse({
      handle: "corpus-rpg-recursive",
      name: RPG_RECURSION_CARD,
      description: "A keeper follows the ledger through two observatories.",
    }),
  });
  const room = await caller.chat.startChat({ characterIds: [character.id], opening: "none" });
  const chatId = room.chat.id;
  await caller.chat.setGroupConfig({ chatId, config: { output: "per-speaker", cardScope: "scoped", policy: "list" } });
  await caller.chat.setCharactersCanReact({ chatId, enabled: true });
  await caller.chat.setReactionsEnabled({ chatId, enabled: true });
  const game = await seedRpgGameRows(root, { principal, chatId, mode: "lite" });
  await caller.rpg.updateConfig({ chatId, extractionMode: "folded" });
  const turn = await root.services.chat.send({
    principal,
    chatId,
    content: RPG_RECURSION_CUE,
    timeZone: UTC_TIME_ZONE,
    intent: { maxContextTokens: 32_000, maxOutputTokens: 128 },
  });
  await root.settleBackground();
  const assistant = turn.messages.find((message) => message.role === "assistant");
  if (assistant === undefined || turn.aborted || root.app.rpgTrace === undefined) {
    throw new Error("native recursive RPG capture requires a completed assistant and its real trace recorder");
  }
  return {
    character,
    room,
    connection,
    game,
    turn,
    canon: await captureTurnRows(root.db, turn),
    rows: await captureRpgRows(root.db, game.id),
    calls: await captureRpgTurnToolCalls(root.db, game.id, [assistant.selectedVariantId]),
    tracker: await caller.rpg.getTrackerView({ chatId }),
    reactions: await caller.chat.listReactions({ chatId }),
    trace: root.app.rpgTrace.recent({ chatId }),
  };
}
