// Higher tiers and rerolls are native canon; this producer never supplies a level, score or derived row.
import { createCharacterSchema } from "@orb/contracts/character";
import { DEFAULT_MEMORY_DEFAULTS } from "@orb/contracts/settings";
import { messages, messageVariants } from "@orb/db";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { eq } from "drizzle-orm";
import { seedCorpusKnowledgeImages } from "./corpus-knowledge-images.ts";
import { CORPUS_KNOWLEDGE_SWIPE_CUE } from "./corpus-knowledge-wire.ts";
import { settleCorpusWorkloads } from "./corpus-workloads.ts";
import { captureThemeRows } from "./factories/discovery.ts";
import { captureChatMemoryRows } from "./factories/embedding-generation.ts";
import type { ServerTestHarness } from "./server.ts";

const ARC_STORY_MESSAGES = 80;
const STORY_CLOCK_STEP_MS = 1000;
type CorpusCaller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>;
type CorpusTurn = Awaited<ReturnType<ServerTestHarness["services"]["chat"]["send"]>>;
type Hotspots = Awaited<ReturnType<CorpusCaller["discovery"]["swipeHotspots"]>>;
interface CorpusKnowledgeVariants {
  readonly character: Awaited<ReturnType<CorpusCaller["character"]["create"]>>;
  readonly room: Awaited<ReturnType<CorpusCaller["chat"]["startChat"]>>;
  readonly history: readonly Awaited<ReturnType<CorpusCaller["chat"]["commitMessage"]>>[];
  readonly memoryJobs: Awaited<ReturnType<typeof settleCorpusWorkloads>>;
  readonly themeJobs: Awaited<ReturnType<typeof settleCorpusWorkloads>>;
  readonly memory: Awaited<ReturnType<typeof captureChatMemoryRows>>;
  readonly themes: Awaited<ReturnType<typeof captureThemeRows>>;
  readonly home: Awaited<ReturnType<CorpusCaller["discovery"]["home"]>>;
  readonly arcDetails: readonly Awaited<ReturnType<CorpusCaller["discovery"]["themeDetail"]>>[];
  readonly drift: Awaited<ReturnType<CorpusCaller["discovery"]["themeDrift"]>>;
  readonly first: CorpusTurn;
  readonly swipedOnce: CorpusTurn;
  readonly swipedTwice: CorpusTurn;
  readonly selected: Awaited<ReturnType<CorpusCaller["chat"]["selectVariant"]>>;
  readonly singleTake: Hotspots;
  readonly firstHotspot: Hotspots;
  readonly secondHotspot: Hotspots;
  readonly selectedHotspot: Hotspots;
  readonly slot: typeof messages.$inferSelect;
  readonly variants: readonly (typeof messageVariants.$inferSelect)[];
  readonly images: Awaited<ReturnType<typeof seedCorpusKnowledgeImages>>;
}

/** Keep the grounded default grid and create enough actual story for its native consolidation to engage. */
export async function seedCorpusKnowledgeVariants(root: ServerTestHarness): Promise<CorpusKnowledgeVariants> {
  const principal = await root.principalFor(root.ownerId);
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.settings.updateUserSettingsSection({ section: "memory", patch: { enabled: true } });
  await caller.settings.updateAppSettings({ partial: { memoryDefaults: DEFAULT_MEMORY_DEFAULTS } });
  const preset = await caller.preset.create({ name: "Arc corpus preset", kind: "custom" });
  await caller.settings.updateUserSettingsSection({ section: "seeds", patch: { defaultPresetId: preset.id } });
  const character = await caller.character.create({
    input: createCharacterSchema.parse({
      handle: "knowledge-arc-variant",
      name: "Arc ledger traveller",
      description: "A traveller preserves the orbital ledger and harbor witnesses.",
    }),
  });
  const room = await caller.chat.startChat({ characterIds: [character.id], opening: "none" });
  const chatId = room.chat.id;
  await caller.chat.setGroupConfig({ chatId, config: { output: "per-speaker", cardScope: "scoped", policy: "list" } });
  const history: CorpusKnowledgeVariants["history"][number][] = [];
  for (let scene = 0; scene < ARC_STORY_MESSAGES; scene += 1) {
    root.timers.advance(STORY_CLOCK_STEP_MS);
    await root.settleBackground();
    history.push(
      await caller.chat.commitMessage({
        chatId,
        timeZone: UTC_TIME_ZONE,
        content: `Arc ledger scene ${scene}: The traveller repairs the loom and preserves a harbor witness's recorded journey.`,
      }),
    );
  }
  root.timers.advance(STORY_CLOCK_STEP_MS);
  await root.settleBackground();
  const memoryJobs = await settleCorpusWorkloads(root, caller, [
    await caller.workloads.start({ input: { kind: "memory-backfill", params: {} }, mode: "singular" }),
  ]);
  const memory = await captureChatMemoryRows(root.db, chatId);
  const themeJobs = await settleCorpusWorkloads(root, caller, [
    await caller.workloads.start({ input: { kind: "compute-themes", params: { k: 1 } }, mode: "singular" }),
  ]);
  const themes = await captureThemeRows(root.db, root.ownerId);
  const home = await caller.discovery.home();
  const arcDetails = await Promise.all(home.arcThemes.map(({ clusterIdx, level }) => caller.discovery.themeDetail({ clusterIdx, level })));
  const drift = await caller.discovery.themeDrift();
  const turnParams = { principal, chatId, timeZone: UTC_TIME_ZONE, intent: { maxContextTokens: 32_000, maxOutputTokens: 64 } };
  const first = await root.services.chat.send({ ...turnParams, content: CORPUS_KNOWLEDGE_SWIPE_CUE });
  const assistant = first.messages.find((message) => message.role === "assistant");
  if (first.aborted || assistant === undefined) {
    throw new Error("native knowledge corpus produced no selected assistant take");
  }
  const singleTake = await caller.discovery.swipeHotspots({ chatId });
  const swipedOnce = await root.services.chat.swipe({ ...turnParams, messageId: assistant.id });
  const firstHotspot = await caller.discovery.swipeHotspots({ chatId });
  const swipedTwice = await root.services.chat.swipe({ ...turnParams, messageId: assistant.id });
  const secondHotspot = await caller.discovery.swipeHotspots({ chatId });
  const selected = await caller.chat.selectVariant({ chatId, messageId: assistant.id, variantId: assistant.selectedVariantId, timeZone: UTC_TIME_ZONE });
  const selectedHotspot = await caller.discovery.swipeHotspots({ chatId });
  const slot = await root.db.select().from(messages).where(eq(messages.id, assistant.id)).get();
  if (slot === undefined) {
    throw new Error("native reroll lost its canonical message slot");
  }
  const variants = await root.db.select().from(messageVariants).where(eq(messageVariants.messageId, assistant.id)).orderBy(messageVariants.idx);
  const images = await seedCorpusKnowledgeImages(root);
  return {
    character,
    room,
    history,
    memoryJobs,
    themeJobs,
    memory,
    themes,
    home,
    arcDetails,
    drift,
    first,
    swipedOnce,
    swipedTwice,
    selected,
    singleTake,
    firstHotspot,
    secondHotspot,
    selectedHotspot,
    slot,
    variants,
    images,
  };
}
