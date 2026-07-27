// tests/server/domain/rpg/chat-ops/gather — the game turn's GATHER (rpg-design/05 §4.6-4.7 + the owner ruling
// 2026-07-27). Drives the real `gatherTurnContext` through the harness's `chatOps`: a non-game chat is
// byte-identical null; a game contributes the depth-0 reminder injection. THE CHARACTER TURN IS ALWAYS
// TOOL-LESS PROSE in every mode — state is captured by a DEDICATED STATE ROUND post-commit (cheap = a tool
// round, reliable = an extraction), so the gather NEVER returns tools + the char-turn reminder omits the
// update-guidance (the char turn is never asked to call a tool).

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

test("reliable mode: the char turn is tool-less, guidance omitted (state round fires post-turn)", async () => {
  const db = await freshDb();
  const { chatId, h } = await seedLiteGame(db); // seedLiteGame defaults to reliable
  const out = await h.chatOps.gatherTurnContext(chatId, undefined, false);
  expect(out?.tools).toEqual([]);
  expect(out?.injections[0]?.content).not.toContain("update_party");
});

test("cheap mode: the char turn is ALSO tool-less (owner ruling — the dedicated tool round runs post-commit)", async () => {
  const db = await freshDb();
  const { chatId, h } = await seedLiteGame(db);
  await h.service.updateConfig({ principal: principal("host"), chatId, extractionMode: "cheap" });
  const out = await h.chatOps.gatherTurnContext(chatId, undefined, false);
  // The char turn NEVER mounts tools — cheap captures state in the dedicated tool round, not on the narration.
  expect(out?.tools).toEqual([]);
  expect(out?.injections[0]?.content).not.toContain("update_party");
  // The reminder still injects the tracked state as flavor (the depth-0 system injection is always present).
  expect(out?.injections).toHaveLength(1);
  expect(out?.injections[0]?.role).toBe("system");
});

test("readonly (manual-steering): tool-less char turn + the reminder still steers via hand-edited state", async () => {
  const db = await freshDb();
  const { chatId, h } = await seedLiteGame(db, { trackersReadOnly: true });
  await h.service.updateConfig({ principal: principal("host"), chatId, extractionMode: "cheap" });
  const out = await h.chatOps.gatherTurnContext(chatId, undefined, false);
  expect(out?.tools).toEqual([]);
  expect(out?.injections[0]?.content).not.toContain("update_party");
});
