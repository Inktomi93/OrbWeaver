// The plugin bridge's room-variable ops re-check the INSTALLER's standing on every call, against the real chat
// membership store and through the real broker. A floated continuation keeps its command's authority for the
// continuation window, so admission-time authority alone would let it keep writing a room its installer has
// since left or lost the host seat in.

import type { PluginBridge, PluginHandlerRef, PluginInstance } from "@orb/contracts/plugin";
import type { Db } from "@orb/db";
import { chatParticipants } from "@orb/db/schema";
import type { ChatId, Handle, PluginId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { VarOp } from "@orb/kit/macro";
import { createPluginHost } from "@orb/server/infra/plugin-host";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, vi } from "vitest";
import { createResolveViewerVisibility } from "../../../../../packages/server/src/domain/chat/verbs/resolve-viewer-visibility.ts";
import type { PluginHostOps } from "../../../../../packages/server/src/domain/plugin/contract/ops.ts";
import { buildPluginBridge } from "../../../../../packages/server/src/domain/plugin/substrate/bridge.ts";
import { __terminateManagedPluginBrokerForTest } from "../../../../../packages/server/src/infra/plugin-host/process-runtime.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedChat, seedParticipant, seedUser } from "../../chat/_support.ts";
import { makeInertOps, makePluginHarness } from "../_support.ts";

const LONG = 30_000;
const PLUGIN_ID = castId<PluginId>("plugin_bridge_revocation0001");
const LEFT_AT_SEQ = 99;

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

afterEach(async () => {
  await __terminateManagedPluginBrokerForTest();
});

interface RoomOps {
  readonly ops: PluginHostOps;
  readonly written: string[];
  readonly reachedGate: Promise<void>;
  readonly releaseGate: () => void;
}

// The real viewer-visibility op over the seeded db; the room writes are recorded instead of applied, and the
// continuation's variable read parks on a gate so the test can change the installer's standing mid-chain.
function roomOps(): RoomOps {
  const base = makeInertOps();
  const written: string[] = [];
  const reached = Promise.withResolvers<void>();
  const gate = Promise.withResolvers<void>();
  let reads = 0;
  const ops: PluginHostOps = {
    ...base,
    chat: {
      ...base.chat,
      resolveViewerVisibility: createResolveViewerVisibility({ db }),
      getVariables: async () => {
        reads += 1;
        if (reads > 1) {
          return {};
        }
        reached.resolve();
        await gate.promise;
        return {};
      },
      applyVariableOps: (_chatId, varOps: readonly VarOp[]) => {
        written.push(...varOps.map((op) => op.key));
        return Promise.resolve({ outcome: "applied" });
      },
    },
  };
  return { ops, written, reachedGate: reached.promise, releaseGate: (): void => gate.resolve() };
}

async function seedRoom(installerHandle: string): Promise<{ readonly installer: UserId; readonly chatId: ChatId }> {
  const installer = await seedUser(db, castId<Handle>(installerHandle));
  const chatId = await seedChat(db, "room");
  await seedParticipant(db, { chatId, key: installerHandle, userId: installer, role: "host" });
  return { installer, chatId };
}

async function activateWriter(bridge: PluginBridge): Promise<{
  readonly host: ReturnType<typeof createPluginHost>;
  readonly instance: PluginInstance;
  readonly handler: PluginHandlerRef;
}> {
  const host = createPluginHost({ nowEpochMs: () => 1_700_000_000_000, nextRandom: () => 0.5, mintId: () => "bridge-revocation-id" });
  const outcome = await host.createInstance({
    mainJs: `
      const h = orb.host(1);
      h.tools.register({
        name: "write_later",
        description: "writes now, then again from a floated continuation",
        parameters: { type: "object", properties: {} },
        handler: async () => {
          const room = h.chat.current();
          void (async () => {
            await h.chat.getVariables(room);
            await h.chat.applyVariableOps(room, [{ op: "set", key: "after", value: "1" }]);
          })().catch((e) => h.log.warn("late write refused: " + e.message));
          await h.chat.applyVariableOps(room, [{ op: "set", key: "before", value: "1" }]);
          return "accepted";
        },
      });`,
    reloadMainJs: () => Promise.reject(new Error("test: no cold wake")),
    grants: ["tools.register", "chat.read", "chat.variables.write"],
    bridge,
    chat: null,
  });
  if (!outcome.ok) {
    throw new Error(outcome.error);
  }
  const handler = outcome.instance.tools[0]?.handler;
  if (handler === undefined) {
    throw new Error("test: write tool did not register");
  }
  return { host, instance: outcome.instance, handler };
}

test("a continuation's next room write is refused once its installer has left the room", { timeout: LONG }, async () => {
  const { installer, chatId } = await seedRoom("leaver");
  const room = roomOps();
  const bridge = buildPluginBridge(room.ops, installer, { id: PLUGIN_ID, name: "Writer", slug: "writer" }, makePluginHarness(db).ctx.belts);
  const { host, instance, handler } = await activateWriter(bridge);

  await expect(host.invoke(instance, handler, "{}", { chatId, canWrite: true, automationDepth: 0 })).resolves.toBe("accepted");
  await room.reachedGate;
  // The installer leaves while the continuation is parked between its read and its write.
  await db
    .update(chatParticipants)
    .set({ leftSeq: LEFT_AT_SEQ })
    .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.userId, installer)));
  room.releaseGate();

  await vi.waitFor(() => expect(host.readLog(instance).some((line) => line.message.startsWith("late write refused"))).toBe(true));
  expect(room.written).toEqual(["before"]);
  host.dispose(instance);
});

test("a continuation's next room write is refused once its installer no longer holds the host seat", { timeout: LONG }, async () => {
  const { installer, chatId } = await seedRoom("demoted");
  const room = roomOps();
  const bridge = buildPluginBridge(room.ops, installer, { id: PLUGIN_ID, name: "Writer", slug: "writer" }, makePluginHarness(db).ctx.belts);
  const { host, instance, handler } = await activateWriter(bridge);

  await expect(host.invoke(instance, handler, "{}", { chatId, canWrite: true, automationDepth: 0 })).resolves.toBe("accepted");
  await room.reachedGate;
  await db
    .update(chatParticipants)
    .set({ role: "member" })
    .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.userId, installer)));
  room.releaseGate();

  await vi.waitFor(() => expect(host.readLog(instance).some((line) => line.message.startsWith("late write refused"))).toBe(true));
  expect(room.written).toEqual(["before"]);
  host.dispose(instance);
});

test("a room-variable read for a chat the installer is not in is the empty fold, never the room's state", async () => {
  const outsider = await seedUser(db, castId<Handle>("outsider"));
  const chatId = await seedChat(db, "room");
  let reached = false;
  const base = makeInertOps();
  const ops: PluginHostOps = {
    ...base,
    chat: {
      ...base.chat,
      resolveViewerVisibility: createResolveViewerVisibility({ db }),
      getVariables: () => {
        reached = true;
        return Promise.resolve({ secret: "room state" });
      },
    },
  };
  const bridge = buildPluginBridge(ops, outsider, { id: PLUGIN_ID, name: "Reader", slug: "reader" }, makePluginHarness(db).ctx.belts);

  await expect(bridge.chat.getVariables(chatId)).resolves.toEqual({});
  expect(reached).toBe(false);
});
