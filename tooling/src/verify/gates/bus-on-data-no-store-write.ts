// Gate: bus-on-data-no-store-write (UI-Gates-and-Lessons.md §11.1). A subscription `onData` /
// `onConnectionStateChange` body may route into the pure reducer, buffer through the sanctioned
// chatStream write api, or drive the invalidation/notify seam — and nothing else. A raw Zustand write
// (`.setState(`) inside the callback forks canon into an unsanctioned second store.
import type { Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";

/** The subscription-callback property names whose bodies must stay store-write-free. */
const HANDLER_NAMES = new Set(["onData", "onConnectionStateChange"]);
const STORE_WRITE_TOKEN = ".setState(";

const MESSAGE =
  "raw store write (.setState) inside a bus onData/onConnectionStateChange body — the subscription seam " +
  "buffers through the chatStream api + routes to the invalidation seam, never a second store " +
  "(UI-Gates-and-Lessons.md §11.1; the reducer is data/bus/apply-chat-bus-event.ts).";

/** True if `node` sits inside an `onData`/`onConnectionStateChange` handler's function body — an
 *  `onData:`/`onConnectionStateChange:` property (arrow value) or method shorthand. */
function insideHandler(node: Node): boolean {
  for (let cur = node.getParent(); cur !== undefined; cur = cur.getParent()) {
    if ((cur.isKind(SyntaxKind.PropertyAssignment) || cur.isKind(SyntaxKind.MethodDeclaration)) && HANDLER_NAMES.has(cur.getName())) {
      return true;
    }
  }
  return false;
}

export const gate = defineGate({
  id: "bus-on-data-no-store-write",
  family: "bus-on-data-no-store-write",
  authority: "ordinary",
  severity: "error",
  population: { in: ["@client"], under: ["packages/client/src/data/bus/**"] },
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: "route events into the pure reducer (data/bus/apply-chat-bus-event.ts), buffer through the chatStream api, or drive the invalidation seam — never a raw .setState.",
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.PropertyAccessExpression],
        visit: (node) => {
          if (!node.isKind(SyntaxKind.PropertyAccessExpression) || node.getName() !== "setState") {
            return;
          }
          const call = node.getParent();
          if (call?.isKind(SyntaxKind.CallExpression) === true && insideHandler(node)) {
            ctx.report.node(call, { token: STORE_WRITE_TOKEN, offset: call.getText().indexOf(STORE_WRITE_TOKEN) });
          }
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "source",
      files: { "packages/client/src/data/bus/use-chat-bus.ts": "export const sub = {\n  onData: () => {\n    useX.setState({ a: 1 });\n  },\n};\n" },
      expect: { count: 1, token: STORE_WRITE_TOKEN },
      why: "a raw .setState inside an onData body — forking canon into an unsanctioned second store (§11.1)",
    },
    {
      mode: "source",
      files: { "packages/client/src/data/bus/unrelated.ts": "export const sub = { onConnectionStateChange() { unrelated.setState({ ready: true }); } };\n" },
      expect: { count: 1, token: STORE_WRITE_TOKEN },
      why: "the syntax policy intentionally bans any dotted .setState call in either named handler, including an unrelated receiver and method shorthand",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: { "packages/client/src/data/bus/use-chat-bus-ok.ts": "export const sub = {\n  onData: () => {\n    applyChatBusEvent({});\n  },\n};\n" },
      why: "an onData body routing to the pure reducer (applyChatBusEvent) — the sanctioned shape",
    },
    {
      mode: "source",
      files: { "packages/client/src/data/bus/setup.ts": "export function init() {\n  useX.setState({ a: 1 });\n}\n" },
      why: "a .setState OUTSIDE any onData/onConnectionStateChange body (top-level) — the insideHandler false branch, passes",
    },
    {
      mode: "source",
      files: { "packages/client/src/data/bus/computed.ts": 'export const sub = { onData: () => store["setState"]({ ready: true }) };\n' },
      why: "declared limit: computed/quoted member access is outside this dotted .setState spelling policy",
    },
  ],
});
