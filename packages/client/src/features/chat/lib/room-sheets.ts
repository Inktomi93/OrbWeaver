// The room's stylesheet cascade: the `<style>` sheets its characters wrote, carried as written into the room's later
// framed replies (D354). A card's greeting, or an earlier reply, may define the classes later replies use with no
// stylesheet of their own. This generalizes the owner's greeting ruling from one row to the room: the greeting is the
// first source, and the replies a character wrote after it are sources too.
//
// WHO CONTRIBUTES: a canon row a character wrote (no member's, persona's or system row) at the sandboxed step, read off
// that row's own render policy. Its selected variant is the one read, so a swipe or an edit changes what it carries. A
// member's or a system row's sheet is a posture question, not a source.
// WHO RECEIVES: a later row, through `carriedRoomSheets`, which keeps only the sheets naming a class the reply uses.
// The receiving row's own tier decides whether it frames.
// WHAT IS READ: the rows the transcript holds and the room's head (`ROOM_HEAD_ROWS`), so the greeting carries on a
// room load whose tail no longer holds it.

import type { MessageView } from "@orb/contracts/chat";
import type { FrameStyleSheet } from "@orb/kit/content";
import { frameStyleElements, holdBlocksWhole } from "@orb/kit/content";
import type { RowRenderPolicy } from "#lib";

/** A room's first canon row has this sequence number. */
export const ROOM_FIRST_SEQ = 1;
/** The rows of the room's head read: its greeting, which may follow one opening row (a scenario or a system note). */
export const ROOM_HEAD_ROWS = 2;

/** One row's sheets, as a later row carries them. */
export interface RoomSheetSource {
  readonly seq: number;
  readonly sheets: readonly FrameStyleSheet[];
}

export type RoomSheetRow = Pick<MessageView, "id" | "seq" | "role" | "kind" | "authorUserId" | "characterId" | "content">;

// The cheap pre-read: a row with no `<style` opener holds no sheet, so most rows skip the markup read.
const STYLE_OPENER_RE = /<style/iu;

/** The room's sources in canon order, one per row (the held copy wins over the head read's): each row a character wrote at the sandboxed step that holds a
 *  stylesheet. `policyOf` is the transcript's own per-row policy, so a source's step is the one its row draws at. */
export function roomSheetSources(
  rows: readonly RoomSheetRow[],
  policyOf: (row: RoomSheetRow) => Pick<RowRenderPolicy, "cardTier">,
): readonly RoomSheetSource[] {
  const bySeq = new Map<number, RoomSheetSource>();
  for (const row of rows) {
    if (bySeq.has(row.seq) || row.role !== "assistant" || row.authorUserId !== null || row.characterId === null || !STYLE_OPENER_RE.test(row.content)) {
      continue;
    }
    if (policyOf(row).cardTier !== "tierB") {
      continue;
    }
    // Read as a frame parses it, so the sheets are the ones the row's own frame draws.
    const sheets = frameStyleElements(holdBlocksWhole(row.content));
    if (sheets.length > 0) {
      bySeq.set(row.seq, { seq: row.seq, sheets });
    }
  }
  return [...bySeq.values()].toSorted((a, b) => a.seq - b.seq);
}

/** The sheets of the sources before `seq`, in canon order: what a row at `seq` may carry. Undefined when there are none. */
export function roomSheetsBefore(sources: readonly RoomSheetSource[], seq: number): readonly FrameStyleSheet[] | undefined {
  const sheets = sources.filter((source) => source.seq < seq).flatMap((source) => source.sheets);
  return sheets.length === 0 ? undefined : sheets;
}
