// A hand-run rendered check for a heavy SillyTavern preset whose display scripts draw expanding panels: it imports the
// file named by `ORB_PRESET_PROBE_FILE` through the product's single-file preset door on a corpus root, makes it the
// host's preset, and drives the real transcript (`MessageListSurface`) with the room's reads and card frames answered by
// that root. A reply streams through the production stream calls, and the stored reply draws in its routed frame, where
// a panel opens on click. The default suites skip it: a third-party preset carries no licence to commit it, so the file
// stays outside the tree and is read, never copied. `tests/server/domain/import/persistence/preset-script-probe.dom.test.ts`
// runs the same file through the server's import, prompt and depth passes and the Worker's script loop.

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import process from "node:process";
import { rendersTrustedHtml } from "@orb/contracts/chat";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { ROOM_PROCEDURES, routeAuthConfig, routeCardFrames, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { captureCookieAuth, createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import type { PlainContentNoticeStory } from "./_plain-content-notice-stories.tsx";
import type { StyledReplyStreamStory } from "./_styled-reply-stream-stories.tsx";

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;
type Caller = Awaited<ReturnType<Root["internalCallerFor"]>>;

// biome-ignore lint/style/noProcessEnv: a path the person running the check names, not application configuration.
const PRESET_PATH = process.env["ORB_PRESET_PROBE_FILE"];
const SKIP_REASON = "ORB_PRESET_PROBE_FILE names no preset file; a third-party preset is not committed to the tree";
const STORY = "tests/client/features/chat/components/_plain-content-notice-stories/PlainContentNoticeStory";
const STREAM_STORY = "tests/client/features/chat/components/_styled-reply-stream-stories/StyledReplyStreamStory";
const CHUNK_LABEL = "Stream the next chunk";
const VIEWER_PASSWORD = "heavy-preset-viewer-password";
const REPLY_FRAME = '[data-slot="reply-frame"] [data-slot="sandbox-frame"]';
const GHOST_BODY = '[data-slot="ghost-message-row"] [data-slot="ghost-stream-body"]';
const NOTICE = '[data-slot="plain-notice"]';
const CASE_TIMEOUT_MS = 180_000;
const PROSE_OPEN = "Sola leans against the doorframe, amber light catching her hair.";
const PROSE_CLOSE = "You're late, she says, smiling anyway.";
// A reply in the shapes heavy presets' tracker prompts ask the model for, between two lines of prose: tagged blocks
// a display script turns into an expanding panel, and a details menu the model writes itself, which a display script
// restyles by its summary. A preset that knows neither shape draws the reply unframed, and the frame check fails.
const REPLY = [
  PROSE_OPEN,
  "<date>Day 3 · Late evening · Autumn rain</date>",
  "<wardrobe>\nSola: oversized knit sweater, bare feet\n</wardrobe>",
  "<inventory>\nSola: brass key, half a honey cake\n</inventory>",
  "<details><summary>INTERNAL STATES</summary>\nSola: wary, fond\n</details>",
  PROSE_CLOSE,
].join("\n\n");
// The reply cut as a provider streams it: inside a tag, inside a block and inside the prose.
const CHUNK_CUTS = [12, 70, 81, 130, 160, 205, 240, 262, 300] as const;
// What markup looks like on screen while a reply forms: a bracket or a block's tag name.
const SOURCE_MARKERS = ["<", ">", "wardrobe", "inventory", "summary"] as const;
const TRANSCRIPT_READS = [
  ...ROOM_PROCEDURES,
  "sessions.me",
  "settings.getUserSettings",
  "plugin.list",
  "plugin.listSurfaces",
  "regex.listScripts",
  "rpg.getGame",
  "rpg.listTurnToolCalls",
  "plugin.transformForDisplay",
] as const;

interface PresetRoom {
  readonly chatId: ChatId;
  readonly characterId: CharacterId;
}

function chunksOf(text: string): readonly string[] {
  const cuts = [0, ...CHUNK_CUTS.filter((cut) => cut < text.length), text.length];
  return cuts.slice(1).map((end, index) => text.slice(cuts[index], end));
}

/** Import the file through the single-file door, make it the host's preset, and report where its scripts landed. */
async function importPreset(owner: Caller, fileText: string, fileName: string): Promise<{ readonly displayScripts: number; readonly report: string }> {
  const preview = await owner.preset.previewFile({ fileText, fileName });
  if (!preview.ok) {
    throw new Error(`the preset door refused the file: ${preview.error}`);
  }
  const imported = await owner.preset.importFile({ fileText, fileName });
  if (!imported.ok || imported.presetId === undefined) {
    throw new Error("the preset import landed no preset");
  }
  expect(preview.refusedScripts, "no script is refused at preview").toEqual([]);
  expect(imported.regexScripts?.refused ?? [], "no script is refused at import").toEqual([]);
  await owner.settings.updateUserSettingsSection({ section: "seeds", patch: { defaultPresetId: imported.presetId } });
  const rows = await owner.regex.listForPreset({ presetId: imported.presetId });
  const byPasses = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.passes.join("+")}${row.enabled ? "" : " (off)"}`;
    byPasses.set(key, (byPasses.get(key) ?? 0) + 1);
  }
  const passes = [...byPasses].map(([key, count]) => `${key} ${String(count)}`).join(", ");
  return {
    displayScripts: rows.filter((row) => row.enabled && row.passes.includes("display")).length,
    report: `${basename(fileName)}: preview attaches ${String(preview.regexScripts)} (${String(preview.regexScriptsOff)} off); import created ${String(imported.regexScripts?.created ?? 0)}, reused ${String(imported.regexScripts?.reused ?? 0)}; landed by pass: ${passes}`,
  };
}

/** A corpus room whose latest reply is spoken by a character that renders trusted HTML, rewritten to `body`. */
async function presetRoom(owner: Caller, body: string): Promise<PresetRoom> {
  for (const row of (await owner.chat.listChats({ limit: 100 })).items) {
    const detail = await owner.chat.getChat({ chatId: row.id });
    if (detail.rpg !== null) {
      continue;
    }
    const trusted = new Set(
      detail.participants.flatMap((seat) =>
        seat.characterId !== null && seat.renderPolicy !== undefined && rendersTrustedHtml(seat.renderPolicy.htmlTrust) ? [seat.characterId] : [],
      ),
    );
    const { messages } = await owner.chat.listMessages({ chatId: row.id });
    const reply = messages.findLast((message) => message.role === "assistant" && message.characterId !== null && trusted.has(message.characterId));
    if (reply?.characterId !== undefined && reply.characterId !== null && detail.viewerIsHost) {
      await owner.chat.editMessage({ chatId: row.id, messageId: reply.id, content: body, timeZone: UTC_TIME_ZONE });
      return { chatId: row.id, characterId: reply.characterId };
    }
  }
  throw new Error("No corpus room the owner hosts has a reply from a character that renders trusted HTML");
}

async function serveRoom(page: Page, root: Root, owner: Caller): Promise<void> {
  const { cookie } = await captureCookieAuth(root, await root.principalFor(root.ownerId), VIEWER_PASSWORD);
  const config = await root.http.request("/api/auth/config", { headers: { cookie } });
  await routeAuthConfig(page, await config.text());
  await routeTrpc(page, serveCorpusProcedures(owner, TRANSCRIPT_READS));
  await routeCardFrames(page, root, cookie);
}

test.describe("a heavy preset's display scripts, rendered", () => {
  test.skip(PRESET_PATH === undefined, SKIP_REASON);
  test.setTimeout(CASE_TIMEOUT_MS);

  test("the reply streams with no markup shown, then its panels draw in the frame and open on click", async ({ mount, page }) => {
    const fileText = await readFile(PRESET_PATH ?? "", "utf8");
    await using root = await createCorpusHarness();
    const owner = await root.internalCallerFor(root.ownerId);
    const landed = await importPreset(owner, fileText, PRESET_PATH ?? "");
    const room = await presetRoom(owner, REPLY);
    const displaySet = await owner.regex.listDisplayScripts({ chatId: room.chatId });
    test.info().annotations.push({ type: "preset", description: `${landed.report}; the room draws through ${String(displaySet.length)} display scripts` });
    expect(displaySet.length, "every enabled display script of the preset reaches the room").toBeGreaterThanOrEqual(landed.displayScripts);
    await serveRoom(page, root, owner);

    // The live reply, as the stream delivers it: prose shows as it arrives, and no tag or block name ever does.
    const chunks = chunksOf(REPLY);
    const streaming = await mount<typeof StyledReplyStreamStory>(STREAM_STORY, {
      chatId: room.chatId,
      speakerCharacterId: room.characterId,
      chunks,
      chunkLabel: CHUNK_LABEL,
    });
    const shown: string[] = [];
    for (const _chunk of chunks) {
      await page.getByRole("button", { name: CHUNK_LABEL, exact: true }).click();
      const text = await page.locator(GHOST_BODY).textContent();
      shown.push(...SOURCE_MARKERS.filter((marker) => (text ?? "").includes(marker)).map((marker) => `${marker} in: ${text ?? ""}`));
    }
    // Positive control: both lines of prose streamed, so each read saw the row as it formed.
    await expect(page.locator(GHOST_BODY)).toContainText(PROSE_OPEN);
    await expect(page.locator(GHOST_BODY)).toContainText(PROSE_CLOSE);
    expect(shown).toEqual([]);
    await streaming.unmount();

    // The stored reply: its scripts run in the Worker and the styled reply draws in its routed frame.
    const started = performance.now();
    await mount<typeof PlainContentNoticeStory>(STORY, { chatId: room.chatId });
    const frame = page.frameLocator(REPLY_FRAME);
    await expect(frame.getByText(PROSE_OPEN)).toBeVisible();
    test.info().annotations.push({ type: "drawn", description: `mount to framed reply ${(performance.now() - started).toFixed(0)} ms` });
    const panel = frame.locator("details").first();
    await expect(panel).toBeVisible();
    await expect(panel).not.toHaveAttribute("open");
    await panel.locator("summary").first().click();
    await expect(panel).toHaveAttribute("open", "");
    // The preset's panels need no script, so no script notice is owed, and no plain notice either.
    await expect(page.locator(NOTICE)).toHaveCount(0);
    await page.unrouteAll({ behavior: "wait" });
  });
});
