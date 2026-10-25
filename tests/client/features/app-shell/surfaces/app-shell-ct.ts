// Node-side helpers the app-shell component specs share: story ids, accessible names and routed procedures.
// In-page probes live in `@orb/testkit/browser/spec`, where their browser callbacks typecheck.
import type { TrpcRecorder } from "@orb/testkit/ct";
import { createShellAmbientReads, ROOM_PROCEDURES, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import type { CorpusWire } from "@orb/testkit/iso";
import type { Page } from "@playwright/test";

type ServedPath = Parameters<typeof serveCorpusProcedures>[1][number];

/** Home's captured reads, plus every listed procedure answered by `caller`, a corpus root's internal caller. */
export function routeShell(page: Page, corpus: CorpusWire, caller: object, served: readonly ServedPath[]): Promise<TrpcRecorder> {
  return routeTrpc(page, { ...createShellAmbientReads(corpus), ...serveCorpusProcedures(caller, served) });
}

/** Home's captured reads plus the section set and an open room's reads, each answered by `caller`. */
export function routeRoom(page: Page, corpus: CorpusWire, caller: object): Promise<TrpcRecorder> {
  return routeTrpc(page, { ...createShellAmbientReads(corpus), ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...ROOM_PROCEDURES]) });
}

/** The first room of a `chat.listChats` page the user named, with more than one character seated. */
export function namedGroupRoom<const TRow extends { readonly title: string | null; readonly participantPortraits: readonly unknown[] }>(
  rows: readonly TRow[],
): TRow {
  const room = rows.find((row) => (row.title ?? "") !== "" && row.participantPortraits.length > 1);
  if (room === undefined) {
    throw new Error("The corpus has no named group room");
  }
  return room;
}

export const SHELL_STORIES = "tests/client/features/app-shell/surfaces/_app-shell-stories";

/** The ⌘K chip's accessible name leads with the word and carries the platform shortcut after it. */
export const JUMP_CHIP = /^Jump — the command menu \(/u;

export const PHONE = { width: 390, height: 844 } as const;

const TOUCH_DRAG_STEPS = 8;

/** A finger drag through Chromium's real touch pipeline, so a touch-scroll region scrolls the way a phone scrolls it. */
export async function touchDrag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [from] });
  for (let step = 1; step <= TOUCH_DRAG_STEPS; step += 1) {
    const x = from.x + ((to.x - from.x) * step) / TOUCH_DRAG_STEPS;
    const y = from.y + ((to.y - from.y) * step) / TOUCH_DRAG_STEPS;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}
