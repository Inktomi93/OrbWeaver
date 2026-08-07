// The ORBWEAVER arm of the ST-parity rig: replays each `fixtures/<id>.json` through the REAL turn
// engine behind a wire-capturing OpenRouter backend, and writes the outbound body to
// `orbweaver-output/<model>_<id>.json` for `compare-runner.ts` to diff against ST's capture.
//
// The fixture + ST-card shapes below are the ST-side JSON this rig authors itself (run-demo-*.sh emit
// them; `build-fixtures.ts` writes the cards) — they are LOCAL PROBE INPUT shapes, not a cross-boundary
// wire contract, so they are declared here rather than in `contracts` (no other reader exists).
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import type { AssembleContext } from "@orb/contracts/chat";
import { DEFAULT_GROUP_CONFIG } from "@orb/contracts/chat";
import type { ResolvedConnection, RoleHandling } from "@orb/contracts/connection";
import type { NamesBehavior, PromptConfig } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { CharacterId, ChatId, Handle, ModelId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { MessageRole } from "@orb/kit/message-role";
import { createTurnEngine } from "../../../packages/server/src/domain/chat/engine/engine.ts";
import { driveRound } from "../../../packages/server/src/domain/chat/engine/round.ts";
import { loadWitnessHorizons } from "../../../packages/server/src/domain/chat/memory/persistence/queries.ts";
import { recallMemory } from "../../../packages/server/src/domain/chat/memory/recall/recall.ts";
import { resolveModelCapability } from "../../../packages/server/src/domain/connection/catalog/resolve-model-capability.ts";
import { createRunChatTurnBridge } from "../../../packages/server/src/entry/compose/chat.ts";
import type { OrClient } from "../../../packages/server/src/infra/providers/backends/openrouter/index.ts";
import { createOpenRouterBackend } from "../../../packages/server/src/infra/providers/backends/openrouter/index.ts";
import {
  makeChatContext,
  seedCharacter,
  seedChat,
  seedMessage,
  seedUser,
  stubRunCompaction,
  testConnection,
} from "../../../tests/server/domain/chat/_support.ts";
import { freshDb } from "../../../tests/support/db.ts";

import { FIXTURES_DIR, ORB_OUTPUT_DIR, SEED_CHATS_DIR, ST_RUNTIME_DIR } from "./rig-paths.ts";

/** The rig's own fixture file shape (`fixtures/<id>.json`), as emitted by the two run-demo-*.sh scripts. */
type GoldenFixture = {
  readonly provider?: string;
  readonly model?: string;
  readonly chatFile?: string;
  readonly character: { readonly name: string };
  readonly user?: { readonly name?: string };
  readonly messages?: readonly { readonly role: string; readonly content: string }[];
  /** `parameters` is a JSON-Schema object — the shape `WireTool.parameters` requires. */
  readonly tools?: readonly { readonly name: string; readonly description: string; readonly parameters: Record<string, unknown> }[];
  /** Raw ST `oai_settings` overrides — snake_case, ST's vocabulary, never ours. Every key the two
   *  run-demo-*.sh scripts can emit is declared; a key declared here but not read below is a silently
   *  ignored fixture axis, which is exactly how the names/force-name sweeps produced 44 identical captures. */
  readonly settings?: {
    // biome-ignore lint/style/useNamingConvention: verbatim ST `oai_settings` keys — renaming breaks the fixture read.
    readonly custom_prompt_post_processing?: string;
    /** The sweeps' other spelling for the same ST setting — both are read. */
    // biome-ignore lint/style/useNamingConvention: verbatim ST `oai_settings` keys — renaming breaks the fixture read.
    readonly prompt_post_processing?: string;
    // biome-ignore lint/style/useNamingConvention: verbatim ST `oai_settings` keys — renaming breaks the fixture read.
    readonly squash_system_messages?: boolean;
    // biome-ignore lint/style/useNamingConvention: verbatim ST `oai_settings` keys — renaming breaks the fixture read.
    readonly assistant_prefill?: string;
    /** ST's own key. `character_names_behavior` is the rig's older alias; both are read. */
    // biome-ignore lint/style/useNamingConvention: verbatim ST `oai_settings` keys — renaming breaks the fixture read.
    readonly names_behavior?: number;
    // biome-ignore lint/style/useNamingConvention: verbatim ST `oai_settings` keys — renaming breaks the fixture read.
    readonly character_names_behavior?: number;
    // biome-ignore lint/style/useNamingConvention: verbatim ST `power_user` key — renaming breaks the fixture read.
    readonly always_force_name2?: boolean;
  };
};

/** One line of an ST `.jsonl` chat log (only the fields this rig replays). `name` is load-bearing: among
 *  non-user rows it is the ONLY author discriminator ST has, so dropping it makes every multi-character
 *  room replay as a single speaker — and the name-stamp behaviours are exactly what the sweeps vary. */
type StChatLine = {
  readonly mes?: string;
  readonly name?: string;
  // biome-ignore lint/style/useNamingConvention: verbatim ST `.jsonl` chat-log keys.
  readonly is_system?: boolean;
  // biome-ignore lint/style/useNamingConvention: verbatim ST `.jsonl` chat-log keys.
  readonly is_user?: boolean;
};

/** An ST V2 character card as `build-fixtures.ts` writes it (snake_case — ST's on-disk spec). */
type StCharacterCard = {
  readonly name: string;
  readonly description?: string;
  readonly personality?: string;
  readonly scenario?: string;
  // biome-ignore lint/style/useNamingConvention: verbatim chara_card_v2 spec keys.
  readonly first_mes?: string;
  // biome-ignore lint/style/useNamingConvention: verbatim chara_card_v2 spec keys.
  readonly mes_example?: string;
  // biome-ignore lint/style/useNamingConvention: verbatim chara_card_v2 spec keys.
  readonly creator_notes?: string;
  // biome-ignore lint/style/useNamingConvention: verbatim chara_card_v2 spec keys.
  readonly system_prompt?: string;
  // biome-ignore lint/style/useNamingConvention: verbatim chara_card_v2 spec keys.
  readonly post_history_instructions?: string;
};

/** `JSON.parse` is `unknown` under this repo's `reset.d.ts`; every parse here is a file THIS rig wrote,
 *  so the assertion is a declaration of that provenance, not a validation dodge. */
function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
}

async function loadSTChat(db: Awaited<ReturnType<typeof freshDb>>, chatId: ChatId, chatFileName: string, host: UserId, aria: CharacterId) {
  const chatFile = path.join(SEED_CHATS_DIR, `${chatFileName}.jsonl`);
  const lines = fs
    .readFileSync(chatFile, "utf-8")
    .split("\n")
    .filter((l) => l.trim().length > 0);

  // One character row per distinct assistant `name`. ST's demo chats are multi-character (the ashen-spire
  // seed carries three), and collapsing them onto one id erases the distinct-speaker signal that every
  // names-behaviour except `none` is defined by.
  const byName = new Map<string, CharacterId>();
  let seq = 1;
  // skip header line (idx 0)
  for (const line of lines.slice(1)) {
    const data = JSON.parse(line) as StChatLine;
    if (!data.mes) {
      continue;
    }

    // `is_system: true` rows are UI-only in ST — filtered out of the prompt entirely (public/script.js
    // `coreChat`), so replaying them as system rows would put content on our wire that ST never sends.
    if (data.is_system === true) {
      continue;
    }
    const role: MessageRole = data.is_user === true ? "user" : "assistant";

    let characterId: CharacterId | null = null;
    if (role === "assistant") {
      const name = data.name ?? "";
      if (name.length === 0) {
        characterId = aria;
      } else {
        const existing = byName.get(name);
        characterId = existing ?? (await seedCharacter(db, host, name));
        byName.set(name, characterId);
      }
    }

    await seedMessage(db, chatId, seq++, {
      role,
      authorUserId: role === "user" ? host : null,
      characterId,
      content: data.mes,
    });
  }
}

async function runCapture() {
  const fixtures = fs.readdirSync(FIXTURES_DIR).filter((f) => f.endsWith(".json"));
  for (const fixtureFile of fixtures) {
    console.log(`Processing ${fixtureFile}...`);
    const fixture = readJson<GoldenFixture>(path.join(FIXTURES_DIR, fixtureFile));

    // We only care about claude for this
    if (fixture.provider !== "claude") {
      continue;
    }

    // The captured outbound body, verbatim — the whole POINT of this probe is to dump the wire shape we
    // did NOT model, so it stays opaque all the way to `JSON.stringify`.
    const wireSink: { body?: unknown } = {};
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
          // FABRICATION-OK: a minimal `OrClient` double — the backend only fetches and reads the SSE
          // stream, and this probe never inspects the response (it captures the REQUEST via captureWire).
        }) as unknown as OrClient,
      captureWire: (entry) => {
        wireSink.body = entry.body;
      },
    });

    const bridge = createRunChatTurnBridge({
      runChatTurn: backend.runChatTurn!,
      getOrSkinTierModels: () => Promise.resolve({ opus: "or/opus", sonnet: "or/sonnet", haiku: "or/haiku" }),
    });

    const db = await freshDb();

    const Host = await seedUser(db, castId<Handle>("host"));
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

    // The sweeps emit the mode under either spelling; reading only one silently defaulted 18 fixtures.
    const postProcessing = fixture.settings?.custom_prompt_post_processing ?? fixture.settings?.prompt_post_processing;
    let roleHandling: RoleHandling = "merge";
    let namesBehavior: NamesBehavior = "default";
    if (postProcessing === "strict" || postProcessing === "strict_tools") {
      roleHandling = "strict";
    } else if (postProcessing === "semi" || postProcessing === "semi_tools") {
      roleHandling = "semi-strict";
    } else if (postProcessing === "none" || postProcessing === "") {
      roleHandling = "none";
    }

    const squashSystemMessages = fixture.settings?.squash_system_messages;

    // ST's `character_names_behavior` (openai.js:204-209) is a NUMERIC enum; ours is a string union. The
    // values are NOT positional — NONE is -1 and COMPLETION sorts before CONTENT.
    const namesMapping: Readonly<Record<number, NamesBehavior>> = { [-1]: "none", 0: "default", 1: "completion", 2: "content" };
    const stNames = fixture.settings?.names_behavior ?? fixture.settings?.character_names_behavior;
    if (stNames !== undefined) {
      namesBehavior = namesMapping[stNames] ?? "default";
    } else if (roleHandling === "strict") {
      namesBehavior = "none"; // ST's strict post-processing implicitly drops names
    }
    // `always_force_name2` is deliberately NOT mapped: it is Text-Completion-only on ST's side (its own
    // JSDoc at script.js:4211, sole prompt consumer at :5022 behind `!isInstruct`), and zero occurrences
    // exist in openai.js or prompt-converters.js. This rig is chat-completion only, so the key is inert.

    const promptConfig: PromptConfig = { ...DEFAULT_PROMPT_CONFIG, namesBehavior };

    const ctx = makeChatContext(db, {
      runChatTurn: bridge,
      applyStatsDelta: () => {},
      tools:
        fixture.tools && fixture.tools.length > 0
          ? {
              resolveTools: (names) => ({ names }),
              toWireTools: () => (fixture.tools ?? []).map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })),
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

    const stCharPath = path.join(ST_RUNTIME_DIR, "data/default-user/characters", `${fixture.character.name}.json`);
    const stChar: StCharacterCard = fs.existsSync(stCharPath) ? readJson<StCharacterCard>(stCharPath) : { name: fixture.character.name };

    // The engine reads only the slice below off `assembleContext`; the rest of `AssembleContext` is
    // populated by `buildAssembleContext` in a real turn, which this probe deliberately bypasses (it
    // replays ST's card verbatim, not our canon). Hence a narrowing cast, not a hand-built full shape.
    const assembleContext = {
      character: {
        name: stChar.name,
        description: stChar.description ?? "",
        personality: stChar.personality ?? "",
        scenario: stChar.scenario ?? "",
        firstMes: stChar.first_mes ?? "",
        mesExample: stChar.mes_example ?? "",
        creatorNotes: stChar.creator_notes ?? "",
        systemPrompt: stChar.system_prompt ?? "",
        postHistoryInstructions: stChar.post_history_instructions ?? "",
      },
      promptConfig,
      activePersona: { name: fixture.user?.name ?? "Traveler", description: "" },
      recentMessages: [],
    } as unknown as AssembleContext;

    const modelsToTest = [fixture.model || "claude-3-5-sonnet-20240620"];

    for (const modelId of modelsToTest) {
      const capability = resolveModelCapability(modelId, "openrouter", "chat-completions");
      // `ResolvedConnection` is readonly end-to-end (D-law: connections are resolved, never mutated), so
      // the per-model variant is BUILT, not patched onto the shared `testConnection()` double.
      // ST forces strict post-processing for Anthropic; when the fixture asks for it we raise the
      // capability FLOOR rather than passing intent, so the engine derives the same shape a real
      // strict-backend turn would.
      const connection: ResolvedConnection = {
        ...testConnection("openrouter", "chat-completions"),
        model: castId<ModelId>(modelId),
        capability:
          roleHandling === "strict" && capability.turns !== undefined
            ? { ...capability, turns: { ...capability.turns, roleHandlingFloor: "strict" as const } }
            : capability,
      };

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
            attachedToolNames: fixture.tools && fixture.tools.length > 0 ? fixture.tools.map((t) => t.name) : undefined,
          },
          group: DEFAULT_GROUP_CONFIG,
          speakers: [{ ref: { kind: "character", characterId: Aria }, name: "Sabine Veyra" }],
          groupCharacterId: null,
          castName: "Sabine Veyra",
          narratorMemberNames: [],
        });
      } catch (err) {
        // A throw here still leaves a usable capture when the wire was already built, so it is not fatal —
        // but swallowing it silently is how a fixture that captured NOTHING looks the same as one that
        // matched. Say which happened.
        console.warn(`[Orb] ${fixtureFile} @ ${modelId}: driveRound threw — ${err instanceof Error ? err.message : String(err)}`);
      }

      if (wireSink.body === undefined) {
        console.error(`[Orb] ✗ ${fixtureFile} @ ${modelId}: NO wire captured — no file written.`);
        process.exitCode = 1;
      }
      if (wireSink.body) {
        const parsedModel = modelId.replace(/[^a-zA-Z0-9]/g, "-");
        const outPath = path.join(ORB_OUTPUT_DIR, `${parsedModel}_${fixtureFile}`);
        fs.writeFileSync(outPath, JSON.stringify(wireSink.body, null, 2));
      }
    } // End model loop
  }
}
runCapture();
