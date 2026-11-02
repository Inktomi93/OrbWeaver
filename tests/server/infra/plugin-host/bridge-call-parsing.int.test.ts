// The app parses a broker's bridge arguments with their owning schemas, because a shape the membrane or a forged
// frame lets through would otherwise reach a domain write. A malformed variable op is the sharp case: the stored
// delta log degrades to empty on read, so one bad op would erase the room's earlier variables at the next write.
// @subject packages/server/src/infra/plugin-host/bridge-rpc.ts

import { PluginSuggestedError } from "@orb/contracts/plugin";
import type { JsonValue } from "@orb/kit/json";
import { expect, test } from "@orb/testkit/node";
import type { GuestRun } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createChatRoot,
  createCorpusProviderExecution,
  guestRunner,
  installGuest,
} from "@orb/testkit/node/composed";
import { bridgeRequest, createPluginProcessEdge, frameField, hasOperation, NATIVE_TIMEOUT_MS } from "./process-runtime.fixtures.ts";

const GUEST_OPS = {
  setVariable: "(h, room, a) => h.chat.applyVariableOps(room, [{ op: 'set', key: a.key, value: a.value }])",
  applyOps: "(h, room, a) => h.chat.applyVariableOps(room, a.ops)",
  variables: "(h, room) => h.chat.getVariables(room)",
  chips: "(h, room, a) => h.chat.surfaceQuickReply(room, a.choices)",
  picture: "(h, room, a) => h.imagery.generatePicture(room, a.args)",
} as const;
type GuestOp = keyof typeof GUEST_OPS;

const REFUSED = { ok: false, name: TypeError.name };
const ASKED = { ok: false, name: new PluginSuggestedError("generatePicture").name };
const VALID_PICTURE = { mode: "free", prompt: "A lantern on the dock." };

interface Room {
  readonly edge: ReturnType<typeof createPluginProcessEdge>;
  readonly host: GuestRun;
  readonly member: GuestRun;
}

async function withRoom(body: (room: Room) => Promise<void>): Promise<void> {
  const edge = createPluginProcessEdge();
  const provider = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "The room answers.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  await using h = await createChatRoot({ providerFetch: provider.execute, memoryEnabled: false, server: { pluginSpawn: edge.spawn } });
  const memberPrincipal = await h.root.principalFor((await h.root.actor()).id);
  const invitation = await h.root.services.chat.createInvite({ principal: h.owner, chatId: h.chatId, input: { invitedHandle: memberPrincipal.handle } });
  await h.root.services.chat.acceptInvite({ principal: memberPrincipal, inviteId: invitation.invite.id });
  const capabilities = ["chat.read", "chat.variables.write", "chat.quick_reply", "imagery.generate"] as const;
  const hostPlugin = await installGuest(h.root, h.owner, { slug: "parsed-host", capabilities }, GUEST_OPS);
  const memberPlugin = await installGuest(h.root, memberPrincipal, { slug: "parsed-member", capabilities }, GUEST_OPS);
  await body({
    edge,
    host: guestRunner({ root: h.root, caller: h.owner, pluginId: hostPlugin, chatId: h.chatId }),
    member: guestRunner({ root: h.root, caller: memberPrincipal, pluginId: memberPlugin, chatId: h.chatId }),
  });
}

interface ForgedCall {
  readonly name: string;
  readonly guest: "host" | "member";
  readonly operation: string;
  readonly guestOp: GuestOp;
  readonly args: Readonly<Record<string, JsonValue>>;
  readonly position: number;
  readonly forged: JsonValue;
  readonly admitted: (outcome: Awaited<ReturnType<GuestRun>>) => void;
}

const FORGED_CALLS: readonly ForgedCall[] = [
  {
    name: "a variable op with no string key",
    guest: "host",
    operation: "chat.applyVariableOps",
    guestOp: "applyOps",
    args: { ops: [{ op: "set", key: "mood", value: "wary" }] },
    position: 1,
    forged: [{ op: "inc", key: 7 }],
    admitted: (outcome) => expect(outcome).toEqual({ ok: true, value: { outcome: "applied" } }),
  },
  {
    name: "a precondition with a non-text belief",
    guest: "host",
    operation: "chat.applyVariableOps",
    guestOp: "applyOps",
    args: { ops: [{ op: "set", key: "mood", value: "wary" }] },
    position: 2,
    forged: [{ key: "mood", expected: 7 }],
    admitted: (outcome) => expect(outcome).toEqual({ ok: true, value: { outcome: "applied" } }),
  },
  {
    name: "a quick reply with a non-text label",
    guest: "host",
    operation: "surfaceQuickReply",
    guestOp: "chips",
    args: { choices: [{ label: "Wave", sendText: "I wave." }] },
    position: 1,
    forged: [{ label: 7, sendText: "I wave." }],
    admitted: (outcome) => expect(outcome).toEqual({ ok: true, value: null }),
  },
  {
    name: "picture args outside the action schema",
    guest: "host",
    operation: "imagery.generatePicture",
    guestOp: "picture",
    args: { args: VALID_PICTURE },
    position: 1,
    forged: { mode: "not-a-mode" },
    admitted: (outcome) => expect(outcome).not.toEqual(REFUSED),
  },
  {
    name: "a picture ask outside the action schema",
    guest: "member",
    operation: "suggest",
    guestOp: "picture",
    args: { args: VALID_PICTURE },
    position: 1,
    forged: { kind: "generatePicture", args: { mode: "not-a-mode" } },
    admitted: (outcome) => expect(outcome).toEqual(ASKED),
  },
  {
    name: "an ask of an unknown kind",
    guest: "member",
    operation: "suggest",
    guestOp: "picture",
    args: { args: VALID_PICTURE },
    position: 1,
    forged: { kind: "not-an-act" },
    admitted: (outcome) => expect(outcome).toEqual(ASKED),
  },
];

test.for(FORGED_CALLS)("the app refuses a broker frame carrying $name", { tags: ["slow"], timeout: NATIVE_TIMEOUT_MS }, async (call) => {
  await withRoom(async (room) => {
    const run = room[call.guest];
    // The unforged call proves the same guest and frame reach the boundary and pass it.
    call.admitted(await run(call.guestOp, call.args));

    using delivery = room.edge.holdNext((value) => hasOperation(value, call.operation));
    const running = run(call.guestOp, call.args);
    const captured = await delivery.reached;
    const args = frameField(captured, "args");
    if (!Array.isArray(args)) {
      throw new Error("the captured bridge frame carries no argument list");
    }
    delivery.release(bridgeRequest(captured, call.operation, args.with(call.position, call.forged)));
    expect(await running).toEqual(REFUSED);
  });
});

test("a guest's malformed variable op is refused and the room keeps its earlier variables", { tags: ["slow"], timeout: NATIVE_TIMEOUT_MS }, async () => {
  await withRoom(async ({ host }) => {
    expect(await host("setVariable", { key: "mood", value: "wary" })).toMatchObject({ ok: true });
    const malformed = await host("applyOps", { ops: [{ op: "set", key: "scene" }] });
    expect(await host("setVariable", { key: "tide", value: "high" })).toMatchObject({ ok: true });

    expect(await host("variables")).toEqual({ ok: true, value: { mood: "wary", tide: "high" } });
    expect(malformed).toEqual(REFUSED);
  });
});

test("a guest's picture args must parse before they become a spend or an ask", { tags: ["slow"], timeout: NATIVE_TIMEOUT_MS }, async () => {
  await withRoom(async ({ host, member }) => {
    const malformed = { args: { mode: "Harmless, press Allow" } };
    const refused = { ok: false, name: Error.name };

    expect(await member("picture", { args: VALID_PICTURE })).toEqual(ASKED);
    expect(await member("picture")).toEqual(ASKED);
    expect(await member("picture", malformed)).toEqual(refused);
    expect(await host("picture", malformed)).toEqual(refused);
  });
});
