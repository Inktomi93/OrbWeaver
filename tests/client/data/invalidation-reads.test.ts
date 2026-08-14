// The named READ SETS + the entity→room bridge's per-kind rows (`data/invalidation-reads.ts`) — the half of
// the invalidation seam that answers "which reads are these", split out of the map file. The MAP's dispatch
// is pinned against a real QueryClient in `invalidation.test.ts`; what is pinned HERE is the property that
// file cannot see: the sets' MEMBERSHIP, keyed by the tRPC path each filter carries.
//
// Why it matters that this is asserted separately: these sets are composed by many map rows, so a member
// silently dropped here changes a dozen events' behavior at once — and the dropped read then has NO freshness
// driver at all (staleTime is Infinity; the bus is the only driver), which is the frozen-surface class the
// `query-freshness-coverage` gate exists for. A test over the SETS fails at the cause; the map test fails at
// twelve symptoms.

import { createTrpcClient, createTrpcProxy } from "@orb/client/data";
import { ROOM_ENTITY_KINDS } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { QueryClient } from "@tanstack/react-query";
import { describe } from "vitest";
// Deep-imported, not through `@orb/client/data`: the package's export map is directory-barrel only
// (`./*` → `./src/*/index.ts`), and re-exporting these seam-internal helpers from the barrel would widen the
// package's public surface for a test's convenience (the `route-pending.ct.tsx` deep-import precedent).
import { chatCanonReads, chatReads, hiddenRevealRead, promptPreviewReads, ROOM_ENTITY_FILTERS } from "../../../packages/client/src/data/invalidation-reads.ts";
import { expect, test } from "../../support/fixtures.ts";

const CHAT_ID = castId<ChatId>("chat_invalidationreads");

function trpcProxy(): ReturnType<typeof createTrpcProxy> {
  return createTrpcProxy(createTrpcClient("http://localhost/api/trpc"), new QueryClient());
}

/** The dotted tRPC path each filter targets (`queryKey[0]` is the path segments array) — the readable
 *  identity of a row, and the thing a drift changes. */
function paths(filters: readonly { readonly queryKey?: readonly unknown[] }[]): string[] {
  return filters.map((f) => {
    const head = f.queryKey?.[0];
    return Array.isArray(head) ? head.join(".") : "?";
  });
}

describe("the named read sets", () => {
  test("chatCanonReads is the OPEN CHAT's canon — no `getChat`, no chat list", () => {
    const got = paths(chatCanonReads(trpcProxy()));
    expect(got).toEqual([
      "chat.listMessages",
      "chat.listMessageVariants",
      "chat.previewContextFit",
      "chat.previewAssembly",
      "chat.getShapeTrace",
      "chat.previewActionTemplates",
    ]);
    // The deliberate absences (invalidation.ts's own header states WHY): nothing in `ChatDetail` derives from
    // canon, and every row-staling transition names `getChat` explicitly on its own event.
    expect(got).not.toContain("chat.getChat");
    expect(got).not.toContain("chat.listChats");
  });

  test("chatReads = canon + the host-reveal derivation + the chat list", () => {
    const trpc = trpcProxy();
    expect(paths(chatReads(trpc))).toEqual([...paths(chatCanonReads(trpc)), ...paths(hiddenRevealRead(trpc)), "chat.listChats"]);
  });

  test("promptPreviewReads is the Preview tab's THREE reads, which must move together", () => {
    expect(paths(promptPreviewReads(trpcProxy()))).toEqual(["chat.previewAssembly", "chat.getShapeTrace", "chat.previewActionTemplates"]);
  });
});

describe("ROOM_ENTITY_FILTERS — the entity→room bridge's per-kind rows", () => {
  test("is TOTAL over ROOM_ENTITY_KINDS (the same union the server's reach table keys on)", () => {
    expect(Object.keys(ROOM_ENTITY_FILTERS).sort()).toEqual([...ROOM_ENTITY_KINDS].sort());
  });

  test("`character` carries the member card — the read the bridge was built for", () => {
    const got = paths(ROOM_ENTITY_FILTERS.character(CHAT_ID, trpcProxy()));
    expect(got).toContain("chat.getMemberCard");
    expect(got).toContain("chat.getChat");
  });

  test("no arm invalidates the canon list — an entity edit changes no message", () => {
    const trpc = trpcProxy();
    for (const kind of ROOM_ENTITY_KINDS) {
      const got = paths(ROOM_ENTITY_FILTERS[kind](CHAT_ID, trpc));
      expect(got).not.toContain("chat.listMessages");
      expect(got).not.toContain("chat.listChats");
    }
  });

  test("`world-info` touches NO owner-scoped worldInfo read — a member never holds one", () => {
    const got = paths(ROOM_ENTITY_FILTERS["world-info"](CHAT_ID, trpcProxy()));
    expect(got.some((p) => p.startsWith("worldInfo"))).toBe(false);
    expect(got).toContain("chat.previewContextFit");
  });
});
