// The row's identity art: the gutter chip, ripple's welded portrait and the full-size view they open. Split from
// message-row-parts.tsx to stay under the component-size cap; pure (args) => ReactElement like its sibling.

import { initialsFor } from "@orb/kit/initials";
import type { MessageRole } from "@orb/kit/message-role";
import { Avatar } from "@orb/ui/avatar";
import { Button } from "@orb/ui/button";
import type { ReactElement } from "react";
import { cn, viewImageActionName } from "#lib";
import type { ArtViewer } from "../hooks/art-viewer-context.tsx";
import type { RowAttribution } from "../lib/attribution.ts";
import type { BubbleDecorationArgs, RowSkin } from "../lib/message-row-variants.ts";
import { avatarPortraitSrcProp, avatarSrcProp } from "../lib/message-row-variants.ts";
import type { ArtView } from "./message-row-bubble.tsx";

/** #1728 arm B — a chip in a `1fr` RAIL must hug the centred column's edge or it drifts to the far side of
 *  the margin. Mapped rather than branched, so a new rail member fails tsc here (the house dispatch rule). */
const GUTTER_RAIL_CLASS: Readonly<Record<"none" | "leading" | "trailing", string>> = {
  none: "",
  leading: "@4xl:justify-self-end",
  trailing: "@4xl:justify-self-start",
};

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
}): ReactElement | null {
  if (args.attribution.name === null || !args.showInChatAvatars) {
    return null;
  }
  // The welded portrait spans the card and has no line to align to — offset only the gutter chip.
  // exactOptionalPropertyTypes idiom: OMIT the prop rather than pass `undefined` (the `avatarSrcProp`
  // precedent one file over).
  const railClass = GUTTER_RAIL_CLASS[args.gutterRail];
  const chipClass = cn(args.alignToInsideHeader ? "mt-row" : "", railClass) ?? "";
  // A bare skin (stock document) shows no identity art at all.
  if (args.avatarTreatment === "none") {
    return null;
  }
  // Static illustration art (`imageUrlFor`) has no owned blob to open full size.
  const target = viewTargetFor(args.viewArt, args.imageUrlFor === undefined ? args.attribution.avatarHash : null, args.attribution.name);
  if (args.avatarTreatment === "sticky-portrait") {
    return stickyPortrait(args, target);
  }
  const chip = (
    <Avatar
      size={args.avatarSize}
      shape={args.avatarShape}
      aspect={args.avatarAspect}
      ring={args.avatarRing}
      fallbackDelay={0}
      hueSeed={args.attribution.hueSeed}
      {...(target === null && chipClass !== "" ? { className: chipClass } : {})}
      {...(args.imageUrlFor === undefined ? avatarSrcProp(args.attribution.avatarHash) : { src: args.imageUrlFor("icon") })}
    >
      {initialsFor(args.attribution.name)}
    </Avatar>
  );
  return viewable(target, chipClass, chip);
}

/** The tap target for echo's tile or whisper's band: the speaker's own art, opened in the transcript's viewer. */
export function artViewFor(viewArt: ArtViewer | null, attribution: RowAttribution): ArtView | null {
  if (attribution.name === null) {
    return null;
  }
  const target = viewTargetFor(viewArt, attribution.avatarHash, attribution.name);
  if (target === null) {
    return null;
  }
  return { label: viewImageActionName(target.name), open: (opener) => target.open({ hash: target.hash, name: target.name }, opener) };
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

// `media` sizes the button from its child, so the avatar keeps its own box and the button adds only the press.
function viewable(target: ViewTarget | null, className: string, avatar: ReactElement): ReactElement {
  if (target === null) {
    return avatar;
  }
  return (
    <Button
      aria-label={viewImageActionName(target.name)}
      className={cn(className, "cursor-pointer hover:bg-transparent hover:opacity-80 active:bg-transparent") ?? ""}
      intent="ghost"
      onClick={(event): void => target.open({ hash: target.hash, name: target.name }, event.currentTarget)}
      size="media"
    >
      {avatar}
    </Button>
  );
}

// Ripple's portrait sticks to the top of its card as the row scrolls; wrapped, the button is the sticky flex item.
function stickyPortrait(args: Parameters<typeof renderRowAvatar>[0], target: ViewTarget | null): ReactElement {
  const weldRounding = args.mirrored ? "rounded-l-none rounded-r-card" : "rounded-l-card rounded-r-none";
  const portrait = (
    <Avatar
      size={args.avatarSize}
      shape="square"
      aspect="portrait"
      ring={args.avatarRing}
      fallbackDelay={0}
      hueSeed={args.attribution.hueSeed}
      className={
        cn(
          target === null && "sticky top-0",
          "h-auto w-(--immersive-ripple-portrait-width) @max-md:w-(--immersive-ripple-portrait-width-phone)",
          weldRounding,
        ) ?? ""
      }
      {...(args.imageUrlFor === undefined ? avatarPortraitSrcProp(args.attribution.avatarHash) : { src: args.imageUrlFor("portrait") })}
    >
      {initialsFor(args.attribution.name ?? "")}
    </Avatar>
  );
  return viewable(target, cn("sticky top-0 shrink-0", weldRounding) ?? "", portrait);
}
