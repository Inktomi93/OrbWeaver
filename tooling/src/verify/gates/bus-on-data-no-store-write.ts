// Gate: bus-on-data-no-store-write (UI-Gates-and-Lessons.md §11.1). A subscription `onData` /
// `onConnectionStateChange` body may route into the pure reducer, buffer through the sanctioned
// chatStream write api, or drive the invalidation/notify seam — and nothing else. A raw Zustand write
// (`.setState(`) inside the callback forks canon into an unsanctioned second store.
//
// THE REPORTED POSITION IS THE BARE `setState` IDENTIFIER, NOT THE `.setState(` SPELLING (fixed 2026-09-11,
// #1954). This policy is ORDINARY, so it exists to be waivable — and the ordinary marker grammar's position
// group is `\(([^()\r\n]+)\)` (lib/ordinary-waiver.ts), which CANNOT contain a paren. Reporting `.setState(`
// therefore named a position no author could ever spell: every `@orb-waive bus-on-data-no-store-write(...)`
// parsed as `malformed`, the finding survived, and an authority alarm fired. The door was shut. The offset
// is derived from the name node rather than an `indexOf` on the call text so a nested `.setState(` in an
// argument cannot steal the anchor; the token stays an exact source slice, which `locateFinding` enforces.
//
// FAMILY: a DECLARED SINGLETON, and the reason is that its subject has no second asker. Every other bus
// policy asks a question about the bus VOCABULARY — which unions exist, which members are belted, which
// members have a producer — and reads it from a shared fact (`lib/bus-definition-fact.ts`,
// `lib/bus-fact.ts`). This one asks nothing about the vocabulary at all: it is a pure SYNTAX fence over one
// callback's body inside one directory, and it would not be improved by a reader. A shared theme ("bus") is
// explicitly not a family (§5b.4), which is why it does not join `bus-definition` or `bus-fact`.
//
// POPULATION PORT: byte-identical. The legacy descriptor's `scanRoot` was
// `(p) => p.includes("packages/client/src/data/bus/")` (`45743d76d^:tooling/src/verify/gates/
// bus-onData-no-store-write.ts:35`); the final population is `{ in: ["@client"], under:
// ["packages/client/src/data/bus/**"] }`, the same prefix expressed in the algebra. The `under:` subtree is
// the SUBSCRIPTION SEAM's own directory — the only place a bus `onData` is wired — so the fence is a
// statement about where the subject lives, not a narrowing of the law.
//
// The legacy `bus-onData-no-store-write` descriptor is at `45743d76d^` (the mechanical-gate conversion
// commit deleted the camelCase file and landed this one). The SHA this header carried until #2047
// (`2f3f070c693f54f0f482c067b8627f21efec9da6`) named a later unrelated checkpoint commit where NEITHER
// filename exists — a citation that resolved to nothing, found by `git cat-file -e`.
import type { Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";

/** The subscription-callback property names whose bodies must stay store-write-free. */
const HANDLER_NAMES = new Set(["onData", "onConnectionStateChange"]);
/** The waivable position token: the bare property name, free of the parens the marker grammar forbids. */
const POSITION_TOKEN = "setState";

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
  fix:
    "route events into the pure reducer (data/bus/apply-chat-bus-event.ts), buffer through the chatStream " +
    "api, or drive the invalidation seam — never a raw .setState. A deliberate site is waived with " +
    "`@orb-waive bus-on-data-no-store-write(<position>): <reason>` on the line above, where <position> is " +
    "the literal `setState` — the bare property name, free of the parens the marker grammar forbids.",
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
            ctx.report.node(call, { token: POSITION_TOKEN, offset: node.getNameNode().getStart() - call.getStart() });
          }
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "source",
      files: { "packages/client/src/data/bus/use-chat-bus.ts": "export const sub = {\n  onData: () => {\n    useX.setState({ a: 1 });\n  },\n};\n" },
      expect: { count: 1, token: POSITION_TOKEN },
      why: "a raw .setState inside an onData body — forking canon into an unsanctioned second store (§11.1)",
    },
    {
      mode: "source",
      files: { "packages/client/src/data/bus/unrelated.ts": "export const sub = { onConnectionStateChange() { unrelated.setState({ ready: true }); } };\n" },
      expect: { count: 1, token: POSITION_TOKEN },
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
      why: "a .setState OUTSIDE any onData/onConnectionStateChange body (top-level) — the insideHandler false branch, passes. THIS ROW IS CARRIED BY THE NODE-KIND HALF ALONE: `init()` is a FunctionDeclaration, so it has no PropertyAssignment/MethodDeclaration ancestor at all and this row reds with `HANDLER_NAMES` deleted. The two rows below split the fence's other halves apart",
    },
    {
      mode: "source",
      files: { "packages/client/src/data/bus/other-handler.ts": "export const sub = {\n  onError: () => {\n    useX.setState({ a: 1 });\n  },\n};\n" },
      why: "§4.1 NARROWING (WHICH HANDLER): `HANDLER_NAMES.has(cur.getName())`. A raw .setState inside a subscription callback this policy does NOT name — `onError` is an error path, not the canon-carrying data path — passes. The fence was unpinned before #2047: `mustPass[1]` above reds on the node-KIND half alone, so deleting the handler-NAME set left every row green and the policy would have banned .setState in EVERY object-literal method in the directory",
    },
    {
      mode: "source",
      files: { "packages/client/src/data/bus/replace.ts": "export const sub = {\n  onData: () => {\n    useX.replace({ a: 1 });\n  },\n};\n" },
      why: '§4.1 NARROWING (WHICH MEMBER): `node.getName() !== "setState"`. A different store member inside a NAMED handler passes — `.setState` identity is the whole policy, and with the name fence cut this row dies as a PASS TOOL ERROR rather than a finding, because the reported `token: "setState"` stops being an exact slice of the anchored call',
    },
    {
      mode: "source",
      files: {
        "packages/client/src/data/bus/ref.ts": "export const sub = {\n  onData: () => {\n    const write = useX.setState;\n    void write;\n  },\n};\n",
      },
      why: "§4.1 NARROWING (THE CALL SITE): `call?.isKind(CallExpression)`. A bare `.setState` REFERENCE inside a named handler is not a write — handing the function to something else is a different (and far rarer) shape than invoking it here, and this policy bans the invocation",
    },
    {
      mode: "source",
      files: { "packages/client/src/data/bus/computed.ts": 'export const sub = { onData: () => store["setState"]({ ready: true }) };\n' },
      why: "declared limit: computed/quoted member access is outside this dotted .setState spelling policy",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/data/bus/waived.ts":
          "export const sub = {\n  onData: () => {\n" +
          "    // @orb-waive bus-on-data-no-store-write(setState): the proof's stand-in reason and its end condition.\n" +
          "    useX.setState({ a: 1 });\n  },\n};\n",
      },
      why: "POSITIVE IDENTITY (#1954): the marker an author would actually write — `setState`, the position this policy reports — binds to the flagged call and suppresses it. Self-checking: a paren-bearing or otherwise unspellable position would come back `malformed`, a wrong name `dead-position`, a non-flagging fixture `stale`, and every one of those raises an authority alarm that fails this arm.",
    },
  ],
});
