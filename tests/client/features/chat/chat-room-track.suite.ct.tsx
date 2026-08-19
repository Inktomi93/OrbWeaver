// CT suite: THE ROOM'S ONE SHARED TRACK (#213) — the transcript column, the composer and the variant pager
// must agree about where the middle of the room pane is, at EVERY desktop pane state.
//
// Cross-cutting by construction (hence `.suite`): the property spans the row skin table
// (`message-row-variants.ts`), the composer's own box (`composer.tsx`) and the client styles tier's reading
// measure (`globals.css`) — no single module owns it, and the defect was precisely that each element
// resolved its own axis.
//
// WHY THE WRAPPER STORY. `--width-shell-content` is stamped by `app-shell.tsx` (a clamp against the
// VIEWPORT), so in a CT with no shell the var is unset and every `max-w-(--width-shell-content)` computes to
// `none` — the disagreement is unreachable. `ChatRoomTrackStory` mounts the real room pane inside a
// fixed-width box carrying that exact expression, so a pane state is one number: the box's width.
//
// THE FOUR PANE STATES ARE MEASURED ONES, not invented (reports/design/chats-delta-2026-08-18.md
// §pane-states, viewport 1360, chatWidthPct 50): `list:docked+context:collapsed` → a 894px pane;
// `list:docked+context:docked` → 509px BEFORE #242 and 579px after it (the shell grid's conditional
// squeeze hands that state +70.4px of content track — the delta is read off the real
// `grid-template-columns` in app-shell.ct.tsx, and it is the ONLY state that moved: the other three carry
// no reading-floor deficit, so their tracks are byte-identical); `list:collapsed+context:docked` → 816px;
// `list:collapsed+context:collapsed` (full width) → 1212px. The measured offsets there were +107 / 0 / +68 /
// +260 px between the transcript column and the composer. Mobile was clean at every state, so this stage is
// desktop-only by design.

import type { CastEntry, GroupConfig, ParticipantView } from "@orb/contracts/chat";
import { DEFAULT_GROUP_CONFIG } from "@orb/contracts/chat";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import type { CharacterId, MessageId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { routeTrpc } from "../../../support/ct/route-trpc.ts";
import { ChatRoomTrackStory } from "./_ct-stories.tsx";
import { makeMessagesPage, makeMessageView } from "./fixtures.ts";

const CONTENT_COLUMN = '[data-slot="message-content-column"]';
const MESSAGE_ROW = '[data-slot="message-row"]';
const ROW_BODY = '[data-slot="message-row-body"]';
const COMPOSER = '[data-slot="composer"]';
const SWIPE_STRIP = '[data-slot="swipe-strip"]';

/** The widest a row's identity gutter may be before the reading column's own centre drifts visibly off
 *  the track's: an avatar chip (32px at `md`) plus the row gap. The column sits beside it by law (§B.1 —
 *  the avatar is a SIBLING of the content column), so the axis test bounds the offset instead of
 *  demanding zero. */
const MAX_GUTTER_PX = 48;

/** The measured desktop pane widths (see the header). `both-open` MOVED at #242 (509 → 579): the shell
 *  grid now squeezes both docked panes when the content track would fall under the reading floor, and at
 *  this suite's own viewport (1360) that is a measured +70.4px of content track
 *  (`app-shell.ct.tsx` "#242 both docked at 1360…" reads it off the real `grid-template-columns`:
 *  569.6 → 640.0). The other three states carry no deficit and are untouched. */
const PANE_STATES = [
  { name: "list docked · context collapsed (default)", paneWidth: 894 },
  { name: "list docked · context docked (both open)", paneWidth: 579 },
  { name: "list collapsed · context docked", paneWidth: 816 },
  { name: "list collapsed · context collapsed (full width)", paneWidth: 1212 },
] as const;

/** The both-open pane, named once for the test that is ABOUT that state rather than about the axis. */
const BOTH_OPEN_PANE_WIDTH = 579;
/** …and the pane the SAME state had before the squeeze — the non-vacuity control for the floor. */
const PRE_SQUEEZE_BOTH_OPEN_PANE_WIDTH = 509;
/** The floor the owner ruled: 65 characters of the transcript's own prose (not 65 `ch` — see the test). */
const REAL_CHARACTER_FLOOR = 65;

const LONG_PROSE =
  "The archive keeps its own weather, and the weather keeps its own archive; every page that is read is a " +
  "page that is rewritten, and every page rewritten is a page that will be read again by someone who does " +
  "not know they are the second reader of a sentence that was never finished the first time.";

const PREVIEW_FIT_STUB = {
  "chat.previewContextFit": (): unknown => ({
    boundaryMessageId: null,
    usedTokens: 120,
    ceilingTokens: 32_768,
    ceilingEstimated: false,
    reserveOutputTokens: 2048,
    droppedCount: 0,
    compactSummary: null,
  }),
};

/** The room the axis is measured over: ONE tail assistant row with three variants, so the swipe strip (the
 *  "pager" of #213's item 4) actually renders and can be measured against the same axis. `flat` is the
 *  owner's own live chatStyle AND the skin the defect was reported over — the bubble-family skins cap their
 *  inner box at `max-w-prose`, which would hide a track disagreement behind the bubble's own shrink-to-fit. */
const AZAREAL_ID = castId<CharacterId>("char_track_azareal");

function seat(): ParticipantView {
  return {
    id: castId("participant_track"),
    chatId: castId("chat_ct_keystone"),
    kind: "character",
    userId: null,
    characterId: AZAREAL_ID,
    role: "member",
    activePersonaId: null,
    talkativeness: 1,
    disabled: false,
    joinedAt: 0,
    joinSeq: 0,
    leftSeq: null,
    joinHistoryVisibility: "full",
    displayName: "Azareal",
    handle: null,
    avatarAssetId: null,
    avatarHash: "ct_cas_hash_track",
  };
}

function routeRoom(page: Page, chatStyle: string, content: string = LONG_PROSE): Promise<unknown> {
  return routeTrpc(page, {
    ...PREVIEW_FIT_STUB,
    "settings.getUserSettings": (): unknown => ({
      userId: castId<UserId>("user_ct"),
      schemaVersion: 1,
      config: { ...DEFAULT_USER_SETTINGS, appearance: { ...DEFAULT_USER_SETTINGS.appearance, chatStyle } },
      updatedAt: 0,
    }),
    "chat.getChat": (): { participants: readonly ParticipantView[]; anchorPersonaId: null; cast: readonly CastEntry[]; group: GroupConfig } => ({
      participants: [seat()],
      anchorPersonaId: null,
      cast: [{ kind: "character", id: AZAREAL_ID, name: "Azareal", avatarHash: "ct_cas_hash_track" }],
      group: DEFAULT_GROUP_CONFIG,
    }),
    "chat.listMessages": (): unknown =>
      makeMessagesPage([
        makeMessageView({
          id: castId<MessageId>("msg_track_tail"),
          role: "assistant",
          characterId: AZAREAL_ID,
          content,
          variantCount: 3,
          selectedVariantIdx: 1,
        }),
      ]),
  });
}

interface Box {
  readonly left: number;
  readonly right: number;
  readonly centre: number;
}

async function boxOf(page: Page, selector: string): Promise<Box> {
  return await page.evaluate((sel): Box => {
    const el = document.querySelector(sel);
    if (el === null) {
      throw new Error(`no ${sel} mounted`);
    }
    const rect = el.getBoundingClientRect();
    return { left: rect.left, right: rect.right, centre: rect.left + rect.width / 2 };
  }, selector);
}

// The axis tolerance. Sub-pixel layout rounding is real (a flex track can land on a .5), a 1px disagreement
// is invisible; the defect this pins was 68–260px.
const AXIS_TOLERANCE_PX = 1;

for (const state of PANE_STATES) {
  test(`the transcript, composer and pager share ONE track — ${state.name}`, async ({ mount, page }) => {
    await page.setViewportSize({ width: 1360, height: 900 });
    await routeRoom(page, "flat");

    await mount(<ChatRoomTrackStory paneWidth={state.paneWidth} />);
    await expect(page.locator(CONTENT_COLUMN).first()).toBeVisible();
    await expect(page.locator(COMPOSER)).toBeVisible();
    await expect(page.locator(SWIPE_STRIP)).toBeVisible();

    const row = await boxOf(page, MESSAGE_ROW);
    const body = await boxOf(page, ROW_BODY);
    const column = await boxOf(page, CONTENT_COLUMN);
    const composer = await boxOf(page, COMPOSER);
    const strip = await boxOf(page, SWIPE_STRIP);

    // ONE TRACK: the element that owns the transcript's PLACEMENT and the composer resolve the same box —
    // same left edge, same right edge, therefore the same middle. This is the assertion the defect broke:
    // the row track used to be the whole pane (flat/hush carried a bare `w-full`) while the composer
    // centred inside it.
    expect(Math.abs(row.left - composer.left)).toBeLessThanOrEqual(AXIS_TOLERANCE_PX);
    expect(Math.abs(row.right - composer.right)).toBeLessThanOrEqual(AXIS_TOLERANCE_PX);
    expect(Math.abs(row.centre - composer.centre)).toBeLessThanOrEqual(AXIS_TOLERANCE_PX);
    // The row's BODY (identity gutter + reading column) is placed as one unit and centres in that track —
    // this is the half that used to be `items-stretch`, which re-pinned the capped column to the track's
    // left edge and dumped every unspent pixel on its right ("~2x more dead wallpaper right of it than
    // left", the owner's report).
    expect(Math.abs(body.centre - row.centre)).toBeLessThanOrEqual(AXIS_TOLERANCE_PX);
    // The reading column itself is offset only by the row's own anatomy — the avatar gutter, a SIBLING of
    // the content column by law (§B.1, not this lane's to reverse) — so its centre sits within half a
    // chip of the track's, at EVERY pane state. The measured defect was 107 → 260px of DRIFT.
    const gutter = body.right - body.left - (column.right - column.left);
    expect(gutter).toBeLessThanOrEqual(MAX_GUTTER_PX);
    expect(Math.abs(column.centre - composer.centre)).toBeLessThanOrEqual(gutter / 2 + AXIS_TOLERANCE_PX);
    // The pager rides the reading column's leading edge, not the track's centre: it is a compact chip
    // sized to its own content (#228 — a full-width plate holding one chevron read as a broken bubble).
    expect(Math.abs(strip.left - column.left)).toBeLessThanOrEqual(AXIS_TOLERANCE_PX);
    expect(strip.right).toBeLessThanOrEqual(column.right + AXIS_TOLERANCE_PX);
    expect(strip.right - strip.left).toBeLessThan(column.right - column.left);
    // …and nothing overflows the pane it lives in (the both-open state is still narrower than the
    // TOKEN-STRICT 65ch floor even after #242's squeeze; it must degrade to the pane, never spill out).
    expect(row.right - row.left).toBeLessThanOrEqual(state.paneWidth + AXIS_TOLERANCE_PX);
    expect(composer.right - composer.left).toBeLessThanOrEqual(state.paneWidth + AXIS_TOLERANCE_PX);
  });
}

interface MeasureReading {
  /** `--reading-measure` resolved inside the BUBBLE — i.e. in the PROSE font the reader actually reads. */
  readonly proseTokenPx: number;
  /** The same token resolved in the room pane's own (unscaled, 1rem) font — the PRE-FIX resolution, kept
   *  as the non-vacuity control: the two numbers must differ, or "resolves in the prose font" is unfalsifiable. */
  readonly baseTokenPx: number;
  readonly maxWidth: string;
}

async function readMeasure(page: Page): Promise<MeasureReading> {
  return await page.evaluate(
    ([columnSel, bubbleSel, paneSel]): MeasureReading => {
      const column = document.querySelector(String(columnSel));
      const bubble = document.querySelector(String(bubbleSel));
      const pane = document.querySelector(String(paneSel));
      if (!(column instanceof HTMLElement && bubble instanceof HTMLElement && pane instanceof HTMLElement)) {
        throw new Error("column/bubble/pane not mounted");
      }
      const probeIn = (host: HTMLElement, value: string): number => {
        const probe = document.createElement("div");
        probe.style.position = "absolute";
        probe.style.visibility = "hidden";
        probe.style.width = value;
        host.append(probe);
        const px = probe.getBoundingClientRect().width;
        probe.remove();
        return px;
      };
      const style = getComputedStyle(column);
      return {
        proseTokenPx: probeIn(bubble, "var(--reading-measure)"),
        baseTokenPx: probeIn(pane, "var(--reading-measure)"),
        maxWidth: style.maxWidth,
      };
    },
    [CONTENT_COLUMN, '[data-slot="message-bubble"]', '[data-testid="room-pane"]'],
  );
}

test("the reading measure resolves in the PROSE font, not the column's own font", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1360, height: 900 });
  await routeRoom(page, "flat");
  await mount(<ChatRoomTrackStory paneWidth={1212} />);
  await expect(page.locator(CONTENT_COLUMN).first()).toBeVisible();

  const measure = await readMeasure(page);

  // Non-vacuity control: the two resolutions must actually DIFFER on this stage, or the assertion below
  // would pass whatever the sheet says (the prose font is `--text-body` = 0.9375rem against the column's 1rem).
  expect(measure.proseTokenPx).toBeGreaterThan(0);
  expect(measure.proseTokenPx).toBeLessThan(measure.baseTokenPx);
  // THE FIX: the cap is the token resolved in the font the prose is set in. Pre-#213 it resolved in the
  // column's 16px font, which is how a ratified 75ch measure rendered ~85 real characters per line.
  expect(measure.maxWidth).not.toBe("none");
  expect(Number.parseFloat(measure.maxWidth)).toBeCloseTo(measure.proseTokenPx, 0);
});

// ── #242: THE BOTH-OPEN STATE IS IN BAND NOW (owner-ruled off the #240 fork) ───────────────────────
// This arm used to be "no worse + no overflow" (the axis test above) because the pane was narrower than
// the reading floor and NOTHING in the transcript could widen a pane. #240 ruled the shell-grid arm —
// both docked panes give up slack when the content track would fall under the floor — so the state has a
// real floor to hold, and this is the assertion that upgrade buys.
//
// THE FLOOR IS THE REAL-CHARACTER ONE, and that is the owner's pick, not a convenience. The token-strict
// floor (`--reading-measure-min`, 65 `ch` resolved in the prose font) measures 557.7px on this stage,
// which the room's own glyphs overshoot: `ch` is the width of "0", wider than the average character in a
// proportional face, so 65ch fits ~74 real characters. Holding it here would need ~+96px of pane instead
// of +70 and would spend the panes down to their floors at every desktop width. The ruled target is the
// LINE THE READER SEES: 65 characters of the transcript's own prose, measured in the prose font.
test("#242 both open: the reading line holds the REAL-CHARACTER floor and stays under the measure cap", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1360, height: 900 });
  await routeRoom(page, "flat");
  await mount(<ChatRoomTrackStory paneWidth={BOTH_OPEN_PANE_WIDTH} />);
  await expect(page.locator(CONTENT_COLUMN).first()).toBeVisible();

  const line = await page.evaluate(
    (sample): { readonly textWidth: number; readonly sampleWidth: number; readonly maxMeasure: number } => {
      const bubble = document.querySelector('[data-slot="message-bubble"]');
      if (!(bubble instanceof HTMLElement)) {
        throw new Error("no bubble mounted");
      }
      // The sample is the room's OWN prose, in the room's own prose font, laid out on one line — so the
      // floor is "65 of these characters fit", never a synthetic average.
      const probe = document.createElement("span");
      probe.style.position = "absolute";
      probe.style.visibility = "hidden";
      probe.style.whiteSpace = "pre";
      probe.textContent = sample;
      bubble.append(probe);
      const sampleWidth = probe.getBoundingClientRect().width;
      probe.textContent = "";
      probe.style.whiteSpace = "";
      probe.style.width = "var(--reading-measure)";
      const maxMeasure = probe.getBoundingClientRect().width;
      probe.remove();
      const style = getComputedStyle(bubble);
      const textWidth = bubble.getBoundingClientRect().width - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight);
      return { textWidth, sampleWidth, maxMeasure };
    },
    LONG_PROSE.slice(0, REAL_CHARACTER_FLOOR),
  );

  // IN BAND, both ends: at or above the real-character floor…
  expect(line.sampleWidth).toBeGreaterThan(0);
  expect(line.textWidth).toBeGreaterThanOrEqual(line.sampleWidth - AXIS_TOLERANCE_PX);
  // …and still under the 75ch cap (the band is 65-75; a floor with no ceiling is how #97 happened).
  expect(line.textWidth).toBeLessThanOrEqual(line.maxMeasure);
  // Non-vacuity: the PRE-#242 pane is the same measurement, short. Without this the assertion above would
  // pass on any pane wide enough by accident, and the shell change it exists to fence would be invisible.
  await page.evaluate((width) => {
    const pane = document.querySelector('[data-testid="room-pane"]');
    if (pane instanceof HTMLElement) {
      pane.style.width = `${width}px`;
    }
  }, PRE_SQUEEZE_BOTH_OPEN_PANE_WIDTH);
  const shortLine = await page.evaluate((): number => {
    const bubble = document.querySelector('[data-slot="message-bubble"]');
    if (!(bubble instanceof HTMLElement)) {
      throw new Error("no bubble mounted");
    }
    const style = getComputedStyle(bubble);
    return bubble.getBoundingClientRect().width - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight);
  });
  expect(shortLine).toBeLessThan(line.sampleWidth);
});

// THE BAND'S FLOOR (#213/#212-2). `--reading-measure` is a MAX; the floor is `--reading-measure-min`, and
// the only thing inside the transcript that can push a line under it is an immersive skin's decoration
// (echo spent 55% of its own box on `padding-right`, leaving 28 chars/line). The floor is therefore pinned
// where it BINDS: echo's prose box must still hold the min measure, with the art living outside it.
//
// The token-strict floor is STILL not pinned at the both-open pane (#242 bought the real-character one,
// not the 65ch one — see the test above), and no rule in the transcript can widen a pane: that half of
// the fork stays where it was answered, in the shell grid.
test("an immersive skin's art does not eat the reading line below the min measure (echo)", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1360, height: 900 });
  await routeRoom(page, "echo");
  await mount(<ChatRoomTrackStory paneWidth={1212} />);
  await expect(page.locator(CONTENT_COLUMN).first()).toBeVisible();

  const line = await page.evaluate((): { readonly textWidth: number; readonly floorPx: number } => {
    const bubble = document.querySelector('[data-slot="message-bubble"]');
    if (!(bubble instanceof HTMLElement)) {
      throw new Error("no bubble mounted");
    }
    const probe = document.createElement("div");
    probe.style.position = "absolute";
    probe.style.visibility = "hidden";
    probe.style.width = "var(--reading-measure-min)";
    bubble.append(probe);
    const floorPx = probe.getBoundingClientRect().width;
    probe.remove();
    const style = getComputedStyle(bubble);
    // The reading line is the bubble's CONTENT box: its own width minus the art pane it reserves as padding.
    const textWidth = bubble.getBoundingClientRect().width - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight);
    return { textWidth, floorPx };
  });

  expect(line.floorPx).toBeGreaterThan(0);
  expect(line.textWidth).toBeGreaterThanOrEqual(line.floorPx - AXIS_TOLERANCE_PX);
});

// ── #245: ENTERING EDIT MUST NOT RESHAPE THE ROW (owner-reported, 2026-08-18) ───────────────────────
//
// "Entering EDIT on a message reflows the row — the transcript jumps under the user at the exact moment
// they're trying to work on a message." Read mode and edit mode are the SAME message at the SAME place;
// the swap is an affordance change, not a content change, so the row's box is the invariant.
//
// The measured collapse had three sources, all in one commit: the rendered prose was replaced by a
// FIXED-height `Textarea` (its default box, blind to what it replaced); the row's chrome below the bubble
// (tool calls · metadata · the swipe pager) is suppressed while editing — a DELIBERATE ruling, kept — and
// nothing reserved the height it vacated; and the editor adds its own Save/Cancel control row.
//
// The pin is therefore stated as the reader experiences it: the row's TOP does not move, and the row does
// not SHRINK (a shrink is the jump — everything below slides up under the cursor). Growth is bounded by the
// editor's own control row, which is a real new affordance and the one honest addition.
//
// It rides THIS suite (not message-row.ct.tsx) because the CHAT_TRACK half of the claim — the edit row
// still resolves the room's one horizontal track — is only reachable on the stage that stamps
// `--width-shell-content` (see the header).

const EDIT_TEXTAREA = '[data-slot="message-edit-textarea"]';
const SHORT_PROSE = "It rained.";

/** The row's full box + the reading column's own edges — everything #245 says must hold across the swap. */
interface RowGeometry {
  readonly top: number;
  readonly height: number;
  readonly left: number;
  readonly right: number;
  readonly columnLeft: number;
  readonly columnRight: number;
}

async function rowGeometry(page: Page): Promise<RowGeometry> {
  return await page.evaluate(
    ([rowSel, columnSel]): RowGeometry => {
      const row = document.querySelector(String(rowSel));
      const column = document.querySelector(String(columnSel));
      if (!(row instanceof HTMLElement && column instanceof HTMLElement)) {
        throw new Error("row/column not mounted");
      }
      const rowRect = row.getBoundingClientRect();
      const columnRect = column.getBoundingClientRect();
      return {
        top: rowRect.top,
        height: rowRect.height,
        left: rowRect.left,
        right: rowRect.right,
        columnLeft: columnRect.left,
        columnRight: columnRect.right,
      };
    },
    [MESSAGE_ROW, CONTENT_COLUMN],
  );
}

/** Hover first: the action cluster rests `pointer-events-none` (A3), so an unhovered click cannot pass
 *  Playwright's actionability check. This is the real user's gesture, not a style override. */
async function enterEdit(page: Page): Promise<void> {
  await page.locator(MESSAGE_ROW).hover();
  await page.getByRole("button", { name: "Edit message" }).click();
  await expect(page.locator(EDIT_TEXTAREA)).toBeVisible();
}

// The editor's own Save/Cancel row is the ONE thing edit mode legitimately adds; everything else must be
// absorbed. `gap-field` + a `sm` button ≈ 36px — the bound is set a touch above it so a token retune does
// not red the suite for a rounding, while the measured pre-fix collapses (hundreds of px) stay caught.
const EDIT_CONTROL_ROW_MAX_PX = 48;

for (const chatStyle of ["flat", "bubble"] as const) {
  for (const [lengthName, content] of [
    ["a long reply", LONG_PROSE],
    ["a two-word reply", SHORT_PROSE],
  ] as const) {
    test(`#245 ${chatStyle} · ${lengthName}: read → edit → cancel keeps the row's box`, async ({ mount, page }) => {
      await page.setViewportSize({ width: 1360, height: 900 });
      await routeRoom(page, chatStyle, content);

      await mount(<ChatRoomTrackStory paneWidth={894} />);
      await expect(page.locator(CONTENT_COLUMN).first()).toBeVisible();
      await expect(page.locator(COMPOSER)).toBeVisible();

      const read = await rowGeometry(page);
      await enterEdit(page);
      const editing = await rowGeometry(page);

      // THE JUMP: the row's own top is where the reader's eye and cursor are. It does not move.
      expect(Math.abs(editing.top - read.top)).toBeLessThanOrEqual(AXIS_TOLERANCE_PX);
      // …and the row does not COLLAPSE. A shrink drags every row below it up under the pointer; growth is
      // bounded by the editor's own control row.
      expect(editing.height).toBeGreaterThanOrEqual(read.height - AXIS_TOLERANCE_PX);
      expect(editing.height).toBeLessThanOrEqual(read.height + EDIT_CONTROL_ROW_MAX_PX);

      // THE TRACK STILL HOLDS (#213): edit mode is the same row on the same axis, not a second layout.
      const composer = await boxOf(page, COMPOSER);
      expect(Math.abs(editing.left - composer.left)).toBeLessThanOrEqual(AXIS_TOLERANCE_PX);
      expect(Math.abs(editing.right - composer.right)).toBeLessThanOrEqual(AXIS_TOLERANCE_PX);
      // The reading column keeps its own edges too — the editor occupies the prose's footprint, it does
      // not re-measure the column.
      expect(Math.abs(editing.columnLeft - read.columnLeft)).toBeLessThanOrEqual(AXIS_TOLERANCE_PX);
      expect(Math.abs(editing.columnRight - read.columnRight)).toBeLessThanOrEqual(AXIS_TOLERANCE_PX);

      // Cancel restores the row EXACTLY — the round trip is a no-op, not an approximation.
      await page.getByRole("button", { name: "Cancel edit" }).click();
      await expect(page.locator(EDIT_TEXTAREA)).toHaveCount(0);
      const cancelled = await rowGeometry(page);
      expect(Math.abs(cancelled.top - read.top)).toBeLessThanOrEqual(AXIS_TOLERANCE_PX);
      expect(Math.abs(cancelled.height - read.height)).toBeLessThanOrEqual(AXIS_TOLERANCE_PX);
    });
  }
}
