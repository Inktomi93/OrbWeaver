// @subject packages/server/src/domain/chat/verbs/turn.ts
// @subject packages/server/src/domain/chat/persistence/queries.ts
// A real turn resolves each plugin's macros once, under its own plugin id, and stores the turn's macro slice with the
// variant it sent: the host reads it back through getVariantWire, the retrospective twin of the preview.

import { spawn } from "node:child_process";
import type { MacroSlice } from "@orb/contracts/chat";
import type { PluginId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { installMacroGuest } from "@orb/testkit/node/composed";
import { textRoom, wireOf, wireText } from "../scenario-physical.ts";

// One step of the root's scoped clock; the poll repeats it until the macro deadline has passed.
const TICK_MS = 250;
const POLL_TIMEOUT_MS = 2000;
const TEST_TIMEOUT_MS = 15_000;

/** The probe row with each token written as `token=<its render>`, so an unresolved token is visible as raw braces. */
function probe(tokens: readonly string[]): string {
  return `PROBE ${tokens.map((token) => `${token}={{${token}}}`).join(" ; ")} END`;
}

async function writeOnCard(h: ChatRoot, description: string): Promise<void> {
  const character = h.characters[0];
  if (character === undefined) {
    throw new Error("the room seated no character");
  }
  await h.caller.character.update({ characterId: character.id, input: { description } });
}

/** The host-namespaced macro name the plugin registered, as the owner's own read lists it. */
async function macroNameOf(h: ChatRoot, pluginId: PluginId): Promise<string> {
  const row = (await h.caller.plugin.listMacros()).find((macro) => macro.pluginId === pluginId);
  if (row === undefined) {
    throw new Error("the plugin listed no macro");
  }
  return row.name;
}

type SendOutcome = Awaited<ReturnType<ChatRoot["root"]["services"]["chat"]["send"]>>;

/** Run the send and read every string of the newest request it sent. */
async function sentWire(h: ChatRoot, send: () => Promise<SendOutcome>): Promise<{ readonly sent: SendOutcome; readonly wire: string }> {
  const { outcome, newest } = await wireOf(h, send);
  return { sent: outcome, wire: wireText(newest) };
}

/** The macro slice the host reads back for the turn's assistant variant. */
async function storedSlice(h: ChatRoot, messages: SendOutcome["messages"]): Promise<MacroSlice | null | undefined> {
  const assistant = messages.find((message) => message.role === "assistant");
  if (assistant === undefined) {
    throw new Error("the turn produced no assistant message");
  }
  const wire = await h.root.services.chat.getVariantWire({ principal: h.owner, chatId: h.chatId, variantId: assistant.selectedVariantId });
  return wire.macros;
}

test("two plugins resolve to their own values in the turn, and the stored slice names each under its own plugin id", async () => {
  await using h = await textRoom(["The deck answers."], { server: { pluginSpawn: spawn } });
  const oracle = await installMacroGuest(h.root, h.owner, { slug: "oracle-deck", name: "Oracle Deck" }, [
    { name: "omen", description: "Draws an omen.", answer: "OMEN-VALUE" },
  ]);
  const ledger = await installMacroGuest(h.root, h.owner, { slug: "ledger", name: "Ledger" }, [
    { name: "tally", description: "Counts coins.", answer: "TALLY-VALUE" },
  ]);
  const omen = await macroNameOf(h, oracle);
  const tally = await macroNameOf(h, ledger);
  const legacyOmen = "plugin_oracle_deck_omen";
  await writeOnCard(h, probe([omen, legacyOmen, tally]));

  const { sent, wire } = await sentWire(h, () => h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "Draw." }));

  expect(sent.aborted).toBe(false);
  expect(wire).toContain(`${omen}=OMEN-VALUE`);
  expect(wire).toContain(`${tally}=TALLY-VALUE`);
  expect(wire).toContain(`${legacyOmen}=OMEN-VALUE`);
  const slice = await storedSlice(h, sent.messages);
  expect(slice?.registered).toEqual(
    expect.arrayContaining([
      { name: omen, source: { kind: "plugin", id: oracle } },
      { name: legacyOmen, source: { kind: "plugin", id: oracle } },
      { name: tally, source: { kind: "plugin", id: ledger } },
    ]),
  );
  expect(slice?.rejected).toEqual([]);
});

test("a legacy spelling two plugins both claim stays with the live name in the turn, not with either hyphenated plugin", async () => {
  const claimed = "plugin_foo_bar_baz";
  await using h = await textRoom(["Done."], { server: { pluginSpawn: spawn } });
  await installMacroGuest(h.root, h.owner, { slug: "foo-bar" }, [{ name: "baz", description: "d", answer: "HYPHEN-VALUE" }]);
  const plain = await installMacroGuest(h.root, h.owner, { slug: "foo" }, [{ name: "bar_baz", description: "d", answer: "PLAIN-VALUE" }]);
  await writeOnCard(h, probe([claimed]));

  const { sent, wire } = await sentWire(h, () => h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "Go." }));

  expect(wire).toContain(`${claimed}=PLAIN-VALUE`);
  expect(wire).not.toContain("HYPHEN-VALUE");
  expect((await storedSlice(h, sent.messages))?.registered).toContainEqual({ name: claimed, source: { kind: "plugin", id: plain } });
});

test("a plugin macro that never answers renders empty at the deadline in the turn while another plugin's macro resolves", {
  timeout: TEST_TIMEOUT_MS,
}, async () => {
  await using h = await textRoom(["Done."], { server: { pluginSpawn: spawn } });
  const slow = await installMacroGuest(h.root, h.owner, { slug: "slow-deck" }, [{ name: "stalled", description: "Never answers.", stalls: true }]);
  const quick = await installMacroGuest(h.root, h.owner, { slug: "quick-deck" }, [{ name: "quick", description: "Answers.", answer: "QUICK-VALUE" }]);
  await writeOnCard(h, `Omen:[{{${await macroNameOf(h, slow)}}}] Quick:[{{${await macroNameOf(h, quick)}}}]`);

  const { sent, wire } = await sentWire(h, async () => {
    let settled = false;
    const sending = h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "Go." }).finally(() => {
      settled = true;
    });
    await expect
      .poll(
        () => {
          h.root.timers.advance(TICK_MS);
          return settled;
        },
        { timeout: POLL_TIMEOUT_MS, interval: 25 },
      )
      .toBe(true);
    return await sending;
  });

  expect(sent.aborted).toBe(false);
  expect(wire).toContain("Omen:[]");
  expect(wire).toContain("Quick:[QUICK-VALUE]");
});
