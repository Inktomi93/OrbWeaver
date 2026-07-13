// biome-ignore-all lint/style/useFilenamingConvention: the gate NAME is `bus-onData-no-store-write`
// (UI-Gates-and-Lessons.md §8 + §11.1 + the reducer header) — check-gates.int.test.ts cross-checks the
// file basename against the gate name report.ts prints, so the file MUST match the documented name.
// biome-ignore-all lint/security/noSecrets: the mustFlag/mustPass example strings are TS fixture snippets
// (onData handler bodies), not secrets.
// Gate: bus-onData-no-store-write (UI-Gates-and-Lessons.md §11.1 — "the bus→cache sync seam is the
// only sanctioned SSE shape"). A subscription `onData` / `onConnectionStateChange` body may (a) route
// events into the pure reducer (`applyChatBusEvent`), (b) buffer transient progress through the
// SANCTIONED chatStream write api, and (c) drive the invalidation seam (`invalidate`/`invalidateUser`/
// `invalidateAllUserRoots`) or the notify seam — and NOTHING ELSE. It must NEVER become a second store:
// a raw Zustand write (`.setState(`) inside the callback forks canon into an unsanctioned buffer the
// reducer/seam don't know about (the exact "onData grows a second store" drift §11.1 forbids).
//
// WHAT IT FLAGS: a `.setState(` call (AST — comments don't count) lexically inside an `onData` or
// `onConnectionStateChange` function-valued property/method, in packages/client/src/data/bus/**. Pins
// today's clean shape (use-chat-bus.ts routes to `applyChatBusEvent`; use-user-bus.ts routes to
// `deps.invalidate*`) against drift.
//
// WHAT IT DELIBERATELY DOES NOT FLAG: the sanctioned calls the current bodies make —
// `applyChatBusEvent(...)`, `deps.stream.*` (the chatStream write api), `deps.invalidate*(...)`,
// `notify.*(...)` — none is a `.setState(`. The chatStream api itself lives in state/chat-stream.ts
// (whose `useChatStreamStore.setState` IS the sanctioned write, out of scope here); and who may IMPORT
// that api is the twin grit `chat-stream-writes-in-bus-only`'s job (the import-side half).
import type { Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

/** The subscription-callback property names whose bodies must stay store-write-free. */
const HANDLER_NAMES = new Set(["onData", "onConnectionStateChange"]);

const MESSAGE =
  "raw store write (.setState) inside a bus onData/onConnectionStateChange body — the subscription seam " +
  "buffers through the chatStream api + routes to the invalidation seam, never a second store " +
  "(UI-Gates-and-Lessons.md §11.1; the reducer is data/bus/apply-chat-bus-event.ts).";

/** True if `node` sits inside an `onData`/`onConnectionStateChange` handler's function body — an
 *  `onData:`/`onConnectionStateChange:` property (arrow value) or method shorthand. */
function insideHandler(node: Node): boolean {
  for (let cur = node.getParent(); cur !== undefined; cur = cur.getParent()) {
    if (
      (cur.isKind(SyntaxKind.PropertyAssignment) || cur.isKind(SyntaxKind.MethodDeclaration)) &&
      HANDLER_NAMES.has(cur.getName())
    ) {
      return true;
    }
  }
  return false;
}

// ── SINGLE-PASS CONTRACT FORM (§1.2, §8.1 batch (b)) ──────────────────────────────────────────────
// The legacy predicate as a PropertyAccessExpression subscription: a `.setState(` call lexically inside
// an onData/onConnectionStateChange handler body, in data/bus/**. scanRoot mirrors the legacy BUS_DIR
// filter. Per-occurrence (each store write in a handler).
export const gate: GateDescriptor = {
  name: "bus-onData-no-store-write",
  docRow: "UI-Gates-and-Lessons.md §11.1",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: "route events into the pure reducer (data/bus/apply-chat-bus-event.ts), buffer through the chatStream api, or drive the invalidation seam — never a raw .setState.",
  scanRoot: (p) => p.includes("packages/client/src/data/bus/"),
  kinds: [SyntaxKind.PropertyAccessExpression],
  visit: (node, _sf, ctx) => {
    if (!node.isKind(SyntaxKind.PropertyAccessExpression) || node.getName() !== "setState") {
      return;
    }
    if (node.getParent()?.isKind(SyntaxKind.CallExpression) === true && insideHandler(node)) {
      ctx.report(node, { token: ".setState(", offset: 0 });
    }
  },
  mustFlag: [
    {
      files: "export const sub = {\n  onData: () => {\n    useX.setState({ a: 1 });\n  },\n};\n",
      at: "packages/client/src/data/bus/use-chat-bus.ts",
      why: "a raw .setState inside an onData body — forking canon into an unsanctioned second store (§11.1)",
    },
  ],
  mustPass: [
    {
      files: "export const sub = {\n  onData: () => {\n    applyChatBusEvent({});\n  },\n};\n",
      at: "packages/client/src/data/bus/use-chat-bus-ok.ts",
      why: "an onData body routing to the pure reducer (applyChatBusEvent) — the sanctioned shape",
    },
    {
      files: "export function init() {\n  useX.setState({ a: 1 });\n}\n",
      at: "packages/client/src/data/bus/setup.ts",
      why: "a .setState OUTSIDE any onData/onConnectionStateChange body (top-level) — the insideHandler false branch, passes",
    },
  ],
};
