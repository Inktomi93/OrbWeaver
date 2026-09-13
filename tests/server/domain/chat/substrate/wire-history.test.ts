// `substrate/wire-history` — the ONE CONVERT home, pinned at its own seam rather than only through the two
// callers that consume it (`engine/pipeline.ts`'s turn and `verbs/read.ts`'s previews).
//
// What matters here is the CONTRACT the fit depends on (#1434 / #1540): `wireCostRows` returns the WIRE text,
// so a stored card is priced as its stub, a `:::choices` block is priced as nothing, and a resolved media part
// contributes no prompt text at all — while the row's canon IDENTITY (`messageId`) survives the conversion,
// because that id IS the boundary the transcript divider draws and the turn stamps. The per-span rules
// themselves are pinned through the pipeline (`tests/server/domain/chat/engine/pipeline.test.ts`); this file
// pins the COST projection and the index alignment the fit's `droppedCount` slice relies on.

import type { MessageView } from "@orb/contracts/chat";
import type { ContentImageRef } from "@orb/kit/content";
import type { MessageId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { estimateTokens } from "@orb/kit/tokens";
import { buildWireHistory, wireCostRows } from "../../../../../packages/server/src/domain/chat/substrate/wire-history.ts";
import { expect, test } from "../../../../support/fixtures.ts";

type ShapedRow = Parameters<typeof buildWireHistory>[1][number];

const row = (role: "user" | "assistant", content: string, id?: string): ShapedRow => ({
  role,
  content,
  ...(id === undefined ? {} : { messageId: castId<MessageId>(id) }),
});

/** A canon double carrying only what the conversion reads off it: the id and the role (the assistant set the
 *  user-attachment rule needs). */
// @orb-waive no-test-fabrication(unknown): slim canon double — `buildWireHistory` reads `id` and `role` off a canon row and nothing Ends when this deliberate test boundary can be expressed without a fabricated typed value.
// else (see its `assistantMessageIds` fold); a full MessageView factory would hide that narrowness.
const canonRow = (id: string, role: "user" | "assistant"): MessageView => ({ id: castId<MessageId>(id), role }) as unknown as MessageView;

const NO_CANON: readonly MessageView[] = [];

/** The env every test below shares: no vision, no video, a resolver that must never be reached (no
 *  attachments in these fixtures), and NO card window — the non-game default (ABSENT ≠ ZERO). */
const env = {
  visionOk: false,
  videoOk: false,
  resolveImageUrl: (_ref: ContentImageRef): Promise<null> => Promise.reject(new Error("resolveImageUrl must not be reached")),
  cardKeepLastX: undefined,
  canon: NO_CANON,
};

const CARD = ':::card title="Ashfell Market"\n<div>'.concat("blob ".repeat(400), "</div>\n:::");

test("a stored card is PRICED as its wire stub, not as its stored body (the #1540 defect, at the seam)", async () => {
  const converted = await buildWireHistory({ ...env, cardKeepLastX: 0, canon: [canonRow("message_1", "assistant")] }, [row("assistant", CARD, "message_1")]);

  const cost = wireCostRows(converted);
  expect(cost[0]?.content).toBe("[card: Ashfell Market]");
  // The whole point: the number the fitter sees is two orders of magnitude below the stored body's.
  expect(estimateTokens(cost[0]?.content ?? "")).toBeLessThan(estimateTokens(CARD) / 10);
});

test("a card rides FULL inside the keep-last-X window, and is priced at its real bytes there", async () => {
  const canon = [canonRow("message_1", "assistant"), canonRow("message_2", "assistant")];
  const converted = await buildWireHistory({ ...env, cardKeepLastX: 1, canon }, [row("assistant", CARD, "message_1"), row("assistant", CARD, "message_2")]);

  const cost = wireCostRows(converted);
  expect(cost[0]?.content).toBe("[card: Ashfell Market]"); // outside the window ⇒ stubbed
  expect(cost[1]?.content).toContain("blob blob"); // the newest card ⇒ whole
});

test("a CHOICES block costs nothing — it never rides the wire (the CYOA fence)", async () => {
  const body = "pick one\n:::choices\n1. go north\n2. go south\n:::";
  const converted = await buildWireHistory({ ...env, canon: [canonRow("message_1", "assistant")] }, [row("assistant", body, "message_1")]);

  expect(wireCostRows(converted)[0]?.content).toBe("pick one\n");
});

test("the cost row KEEPS the canon identity — the id the fit turns into a context boundary", async () => {
  const converted = await buildWireHistory({ ...env, cardKeepLastX: 0, canon: [canonRow("message_7", "assistant")] }, [
    row("user", "a synthetic tail"),
    row("assistant", CARD, "message_7"),
  ]);

  const cost = wireCostRows(converted);
  // Order and arity are preserved 1:1 — the pipeline recovers the kept WIRE rows by slicing this same array
  // at `fitted.droppedCount`, which is only sound while the two arrays are index-aligned.
  expect(cost).toHaveLength(2);
  expect(cost[0]?.messageId).toBeUndefined();
  expect(cost[1]?.messageId).toBe(castId<MessageId>("message_7"));
});
