// @subject packages/client/src/features/chat/lib/turn-warning-surface.ts
// The dropped-settings notice after a turn, as the host's room shows it. It is said once per preset and connection pair:
// the same drops on the same pair stay quiet, and another model or another default preset says its set again. The
// notice's door opens the host's default preset on its Params view; a cache control, which is no setting of the preset,
// offers no such door. The turns arrive over the room's scripted socket as the server sends them.

import type { ChatWarning } from "@orb/contracts/chat";
import { SETTINGS_ADJUSTED_CODE } from "@orb/contracts/chat";
import { BUILTIN_PROVIDERS, WARNING_CODE } from "@orb/contracts/inference";
import type { StreamFrame } from "@orb/contracts/stream";
import type { ChatId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import { seedShellState } from "@orb/testkit/browser/spec";
import type { TrpcRecorder } from "@orb/testkit/ct";
import {
  createShellAmbientReads,
  noticeToast,
  ROOM_PROCEDURES,
  routeAuthConfig,
  routeOrbSocket,
  routeTrpc,
  SECTION_PROCEDURES,
  serveCorpusProcedures,
  trpcError,
} from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import { OPEN_PARAMS_NAME, warningNotice } from "#client/features/chat/lib/warning-notice.ts";
import { PRESET_EDITOR_VIEW_LABELS } from "#client/features/preset/lib/preset-names.ts";
import { ALERTS_REGION_NAME, TOAST_CLOSE_NAME } from "#ui/primitives/toast/toast-names.ts";
import type { TurnDropsRoomStory } from "./_turn-drops-notice-stories.tsx";
import { findHostedRoom } from "./hosted-room.fixtures.ts";

const STORY = "tests/client/features/chat/components/_turn-drops-notice-stories/TurnDropsRoomStory";
// Past any sequence the corpus room holds, so the scripted frames land as new live events.
const FIRST_SEQ = 1_000_000;
// More reconnects than the case waits through before it closes the notice; each one is a dropped connection.
const RECONNECTS_UNTIL_CLOSED = 1000;
const PROVIDER = BUILTIN_PROVIDERS[0]?.id;
const MODEL = "vendor/first";
const OTHER_MODEL = "vendor/second";
const TOP_K: ChatWarning = { code: SETTINGS_ADJUSTED_CODE, adjustment: WARNING_CODE.samplingKnobDropped, knob: "topK" };
const CACHE: ChatWarning = { code: SETTINGS_ADJUSTED_CODE, adjustment: WARNING_CODE.cacheControlAdjusted };
// A warning with its own notice: once it shows, every frame sent before it was handled.
const SENTINEL: ChatWarning = { code: "provider_refused" };
// The reads the preset editor makes once the notice's door has opened it.
const PRESET_PROCEDURES = [
  "settings.getUserSettings",
  "sessions.me",
  "preset.get",
  "preset.update",
  "preset.list",
  "preset.resolveEffective",
  "preset.listUsage",
  "connection.resolveChatCapability",
  "connection.providersAvailable",
  "connection.list",
] as const;
test.use({ viewport: { width: 1280, height: 1000 }, isMobile: false, hasTouch: false });

type Harness = Awaited<ReturnType<typeof createCorpusHarness>>;
type Caller = Awaited<ReturnType<Harness["internalCallerFor"]>>;

/** One whole turn on a model: it starts, raises each warning, and completes, on seqs the room has not passed. */
function turnFrames(
  room: { readonly root: Harness; readonly chatId: ChatId },
  turn: { readonly model: string; readonly warnings: readonly ChatWarning[]; readonly from: number },
): readonly StreamFrame[] {
  const { root, chatId } = room;
  const { model, warnings, from } = turn;
  if (PROVIDER === undefined) {
    throw new Error("The product lists no built-in provider");
  }
  const turnId = root.idSource.typeId(ID_PREFIX.chatTurn);
  return [
    {
      channel: "chat",
      chatId,
      seq: from,
      event: { type: "turnStarted", chatId, turnId, intent: "send", api: null, provider: PROVIDER, model, speakerCharacterId: null, targetMessageId: null },
    },
    ...warnings.map((warning, index): StreamFrame => ({ channel: "chat", chatId, seq: from + 1 + index, event: { type: "warning", chatId, ...warning } })),
    { channel: "chat", chatId, seq: from + 1 + warnings.length, event: { type: "turnCompleted", chatId, turnId, intent: "send", messageId: null } },
  ];
}

async function serveRoom(
  page: Page,
  {
    root,
    corpus,
    host,
    chatId,
  }: { readonly root: Harness; readonly corpus: Parameters<typeof createShellAmbientReads>[0]; readonly host: Caller; readonly chatId: ChatId },
): Promise<TrpcRecorder> {
  await seedShellState(page, { activeSection: "chats" });
  await routeAuthConfig(page, await (await root.http.request("/api/auth/config")).text());
  return routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(host, [
      ...SECTION_PROCEDURES,
      ...ROOM_PROCEDURES,
      ...PRESET_PROCEDURES,
      "notifications.presence",
      "rpg.getGame",
      "rpg.listTurnToolCalls",
    ]),
    "stream.attach": ({ ref }) => (ref.channel === "user" || (ref.channel === "chat" && ref.chatId === chatId) ? null : trpcError({ code: "NOT_FOUND" })),
    "stream.detach": ({ ref }) => (ref.channel === "user" || (ref.channel === "chat" && ref.chatId === chatId) ? null : trpcError({ code: "NOT_FOUND" })),
  });
}

test("the same drops on the same preset and connection stay quiet, and another model or default preset says them again", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const host = await root.internalCallerFor(root.ownerId);
  const chatId = await findHostedRoom(host);
  const room = { root, chatId };
  const first = await host.preset.create({ name: "First default", kind: "generation" });
  const second = await host.preset.create({ name: "Second default", kind: "generation" });
  await host.settings.updateUserSettingsSection({ section: "seeds", patch: { defaultPresetId: first.id } });
  const settingsChanged: StreamFrame = { channel: "user", event: { type: "settingsChanged" } };
  // Each connection serves the frames of the phase the case has reached, and ends without a close, so the client keeps
  // reconnecting; a repeat of a phase's frames is a replay the seq guard drops. The first connection opened after a
  // close serves the next phase.
  const phases: readonly (readonly StreamFrame[])[] = [
    turnFrames(room, { model: MODEL, warnings: [TOP_K], from: FIRST_SEQ }),
    // The next turn: the same drops on the same pair, then a frame with its own notice.
    [
      ...turnFrames(room, { model: MODEL, warnings: [TOP_K], from: FIRST_SEQ + 10 }),
      { channel: "chat", chatId, seq: FIRST_SEQ + 20, event: { type: "warning", chatId, ...SENTINEL } },
    ],
    // Another model on the same preset.
    turnFrames(room, { model: OTHER_MODEL, warnings: [TOP_K], from: FIRST_SEQ + 30 }),
    // The host switches default preset: the page learns of it through the user bus and reads the settings again.
    [settingsChanged],
    // The model the first pair knew, under the other preset.
    turnFrames(room, { model: MODEL, warnings: [TOP_K], from: FIRST_SEQ + 40 }),
  ];
  let phase = 0;
  const calls = await serveRoom(page, { root, corpus, host, chatId });
  const socket = await routeOrbSocket(page, {
    awaitRooms: [{ channel: "chat", chatId }, { channel: "user" }],
    dropConnectionCount: RECONNECTS_UNTIL_CLOSED,
    frames: (): Promise<readonly StreamFrame[]> => Promise.resolve(phases[phase] ?? []),
  });
  await mount<typeof TurnDropsRoomStory>(STORY, { chatId });
  await socket.served();
  const toasts = page.getByRole("region", { name: ALERTS_REGION_NAME, exact: true }).locator('[data-slot="toast-root"]');
  const close = async (notice: ReturnType<typeof noticeToast>): Promise<void> => {
    await notice.getByRole("button", { name: TOAST_CLOSE_NAME, exact: true }).click();
    await expect(notice).toHaveCount(0);
    phase += 1;
  };

  const dropped = noticeToast(page, warningNotice(TOP_K));
  await expect(dropped).toBeVisible();
  await close(dropped);

  // Once the sentinel shows, the second turn was handled, and its repeat of the same drops raised nothing.
  const said = noticeToast(page, warningNotice(SENTINEL));
  await expect(said).toBeVisible();
  await expect(toasts).toHaveCount(1);
  await close(said);

  // The positive control: a pair the room has not seen says its set.
  const otherModel = noticeToast(page, warningNotice(TOP_K));
  await expect(otherModel).toBeVisible();
  await otherModel.getByRole("button", { name: TOAST_CLOSE_NAME, exact: true }).click();
  await expect(otherModel).toHaveCount(0);

  await host.settings.updateUserSettingsSection({ section: "seeds", patch: { defaultPresetId: second.id } });
  const readsBefore = calls.count("settings.getUserSettings");
  phase += 1;
  // The user bus frame reaches the page, which reads the new default; the turn of the next phase starts after that read.
  await expect.poll(() => calls.count("settings.getUserSettings")).toBeGreaterThan(readsBefore);
  phase += 1;
  const otherPreset = noticeToast(page, warningNotice(TOP_K));
  await expect(otherPreset).toBeVisible();
});

test("a dropped setting's notice opens the host's default preset on Params, and a cache control offers no door", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const host = await root.internalCallerFor(root.ownerId);
  const chatId = await findHostedRoom(host);
  const room = { root, chatId };
  const preset = await host.preset.create({ name: "Door default", kind: "generation" });
  await host.settings.updateUserSettingsSection({ section: "seeds", patch: { defaultPresetId: preset.id } });
  const phases: readonly (readonly StreamFrame[])[] = [
    turnFrames(room, { model: MODEL, warnings: [CACHE], from: FIRST_SEQ }),
    turnFrames(room, { model: OTHER_MODEL, warnings: [TOP_K], from: FIRST_SEQ + 10 }),
  ];
  let phase = 0;
  await serveRoom(page, { root, corpus, host, chatId });
  const socket = await routeOrbSocket(page, {
    awaitRooms: [{ channel: "chat", chatId }, { channel: "user" }],
    dropConnectionCount: RECONNECTS_UNTIL_CLOSED,
    frames: (): Promise<readonly StreamFrame[]> => Promise.resolve(phases[phase] ?? []),
  });
  await mount<typeof TurnDropsRoomStory>(STORY, { chatId });
  await socket.served();

  const cache = noticeToast(page, warningNotice(CACHE));
  await expect(cache).toBeVisible();
  await expect(cache.getByRole("button", { name: OPEN_PARAMS_NAME, exact: true })).toHaveCount(0);
  await cache.getByRole("button", { name: TOAST_CLOSE_NAME, exact: true }).click();
  phase += 1;

  const dropped = noticeToast(page, warningNotice(TOP_K));
  await expect(dropped).toBeVisible();
  await dropped.getByRole("button", { name: OPEN_PARAMS_NAME, exact: true }).click();
  // The preset editor is open on its Params view, on the preset the host's turns run.
  await expect(page.getByRole("tab", { name: PRESET_EDITOR_VIEW_LABELS.params, exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText(preset.name, { exact: false }).first()).toBeVisible();
});
