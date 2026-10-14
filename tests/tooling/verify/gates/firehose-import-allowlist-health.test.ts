import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint } from "eslint";
import { gate as health } from "../../../../tooling/src/verify/gates/firehose-import-allowlist-health.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";

test("the D162 rename-health owner passes every declared proof", () => {
  expect(verifyPolicyProofs([health])).toEqual([]);
});

test("the actual D162 selector refuses named, re-exported, namespace and computed consumers outside its two homes", async () => {
  const eslint = new ESLint();
  const source = [
    'import { subscribeAllChatEvents } from "./chat-events-bus.ts";',
    'export { subscribeAllChatEvents } from "./chat-events-bus.ts";',
    'import * as bus from "./chat-events-bus.ts";',
    "bus.subscribeAllChatEvents(() => {});",
    'bus["subscribeAllChatEvents"](() => {});',
  ].join("\n");
  const forbidden = await eslint.lintText(source, { filePath: "packages/server/src/transport/trpc/stream/socket.ts" });
  expect(forbidden.flatMap((result) => result.messages.filter((message) => message.ruleId === "orb/firehose-import-allowlist"))).toHaveLength(4);
  for (const filePath of ["packages/server/src/entry/compose/automation-watcher.ts", "packages/server/src/transport/trpc/index.ts"]) {
    const allowed = await eslint.lintText(source, { filePath });
    expect(allowed.flatMap((result) => result.messages.filter((message) => message.ruleId === "orb/firehose-import-allowlist"))).toEqual([]);
  }
});
