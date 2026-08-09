// FaceStrip — the client-shared horizontal strip of clickable FACES (list-pane-projection §11.2, D12): a
// dense row of character portraits pinned at a LIST pane's top, where tapping a face scopes the pane below
// it. Two features render this anatomy and change together (the character library's favorites strip and the
// chats pane's Arm B faces strip), which is the R2 bar for a tier-2 composite.
//
// NOT `@orb/ui/avatar-stack` — that primitive is display-only overlapping avatars with no per-item click.
// These are real `Avatar`-in-`Button` controls, each with its own accessible name and `aria-current`.
//
// The active ring is the EXISTING `Avatar ring="accent"` variant; the face button is `size="media"`
// (CONTENT-sized), which is the F2-safe size for a display-token child — every other button size pins a
// control height, so a 32px avatar inside one would paint outside its own hit box.
//
// TOUCH FLOOR (side-eye P1-3): content-sized means the box was the 32px AVATAR at every pointer — under
// WCAG's 44px and under this app's own coarse floor. The fix is the sibling icon buttons' mechanism, not a
// bigger portrait: a per-pointer MIN box (`min-w/min-h-control-md` = 34px fine / 48px coarse by token
// construction, D62 P1) with the avatar centered inside it. The avatar display token stays 32px.
//
// Data-driven: an empty `items` renders NOTHING, never an empty shell (the strip is a shortcut, and a
// shortcut to nowhere is chrome). UNLESS the caller declares its read still `pending` — "no faces" and
// "no answer yet" are different facts, and only the second one owes a reserved box (`FaceStripPlaceholder`,
// which carries the measurement that bought it).
//
// THE FOLD (FACEFILT — owner report: nine faces already scrolling on a six-character library). A strip
// that scrolls sideways is a second thing to navigate, and the shortcut it was supposed to be is gone. A
// caller that supplies `overflow` gets the FOLDED posture instead: the strip measures its own row and
// renders as many faces as the pane actually holds, with everyone else behind ONE picker tile. There is no
// N to configure — a captioned face costs its NAME's width, so any fixed count is wrong at some pane width
// (`face-strip-fold.ts` holds the rules; this file only measures and renders).
//
// Two invariants the fold owes its caller:
//  · the SELECTED face is never folded away — it is hoisted to the front of the row rather than hidden,
//    because a pane scoped by a face you cannot see is a filter you cannot clear;
//  · the leftover-of-one squeezes into the tile's slot instead of hiding behind it (`squeezed`), so the
//    tile never stands in for exactly one face. Its caption clips; the full name stays the accessible name.
//
// The tile sits INSIDE the strip's `role="list"` row, beside the faces: it is where the rest of the list
// went, and it has to share the row's measuring box for the fold to be about the pane at all.

import { blobUrl } from "@orb/contracts/assets";
import { initialsFor } from "@orb/kit/initials";
import { Avatar } from "@orb/ui/avatar";
import { Button } from "@orb/ui/button";
import { Row, Stack } from "@orb/ui/layout";
import { Popover, PopoverPopup, PopoverTrigger } from "@orb/ui/popover";
import { Skeleton } from "@orb/ui/skeleton";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { useLayoutEffect, useRef, useState } from "react";
import type { FaceFold } from "./face-strip-fold.ts";
import { foldFaces } from "./face-strip-fold.ts";

export interface FaceStripItem {
  readonly id: string;
  readonly name: string;
  /** CAS key — null falls back to the hue-seeded initials blob. */
  readonly avatarHash: string | null;
}

/** Not exported: every consumer writes the object inline at the `<FaceStrip>` call, so an exported name
 *  would be a second spelling with no reader (knip). Re-export it the day a consumer builds one elsewhere. */
interface FaceStripOverflow {
  /** The tile's accessible name — it opens a picker, so it names that verb ("Filter by another character"). */
  readonly label: string;
  /**
   * The picker body, rendered in the tile's popover. `close` dismisses it once a choice is made.
   *
   * `shownIds` is the ids the row is CURRENTLY rendering as faces — the tile promises "the others", so the
   * picker it opens must not re-list the four faces sitting beside it (side-eye 2026-08-03 P3: a `+6 More`
   * tile opened a picker listing all ten). Only the strip knows what the fold left visible, which is why it
   * is handed down rather than recomputed by the caller.
   */
  readonly render: (args: { readonly close: () => void; readonly shownIds: readonly string[] }) => ReactNode;
}

export interface FaceStripProps {
  readonly items: readonly FaceStripItem[];
  /** The face currently scoping the pane below (`aria-current` + the accent ring), or null. */
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
  /** The strip's accessible name — it is a list of shortcuts, so it says which ones. */
  readonly label: string;
  /** Per-face verb for the accessible name, e.g. "Open" → "Open Azarael". @defaultValue "Open" */
  readonly verb?: string;
  /** Print each face's name under it. Off by default (the favorites strip is portraits only). */
  readonly caption?: boolean;
  /** A micro-caps KICKER printed above the faces (the mock's group label). Without it a cold user reads a
   *  bare row of portraits and can't tell it is a control at all — the strip's accessible `label` only
   *  reaches assistive tech. Make it name the strip's VERB, not its contents: a clickable portrait means
   *  "start a chat" everywhere else in the app, so a strip that FILTERS has to say so in the one line a
   *  sighted user actually reads. Omit for a strip whose surrounding copy already names it. */
  readonly kicker?: string;
  /** Opt into the FOLDED posture: the strip fits ONE row and hands everything it could not fit to this
   *  picker. Omitted, the strip keeps its original scrolling row (the favorites strip's posture). */
  readonly overflow?: FaceStripOverflow;
  /**
   * What SELECTING a face means, which decides the state the tile announces.
   *
   * `"current"` (default) — picking NAVIGATES: the selected face is the one open elsewhere, so it is
   * `aria-current` (the character library's favorites strip: tapping opens an editor, tapping the open one
   * again re-opens it).
   * `"toggle"` — picking sets a FILTER the same tap clears, so the tile is a real toggle button and owes
   * `aria-pressed`. Without it the chats strip's active filter was visual-only on the tile — an orange ring
   * and an orange caption, with the a11y tree reporting `pressed: null` on all four and the tile's name
   * still an unfulfilled promise ("Show chats with Elias Thorn") while it was already showing them
   * (side-eye 2026-08-03 P2). The NAME stays stable across both states on purpose: `aria-pressed` is what
   * carries the state, and a name that flipped to "Stop showing…" would break the label⇄state contract the
   * preset row's activate toggle already follows.
   */
  readonly selectMode?: "current" | "toggle";
  /**
   * The caller's read has not landed yet, so `items` is empty because nothing is KNOWN — not because the
   * answer is "no faces". The strip then reserves its own box (see `FaceStripPlaceholder`) instead of
   * rendering nothing and shoving the pane down when the read lands. Omitted, an empty strip is an empty
   * strip, exactly as before.
   */
  readonly pending?: boolean;
}

/** What the fold decided, plus whether the selected face had to be hoisted to survive it. */
interface FoldState extends FaceFold {
  readonly hoisted: boolean;
}

const FACE_KEY_ATTR = "data-face-key";
const OVERFLOW_ATTR = "data-face-overflow";
/** A squeezed face is rendered NARROWER than it wants to be — measuring it would poison the cache with the
 *  width the fold itself imposed, and the next fold would then "discover" that it fits unaided. */
const SQUEEZED_ATTR = "data-face-squeezed";

/** Cache key: a face's width is its portrait AND its caption, so a rename must re-measure. */
function faceKey(item: FaceStripItem): string {
  return `${item.id} ${item.name}`;
}

/** The selected face first, everything else in its own order — the hoist that keeps a scoping face visible. */
function hoistSelected(items: readonly FaceStripItem[], selectedId: string | null): readonly FaceStripItem[] {
  const selected = items.find((item) => item.id === selectedId);
  return selected === undefined ? items : [selected, ...items.filter((item) => item.id !== selectedId)];
}

/** Cache the width of every face the row is currently rendering (a squeezed one lies — see `SQUEEZED_ATTR`). */
function readFaceWidths(row: HTMLElement, cache: Map<string, number>): void {
  for (const face of row.querySelectorAll<HTMLElement>(`[${FACE_KEY_ATTR}]:not([${SQUEEZED_ATTR}])`)) {
    const key = face.getAttribute(FACE_KEY_ATTR);
    if (key !== null) {
      cache.set(key, face.getBoundingClientRect().width);
    }
  }
}

interface FoldMeasurement {
  readonly row: HTMLElement;
  readonly items: readonly FaceStripItem[];
  readonly selectedId: string | null;
  readonly cache: ReadonlyMap<string, number>;
  readonly tileWidth: number;
}

/** The fold for a fully-measured row, or `null` when a face has never been measured (it needs a pass). */
function computeFold({ row, items, selectedId, cache, tileWidth }: FoldMeasurement): FoldState | null {
  const widths: number[] = [];
  for (const item of items) {
    const width = cache.get(faceKey(item));
    if (width === undefined) {
      return null;
    }
    widths.push(width);
  }
  const geometry = { available: row.clientWidth, gap: Number.parseFloat(getComputedStyle(row).columnGap) || 0, triggerWidth: tileWidth };
  const natural = foldFaces({ ...geometry, widths });
  const selectedIndex = items.findIndex((item) => item.id === selectedId);
  if (selectedIndex < natural.visible) {
    return { ...natural, hoisted: false };
  }
  // The scoping face fell past the fold: re-fold with it in FRONT, which is the one position no fold can
  // hide (a strip that filters by a face you cannot see is a filter you cannot clear).
  const reordered = [widths[selectedIndex] ?? 0, ...widths.filter((_unused, index) => index !== selectedIndex)];
  return { ...foldFaces({ ...geometry, widths: reordered }), hoisted: true };
}

function sameFold(previous: FoldState | null, next: FoldState): boolean {
  return (
    previous !== null &&
    previous.visible === next.visible &&
    previous.hidden === next.hidden &&
    previous.squeezed === next.squeezed &&
    previous.hoisted === next.hoisted
  );
}

interface FaceButtonProps {
  readonly item: FaceStripItem;
  readonly selected: boolean;
  readonly verb: string;
  readonly caption: boolean;
  /** Rendered in the overflow tile's narrow slot (the leftover-of-one rule) — the caption pays for it. */
  readonly squeezed: boolean;
  readonly selectMode: "current" | "toggle";
  readonly onSelect: (id: string) => void;
}

function FaceButton({ item, selected, verb, caption, squeezed, selectMode, onSelect }: FaceButtonProps): ReactElement {
  return (
    <Button
      // ONE state attribute, chosen by what the tap DOES (see `selectMode`) — never both: a control that is
      // simultaneously `aria-current` and `aria-pressed` states its one fact twice, in two vocabularies.
      {...(selectMode === "toggle" ? { "aria-pressed": selected } : { "aria-current": selected ? ("true" as const) : undefined })}
      aria-label={`${verb} ${item.name}`}
      // The squeezed face takes the tile's slot, which is the control-token box by construction — so it
      // always fits where the tile fit, and only its caption pays for it.
      className={`min-h-control-md min-w-control-md shrink-0${squeezed ? " max-w-control-md" : ""}`}
      data-face-key={faceKey(item)}
      data-face-squeezed={squeezed ? "" : undefined}
      intent="ghost"
      onClick={(): void => onSelect(item.id)}
      size="media"
    >
      <Stack align="center" className="min-w-0" gap="tight">
        <Avatar
          hueSeed={item.id}
          ring={selected ? "accent" : "none"}
          shape="square"
          size="md"
          {...(item.avatarHash === null ? {} : { src: blobUrl(item.avatarHash) })}
        >
          {initialsFor(item.name)}
        </Avatar>
        {caption ? (
          // NATURAL width up to a generous ceiling (side-eye P2a): the mock prints full names, and the old
          // fixed `w-avatar-lg` clipped nearly every one of them to ~6 characters ("Aria Ni…"). The ceiling
          // is a max, not a width, so short names take exactly their own space and only a long one
          // truncates — with the FULL name still the button's accessible name.
          //
          // The selected face tints its caption too (the mock's `.f.on{color:primary}`), not just its avatar
          // ring: a ring alone reads as "the one you last touched", while name-and-portrait together reading
          // accent is a STATE you are in — the same primary this strip's "Filtered: X" chip repeats below
          // it. That is what separates a face that FILTERS from a face that LAUNCHES. The `gloss` VOICE
          // (density-pass §2.3) — the caption is the quiet second line under the datum (the face). The
          // SELECTED face's accent tint is a state, not a type axis, so it stays a className on the voice.
          <Text className={`${squeezed ? "max-w-full" : "max-w-avatar-hero"} truncate text-center${selected ? " text-primary" : ""}`} voice="gloss">
            {item.name}
          </Text>
        ) : null}
      </Stack>
    </Button>
  );
}

/** Both strip arms wear the same optional KICKER, so they are wrapped by ONE function: a placeholder that
 *  reserved only the face row would be short by the kicker's line, which is the shift it exists to stop. */
function withKicker(kicker: string | undefined, row: ReactElement): ReactElement {
  if (kicker === undefined) {
    return row;
  }
  return (
    <Stack gap="tight">
      {/* The `kicker` VOICE — the strip's NAME (density-pass §2.3); it was already this exact skin spelled
          out of four internal axes. */}
      <Text voice="kicker">{kicker}</Text>
      {row}
    </Stack>
  );
}

/** How many face-shaped placeholders the reserved row paints. It is a LOOK, never a measurement: the strip
 *  is ONE row, so the height being reserved is identical at any count. */
const PLACEHOLDER_FACES = 4;
const PLACEHOLDER_SLOTS = Array.from({ length: PLACEHOLDER_FACES }, (_unused, index) => index);
/** The caption placeholder is an EMPTY LINE OF THE CAPTION'S OWN TEXT, not a sized bar: a bar's height is a
 *  guess at `gloss`'s line box (measured 13.13px against an `h-3` guess of 12px — a 1.13px residual shift),
 *  while the real `Text` element reserves it exactly, by construction, at any font scale. */
const CAPTION_PLACEHOLDER = " ";

/**
 * THE RESERVED BOX (measured 2026-08-09: the chats LIST pane shifted 74px on data arrival, CLS 0.0070–0.0102
 * — the strip mounted ABOVE the search field and pushed the field and the whole row list down).
 *
 * The strip's height is CHROME, not data: a kicker line plus one row of `min-h-control-md` face boxes,
 * known before the read lands. So while the caller is `pending` the strip paints that exact box with
 * face-shaped skeletons, and the faces land INTO their own outline instead of shoving the pane
 * (UI-Architecture-and-Layout §4.3 rule 7 — "never layout shift on data arrival").
 *
 * This does NOT reopen the "an empty `items` renders NOTHING" ruling in this file's header: a settled empty
 * answer still renders nothing. The reservation exists only for the window where the answer is UNKNOWN, and
 * an account that genuinely has no faces collapses the placeholder once — the one case that cannot be
 * reserved without inventing a shortcut row to nowhere.
 */
function FaceStripPlaceholder({ caption, kicker }: { readonly caption: boolean; readonly kicker: string | undefined }): ReactElement {
  return withKicker(
    kicker,
    <Row aria-busy={true} className="overflow-hidden" data-face-pending="" gap="field">
      {PLACEHOLDER_SLOTS.map((slot) => (
        // The settled face's own box: `FaceButton`'s per-pointer MIN box (`size="media"` is `p-0`, so the
        // button adds nothing else) around the avatar token and its caption line.
        <Stack align="center" className="min-h-control-md min-w-control-md shrink-0" gap="tight" key={slot}>
          <Skeleton className="size-avatar-md rounded-control" />
          {caption ? (
            <Text aria-hidden={true} className="text-transparent" voice="gloss">
              {CAPTION_PLACEHOLDER}
            </Text>
          ) : null}
        </Stack>
      ))}
    </Row>,
  );
}

/** A scrolling (or, with `overflow`, a self-folding) row of clickable faces; renders nothing when empty —
 *  unless the caller says its read is still `pending`, which reserves the strip's box instead. */
export function FaceStrip({
  items,
  selectedId,
  onSelect,
  label,
  verb = "Open",
  caption = false,
  kicker,
  overflow,
  selectMode = "current",
  pending = false,
}: FaceStripProps): ReactElement | null {
  const rowRef = useRef<HTMLDivElement>(null);
  const widthsRef = useRef<Map<string, number>>(new Map());
  const tileWidthRef = useRef<number | null>(null);
  const [fold, setFold] = useState<FoldState | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const folding = overflow !== undefined;
  // `null` is the MEASURING pass: every face renders (clipped, pre-paint) so the DOM can be read once.
  const measuring = fold === null;

  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!folding || row === null) {
      return;
    }
    const apply = (): void => {
      readFaceWidths(row, widthsRef.current);
      const tile = row.querySelector<HTMLElement>(`[${OVERFLOW_ATTR}]`);
      if (tile !== null) {
        tileWidthRef.current = tile.getBoundingClientRect().width;
      }
      const tileWidth = tileWidthRef.current;
      const next = tileWidth === null ? null : computeFold({ cache: widthsRef.current, items, row, selectedId, tileWidth });
      if (next === null) {
        // A folded strip cannot measure what it is not rendering, so a face it has never seen (a new
        // arrival, a rename) sends it back through the measuring pass. During that pass every item IS
        // mounted, so a gap here would mean the DOM lied — never re-arm it, that is the infinite loop.
        if (!measuring) {
          setFold(null);
        }
        return;
      }
      setFold((previous) => (sameFold(previous, next) ? previous : next));
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(row);
    return (): void => observer.disconnect();
  }, [folding, items, measuring, selectedId]);

  if (items.length === 0) {
    return pending ? <FaceStripPlaceholder caption={caption} kicker={kicker} /> : null;
  }

  const ordered = fold?.hoisted === true ? hoistSelected(items, selectedId) : items;
  const shown = fold === null ? ordered : ordered.slice(0, fold.visible);
  const last = shown.at(-1);
  const squeezedKey = fold?.squeezed === true && last !== undefined ? faceKey(last) : null;
  // During the measuring pass the tile renders too — it is one of the widths the fold spends.
  const showTile = folding && (fold === null || fold.hidden > 0);

  const faces = (
    <Row aria-label={label} className={folding ? "overflow-hidden" : "overflow-x-auto"} gap="field" ref={rowRef} role="list">
      {shown.map((item) => (
        <FaceButton
          caption={caption}
          item={item}
          key={item.id}
          onSelect={onSelect}
          selectMode={selectMode}
          selected={selectedId === item.id}
          squeezed={faceKey(item) === squeezedKey}
          verb={verb}
        />
      ))}
      {showTile ? (
        <Popover onOpenChange={setPickerOpen} open={pickerOpen}>
          <PopoverTrigger
            render={
              <Button aria-label={overflow.label} className="min-h-control-md min-w-control-md shrink-0" data-face-overflow="" intent="ghost" size="media">
                <Stack align="center" gap="tight">
                  {/* The tile is FACE-SHAPED (the avatar token square) so the row keeps one rhythm — and it
                      prints the count, because "there are more" without a number is just a shrug. During the
                      measuring pass the number is provisional; it is never painted (the fold lands in a
                      layout effect, before the browser paints). */}
                  <Row align="center" className="size-avatar-md rounded-control bg-muted" justify="center">
                    <Text voice="gloss">{`+${fold === null ? items.length : fold.hidden}`}</Text>
                  </Row>
                  {caption ? <Text voice="gloss">More</Text> : null}
                </Stack>
              </Button>
            }
          />
          <PopoverPopup>{overflow.render({ close: (): void => setPickerOpen(false), shownIds: shown.map((item) => item.id) })}</PopoverPopup>
        </Popover>
      ) : null}
    </Row>
  );
  return withKicker(kicker, faces);
}
