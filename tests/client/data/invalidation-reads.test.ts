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
import {
  chatCanonReads,
  chatReads,
  hiddenRevealRead,
  promptPreviewReads,
  ROOM_ENTITY_FILTERS,
  ROOM_ENTITY_HEAL_FILTERS,
  roomEntityHealReads,
  runtimeVariablesRead,
} from "../../../packages/client/src/data/invalidation-reads.ts";
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

  test("chatReads = canon + the host-reveal derivation + the RUNTIME VARIABLE FOLD + the chat list", () => {
    const trpc = trpcProxy();
    expect(paths(chatReads(trpc))).toEqual([
      ...paths(chatCanonReads(trpc)),
      ...paths(hiddenRevealRead(trpc)),
      ...paths(runtimeVariablesRead(trpc)),
      "chat.listChats",
    ]);
  });

  test("runtimeVariablesRead is the room's variable FOLD alone — never the picks pane's declarations read", () => {
    // Two different reads over two different columns: `getVariablePicks` is the host's authored picks
    // (`chats.variableValues`), `getRuntimeVariables` is the LIVE fold (`chats.runtimeVariables`) that a
    // turn's `{{setvar}}`, a `set_variable` arm and #16's gated score write all land in. The meter reads the
    // fold, so a set that carried the picks read instead would leave the dial with no driver at all.
    const got = paths(runtimeVariablesRead(trpcProxy()));
    expect(got).toEqual(["chat.getRuntimeVariables"]);
    expect(got).not.toContain("chat.getVariablePicks");
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

// ── #2494 — the live-only lane's heal, as a DERIVED set ────────────────────────────────────────────────
// The defect this pins against is not a wrong read, it is a heal that stopped growing: `chatOpened` named
// `chat.getMemberCard` by hand and stayed that way while `regex` and `databank` joined `ROOM_ENTITY_KINDS`.
// So what matters here is the SHAPE — a Record over the kind tuple, folded by `roomEntityHealReads` — and
// the property the map test cannot see: that the fold is exactly the union of the arms, for whatever the
// tuple holds today.
describe("ROOM_ENTITY_HEAL_FILTERS — the live-only lane's attach heal (#2494)", () => {
  test("is TOTAL over ROOM_ENTITY_KINDS — a new kind must state its heal, `[]` with a reason included", () => {
    expect(Object.keys(ROOM_ENTITY_HEAL_FILTERS).sort()).toEqual([...ROOM_ENTITY_KINDS].sort());
  });

  test("`roomEntityHealReads` IS the fold of every arm — derived, never a second hand-kept list", () => {
    const trpc = trpcProxy();
    expect(paths(roomEntityHealReads(CHAT_ID, trpc))).toEqual(ROOM_ENTITY_KINDS.flatMap((kind) => paths(ROOM_ENTITY_HEAL_FILTERS[kind](CHAT_ID, trpc))));
  });

  test("covers the room-public reads of every kind that has one — the card and the two racks", () => {
    const got = paths(roomEntityHealReads(CHAT_ID, trpcProxy()));
    expect(got.toSorted((left, right) => left.localeCompare(right))).toEqual(["chat.getMemberCard", "databank.listActiveForChat", "regex.listForChat"]);
  });

  test("heals NO fit/preview read — their staleness bound is one turn (#514 / BOOT-4X)", () => {
    const got = paths(roomEntityHealReads(CHAT_ID, trpcProxy()));
    for (const read of ["chat.previewContextFit", "chat.previewAssembly", "chat.getShapeTrace", "chat.previewActionTemplates"]) {
      expect(got).not.toContain(read);
    }
  });

  test("heals NO owner-scoped read — the owner's own devices ride the user bus and its reconnect heal", () => {
    const got = paths(roomEntityHealReads(CHAT_ID, trpcProxy()));
    // `regex.listScripts`/`listGlobal`, `databank.list`, `worldInfo.*`, `character.*` — and the HOST-gated
    // `chat.listEffectiveRegex`, whose only reader is the writer of the very change.
    for (const read of ["regex.listScripts", "regex.listGlobal", "databank.list", "chat.listEffectiveRegex"]) {
      expect(got).not.toContain(read);
    }
    expect(got.some((p) => p.startsWith("worldInfo") || p.startsWith("character."))).toBe(false);
  });
});
