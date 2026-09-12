// A surface composes; verb dispatch lives in `features/chat/hooks/`. A `trpc.chat.<verb>.mutationOptions`
// written at a surface call site is the verb escaping its hook home (UI-Architecture-and-Layout.md §2.1).
//
// THE SUBJECT IS A tRPC MUTATION DECORATION ON THE CHAT ROUTER, and both halves are resolved rather than
// spelled. The legacy gate walked three PropertyAccess hops and compared `rootExpr.getText() === "trpc"`,
// so it required the proxy to be spelled exactly `trpc` at the call site and accepted ANY object shaped
// like that — the manifest's own row: "exact `trpc.chat.*.mutationOptions` spelling misses
// aliases/destructure/namespace and can match shadows".
//
// The proxy is never a module export here — every real call site gets it from `useTRPC()` or as a callback
// PARAMETER, which is exactly why the value-origin reader cannot answer and the TYPE identity must. So:
//   · `mutationOptions` must be a property declared by `@trpc/tanstack-react-query`;
//   · the chain ROOT's type must be that package's `TRPCOptionsProxy`;
//   · the first router segment under the root must be `chat` — and once the chain is proven tRPC, that
//     segment name IS the router's name, so reading it is identity, not spelling.
//
// THREE ANSWERS: a proven chat mutation is the finding; a proven non-tRPC `mutationOptions` passes; a
// candidate whose chain cannot be placed is REPORTED as unreadable (GATE-AUTHORING §5, #944).
// FAMILY: a singleton under its own id. `trpc-proxy-origin` named the `lib/type-member-origin.ts` reader this policy
// shares in spirit with the rest of the canonical-origin client family, but no second FINAL policy declares it, and
// the loader law (lib/policy-module.ts) refuses a lone member whose `family` is not its id — first applied to this
// module by the mixed door (#1584 §5). Re-declare the shared family when a second member lands.
import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { classifyOriginRefusal } from "../lib/origin-verdict.ts";
import { readMemberReference } from "../lib/reference-fact.ts";
import { declaredByPackage, resolveTypeIdentityOrigin, resolveTypeMemberOrigin } from "../lib/type-member-origin.ts";
import { LOOKALIKE_HOME, trpcProxyProof, vendorLookalikeProof } from "./_proof/client-vendors.ts";

const MUTATION_OPTIONS = "mutationOptions";
const CHAT_ROUTER = "chat";
const TRPC_PROXY_PACKAGE = "@trpc/tanstack-react-query";
const PROXY_TYPE = "TRPCOptionsProxy";
const SURFACES = "**/features/*/surfaces/**";

const MESSAGE =
  "trpc.chat.<verb>.mutationOptions outside the sanctioned verb-hook home — push the verb into features/chat/hooks/use-chat-verbs.ts (or use-chat-injection-verbs.ts / use-draft-chat-actions.ts / use-recent-chats-actions.ts depending on scope), and call the verb from this surface. See UI-Architecture-and-Layout.md §2.1 (surfaces compose; verb dispatch lives in hooks/).";
const UNREADABLE =
  "this surface reads a tRPC `mutationOptions` whose proxy chain the checker cannot place, so whether it is the CHAT router's verb CANNOT be established. Reported rather than passed: the spelling alone is not the identity.";

/** The router segment names between the proxy root and this member, plus the root expression itself.
 *  Walks DOWN the delivered node's own receiver chain — bounded navigation on one node, no traversal. */
function proxyChain(access: MorphNode): { readonly root: MorphNode; readonly segments: readonly string[] } | undefined {
  const segments: string[] = [];
  let current = access;
  for (;;) {
    const read = readMemberReference(current);
    if (read.kind === "unresolved") {
      return;
    }
    segments.unshift(read.value.name);
    const receiver = read.value.receiver;
    if (!(Node.isPropertyAccessExpression(receiver) || Node.isElementAccessExpression(receiver))) {
      return { root: receiver, segments };
    }
    current = receiver;
  }
}

function isProxyRoot(root: MorphNode): boolean {
  const identity = resolveTypeIdentityOrigin(root);
  return identity.kind === "resolved" && identity.value.name === PROXY_TYPE && declaredByPackage(identity.value.declarations, TRPC_PROXY_PACKAGE);
}

export const gate = defineGate({
  id: "no-chat-trpc-in-surface",
  family: "no-chat-trpc-in-surface",
  authority: "ordinary",
  severity: "error",
  population: { in: ["@authored"], under: [SURFACES] },
  analysis: "types",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix:
    "move the verb into features/chat/hooks/ and call the verb hook from this surface. A deliberate site is " +
    "waived with `@orb-waive no-chat-trpc-in-surface(<position>): <reason>` on the line above, where " +
    "<position> is the literal `mutationOptions` — the tRPC member at the end of the call chain.",
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.PropertyAccessExpression, SyntaxKind.ElementAccessExpression],
        visit: (node): void => {
          const read = readMemberReference(node);
          if (read.kind === "unresolved" || read.value.name !== MUTATION_OPTIONS) {
            return;
          }
          const anchor = { token: MUTATION_OPTIONS, offset: Math.max(node.getText().lastIndexOf(MUTATION_OPTIONS), 0) };
          const member = resolveTypeMemberOrigin(node);
          if (member.kind === "unresolved") {
            if (classifyOriginRefusal(member.reason, node) === "unreadable") {
              ctx.report.node(node, { message: UNREADABLE, ...anchor });
            }
            return;
          }
          if (!declaredByPackage(member.value.declarations, TRPC_PROXY_PACKAGE)) {
            return;
          }
          const chain = proxyChain(node);
          if (chain === undefined || !isProxyRoot(chain.root)) {
            ctx.report.node(node, { message: UNREADABLE, ...anchor });
            return;
          }
          if (chain.segments[0] === CHAT_ROUTER) {
            ctx.report.node(node, anchor);
          }
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "types",
      files: {
        ...trpcProxyProof(),
        "packages/client/src/features/chat/surfaces/some-surface.tsx":
          'import { useTRPC } from "@trpc/tanstack-react-query";\nexport function Surface(): unknown {\n  const trpc = useTRPC();\n  return trpc.chat.send.mutationOptions();\n}\n',
      },
      expect: { count: 1, token: "mutationOptions" },
      why: "the founding shape — a chat verb's mutationOptions written at a surface instead of in features/chat/hooks/",
    },
    {
      mode: "types",
      files: {
        ...trpcProxyProof(),
        "packages/client/src/features/chat/surfaces/some-surface.tsx":
          'import { useTRPC } from "@trpc/tanstack-react-query";\nexport function Surface(): unknown {\n  const api = useTRPC();\n  return api.chat.send.mutationOptions();\n}\n',
      },
      expect: { count: 1 },
      why: "THE PROXY UNDER ANOTHER NAME: the legacy check required the root identifier to be spelled `trpc`, so renaming the binding was a one-character escape. The resolved proxy TYPE carries the identity instead",
    },
    {
      mode: "types",
      files: {
        ...trpcProxyProof(),
        "packages/client/src/features/chat/surfaces/some-surface.tsx":
          'import type { TRPCOptionsProxy } from "@trpc/tanstack-react-query";\nexport const options = (trpc: TRPCOptionsProxy): unknown => trpc.chat.send.mutationOptions();\n',
      },
      expect: { count: 1 },
      why: "THE CALLBACK PARAMETER shape the codebase actually uses (`options: (trpc) => trpc.x.y.mutationOptions()`): the proxy is a parameter, so it has no module origin at all and only its TYPE can identify it",
    },
    {
      mode: "types",
      files: {
        ...trpcProxyProof(),
        "packages/client/src/features/chat/surfaces/some-surface.tsx":
          'import { useTRPC } from "@trpc/tanstack-react-query";\nexport function Surface(): unknown {\n  const trpc = useTRPC();\n  return trpc["chat"]["send"]["mutationOptions"]();\n}\n',
      },
      expect: { count: 1 },
      why: "the fully COMPUTED-LITERAL chain is the same reference — the shared member reader normalizes each hop, where the legacy three-hop PropertyAccess walk was offered nothing (#1506)",
    },
    {
      mode: "types",
      files: {
        ...trpcProxyProof(),
        "packages/client/src/features/chat/surfaces/local-root.tsx":
          'import type { DecorateMutationProcedure } from "@trpc/tanstack-react-query";\n' +
          "declare const local: { chat: { send: DecorateMutationProcedure } };\n" +
          "export const go = (): unknown => local.chat.send.mutationOptions();\n",
      },
      expect: { count: 1, messageIncludes: "CANNOT be established" },
      why: "#1989/D2 — `isProxyRoot` (:61-64), PROVEN: `mutationOptions` is a proven trpc-declared member, but its CHAIN ROOT (`local`) is not the resolved `TRPCOptionsProxy`, so whether this is the chat router's verb CANNOT be established. Cutting `isProxyRoot` down to `identity.kind === 'resolved'` leaves this fixture at the SAME count with the ORDINARY message instead — a count-only row is blind to that, so this row also closes the unreadable arm (#1990/D1) for the same fixture",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        ...trpcProxyProof(),
        "packages/client/src/features/chat/hooks/use-chat-verbs.ts":
          'import { useTRPC } from "@trpc/tanstack-react-query";\nexport function useSend(): unknown {\n  return useTRPC().chat.send.mutationOptions();\n}\n',
        "packages/client/src/features/chat/surfaces/some-surface.tsx":
          'import { useSend } from "../hooks/use-chat-verbs.ts";\nexport function Surface(): unknown {\n  return useSend();\n}\n',
      },
      why: "SCOPE plus the sanctioned shape — the verb lives in hooks/ (outside the population) and the surface calls it",
    },
    {
      mode: "types",
      files: {
        ...trpcProxyProof(),
        "packages/client/src/features/databank/surfaces/some-surface.tsx":
          'import { useTRPC } from "@trpc/tanstack-react-query";\nexport function Surface(): unknown {\n  return useTRPC().databank.create.mutationOptions();\n}\n',
      },
      why: "ANOTHER ROUTER is untouched — this law fences the chat verb home, and the segment is read off a chain already proven to be the tRPC proxy",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/chat/surfaces/some-surface.tsx":
          "interface Verb {\n  mutationOptions(): unknown;\n}\ninterface LocalApi {\n  chat: { send: Verb };\n}\nexport const options = (api: LocalApi): unknown => api.chat.send.mutationOptions();\n",
      },
      why: "SAME SHAPE, LOCAL TYPE: an object literally spelled `x.chat.send.mutationOptions()` is not the tRPC proxy. The legacy walk accepted anything whose root identifier read `trpc`, which is the shadow the manifest recorded",
    },
    {
      mode: "types",
      files: {
        ...vendorLookalikeProof(),
        "packages/client/src/features/chat/surfaces/some-surface.tsx":
          'import { useTRPC } from "vendor-lookalike";\nexport function Surface(): unknown {\n  return useTRPC().chat.send.mutationOptions();\n}\n',
      },
      why: `SAME CHAIN, WRONG PACKAGE: a proxy declared in ${LOOKALIKE_HOME} — same type name, same router, same member — is not this app's tRPC surface, and only the declaring package separates them`,
    },
    {
      mode: "types",
      files: {
        ...trpcProxyProof(),
        "packages/client/src/features/chat/surfaces/some-surface.tsx":
          'import { useTRPC } from "@trpc/tanstack-react-query";\nexport function Surface(): unknown {\n  const trpc = useTRPC();\n  // @orb-waive no-chat-trpc-in-surface(mutationOptions): the proof\'s stand-in reason; ends when this fixture stops flagging.\n  return trpc.chat.send.mutationOptions();\n}\n',
      },
      why: "POSITIONAL IDENTITY: the anchor is `{ token: MUTATION_OPTIONS, offset: node.getText().lastIndexOf(MUTATION_OPTIONS) }`, so an author waives the tRPC MEMBER (`mutationOptions`) at the end of the chain — never the proxy binding, the `chat` router segment, or the verb name. The fixture is mustFlag[0] (:111, count 1) plus the marker line; the marker suppresses the finding that row proves this fixture produces, and it ends if that row changes",
    },
  ],
});
