import {
  PLUGIN_BROKER_MESSAGE_MAX_BYTES,
  parseBrokerParentMessage,
  parseMessageLine,
  parseParentBrokerMessage,
  serializeMessage,
} from "../../../../packages/server/src/infra/plugin-host/process-protocol.ts";
import { expect, test } from "../../../support/fixtures.ts";

test("the inherited-channel protocol rejects open operation names and bridge messages without command authority", () => {
  expect(parseParentBrokerMessage({ kind: "command", id: "one", operation: "eval", runtimeId: "runtime-000000000" })).toBeNull();
  expect(
    parseBrokerParentMessage({
      kind: "bridge",
      id: "bridge-one",
      runtimeId: "runtime-000000000",
      operation: "chat.listMessages",
      args: ["chat-one", 10],
    }),
  ).toBeNull();
  expect(
    parseBrokerParentMessage({
      kind: "bridge",
      id: "bridge-one",
      runtimeId: "runtime-000000000",
      authorityId: "authority-000000000",
      operation: "chat.readAnything",
      args: [],
    }),
  ).toBeNull();
  expect(parseParentBrokerMessage({ kind: "command", id: "one", operation: "create", runtimeId: "runtime-000000000" })).toBeNull();
  expect(
    parseParentBrokerMessage({
      kind: "command",
      id: "one",
      operation: "create",
      runtimeId: "runtime-000000000",
      authorityId: "authority-000000000",
    }),
  ).toMatchObject({ kind: "command", operation: "create" });
  expect(parseBrokerParentMessage({ kind: "authority-released", runtimeId: "runtime-000000000" })).toBeNull();
  expect(parseBrokerParentMessage({ kind: "authority-released", runtimeId: "runtime-000000000", authorityId: "authority-000000000" })).toEqual({
    kind: "authority-released",
    runtimeId: "runtime-000000000",
    authorityId: "authority-000000000",
  });
});

test("wire values preserve bytes and undefined without accepting an oversized frame", () => {
  const line = serializeMessage({
    kind: "bridge-result",
    id: "bridge-one",
    ok: true,
    value: { bytes: Uint8Array.from([0, 127, 255]), absent: undefined },
  });
  expect(parseMessageLine(line)).toEqual({
    kind: "bridge-result",
    id: "bridge-one",
    ok: true,
    value: { bytes: Uint8Array.from([0, 127, 255]), absent: undefined },
  });
  expect(() => parseMessageLine("x".repeat(PLUGIN_BROKER_MESSAGE_MAX_BYTES + 1))).toThrow(/message exceeds/u);
  let deep: unknown = null;
  for (let depth = 0; depth < 130; depth += 1) {
    deep = [deep];
  }
  expect(() => serializeMessage({ kind: "bridge-result", id: "deep", ok: true, value: deep })).toThrow(/process value exceeds depth/u);
});
