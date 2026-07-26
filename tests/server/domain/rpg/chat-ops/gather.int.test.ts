// tests/server/domain/rpg/chat-ops/gather — the game turn's GATHER + the extractionMode branch (rpg-design/05
// §4.6-4.7). Drives the real `gatherTurnContext` through the harness's `chatOps`: a non-game chat is
// byte-identical null; a game contributes the depth-0 reminder injection; the tool set branches on
// resolved mode (cheap-with-tools attaches names; reliable / readonly attaches none).

import { RPG_LITE_TOOL_NAMES } from "@orb/contracts/rpg";
import { freshDb } from "../../../../support/db";
import { expect, principal, seedChat, seedLiteGame, test } from "../_support";

test("a NON-game chat gathers null (byte-identical no-op)", async () => {
  const db = await freshDb();
  const chatId = await seedChat(db, "plain");
  const { chatOps } = (await seedLiteGame(db)).h; // build a harness, but gather a DIFFERENT (non-game) chat
  const out = await chatOps.gatherTurnContext(chatId, undefined, false);
  expect(out).toBeNull();
});

test("a game contributes ONE depth-0 system reminder injection, no macros", async () => {
  const db = await freshDb();
  const { chatId, h } = await seedLiteGame(db);
  const out = await h.chatOps.gatherTurnContext(chatId, undefined, false);
  expect(out).not.toBeNull();
  expect(out?.macros).toEqual({});
  expect(out?.injections).toHaveLength(1);
  const inj = out?.injections[0];
  expect(inj?.position).toBe("in_chat");
  expect(inj?.depth).toBe(0);
  expect(inj?.role).toBe("system");
});

test("reliable mode attaches NO tools (the extraction fires post-turn)", async () => {
  const db = await freshDb();
  const { chatId, h } = await seedLiteGame(db); // seedLiteGame defaults to reliable
  const out = await h.chatOps.gatherTurnContext(chatId, undefined, false);
  expect(out?.tools).toEqual([]);
  // Guidance omitted on a non-tool turn.
  expect(out?.injections[0]?.content).not.toContain("update_party");
});

test("cheap mode attaches the 7 lite tool names + update-guidance", async () => {
  const db = await freshDb();
  const { chatId, gameId, h } = await seedLiteGame(db);
  await h.service.updateConfig({ principal: principal("host"), chatId, extractionMode: "cheap" });
  void gameId;
  const out = await h.chatOps.gatherTurnContext(chatId, undefined, false);
  expect(out?.tools).toEqual([...RPG_LITE_TOOL_NAMES]);
  expect(out?.injections[0]?.content).toContain("update_party");
});

test("readonly (manual-steering) attaches NO tools even in cheap mode — the honest degrade", async () => {
  const db = await freshDb();
  const { chatId, h } = await seedLiteGame(db, { trackersReadOnly: true });
  await h.service.updateConfig({ principal: principal("host"), chatId, extractionMode: "cheap" });
  const out = await h.chatOps.gatherTurnContext(chatId, undefined, false);
  expect(out?.tools).toEqual([]);
  expect(out?.injections[0]?.content).not.toContain("update_party");
});
