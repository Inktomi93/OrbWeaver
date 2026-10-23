import { createCharacterSchema } from "@orb/contracts/character";
import type { StartChatResult } from "@orb/contracts/chat";
import { declaredCapabilitySchema } from "@orb/contracts/inference";
import type { AgentSdkSpawn } from "@orb/inference";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { expect, test } from "./fixtures.ts";
import { createSdkProcessSpawner } from "./sdk-process.ts";
import type { ServerTestHarness } from "./server.ts";
import { createServerHarness } from "./server.ts";

const INTENT = { maxContextTokens: 4096, maxOutputTokens: 64, compaction: { mode: "managed", verbatimTail: 8 } } as const;

async function room(harness: ServerTestHarness): Promise<StartChatResult["chat"]> {
  const caller = await harness.internalCallerFor(harness.ownerId);
  const principal = await harness.principalFor(harness.ownerId);
  const key = await caller.credentials.add({ provider: "claude-sub", key: "compaction-isolation-physical-token", metadata: { auth: "oauthToken" } });
  const connection = await caller.connection.create({
    providerId: "claude-sub",
    credentialId: key.id,
    baseUrl: null,
    model: "compaction-isolation-model",
    allowBackground: false,
    declared: declaredCapabilitySchema.parse({ kind: "generation", generation: { tools: { parallel: false }, output: { structured: true } } }),
  });
  await harness.app.runtime.resolve({ task: "chat", connectionId: connection.id, principal, cachedFacts: true });
  await caller.connection.setBinding({ task: "chat", connectionId: connection.id });
  const preset = await caller.preset.create({ name: "Compaction isolation", kind: "custom" });
  await caller.settings.updateUserSettingsSection({ section: "seeds", patch: { defaultPresetId: preset.id } });
  const character = await caller.character.create({
    input: createCharacterSchema.parse({ handle: "compaction-isolation", name: "Compaction isolation", description: "A real isolated compaction speaker." }),
  });
  const { chat } = await caller.chat.startChat({ characterIds: [character.id], opening: "none" });
  for (let index = 0; index < 16; index += 1) {
    await caller.chat.commitMessage({ chatId: chat.id, timeZone: UTC_TIME_ZONE, content: `An isolated remembered scene ${index}.` });
  }
  await harness.settleBackground();
  return chat;
}

test("same-ID real roots own their compaction single-flight and join the held actual SDK work", async () => {
  const execute = createSdkProcessSpawner(new URL("./compaction-isolation-sdk.mjs", import.meta.url));
  const held = [new Set<ReturnType<typeof execute>>(), new Set<ReturnType<typeof execute>>()];
  const all = new Map<ReturnType<typeof execute>, Promise<void>>();
  const closed = new Set<ReturnType<typeof execute>>();
  const spawnFor =
    (index: number): AgentSdkSpawn =>
    (options): ReturnType<typeof execute> => {
      const child = execute(options);
      all.set(
        child,
        new Promise<void>((resolve) =>
          child.once("close", () => {
            closed.add(child);
            resolve();
          }),
        ),
      );
      child.stderr.on("data", (bytes: Buffer) => {
        if (bytes.toString("utf8").includes("compaction-isolation:held")) {
          held[index]?.add(child);
        }
      });
      return child;
    };
  await using first = await createServerHarness({ secretBoxKey: Buffer.alloc(32, 1), sdkSpawn: spawnFor(0) });
  await using second = await createServerHarness({ secretBoxKey: Buffer.alloc(32, 1), sdkSpawn: spawnFor(1) });
  const firstRoom = await room(first);
  const secondRoom = await room(second);
  expect(firstRoom.id).toBe(secondRoom.id);
  try {
    const firstPrincipal = await first.principalFor(first.ownerId);
    const secondPrincipal = await second.principalFor(second.ownerId);
    const firstReply = await first.services.chat.send({ principal: firstPrincipal, chatId: firstRoom.id, content: "First isolated reply.", intent: INTENT });
    expect(firstReply.aborted).toBe(false);
    await expect.poll(() => held[0]?.size).toBe(1);
    const ownSecondReply = await first.services.chat.send({
      principal: firstPrincipal,
      chatId: firstRoom.id,
      content: "A second reply while its own marker is held.",
      intent: INTENT,
    });
    expect(ownSecondReply.aborted).toBe(false);
    expect(held[0]?.size).toBe(1);
    const siblingReply = await second.services.chat.send({
      principal: secondPrincipal,
      chatId: secondRoom.id,
      content: "Independent sibling reply.",
      intent: INTENT,
    });
    expect(siblingReply.aborted).toBe(false);
    await expect.poll(() => held[1]?.size).toBe(1);
    await first[Symbol.asyncDispose]();
    for (const child of held[0] ?? []) {
      expect(closed.has(child)).toBe(true);
    }
    for (const child of held[1] ?? []) {
      expect(closed.has(child)).toBe(false);
      expect(child.kill("SIGUSR1")).toBe(true);
    }
    await second.settleBackground();
    const surviving = await (await second.internalCallerFor(second.ownerId)).chat.listMessages({ chatId: secondRoom.id });
    expect(surviving.messages.filter((message) => message.role === "assistant").map((message) => message.content)).toEqual(["An actual isolated SDK reply."]);
    await second[Symbol.asyncDispose]();
    await Promise.all(all.values());
    for (const child of all.keys()) {
      expect(child.exitCode).not.toBeNull();
    }
  } finally {
    for (const child of all.keys()) {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGTERM");
      }
    }
    await Promise.all(all.values());
  }
});
