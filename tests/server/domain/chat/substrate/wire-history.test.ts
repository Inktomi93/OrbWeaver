// `substrate/wire-history` — the ONE CONVERT home, pinned at its own seam rather than only through the two
// callers that consume it (`engine/pipeline.ts`'s turn and `verbs/read.ts`'s previews).
//
// What matters here is the CONTRACT the fit depends on (#1434 / #1540): `wireCostRows` returns the WIRE text,
// so a stored card is priced as its stub, a `:::choices` block is priced as nothing, and a resolved media part
// contributes no prompt text at all — while the row's canon IDENTITY (`messageId`) survives the conversion,
// because that id IS the boundary the transcript divider draws and the turn stamps. The per-span rules
// themselves are pinned through the pipeline (`tests/server/domain/chat/engine/pipeline.test.ts`); this file
// pins the COST projection and the index alignment the fit's `droppedCount` slice relies on.

import type { ChatReasoningPart, MessageView } from "@orb/contracts/chat";
import type { ContentImageRef } from "@orb/kit/content";
import type { AssetId, MessageId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { estimateTokens } from "@orb/kit/tokens";
import { buildWireHistory, wireCostRows } from "../../../../../packages/server/src/domain/chat/substrate/wire-history.ts";
import { expect, test } from "../../../../support/fixtures.ts";

type ShapedRow = Parameters<typeof buildWireHistory>[1][number];
type WireHistoryEnv = Parameters<typeof buildWireHistory>[0];

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
  // §8.8: empty = the `off`/`tool-chain` rungs (the engine performs no read below `conversation`).
  reasoningByMessage: new Map<MessageId, readonly ChatReasoningPart[]>(),
  // §6.7: the inline-reply origin set. THROWS by default, which is itself a pin — the load is DEMAND-DRIVEN
  // and a history with no assistant-row `asset:` span must never perform it (see the "asks nothing" test).
  loadInlineReplyAssetIds: (): Promise<never> => Promise.reject(new Error("loadInlineReplyAssetIds must not be reached")),
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

// ── §8.8 `conversation` carry: a prior turn's own thinking materialized back onto its assistant row ──────
// The load-bearing property is ORDER. Anthropic requires the `thinking` block at the HEAD of an assistant
// turn and both hosted converters emit parts in array order, so thinking behind the prose is not the turn the
// model signed. These pins are at the CONVERT seam; the wire bytes that order produces are pinned against the
// real Anthropic converter in `tests/inference/backends/anthropic-messages/chat.test.ts`.

const SIGNED: ChatReasoningPart = { type: "reasoning", text: "she is lying about the map", meta: { anthropic: { signature: "SIG-9" } } };

const carried = (id: string): ReadonlyMap<MessageId, readonly ChatReasoningPart[]> =>
  new Map<MessageId, readonly ChatReasoningPart[]>([[castId<MessageId>(id), [SIGNED]]]);

test("the stored thinking rides FIRST on its assistant row — ahead of every body part", async () => {
  const converted = await buildWireHistory({ ...env, canon: [canonRow("message_1", "assistant")], reasoningByMessage: carried("message_1") }, [
    row("assistant", "The map is genuine.", "message_1"),
  ]);

  expect(converted[0]?.row.content).toEqual([SIGNED, { type: "text", text: "The map is genuine." }]);
});

test("an EMPTY carry map leaves the row byte-identical — the `off`/`tool-chain` rungs change nothing here", async () => {
  const converted = await buildWireHistory({ ...env, canon: [canonRow("message_1", "assistant")] }, [row("assistant", "The map is genuine.", "message_1")]);

  expect(converted[0]?.row.content).toEqual([{ type: "text", text: "The map is genuine." }]);
});

test("a USER row never receives thinking, even when the map names its id (the scoped-fold demotion)", async () => {
  // `shape.scopeToSpeaker` re-roles another character's assistant line to a `Name: ...` USER line. Its stored
  // thinking is still the ASSISTANT's, and replaying it on a row the wire delivers as the user speaking would
  // put the model's own reasoning in the user's mouth.
  const converted = await buildWireHistory({ ...env, canon: [canonRow("message_1", "assistant")], reasoningByMessage: carried("message_1") }, [
    row("user", "Bran: The map is genuine.", "message_1"),
  ]);

  expect(converted[0]?.row.content).toEqual([{ type: "text", text: "Bran: The map is genuine." }]);
});

test("a row whose body converted to NOTHING is not resurrected as a turn made of pure thinking", async () => {
  // A choices-only row converts to one empty text part and `dropEmptyWireRows` deletes it. Prepending
  // thinking would keep it alive as an assistant turn with a signature and no content -- which every
  // converter refuses (and which would change what the model believes it said).
  const converted = await buildWireHistory({ ...env, canon: [canonRow("message_1", "assistant")], reasoningByMessage: carried("message_1") }, [
    row("assistant", ":::choices\n1. north\n:::", "message_1"),
  ]);

  expect(converted[0]?.row.content).toEqual([{ type: "text", text: "" }]);
});

test("replayed thinking PROSE is priced by the fit — it is real prompt bytes, unlike a media URL", async () => {
  const converted = await buildWireHistory({ ...env, canon: [canonRow("message_1", "assistant")], reasoningByMessage: carried("message_1") }, [
    row("assistant", "The map is genuine.", "message_1"),
  ]);

  // A `conversation` carry the fitter priced at zero would silently overflow the window it was fitted to.
  expect(wireCostRows(converted)[0]?.content).toBe("she is lying about the mapThe map is genuine.");
});

// ── §6.7 THE INLINE-REPLY MEDIA FENCE ────────────────────────────────────────────────────────────────────
// `ridesAsModelMedia` is the one boolean between "the model sees the picture it drew last turn" and "the
// model sees every asset anyone ever generated in this room". The row it now admits — an ASSISTANT row with
// real `asset:` refs — is the exact row an `/imagine` illustration post writes today
// (`verbs/post-narrator-message.ts`, stamped `illustration`), so EVERY test below is paired: one arm proves
// the picture rides, its twin proves the look-alike does not, in the same run. A one-directional pin here
// would pass just as happily against `return true`.

const PICTURE = castId<AssetId>("asset_inline_1");
const ILLUSTRATION = castId<AssetId>("asset_imagine_1");

/** An env that CAN resolve media and whose origin set is whatever the arm declares. */
const mediaEnv = (inlineReply: ReadonlyMap<MessageId, ReadonlySet<AssetId>>, canon: readonly MessageView[]): WireHistoryEnv => ({
  ...env,
  visionOk: true,
  canon,
  resolveImageUrl: (ref) => Promise.resolve({ url: ref.kind === "asset" ? `https://cas.test/${ref.assetId}` : ref.url, media: "image" as const }),
  loadInlineReplyAssetIds: () => Promise.resolve(inlineReply),
});

const linked = (messageId: MessageId, ...assetIds: readonly AssetId[]): ReadonlyMap<MessageId, ReadonlySet<AssetId>> =>
  new Map<MessageId, ReadonlySet<AssetId>>([[messageId, new Set(assetIds)]]);

const imageMarkdown = (alt: string, assetId: AssetId): string => `![${alt}](asset:${assetId})`;

test("§6.7 BOTH DIRECTIONS: the model's own inline-reply picture RIDES, an /imagine illustration on the same row class does NOT", async () => {
  const canon = [canonRow("message_1", "assistant")];
  const shaped = [row("assistant", `She draws the map.\n\n${imageMarkdown("She draws the map", PICTURE)}`, "message_1")];

  // ARM A — the link for THIS slot and THIS asset says `inline-reply`: a real vision part.
  const rides = await buildWireHistory(mediaEnv(linked(castId<MessageId>("message_1"), PICTURE), canon), shaped);
  expect(rides[0]?.row.content).toContainEqual({ type: "image", url: `https://cas.test/${PICTURE}` });

  // ARM B — byte-identical row, byte-identical asset, and the ONLY difference is that the link is absent
  // from the origin set (which is what an `illustration` stamp means). It collapses to the display-only
  // marker and never reaches the wire's media plane.
  const held = await buildWireHistory(mediaEnv(new Map<MessageId, ReadonlySet<AssetId>>(), canon), shaped);
  expect(held[0]?.row.content).toEqual([{ type: "text", text: "She draws the map.\n\n[image: She draws the map]" }]);
  expect(JSON.stringify(held[0]?.row.content)).not.toContain(PICTURE);
});

test("§6.7 the fence is PER-ASSET, not per-row: one linked picture rides while the /imagine asset beside it stays display-only", async () => {
  // The reachable mixed row: a turn whose model drew a picture in a room that also has `/imagine` posts,
  // after an edit merged both refs onto one slot. A per-ROW relaxation would ship both.
  const canon = [canonRow("message_1", "assistant")];
  const body = `${imageMarkdown("the map", PICTURE)}\n\n${imageMarkdown("illustration", ILLUSTRATION)}`;
  const converted = await buildWireHistory(mediaEnv(linked(castId<MessageId>("message_1"), PICTURE), canon), [row("assistant", body, "message_1")]);

  const parts = converted[0]?.row.content ?? [];
  expect(parts).toContainEqual({ type: "image", url: `https://cas.test/${PICTURE}` });
  expect(JSON.stringify(parts)).not.toContain(ILLUSTRATION);
  // The unlinked asset degraded to the display-only MARKER (merged with the newline that separated them) —
  // the model learns a second picture was shown and receives none of it.
  expect(parts.filter((p) => p.type === "image")).toHaveLength(1);
  expect(parts).toContainEqual({ type: "text", text: "\n\n[image: illustration]" });
});

test("§6.7 an asset linked to ANOTHER slot cannot be laundered by spelling its id in a different assistant row", async () => {
  // The attack the (slot, asset) key exists for: `asset:` ids are readable off the transcript, so an
  // AUTHORED body — a world-info entry, an author's note, a card greeting, a spliced injection — could
  // otherwise name a picture the model really did generate elsewhere and ride it back as model input.
  // The link row is the generation's own receipt and authored prose cannot forge one.
  const canon = [canonRow("message_1", "assistant"), canonRow("message_2", "assistant")];
  const converted = await buildWireHistory(mediaEnv(linked(castId<MessageId>("message_1"), PICTURE), canon), [
    row("assistant", imageMarkdown("the map", PICTURE), "message_2"),
  ]);

  expect(converted[0]?.row.content).toEqual([{ type: "text", text: "[image: the map]" }]);
});

test("§6.7 a SYNTHETIC assistant row (no canon slot) never rides, even naming a genuinely linked asset", async () => {
  // Id-less rows are spliced injections and the regen/continue turn — authored text with no generation
  // behind it, so there is no slot whose link could vouch for the picture.
  const canon = [canonRow("message_1", "assistant")];
  const converted = await buildWireHistory(mediaEnv(linked(castId<MessageId>("message_1"), PICTURE), canon), [
    row("assistant", imageMarkdown("the map", PICTURE)),
  ]);

  expect(converted[0]?.row.content).toEqual([{ type: "text", text: "[image: the map]" }]);
});

test("§6.7 the SCOPED-FOLD demotion closes the fence: a linked picture on a row delivered as `user` does not ride", async () => {
  // `shape.scopeToSpeaker` re-roles another character's assistant line to a `Name: …` USER line. That row is
  // not the speaker's own generation any more, and the user-attachment arm requires a HUMAN author — so the
  // demotion lands in neither class. The whole reason `userAuthored` exists beside `role`.
  const canon = [canonRow("message_1", "assistant")];
  const converted = await buildWireHistory(mediaEnv(linked(castId<MessageId>("message_1"), PICTURE), canon), [
    row("user", `Bran: ${imageMarkdown("the map", PICTURE)}`, "message_1"),
  ]);

  expect(converted[0]?.row.content).toEqual([{ type: "text", text: "Bran: [image: the map]" }]);
});

test("§6.7 a HUMAN-authored row delivered as `assistant` does not ride — the link is not the only guard", async () => {
  // The belt that survives a SHAPE change: `userAuthored` is read on the assistant arm too, so a canon USER
  // row delivered under an assistant role (a prefill/impersonate re-role) cannot reach class 2 even with a
  // link present. Without this pin the clause is untestable and the next refactor deletes it as dead.
  const converted = await buildWireHistory(mediaEnv(linked(castId<MessageId>("message_1"), PICTURE), [canonRow("message_1", "user")]), [
    row("assistant", imageMarkdown("the map", PICTURE), "message_1"),
  ]);

  expect(converted[0]?.row.content).toEqual([{ type: "text", text: "[image: the map]" }]);
});

test("§6.7 an EXTERNAL http ref never rides, on an assistant row, whatever the origin set says", async () => {
  // The scheme gate is unconditional: riding one makes the PROVIDER fetch a third-party URL (the
  // tracking-pixel/exfil vector `forbidExternalMedia` exists for) for content that can change under us.
  const canon = [canonRow("message_1", "assistant")];
  const converted = await buildWireHistory(mediaEnv(linked(castId<MessageId>("message_1"), PICTURE), canon), [
    row("assistant", "![a map](https://evil.test/track.png)", "message_1"),
  ]);

  expect(converted[0]?.row.content).toEqual([{ type: "text", text: "[image: a map]" }]);
});

test("§6.7 the USER-ATTACHMENT arm is untouched — a human's own upload still rides", async () => {
  // The regression half: the relaxation must not have narrowed the class that already worked.
  const converted = await buildWireHistory(mediaEnv(new Map<MessageId, ReadonlySet<AssetId>>(), [canonRow("message_1", "user")]), [
    row("user", imageMarkdown("my reference", PICTURE), "message_1"),
  ]);

  expect(converted[0]?.row.content).toContainEqual({ type: "image", url: `https://cas.test/${PICTURE}` });
});

test("§6.7 the origin read is DEMAND-DRIVEN — a history with no assistant-row asset span never performs it", async () => {
  // The shared `env` loader REJECTS, so reaching it fails this test loudly. A text-only room (which is every
  // room until someone turns the knob on) must pay no query for a feature it never used.
  const converted = await buildWireHistory({ ...env, canon: [canonRow("message_1", "assistant")] }, [row("assistant", "No pictures here.", "message_1")]);

  expect(converted[0]?.row.content).toEqual([{ type: "text", text: "No pictures here." }]);
});
