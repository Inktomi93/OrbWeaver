// Gate: single-stream-transport (docs/design/sse-multiplex-spec.md §11) — a browser tab holds ONE SSE
// socket. `transport/trpc/routers/stream.ts` is the only home for `.subscription(`; every other router proc
// that wants live delivery is a ROOM on that socket (`ROOM_SOURCES`), not a second connection.
//
// WHY A GATE AND NOT tsc: nothing in the type system notices a new `.subscription(` — and the cost is
// invisible until it isn't. The 2026-08-01 starvation incident was exactly this: `useRpgBus` legitimately
// opened a THIRD always-on stream per room, 3 sockets × 2 tabs hit the browser's ~6-per-origin ceiling, and
// an unrelated `character.list` hung forever with zero errors (`a2658fbc`,
// docs/design/sse-multiplex-spec.md §1). The fix was a per-hook discipline the NEXT always-on stream would
// have to re-learn. This is the ratchet that turns that discipline into physics — and that keeps the
// staged fold from silently un-folding.
//
// THE EXEMPT MAP IS THE FOLD LEDGER, AND THE STAGED HALF OF IT IS NOW EMPTY (S5). Each entry is
// `<router>.<proc>` → why it is still a standalone subscription. Six rows lived here while the fold ran
// (`sessions.streamUserEvents` + `rpg.stream` at S1, `chat.streamMessages` at S2,
// `notifications.notifications` at S3, `automation.stream` at S4, `workloads.subscribe` at S5); each was
// deleted by the commit that folded its room, so re-introducing any folded proc goes RED with no way to
// "just add it back to the list" without reverting a shipped stage.
//
// ONE entry remains and it is PERMANENT, not pending: `chat.impersonateStream` (owner ruling, spec §14
// decision 2 — request-scoped, user-gesture-initiated, at most one at a time, and its abort semantics ARE the
// socket teardown; folding it would mean modelling "detach = cancel generation"). A NEW row in this map is
// therefore a spec amendment, never a build step.
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

const ROUTERS_DIR = /\/packages\/server\/src\/transport\/trpc\/routers\//u;
const STREAM_ROUTER = /\/packages\/server\/src\/transport\/trpc\/routers\/stream\.ts$/u;
const ROUTER_NAME_RE = /\/routers\/(?<router>[^/]+)\.ts$/u;

/** `<router>.<proc>` → the cited reason it is not (yet) a room on the ONE socket. */
const EXEMPT: Readonly<Record<string, string>> = {
  // PERMANENT (spec §14 decision 2) — and, since S5, the ONLY exemption. Every STAGED row is gone with the
  // room it named, so re-adding any of the six folded procs goes RED.
  "chat.impersonateStream": "request-scoped + user-gesture-initiated, at most one at a time; detach would have to mean 'cancel generation' (spec §14.2)",
};

const MESSAGE =
  "a `.subscription(` outside transport/trpc/routers/stream.ts — a browser allows ~6 concurrent connections per origin and every SSE subscription pins one for its lifetime, so a second always-on stream re-opens the starvation class the multiplex closed (docs/design/sse-multiplex-spec.md §11).";

/** The proc key this `.subscription(` call declares: the router file's name + the object-literal property
 *  the whole builder chain is assigned to (`stream: authedProcedure.input(…).subscription(…)`). */
function procKeyOf(node: Node, filePath: string): string | undefined {
  const router = ROUTER_NAME_RE.exec(filePath)?.groups?.["router"];
  const prop = node.getFirstAncestorByKind(SyntaxKind.PropertyAssignment);
  const name = prop?.getNameNode().getText().replaceAll('"', "").replaceAll("'", "");
  return router === undefined || name === undefined ? undefined : `${router}.${name}`;
}

export const gate: GateDescriptor = {
  name: "single-stream-transport",
  docRow: "docs/design/sse-multiplex-spec.md §11",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: "make it a ROOM on the multiplexed socket: add the channel to `@orb/contracts/stream` + a `ROOM_SOURCES` entry (transport/trpc/stream/room-sources.ts), and have the client use `useBusRoom`. Only stream.ts may call `.subscription(`.",
  scanRoot: (p) => ROUTERS_DIR.test(`/${p}`) && !STREAM_ROUTER.test(`/${p}`),
  kinds: [SyntaxKind.CallExpression],
  visit: (node, sf, ctx) => {
    if (!Node.isCallExpression(node)) {
      return;
    }
    const callee = node.getExpression();
    if (!(Node.isPropertyAccessExpression(callee) && callee.getName() === "subscription")) {
      return;
    }
    const key = procKeyOf(node, sf.getFilePath());
    if (key !== undefined && key in EXEMPT) {
      return;
    }
    ctx.report(callee.getNameNode());
  },
  mustFlag: [
    {
      files: "export const probeRouter = t.router({\n  live: authedProcedure.subscription(() => source()),\n});\n",
      at: "packages/server/src/transport/trpc/routers/probe.ts",
      why: "a bare `.subscription(` on a router that is not stream.ts and is not in the cited EXEMPT map — a second always-on socket",
    },
    {
      files: "export const chatRouter = t.router({\n  streamSomethingNew: authedProcedure.subscription(() => source()),\n});\n",
      at: "packages/server/src/transport/trpc/routers/chat.ts",
      why: "an EXEMPT map keyed on `<router>.<proc>`, not on the file — a NEW subscription in an exempted router's file still fires",
    },
  ],
  mustPass: [
    {
      files: "export const streamRouter = t.router({\n  connect: authedProcedure.subscription(() => socket()),\n});\n",
      at: "packages/server/src/transport/trpc/routers/stream.ts",
      why: "the ONE home — stream.ts is where `.subscription(` is supposed to live",
    },
    {
      files: "export const chatRouter = t.router({\n  impersonateStream: authedProcedure.subscription(() => deltas()),\n});\n",
      at: "packages/server/src/transport/trpc/routers/chat.ts",
      why: "the permanently-exempt proc (spec §14 decision 2) — cited in the EXEMPT map, so it passes",
    },
    {
      files: "export const chatRouter = t.router({\n  getChat: authedProcedure.query(() => read()),\n});\n",
      at: "packages/server/src/transport/trpc/routers/chat.ts",
      why: "a query on a router — not the gate's target",
    },
  ],
};
