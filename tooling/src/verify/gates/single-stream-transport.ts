// Policy: single-stream-transport (docs/history/design/sse-multiplex-spec.md §11) — a browser tab holds ONE
// SSE socket. `transport/trpc/routers/stream.ts` is the only home for a tRPC `.subscription(`; every other
// router proc that wants live delivery is a ROOM on that socket (`ROOM_SOURCES`), not a second connection.
//
// WHY A GATE AND NOT tsc: nothing in the type system notices a new `.subscription(`, and the cost is
// invisible until it is not. The 2026-08-01 starvation incident was exactly this — `useRpgBus` opened a
// THIRD always-on stream per room, 3 sockets × 2 tabs hit the browser's ~6-per-origin ceiling, and an
// unrelated `character.list` hung forever with zero errors (`a2658fbc`, spec §1).
//
// IDENTITY, NOT SPELLING: the legacy check was `callee.getName() === "subscription"`, so any object with a
// `subscription` property red as a second socket. The subject is now the procedure-builder method DECLARED
// BY `@trpc/server`, resolved through the shared type-member-origin reader off the receiver's TYPE — which
// is the only identity available, because the builder is produced by a call chain that the value walk
// correctly refuses as a dynamic terminal.
//
// AUTHORITY IS reviewed-grant, AND THE LEDGER IS THE GRANT TABLE. Both legacy tables were recurring
// PERMISSIONS: the one-socket home (`routers/stream.ts`'s own `connect`) and the permanent
// `chat.impersonateStream` exemption (owner ruling, spec §14 decision 2 — request-scoped,
// user-gesture-initiated, at most one at a time, and its abort semantics ARE the socket teardown). Each is
// one exact `(subject, operation)` row keyed on the PROC, so the fold ledger keeps its per-proc grain: the
// six staged rows deleted during the S1–S5 fold cannot be "just added back", and a fold that ships without
// deleting its row leaves that row consumed zero times, which is the central STALE alarm. That is the legacy
// two-sided arm, owned centrally and no longer anchored on a hand-picked real-tree file.
import type { Node as MorphNode, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { classifyOriginRefusal } from "../lib/origin-verdict.ts";
import { readMemberReference } from "../lib/reference-fact.ts";
import { declaredByPackage, resolveTypeMemberOrigin } from "../lib/type-member-origin.ts";
import { rpcLookalikeProof, trpcServerProof } from "./_proof/server-vendors.ts";

const SUBSCRIPTION_MEMBER = "subscription";
const TRPC_SERVER = "@trpc/server";
const OPERATION_PREFIX = "sse-subscription";

const MESSAGE =
  "a tRPC `.subscription(` outside transport/trpc/routers/stream.ts — a browser allows ~6 concurrent " +
  "connections per origin and every SSE subscription pins one for its lifetime, so a second always-on " +
  "stream re-opens the starvation class the multiplex closed (sse-multiplex-spec.md §11).";
const FIX =
  "make it a ROOM on the multiplexed socket: add the channel to `@orb/contracts/stream` plus a `ROOM_SOURCES` entry (transport/trpc/stream/room-sources.ts) and have the client use `useBusRoom`. Only stream.ts may open the socket.";

/** The proc this `.subscription(` declares: the object-literal property the whole builder chain is assigned
 *  to (`stream: authedProcedure.input(…).subscription(…)`). A chain that is not a router property has no
 *  proc identity, and its operation falls back to the bare prefix rather than being dropped. */
function procName(node: MorphNode): string | undefined {
  const assignment = node.getFirstAncestorByKind(SyntaxKind.PropertyAssignment);
  if (assignment === undefined) {
    return;
  }
  const name = assignment.getNameNode();
  if (Node.isIdentifier(name)) {
    return name.getText();
  }
  return Node.isStringLiteral(name) || Node.isNoSubstitutionTemplateLiteral(name) ? name.getLiteralText() : undefined;
}

/** Is this call the tRPC procedure builder's own `subscription` method? Fail-closed on an unreadable
 *  receiver; a `subscription` property that PROVABLY belongs to another declaration is not a subject. */
function opensSocket(callee: MorphNode): boolean {
  const origin = resolveTypeMemberOrigin(callee);
  if (origin.kind === "unresolved") {
    return classifyOriginRefusal(origin.reason, callee) === "unreadable";
  }
  return declaredByPackage(origin.value.declarations, TRPC_SERVER);
}

export const gate = defineGate({
  id: "single-stream-transport",
  family: "single-stream-transport",
  authority: "reviewed-grant",
  severity: "error",
  population: { in: ["@server"], under: ["packages/server/src/transport/trpc/routers/**"] },
  analysis: "types",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const opened = new Map<string, { readonly node: MorphNode; readonly subject: string; readonly operation: string }>();
    return {
      visitors: [
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node, sourceFile: SourceFile) => {
            if (!Node.isCallExpression(node)) {
              return;
            }
            const callee = node.getExpression();
            if (!(Node.isPropertyAccessExpression(callee) || Node.isElementAccessExpression(callee))) {
              return;
            }
            const member = readMemberReference(callee);
            const isSubscription = member.kind === "resolved" && member.value.name === SUBSCRIPTION_MEMBER;
            if (!(isSubscription && opensSocket(callee))) {
              return;
            }
            const subject = ctx.relativePath(sourceFile);
            const proc = procName(node);
            const operation = proc === undefined ? OPERATION_PREFIX : `${OPERATION_PREFIX}:${proc}`;
            // One finding per `(subject, operation)`: the ledger's grain is the PROC, so two subscriptions
            // in one router are two rows while a re-declared proc cannot make its own row OVER-BROAD.
            const key = `${subject} :: ${operation}`;
            if (!opened.has(key)) {
              opened.set(key, { node, subject, operation });
            }
          },
        },
      ],
      evaluate: () => {
        for (const [, found] of [...opened].toSorted(([left], [right]) => left.localeCompare(right))) {
          ctx.report.node(found.node, {
            subject: found.subject,
            operation: found.operation,
            message: `${MESSAGE} Proc: ${found.operation} in ${found.subject}.`,
            fix: FIX,
          });
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: {
        ...trpcServerProof(),
        "packages/server/src/transport/trpc/routers/probe.ts":
          'import { authedProcedure, router } from "@trpc/server";\nexport const probeRouter = router({ live: authedProcedure.subscription(() => null) });\n',
      },
      expect: { count: 1, messageIncludes: "sse-subscription:live" },
      why: "the founding shape — a bare `.subscription(` on a router that is not stream.ts; the message carries the exact grant OPERATION, which is the proc key the fold ledger is grained on",
    },
    {
      mode: "types",
      files: {
        ...trpcServerProof(),
        "packages/server/src/transport/trpc/routers/chat.ts":
          'import { authedProcedure, router } from "@trpc/server";\nexport const chatRouter = router({ streamSomethingNew: authedProcedure.input(1).subscription(() => null) });\n',
      },
      expect: { count: 1, messageIncludes: "sse-subscription:streamSomethingNew" },
      why: "the ledger is keyed on the PROC and not on the file — a NEW subscription in a router that already holds a granted proc still fires, which is what kept the S1–S5 fold honest",
    },
    {
      mode: "types",
      files: {
        ...trpcServerProof(),
        "packages/server/src/transport/trpc/routers/two.ts":
          'import { authedProcedure, router } from "@trpc/server";\nexport const twoRouter = router({\n  a: authedProcedure.subscription(() => null),\n  b: authedProcedure.subscription(() => null),\n});\n',
      },
      expect: { count: 2 },
      why: "TWO PROCS ARE TWO FINDINGS, because the grant grain is the proc: deduping to one carrier here would make a single row license a second socket it never reviewed",
    },
    {
      mode: "types",
      files: {
        ...trpcServerProof(),
        "packages/server/src/transport/trpc/routers/bracket.ts":
          'import { authedProcedure, router } from "@trpc/server";\nexport const bracketRouter = router({ live: authedProcedure["subscription"](() => null) });\n',
      },
      expect: { count: 1 },
      why: "the COMPUTED-LITERAL spelling of the same method — a `getName()` comparison could not see it at all",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/transport/trpc/routers/unreadable.ts":
          'import { authedProcedure, router } from "./missing-trpc.ts";\nexport const r = router({ live: authedProcedure.subscription(() => null) });\n',
      },
      expect: { count: 1 },
      why: "FAIL-CLOSED — a builder whose type cannot be read at all is reported rather than silently admitted; a socket budget an unreadable module can walk through is not one",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        ...trpcServerProof(),
        "packages/server/src/transport/trpc/routers/chat.ts":
          'import { authedProcedure, router } from "@trpc/server";\nexport const chatRouter = router({ getChat: authedProcedure.query(() => null) });\n',
      },
      why: "a QUERY on a router is not a socket — the arm keys on the `subscription` method of the tRPC builder, and every other verb on the same builder abstains",
    },
    {
      mode: "types",
      files: {
        ...trpcServerProof(),
        ...rpcLookalikeProof(),
        "packages/server/src/transport/trpc/routers/lookalike.ts":
          'import { authedProcedure, router } from "rpc-lookalike";\nexport const lookalikeRouter = router({ live: authedProcedure.subscription(() => null) });\n',
      },
      why: "THE PACKAGE COUNTERFACTUAL — a DIFFERENT package exporting the same builder shape and the same method name opens no tRPC socket. Deleting the `declaredByPackage` comparison turns this row red, which is what proves the identity was resolved and not spelled",
    },
    {
      mode: "types",
      files: {
        ...trpcServerProof(),
        "packages/server/src/transport/trpc/routers/local-object.ts":
          'import { router } from "@trpc/server";\nconst feed = {\n  subscription(resolver: () => unknown): unknown {\n    return resolver();\n  },\n};\nexport const feedRouter = router({ live: feed.subscription(() => null) });\n',
      },
      why: "a LOCAL object with a `subscription` method is provably a different declaration, so it is not a subject rather than being excused — the legacy name comparison red it",
    },
  ],
});
