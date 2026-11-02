// Guest data crosses the broker channel as the guest wrote it. A value shaped like one of the codec's own markers
// stays plain data in every direction, while a real `undefined` or `Uint8Array` still keeps its type.
// @subject packages/server/src/infra/plugin-host/process-protocol.ts

import { spawn } from "node:child_process";
import { isPlainObject } from "@orb/kit/guards";
import type { JsonValue } from "@orb/kit/json";
import { jsonValueSchema } from "@orb/kit/json";
import { expect, test } from "@orb/testkit/node";
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
import {
  decodeProcessValue,
  encodeProcessValue,
  parseBrokerParentMessage,
  parseMessageLine,
  parseParentBrokerMessage,
  serializeMessage,
} from "#server/infra/plugin-host/process-protocol.ts";
import { NATIVE_TIMEOUT_MS } from "./process-runtime.fixtures.ts";

// Taken from the encoder, so a renamed marker cannot leave these cases testing a shape nothing emits.
const UNDEFINED_MARKER = jsonValueSchema.parse(encodeProcessValue(undefined));
const BYTES_MARKER = jsonValueSchema.parse(encodeProcessValue(Uint8Array.of(104, 105)));
const MARKER_SHAPES = [
  { marker: "undefined", shape: UNDEFINED_MARKER },
  { marker: "bytes", shape: BYTES_MARKER },
];

function onlyKey(shape: JsonValue): string {
  const key = typeof shape === "object" && shape !== null ? Object.keys(shape)[0] : undefined;
  if (key === undefined) {
    throw new Error("a marker is an object with one key");
  }
  return key;
}

const crossings = [
  {
    channel: "a broker bridge frame to the app",
    cross: (value: unknown): unknown => {
      const frame = serializeMessage({ kind: "bridge", id: "bridge", runtimeId: "runtime", authorityId: "authority", operation: "pubsub.emit", args: [value] });
      const message = parseBrokerParentMessage(parseMessageLine(frame));
      return message?.kind === "bridge" ? message.args[0] : expect.fail("the bridge frame did not parse");
    },
  },
  {
    channel: "an app result frame to the broker",
    cross: (value: unknown): unknown => {
      const frame = serializeMessage({ kind: "bridge-result", id: "bridge", ok: true, value });
      const message = parseParentBrokerMessage(parseMessageLine(frame));
      return message?.kind === "bridge-result" && message.ok ? message.value : expect.fail("the result frame did not parse");
    },
  },
  {
    channel: "a synchronous reply",
    cross: (value: unknown): unknown => decodeProcessValue(JSON.parse(JSON.stringify(encodeProcessValue(value)))),
  },
];

const guestValues = MARKER_SHAPES.flatMap(({ marker, shape }) => [
  { name: `${marker} marker`, value: shape },
  { name: `${marker} marker inside an object`, value: { outer: { inner: shape } } },
  { name: `${marker} marker inside a list`, value: [1, [shape]] },
  { name: `${marker} marker beside another key`, value: { ...(isPlainObject(shape) ? shape : {}), sibling: 1 } },
  { name: `${marker} marker key holding a non-marker value`, value: { [onlyKey(shape)]: false } },
  { name: `${marker} marker already in its escaped wire form`, value: encodeProcessValue(shape) },
  { name: `${marker} marker escaped twice`, value: encodeProcessValue(encodeProcessValue(shape)) },
]);

test.for(crossings.flatMap(({ channel, cross }) => guestValues.map(({ name, value }) => ({ channel, cross, name, value }))))(
  "$channel carries a guest's $name unchanged",
  ({ cross, value }) => {
    expect(cross(value)).toStrictEqual(value);
  },
);

test.for(crossings)("$channel keeps a real undefined and real bytes beside marker-shaped data", ({ cross }) => {
  const value = { missing: undefined, bytes: Uint8Array.of(0, 255), list: [undefined, Uint8Array.of(7)], data: [UNDEFINED_MARKER, BYTES_MARKER] };
  expect(cross(value)).toStrictEqual(value);
});

test("a real guest's marker-shaped card state returns to it unchanged through the broker", { tags: ["slow"], timeout: NATIVE_TIMEOUT_MS }, async () => {
  const provider = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "The room answers.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  await using h = await createChatRoot({ providerFetch: provider.execute, memoryEnabled: false, server: { pluginSpawn: spawn } });
  const pluginId = await installGuest(
    h.root,
    h.owner,
    { slug: "marker-keeper", capabilities: ["character.card_state"] },
    { state: "async (h, room, a) => { await h.character.setCardData(a.card, a.data); return await h.character.getCardData(a.card); }" },
  );
  const card = h.characters[0]?.id ?? expect.fail("the room has no character");
  const data = { gone: UNDEFINED_MARKER, bytes: BYTES_MARKER, escaped: jsonValueSchema.parse(encodeProcessValue(BYTES_MARKER)), plain: "kept" };

  expect(await guestRunner({ root: h.root, caller: h.owner, pluginId, chatId: null })("state", { card, data })).toEqual({ ok: true, value: data });
});
