import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { DEFAULT_GROUP_CONFIG } from "@orb/contracts/chat";
import type { PromptConfig } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { castId } from "@orb/kit/ids";
import type { MessageRole } from "@orb/kit/message-role";
import { createTurnEngine } from "../../packages/server/src/domain/chat/engine/engine.ts";
import { driveRound } from "../../packages/server/src/domain/chat/engine/round.ts";
import { loadWitnessHorizons } from "../../packages/server/src/domain/chat/memory/persistence/queries.ts";
import { recallMemory } from "../../packages/server/src/domain/chat/memory/recall/recall.ts";
import { resolveModelCapability } from "../../packages/server/src/domain/connection/catalog/resolve-model-capability.ts";
import { createRunChatTurnBridge } from "../../packages/server/src/entry/compose/chat.ts";
import { createOpenRouterBackend } from "../../packages/server/src/infra/providers/backends/openrouter/index.ts";
import { makeChatContext, seedCharacter, seedChat, seedMessage, seedUser, stubRunCompaction, testConnection } from "../../tests/server/domain/chat/_support.ts";
import { freshDb } from "../../tests/support/db.ts";

const FIXTURES_DIR = path.join(process.cwd(), "tests/goldens/fixtures");
const ST_CHATS_DIR = path.join(process.cwd(), "tests/goldens/sillytavern-runtime/data/default-user/chats/Sabine Veyra");
const OUTPUT_DIR = path.join(process.cwd(), "tests/goldens/orbweaver-output");

async function loadSTChat(db: any, chatId: any, chatFileName: string, host: any, aria: any) {
  const chatFile = path.join(ST_CHATS_DIR, `${chatFileName}.jsonl`);
  const lines = fs
    .readFileSync(chatFile, "utf-8")
    .split("\n")
    .filter((l) => l.trim().length > 0);

  let seq = 1;
  // skip header line (idx 0)
  for (let i = 1; i < lines.length; i++) {
    const data = JSON.parse(lines[i]);
    if (!data.mes) {
      continue;
    }

    let role: MessageRole = "assistant";
    if (data.is_system) {
      role = "system";
    } else if (data.is_user) {
      role = "user";
    }

    await seedMessage(db, chatId, seq++, {
      role,
      authorUserId: role === "user" ? host : null,
      characterId: role === "assistant" ? aria : null,
      content: data.mes,
    });
  }
}

async function runCapture() {
  const fixtures = fs.readdirSync(FIXTURES_DIR).filter((f) => f.endsWith(".json"));
  for (const fixtureFile of fixtures) {
    console.log(`Processing ${fixtureFile}...`);
    const fixture = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, fixtureFile), "utf-8"));

    // We only care about claude for this
    if (fixture.provider !== "claude") {
      continue;
    }

    const wireSink: { body?: any } = {};
    const backend = createOpenRouterBackend({
      now: () => 1000,
      getClient: () =>
        ({
          fetch: async () => ({
            ok: true,
            status: 200,
            headers: new Map(),
            body: {
              getReader: () => {
                let done = false;
                return {
                  read: async () => {
                    if (!done) {
                      done = true;
                      return { value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Mock"}}]}\n\n'), done: false };
                    }
                    return { done: true, value: undefined };
                  },
                };
              },
            },
          }),
        }) as any,
      captureWire: (entry) => {
        wireSink.body = entry.body;
      },
    });

    const bridge = createRunChatTurnBridge({
      runChatTurn: backend.runChatTurn!,
      getOrSkinTierModels: () => Promise.resolve({ opus: "or/opus", sonnet: "or/sonnet", haiku: "or/haiku" }),
    });

    const db = await freshDb();

    const Host = await seedUser(db, castId("host"), { name: "Traveler" });
    const Aria = await seedCharacter(db, Host, "aria");
    const chatId = await seedChat(db, "c");

    if (fixture.chatFile) {
      await loadSTChat(db, chatId, fixture.chatFile, Host, Aria);
    } else if (fixture.messages) {
      let seq = 1;
      for (const msg of fixture.messages) {
        await seedMessage(db, chatId, seq++, {
          role: msg.role === "user" ? "user" : "assistant",
          authorUserId: msg.role === "user" ? Host : null,
          characterId: msg.role === "user" ? null : Aria,
          content: msg.content,
        });
      }
    }

    let roleHandling: any = "merge";
    let namesBehavior: any = "default";
    if (fixture.settings?.custom_prompt_post_processing === "strict" || fixture.settings?.custom_prompt_post_processing === "strict_tools") {
      roleHandling = "strict";
    } else if (fixture.settings?.custom_prompt_post_processing === "semi") {
      roleHandling = "semi-strict";
    } else if (fixture.settings?.custom_prompt_post_processing === "none") {
      roleHandling = "none";
    }

    let squashSystemMessages: any;
    if (fixture.settings?.squash_system_messages !== undefined) {
      squashSystemMessages = fixture.settings.squash_system_messages;
    }

    // Check if the ST fixture specified a names_behavior
    if (fixture.settings?.character_names_behavior !== undefined) {
      const mapping: any = { 0: "none", 1: "default", 2: "content", 3: "completion" };
      namesBehavior = mapping[fixture.settings.character_names_behavior] || "default";
    } else if (roleHandling === "strict") {
      namesBehavior = "none"; // ST's strict post-processing implicitly drops names
    }

    const promptConfig: PromptConfig = { ...DEFAULT_PROMPT_CONFIG, namesBehavior };

    const ctx = makeChatContext(db, {
      runChatTurn: bridge,
      applyStatsDelta: () => {},
      tools:
        fixture.tools && fixture.tools.length > 0
          ? {
              resolveTools: (names) => ({ names }),
              toWireTools: () => fixture.tools.map((t: any) => ({ name: t.name, description: t.description, parameters: t.parameters })),
              toAgentToolServer: () => Promise.resolve({}),
              executeToolCalls: () => Promise.resolve([]),
            }
          : null,
    });
    const engine = createTurnEngine(ctx, {
      emit: () => Promise.resolve(),
      debitBudget: () => Promise.resolve(),
      resolveTurnPolicy: async () => ({ budget: null, allowNonOwnerMaxProSub: false }),
      holder: "tester",
      lockTtlMs: 1000,
      generateSegments: async () => ({ written: 0, skipped: 0 }),
      generateDigests: async () => ({ written: 0, skipped: 0 }),
      loadWitnessHorizons,
      recallMemory,
      runCompaction: stubRunCompaction,
    });

    const stCharPath = path.join(process.cwd(), "tests/goldens/sillytavern-runtime/data/default-user/characters", `${fixture.character.name}.json`);
    const stChar = fs.existsSync(stCharPath) ? JSON.parse(fs.readFileSync(stCharPath, "utf-8")) : { name: fixture.character.name };

    const assembleContext: any = {
      character: {
        name: stChar.name,
        description: stChar.description || "",
        personality: stChar.personality || "",
        scenario: stChar.scenario || "",
        firstMes: stChar.first_mes || "",
        mesExample: stChar.mes_example || "",
        creatorNotes: stChar.creator_notes || "",
        systemPrompt: stChar.system_prompt || "",
        postHistoryInstructions: stChar.post_history_instructions || "",
      },
      promptConfig,
      activePersona: { name: fixture.user?.name || "Traveler", description: "" },
      recentMessages: [],
    };

    const parsedModel = fixture.model || "claude-3-5-sonnet-20240620";
    const modelsToTest = [parsedModel];

    for (const modelId of modelsToTest) {
      const capability = resolveModelCapability(modelId, "openrouter", "chat-completions");
      const connection = testConnection("openrouter", "openrouter");
      connection.credential = { source: "openrouter", apiKey: "mock" } as any;
      connection.modelId = modelId as any;
      connection.capability = capability as any;

      // Look up capability from chat-models if we want accurate flooring
      // We'll leave roleHandling unset and let the engine derive it from the model capability floor
      // ST forces strict for Anthropic, but we use the capability floor
      // However, to mimic ST's "strict" setting if it's explicitly set:
      if (roleHandling === "strict") {
        connection.capability = { ...connection.capability, turns: { ...connection.capability.turns, roleHandlingFloor: "strict" } } as any;
      }

      try {
        await driveRound({
          engine,
          base: {
            chatId,
            assembleContext,
            connection,
            triggeredBy: Host,
            runAsUserId: Host,
            kind: "auto",
            intent: { advanced: { roleHandling, squashSystemMessages } },
            attachedToolNames: fixture.tools && fixture.tools.length > 0 ? fixture.tools.map((t: any) => t.name) : undefined,
          },
          group: DEFAULT_GROUP_CONFIG,
          speakers: [{ ref: { kind: "character", characterId: Aria }, name: "Sabine Veyra" }],
          groupCharacterId: null,
          castName: "Sabine Veyra",
          narratorMemberNames: [],
        });
      } catch {
        // Ignored
      }

      if (wireSink.body) {
        const parsedModel = modelId.replace(/[^a-zA-Z0-9]/g, "-");
        const outPath = path.join(OUTPUT_DIR, `${parsedModel}_${fixtureFile}`);
        fs.writeFileSync(outPath, JSON.stringify(wireSink.body, null, 2));
      }
    } // End model loop
  }
}
runCapture();
