// The row's identity art: the gutter chip, ripple's welded portrait and the full-size view they open. Split from
// message-row-parts.tsx to stay under the component-size cap; pure (args) => ReactElement like its sibling.

import { blobPortraitUrl } from "@orb/contracts/assets";
import { initialsFor } from "@orb/kit/initials";
import type { MessageRole } from "@orb/kit/message-role";
import { Avatar } from "@orb/ui/avatar";
import type { ReactElement } from "react";
import { cn, viewImageActionName } from "#lib";
import type { ArtViewer } from "../hooks/art-viewer-context.tsx";
import type { BubbleDecorationArgs } from "../lib/art-decorations.ts";
import { artRequestWidth } from "../lib/art-decorations.ts";
import type { RowAttribution } from "../lib/attribution.ts";
import type { RowSkin } from "../lib/message-row-variants.ts";
import { avatarSrcProp } from "../lib/message-row-variants.ts";
import type { ArtView } from "./art-slot.tsx";
import { ArtButton, FallbackLetter, PortraitAvatar } from "./art-slot.tsx";

// #1728 arm B — a chip in a `1fr` RAIL must hug the centred column's edge or it drifts to the far side of the margin.
const RAIL_LEADING = "@cq-56:justify-self-end";
const RAIL_TRAILING = "@cq-56:justify-self-start";

// Ripple's portrait column: its width token, and its phone width below the row's `md` step.
const PORTRAIT_WIDTH = "block-auto inline-(--immersive-ripple-portrait-width) @max-cq-28:inline-(--immersive-ripple-portrait-width-phone)";
// Ripple's portrait sticks to the top of its card; the portrait itself is the sticky item only when unwrapped.
const STICKY_TOP = "sticky inset-bs-0";

// "sticky-portrait" (Ripple) swaps the chip for a smart-cropped 2:3 portrait pinned via
// position:sticky, forcing shape="square" regardless of the avatarShape pref. Its weld rounds only the
// outer edge (away from the bubble it welds to — mirrored for role==="user") so the inner edge sits
// flush against the bubble's own radius.
export function renderRowAvatar(args: {
  readonly attribution: RowAttribution;
  readonly avatarTreatment: ReturnType<RowSkin["avatarTreatment"]>;
  readonly role: MessageRole;
  readonly showInChatAvatars: boolean;
  readonly avatarSize: "sm" | "md" | "lg";
  readonly avatarShape: "round" | "square" | "rounded";
  readonly avatarAspect: "square" | "portrait";
  readonly avatarRing: "none" | "accent";
  /** #288 — the gutter chip aligns with the SPEAKER'S NAME, and since the header moved inside the
   *  container that line starts one `--spacing-row` below the container's top edge. Without this the chip
   *  top-aligned with the box instead of the name and sat 8px high of it (measured; the "chip top-aligns
   *  with the name row" CT is the fence). ST's own refs align the chip to the header line, not the card.
   *  False for an `outside` skin, where the header IS the column's first line and nothing is offset. */
  readonly alignToInsideHeader: boolean;
  /** The row sits mirrored at the trailing edge (`rowMirrored`): the weld rounds its other outer edge. */
  readonly mirrored: boolean;
  /** #1728 arm B — this row's skin seats its column with `columnPlacement: "gutterCentred"`, so at/above
   *  the `@4xl` crossover the chip lives in a `1fr` RAIL beside the centred column rather than in flow
   *  beside it. A rail is wider than the chip, so the chip has to hug the column's edge or it drifts to
   *  the far side of the margin: `justify-self-end` for a leading chip, `justify-self-start` for a
   *  trailing one. Inert below the crossover and inert for every `anchored` skin, where the row body is
   *  still a flex line and `justify-self` has no grid to resolve against. */
  readonly gutterRail: "none" | "leading" | "trailing";
  readonly imageUrlFor?: BubbleDecorationArgs["imageUrlFor"];
  /** The transcript's art viewer; null outside one, which leaves the avatar plain paint. */
  readonly viewArt: ArtViewer | null;
  readonly artControl: ArtView["control"];
}): ReactElement | null {
  if (args.attribution.name === null || !args.showInChatAvatars) {
    return null;
  }
  // A bare skin (stock document) shows no identity art at all.
  if (args.avatarTreatment === "none") {
    return null;
  }
  // Static illustration art (`imageUrlFor`) has no owned blob to open full size.
  const target = viewTargetFor(args.viewArt, args.imageUrlFor === undefined ? args.attribution.avatarHash : null, args.attribution.name);
  if (args.avatarTreatment === "sticky-portrait") {
    return stickyPortrait(args, target);
  }
  // The welded portrait spans the card and has no line to align to — offset only the gutter chip, on whichever
  // element is outermost: the chip, or the button that opens it.
  const chipLayout =
    cn(
      args.alignToInsideHeader ? "mbs-row" : undefined,
      args.gutterRail === "leading" ? RAIL_LEADING : undefined,
      args.gutterRail === "trailing" ? RAIL_TRAILING : undefined,
    ) ?? "";
  const avatar = {
    size: args.avatarSize,
    shape: args.avatarShape,
    aspect: args.avatarAspect,
    ring: args.avatarRing,
    fallbackDelay: 0,
    hueSeed: args.attribution.hueSeed,
    // exactOptionalPropertyTypes idiom: OMIT the prop rather than pass `undefined` (`avatarSrcProp`).
    ...(args.imageUrlFor === undefined ? avatarSrcProp(args.attribution.avatarHash) : { src: args.imageUrlFor("icon") }),
  } as const;
  const initials = initialsFor(args.attribution.name);
  if (target === null) {
    return (
      <Avatar {...avatar} className={chipLayout}>
        {initials}
      </Avatar>
    );
  }
  return (
    <ArtButton view={artViewOf(target, args.artControl)} className={chipLayout}>
      <Avatar {...avatar}>{initials}</Avatar>
    </ArtButton>
  );
}

/** The tap target for echo's tile or whisper's band: the speaker's own art, opened in the transcript's viewer. */
export function artViewFor(viewArt: ArtViewer | null, attribution: RowAttribution | undefined, artControl: ArtView["control"]): ArtView | null {
  if (attribution?.name === null || attribution === undefined) {
    return null;
  }
  const target = viewTargetFor(viewArt, attribution.avatarHash, attribution.name);
  if (target === null) {
    return null;
  }
  return artViewOf(target, artControl);
}

/** What a tap on a speaker's art opens: the blob and the name it is titled with. Null leaves the art plain paint. */
interface ViewTarget {
  readonly open: ArtViewer["open"];
  readonly hash: string;
  readonly name: string;
}

function viewTargetFor(viewArt: ArtViewer | null, hash: string | null, name: string): ViewTarget | null {
  return viewArt === null || hash === null ? null : { open: viewArt.open, hash, name };
}

function artViewOf(target: ViewTarget, control: ArtView["control"]): ArtView {
  return { label: viewImageActionName(target.name), control, open: (opener) => target.open({ hash: target.hash, name: target.name }, opener) };
}

/** The portrait URL at the width its slot renders at (times the pixel ratio); undefined with no hash or static art. */
function portraitSource(hash: string | null, owned: boolean): ((cssWidth: number) => string) | undefined {
  return hash === null || !owned ? undefined : (cssWidth: number): string => blobPortraitUrl(hash, artRequestWidth(cssWidth));
}

// Ripple's portrait sticks to the top of its card as the row scrolls; wrapped, the button is the sticky flex item.
function stickyPortrait(args: Parameters<typeof renderRowAvatar>[0], target: ViewTarget | null): ReactElement {
  const weld = args.mirrored ? "end" : "start";
  const portrait = (
    <PortraitAvatar
      size={args.avatarSize}
      shape="square"
      aspect="portrait"
      ring={args.avatarRing}
      cardCorners={weld}
      fallbackDelay={0}
      hueSeed={args.attribution.hueSeed}
      // Unwrapped, the portrait is the sticky flex item; wrapped, the button is.
      className={cn(target === null ? STICKY_TOP : undefined, PORTRAIT_WIDTH) ?? ""}
      urlAt={portraitSource(args.attribution.avatarHash, args.imageUrlFor === undefined)}
      {...(args.imageUrlFor === undefined ? {} : { src: args.imageUrlFor("portrait") })}
    >
      <FallbackLetter className="absolute inset-0" initials={initialsFor(args.attribution.name ?? "")} />
    </PortraitAvatar>
  );
  if (target === null) {
    return portrait;
  }
  return (
    <ArtButton view={artViewOf(target, args.artControl)} cardCorners={weld} className={cn(STICKY_TOP, "shrink-0") ?? ""}>
      {portrait}
    </ArtButton>
  );
}
