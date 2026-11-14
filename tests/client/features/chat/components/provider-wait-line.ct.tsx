// @subject packages/client/src/features/chat/components/ghost-message-row.tsx
// A pending reply whose provider is still starting says so on the bus's `providerWait` frame, on the typing dots' own
// line, and the first token replaces it. A socket body lands whole, so each phase rides its own connection of the one
// page's socket: the turn held before the delay, held past it, then answered. Before the notice the pending row is the
// dots alone, the row main draws. The notice keeps that height while its words fit one line, grows the row only by the
// lines they wrap to, and never clips them or moves the row or the transcript above it.
import { CHAT_APIS, providerIdSchema } from "@orb/contracts/inference";
import type { StreamFrame } from "@orb/contracts/stream";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { seedShellState, setRootFontScale } from "@orb/testkit/browser/spec";
import {
  channelName,
  createShellAmbientReads,
  ROOM_PROCEDURES,
  routeAuthConfig,
  routeOrbSocket,
  routeTrpc,
  SECTION_PROCEDURES,
  serveCorpusProcedures,
  trpcError,
} from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { CORPUS_TEXT_MODEL, createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import { CHAT_PROVIDER_WAITING_NOTE } from "#client/features/chat/lib/chat-surface-names.ts";
import type { ChatRoomShellStory } from "./_chat-room-shell-stories.tsx";

const STORY = "tests/client/features/chat/components/_chat-room-shell-stories/ChatRoomShellStory";
// Past any sequence the corpus room holds, so the scripted frames land as new live events.
const FIRST_SEQ = 1_000_000;
const FIRST_TOKEN = "The engine hums awake.";
// How many connections one phase is served to before the next waits for the case to move on. The first socket a
// StrictMode mount opens is thrown away, so a phase needs two to reach the page's live socket; a repeat is harmless,
// because the room drops a durable frame it has passed and the wait phase is idempotent.
const SERVES_PER_PHASE = 2;
// Connections end without a clean close, so the link reconnects into the next phase.
const DROPPED_CONNECTIONS = 16;
const FONT_SCALE_PROPERTY = channelName("fontScale");
// The desktop and a phone at default text, and the phone at 200% (WCAG 1.4.4 text resize) and 300%.
const CELLS = [
  { name: "desktop", size: { width: 1280, height: 800 }, scale: 1 },
  { name: "phone", size: { width: 390, height: 844 }, scale: 1 },
  { name: "phone at 200% text", size: { width: 390, height: 844 }, scale: 2 },
  { name: "phone at 300% text", size: { width: 390, height: 844 }, scale: 3 },
] as const;

/** The live row's box, placed against the settled row above it, so a subpixel scroll settle between phases is not
 *  read as the row moving. */
interface RowGeometry {
  readonly height: number;
  readonly width: number;
  /** From the settled row's bottom edge to the live row's top edge. */
  readonly offset: number;
  readonly aboveHeight: number;
}

async function geometryOf(ghost: Locator, above: Locator): Promise<RowGeometry> {
  const [row, neighbour] = await Promise.all([ghost.boundingBox(), above.boundingBox()]);
  if (row === null || neighbour === null) {
    throw new Error("The live row or the row above it is not laid out");
  }
  return { height: row.height, width: row.width, offset: row.y - (neighbour.y + neighbour.height), aboveHeight: neighbour.height };
}

// The live row enters with a motion, so a box read mid-entry is not its box. Read until two reads agree.
async function settledGeometryOf(ghost: Locator, above: Locator): Promise<RowGeometry> {
  let previous = await geometryOf(ghost, above);
  await expect
    .poll(async () => {
      const current = await geometryOf(ghost, above);
      const settled = JSON.stringify(current) === JSON.stringify(previous);
      previous = current;
      return settled;
    })
    .toBe(true);
  return previous;
}

async function scaleRoot(page: Page, factor: number): Promise<void> {
  await setRootFontScale(page, FONT_SCALE_PROPERTY, factor);
  await expect.poll(() => page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize))).toBeGreaterThanOrEqual(16 * factor);
}

for (const cell of CELLS) {
  test(`the pending row names a provider that is still starting on its own line, until the first token, ${cell.name}`, async ({ corpus, mount, page }) => {
    await using root = await createCorpusHarness();
    const room = corpus.reads["chat.getChat"].at(0)?.output;
    if (room === undefined) {
      throw new Error("The corpus has no room");
    }
    const chatId = typeIdSchema(ID_PREFIX.chat).parse(room.id);
    const turnId = root.idSource.typeId(ID_PREFIX.chatTurn);
    const caller = await root.internalCallerFor(root.ownerId);
    const opened: readonly StreamFrame[] = [
      {
        channel: "chat",
        chatId,
        seq: FIRST_SEQ,
        event: { type: "turnAccepted", chatId, turnId, intent: "send", speakerCharacterId: null, targetMessageId: null },
      },
      {
        channel: "chat",
        chatId,
        seq: FIRST_SEQ + 1,
        event: {
          type: "turnStarted",
          chatId,
          turnId,
          intent: "send",
          api: CHAT_APIS[0],
          provider: providerIdSchema.parse("openrouter"),
          model: CORPUS_TEXT_MODEL,
          speakerCharacterId: null,
          targetMessageId: null,
        },
      },
    ];
    const waiting: readonly StreamFrame[] = [{ channel: "chat", chatId, seq: null, event: { type: "providerWait", chatId, turnId, phase: "waiting" } }];
    const started: readonly StreamFrame[] = [
      { channel: "chat", chatId, seq: null, event: { type: "providerWait", chatId, turnId, phase: "started" } },
      {
        channel: "chat",
        chatId,
        seq: FIRST_SEQ + 2,
        event: { type: "delta", chatId, turnId, slotSeq: FIRST_SEQ, delta: { chatId, kind: "text", text: FIRST_TOKEN }, memberText: null },
      },
    ];
    // Each connection replays the turn as far as the current phase has gone.
    const phases = [opened, [...opened, ...waiting], [...opened, ...waiting, ...started]] as const;
    let phase = 0;
    let served = 0;
    let advanced = Promise.withResolvers<void>();
    const advance = (): void => {
      phase += 1;
      served = 0;
      const current = advanced;
      advanced = Promise.withResolvers<void>();
      current.resolve();
    };
    await page.setViewportSize(cell.size);
    await seedShellState(page, { activeSection: "chats" });
    await routeAuthConfig(page, await (await root.http.request("/api/auth/config")).text());
    await routeTrpc(page, {
      ...createShellAmbientReads(corpus, root.ownerId),
      ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...ROOM_PROCEDURES, "notifications.presence", "rpg.getGame", "rpg.listTurnToolCalls"]),
      "stream.attach": ({ ref }) => (ref.channel === "chat" && ref.chatId === chatId ? null : trpcError({ code: "NOT_FOUND" })),
      "stream.detach": ({ ref }) => (ref.channel === "chat" && ref.chatId === chatId ? null : trpcError({ code: "NOT_FOUND" })),
    });
    const socket = await routeOrbSocket(page, {
      awaitRooms: [{ channel: "chat", chatId }],
      dropConnectionCount: DROPPED_CONNECTIONS,
      frames: async () => {
        while (served >= SERVES_PER_PHASE) {
          await advanced.promise;
        }
        served += 1;
        return phases[phase] ?? [];
      },
    });
    await mount<typeof ChatRoomShellStory>(STORY, { chatId, socket: true });
    await socket.served();
    await scaleRoot(page, cell.scale);

    const ghost = page.locator('[data-slot="ghost-message-row"]');
    const above = page.locator('[data-slot="message-row"]').last();
    const note = page.getByRole("status", { name: CHAT_PROVIDER_WAITING_NOTE, exact: true });
    const words = ghost.locator('[data-slot="typing-dots-note"]');
    await expect(ghost).toBeVisible();
    // The positive control for the absences below: the pending row is up, and it names no wait yet.
    await expect(ghost.locator('[data-slot="typing-dots"]')).toBeVisible();
    await expect(note).toHaveCount(0);
    await expect(words).toHaveCount(0);
    const pending = await settledGeometryOf(ghost, above);

    advance();
    await expect(note).toBeVisible();
    const noted = await settledGeometryOf(ghost, above);
    const layout = await words.evaluate((element) => ({
      lines: Math.round(element.getBoundingClientRect().height / Number.parseFloat(getComputedStyle(element).lineHeight)),
      clipped: element.scrollWidth > element.clientWidth,
    }));
    expect(layout.clipped).toBe(false);
    // The row holds its height exactly while the words fit the dots' line; only wrapped words add to it.
    expect(noted.height === pending.height).toBe(layout.lines === 1);
    expect({ offset: noted.offset, aboveHeight: noted.aboveHeight, width: noted.width }).toEqual({
      offset: pending.offset,
      aboveHeight: pending.aboveHeight,
      width: pending.width,
    });

    advance();
    await expect(ghost.locator('[data-slot="ghost-stream-body"]')).toContainText(FIRST_TOKEN);
    await expect(note).toHaveCount(0);
    const answered = await settledGeometryOf(ghost, above);
    // The first token replaces the line where it stood: the row starts in the same place and the transcript above is still.
    expect({ offset: answered.offset, aboveHeight: answered.aboveHeight, width: answered.width }).toEqual({
      offset: pending.offset,
      aboveHeight: pending.aboveHeight,
      width: pending.width,
    });
  });
}
