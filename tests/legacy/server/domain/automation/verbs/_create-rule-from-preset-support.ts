import type { AutomationBusEvent, RuleView, TriggerFact } from "@orb/contracts/automation";
import type { ChatBusEvent } from "@orb/contracts/chat";
import type { NotificationEvent } from "@orb/contracts/notifications";
import type { ThemeBackground } from "@orb/contracts/theme";
import { themeBackgroundSchema } from "@orb/contracts/theme";
import type { Db } from "@orb/db";
import type { ChatId, MessageId, UserId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { createSerialLanes } from "@orb/kit/serial-lanes";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { freshDb } from "@orb/testkit/node/db.ts";
import type {
  ApplyProseRewrite,
  ArmDispatch,
  AutomationImageRequest,
  AutomationOps,
  AutomationTurnRequest,
  BackgroundChoice,
  SuggestionStore,
} from "#server/domain/automation/contract/ops.ts";
import type { AutomationService } from "#server/domain/automation/contract/service.ts";
import { createArmExecutors } from "#server/domain/automation/engine/arm-executors.ts";
import { createAutomationService } from "#server/domain/automation/index.ts";
import { createSuggestionStore } from "#server/domain/automation/substrate/suggestions.ts";
import { seedMessage } from "../../chat/_support.ts";
import { makeAutomationHarness, NO_TOOLS, principal, seedHostChat, seedUser } from "../_support.ts";

// One lane set per suite, the way the automation service owns one for its dispatcher and arms.
const SERIAL_LANES = createSerialLanes();

export type { ApplyProseRewrite } from "#server/domain/automation/contract/ops.ts";
export { selectRuleState } from "#server/domain/automation/persistence/rule-state.ts";

/** An UNCHOSEN book now refuses at the KNOB, in the host's own noun (#630 — the `entityRef` kind carries no
 *  default, so there is no `""` to fall through the arm schema's "Suffix should have 26 characters"). A
 *  real-but-unattached id still refuses one step later at `createRule`'s attachment check — that one is a
 *  LIVE fact no picker can pre-empt. Either way: typed, at mint, never stored. */
export const NO_BOOK = /knob 'bookId': choose a world book/u;
/** The LIVE half of the same guard — `substrate/validate.ts`'s attachment probe, one step after the knob. */
export const UNATTACHED_BOOK = /is not attached to this chat/u;

/** #1's idle window is expressed in epoch-ms; the preset substitutes hours × this. */
export const MS_PER_HOUR = 3_600_000;

export interface Fixture {
  readonly db: Db;
  readonly host: UserId;
  readonly chatId: ChatId;
  readonly svc: AutomationService;
  /** The LIVE chat variable store the arms fold into and the CEL env reads back. */
  readonly vars: Record<string, string>;
  readonly turns: AutomationTurnRequest[];
  readonly images: AutomationImageRequest[];
  readonly notices: NotificationEvent[];
  readonly bus: AutomationBusEvent[];
  /** S4 — the pending asks a confirm-first preset's fire raised. */
  readonly suggestions: SuggestionStore;
  /** The message projection `getMessageFact` serves for the next `messageCommitted` event. */
  readonly setMessageContent: (content: string) => void;
  /** The canned `summarizeQuiet` reply (#15's analysis pass) — "" until a test sets one. */
  readonly setQuietReply: (text: string) => void;
  /** #16 — the author's owned background library the `set_chat_background` quiet pick chooses among. EMPTY
   *  by default (the arm soft-no-ops with nothing to pick), so only the needle's suite pays for it. */
  readonly setBackgroundChoices: (choices: readonly BackgroundChoice[]) => void;
  /** Every background the arm actually WROTE, in order — the receipt that the room re-dressed itself. */
  readonly backgroundsSet: ThemeBackground[];
  /** The canned `autobg`-posture reply — the background NAME the quiet pick returns (#16's backdrop half). */
  readonly setAutobgReply: (text: string) => void;
  /** Every prompt the quiet op received (system + user + posture), in call order. */
  readonly quietCalls: { systemPrompt: string; prompt: string; posture: string }[];
  readonly seedBeats: (count: number) => Promise<void>;
}

/** Harness knobs a test may need on the CONTEXT rather than on the ops bundle. C3's rewrite op is the one
 *  member today — it is confirm-only and therefore not on `ops` by construction (`contract/ops.ts`). */
interface SetupOverrides {
  readonly applyProseRewrite?: ApplyProseRewrite;
}

export async function setup(setupOverrides: SetupOverrides = {}): Promise<Fixture> {
  const db = await freshDb();
  const host = await seedUser(db, "user_host");
  const chatId = await seedHostChat(db, host);
  const vars: Record<string, string> = {};
  const turns: AutomationTurnRequest[] = [];
  const images: AutomationImageRequest[] = [];
  const notices: NotificationEvent[] = [];
  const bus: AutomationBusEvent[] = [];
  const quietCalls: { systemPrompt: string; prompt: string; posture: string }[] = [];
  const backgroundsSet: ThemeBackground[] = [];
  let messageContent = "";
  let quietReply = "";
  let autobgReply = "";
  let backgroundChoices: readonly BackgroundChoice[] = [];
  let seeded = 0;

  const ops: AutomationOps = {
    tools: NO_TOOLS,
    chat: {
      getMessageFact: (): Promise<NonNullable<TriggerFact["message"]> | null> =>
        Promise.resolve({ id: "message_probe", role: "user", authorUserId: host, characterId: null, seq: 1, content: messageContent }),
      // These synthetic events stand for HUMAN-plane messages, so the origin read answers what production's
      // `loadTurnOrigin` answers for a live human slot: a ROW stamped depth 0. It must not answer `null` —
      // that is production's "the row is gone", and since #1417 an unresolvable origin fails closed (the event
      // is skipped) rather than being read as a human 0.
      getTurnOrigin: () => Promise.resolve({ initiator: "human" as const, automationDepth: 0 }),
      resolveViewerVisibility: () => Promise.resolve(null),
      readVariables: () => Promise.resolve({ ...vars }),
      readChoicePicks: () => Promise.resolve({}),
      resolveChatProse: () => Promise.resolve({}),
      applyVariableOps: (_chatId, varOps) => {
        for (const op of varOps) {
          if (op.op === "delete") {
            delete vars[op.key];
          } else if (op.op === "set") {
            vars[op.key] = op.value;
          }
        }
        return Promise.resolve({ outcome: "applied" });
      },
      listBackgroundChoices: () => Promise.resolve(backgroundChoices),
      setChatBackground: ({ background }) => {
        backgroundsSet.push(background);
        return Promise.resolve();
      },
      requestTurn: (req) => {
        turns.push(req);
        return Promise.resolve({ costUsd: null, messageCount: 1 });
      },
    },
    worldInfo: { upsertEntries: () => Promise.resolve({ inserted: 0, updated: 0, skippedHandEdited: 0 }) },
    notifications: {
      emit: (event) => {
        notices.push(event);
        return Promise.resolve();
      },
    },
    imagery: {
      generatePicture: (req) => {
        images.push(req);
        return Promise.resolve({ costUsd: null, imageCount: 1 });
      },
    },
    // ONE quiet op, TWO postures — and the needle is the preset that fires both in a single batch (its
    // analysis pass, then its backdrop's autobg pick), so the canned reply is chosen by POSTURE. A single
    // canned string would have fed the analysis JSON to the background matcher, which soft-no-ops on an
    // off-list pick — a green test with the backdrop half silently never running.
    summarizeQuiet: ({ systemPrompt, prompt, posture }) => {
      quietCalls.push({ systemPrompt, prompt, posture });
      return Promise.resolve({ text: posture === "autobg" ? autobgReply : quietReply, costUsd: null });
    },
  };
  const notify = (event: AutomationBusEvent): void => void bus.push(event);
  // ONE store for the arm dispatcher AND the verbs (the compose posture): a confirm-first preset's fire
  // stashes through the dispatcher and is answered through the service, so two stores would make every
  // A4 row in this suite assert against an empty map.
  const suggestions = createSuggestionStore();
  const runArm: ArmDispatch = createArmExecutors({
    serialLanes: SERIAL_LANES,
    db,
    ops,
    prng: () => 0.42,
    notify,
    suggestions,
    newSuggestionId: () => mintTypeId(ID_PREFIX.automationSuggestion),
  });
  const svc = createAutomationService(
    makeAutomationHarness(db, {
      runArm,
      ops,
      notify,
      suggestions,
      ...(setupOverrides.applyProseRewrite === undefined ? {} : { applyProseRewrite: setupOverrides.applyProseRewrite }),
    }),
  );

  return {
    db,
    host,
    chatId,
    svc,
    vars,
    turns,
    images,
    notices,
    bus,
    suggestions,
    setMessageContent: (content: string): void => {
      messageContent = content;
    },
    setQuietReply: (text: string): void => {
      quietReply = text;
    },
    setAutobgReply: (text: string): void => {
      autobgReply = text;
    },
    setBackgroundChoices: (choices: readonly BackgroundChoice[]): void => {
      backgroundChoices = choices;
    },
    backgroundsSet,
    quietCalls,
    seedBeats: async (count: number): Promise<void> => {
      // Seed in order so deterministic ids match the expected positions.
      const step = async (remaining: number): Promise<void> => {
        if (remaining <= 0) {
          return;
        }
        seeded += 1;
        await seedMessage(db, chatId, seeded);
        await step(remaining - 1);
      };
      await step(count);
    },
  };
}

/** The minted rule at `index` — a hard failure rather than a non-null assertion (the house lint bans `!`). */
export function nth(views: readonly RuleView[], index: number): RuleView {
  const view = views[index];
  if (view === undefined) {
    throw new Error(`expected a minted rule at index ${index}, got ${views.length}`);
  }
  return view;
}

/** Mint a preset and ENABLE every rule it created. Returns the minted views in mint order. */
export async function mintAndEnable(
  f: Fixture,
  presetId: Parameters<AutomationService["createRuleFromPreset"]>[0]["presetId"],
  knobs = {},
): Promise<RuleView[]> {
  const p = await principal(f.db, f.host);
  const views = await f.svc.createRuleFromPreset({ timeZone: UTC_TIME_ZONE, principal: p, chatId: f.chatId, presetId, knobs });
  const enable = async (index: number): Promise<void> => {
    const view = views[index];
    if (view === undefined) {
      return;
    }
    await f.svc.setRuleEnabled({ principal: p, ruleId: view.id, enabled: true });
    await enable(index + 1);
  };
  await enable(0);
  return views;
}

export function turnCompleted(chatId: ChatId): ChatBusEvent {
  return { type: "turnCompleted", chatId, intent: "send", messageId: mintTypeId(ID_PREFIX.message) };
}

export function messageCommitted(chatId: ChatId): ChatBusEvent {
  return { type: "messageCommitted", chatId, messageId: mintTypeId(ID_PREFIX.message) as MessageId };
}

/** A lore-activation event carrying `n` freshly-minted entry ids — the fact the resolver projects as
 *  `event.worldInfo.entryIds` (opaque strings; #17 filters on their COUNT). `automationDepth` is the
 *  generating turn's cascade depth (0 = a human-plane turn), threaded onto the event by chat's engine. */
export function worldInfoActivated(chatId: ChatId, entryCount: number, automationDepth = 0): ChatBusEvent {
  return { type: "worldInfoActivated", chatId, entryIds: Array.from({ length: entryCount }, () => mintTypeId(ID_PREFIX.worldEntry)), automationDepth };
}

/** Every outcome the rule logged, oldest first. */
export async function outcomes(f: Fixture, view: RuleView): Promise<string[]> {
  const fires = await f.svc.listFires({ principal: await principal(f.db, f.host), ruleId: view.id });
  return fires.map((fire) => fire.outcome).reverse();
}

/** The author's one owned background, and the name the quiet pick returns to select it. */
const STORM_BACKDROP = "storm over the harbour";

/** Seed the author's background library and the pick that matches it. */
export function armBackdrop(f: Fixture): ThemeBackground {
  // An OWNED library background — the only paintable candidate shape since `kind:"seeded"` retired
  // (2026-09-18). The `/autobg` candidate set IS the author's `appearance.backgroundLibrary`, so a candidate
  // a fixture builds is an `asset` ref, exactly like one the real compose seam projects.
  const background = themeBackgroundSchema.parse({ kind: "asset", assetId: "asset_storm", assetHash: "hash_storm", mime: "image/jpeg" });
  f.setBackgroundChoices([{ name: STORM_BACKDROP, background }]);
  f.setAutobgReply(STORM_BACKDROP);
  return background;
}
