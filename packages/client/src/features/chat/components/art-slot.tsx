// The identity art a row paints beside or above its text: echo's feathered tile and whisper's band. Each asks for
// the image at the width its slot actually renders, and falls back to the speaker's hue fill and initial when there
// is no image or the image fails to load.

import type { AvatarProps } from "@orb/ui/avatar";
import { AVATAR_PIGMENT, Avatar } from "@orb/ui/avatar";
import { Stack } from "@orb/ui/layout";
import type { PictureButtonProps } from "@orb/ui/picture-button";
import { PictureButton } from "@orb/ui/picture-button";
import { Text } from "@orb/ui/text";
import type { ComponentProps, CSSProperties, ReactElement } from "react";
import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from "react";
import { cn } from "#lib";
import type { BubbleDecoration } from "../lib/art-decorations.ts";
import { isFailedArt, rememberFailedArt, subscribeFailedArt } from "../lib/failed-art.ts";

/** Reports whether a row's art failed to load, so the row can drop the chip that would repeat its fallback. */
export type ArtFailedReport = (failed: boolean) => void;

/** A speaker's art as the tap target that opens it full size: `open` receives the button so focus can return to it. */
export interface ArtView {
  readonly label: string;
  readonly control: {
    readonly attach: (opener: HTMLButtonElement | null) => void;
    readonly activate: () => void;
  };
  readonly open: (opener: HTMLElement) => void;
}

// Slot widths snap up to this step so a resize does not refetch the image for every pixel.
const WIDTH_STEP_PX = 16;

// The slot's measured CSS width, the URL asked at that width, and whether that image failed to load.
function useSlotImage(urlAt: ((cssWidth: number) => string) | undefined): {
  /** A callback ref for the slot's element; its measured width drives the request. */
  readonly attach: (element: HTMLDivElement | null) => void;
  readonly url: string | undefined;
  readonly failed: boolean;
} {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const wantsImage = urlAt !== undefined;
  useLayoutEffect(() => {
    if (!wantsImage || element === null) {
      return;
    }
    const measure = (): void => setWidth(Math.ceil(element.getBoundingClientRect().width / WIDTH_STEP_PX) * WIDTH_STEP_PX);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return (): void => observer.disconnect();
  }, [wantsImage, element]);
  const url = urlAt === undefined || width <= 0 ? undefined : urlAt(width);
  // A URL that failed on an earlier mount reads as failed on the first render that knows the URL, so the row never
  // shows the chip it would drop a moment later. The store clears when the network returns, and the probe asks again.
  const failed = useSyncExternalStore(subscribeFailedArt, () => url !== undefined && isFailedArt(url));
  useEffect(() => {
    if (url === undefined || failed) {
      return;
    }
    const probe = new Image();
    probe.onerror = (): void => rememberFailedArt(url);
    probe.src = url;
    return (): void => {
      probe.onerror = null;
    };
  }, [url, failed]);
  return { attach: setElement, url, failed };
}

// The Avatar's look rides on named props of these wrappers, so the variant census reads the Avatar they land on.
const AVATAR_LOOK = ["size", "shape", "aspect", "ring", "cardCorners", "fade", "keepMounted"] as const;
type AvatarLookKey = (typeof AVATAR_LOOK)[number];

// A speaker's art as the control that opens it full size. The bare style: a tint over the art would read as a smudge,
// and the press scale already answers a tap. The picture button sizes itself from its child, so wrapped art keeps its box.
function ArtButton({
  view,
  cardCorners,
  ...button
}: Pick<PictureButtonProps, "cardCorners" | "className" | "children"> & { readonly view: ArtView }): ReactElement {
  return (
    <PictureButton
      {...button}
      cardCorners={cardCorners}
      ref={(opener): void => view.control.attach(opener)}
      aria-label={view.label}
      onClick={(event): void => view.open(event.currentTarget)}
    />
  );
}

// Pointer activation forwards to the chip: one accessible control and one visible focus-return target per row.
function ArtViewButton({ view, corner }: { readonly view: ArtView; readonly corner?: "topStart" | "topEnd" | undefined }): ReactElement {
  return (
    <PictureButton
      aria-hidden="true"
      className="absolute inset-0"
      cardCorners={corner}
      tabIndex={-1}
      onMouseDown={(event): void => event.preventDefault()}
      onClick={view.control.activate}
    />
  );
}

// The initial in the avatar fallback's own ink, the primary's paired ink on the primary-derived art fill, sized by its slot (a size container, so the letter scales with the
// art instead of staying a chip-sized glyph). The art is decorative, so it is hidden from the tree.
export function FallbackLetter({
  initials,
  className,
  scale = "portrait",
}: {
  readonly initials: string;
  readonly className: string;
  readonly scale?: ComponentProps<typeof Text>["artScale"];
}): ReactElement {
  return (
    <Stack align="center" aria-hidden="true" className={className} container="size" justify="center">
      <Text as="div" artScale={scale} tone="primary" ink="toneForeground" voice="monogram" solidLine={true}>
        {initials}
      </Text>
    </Stack>
  );
}

/** Whisper's band: the hue fill with the initial in its solid top, or the banner image over it, under the feather.
 *  An image that fails to load is treated exactly like no image: the plain feather, the initial, and no tap target. */
export function WhisperBand({
  band,
  view,
  onFailedChange,
}: {
  readonly band: NonNullable<BubbleDecoration["headerBand"]>;
  readonly view: ArtView | null;
  readonly onFailedChange?: ArtFailedReport | undefined;
}): ReactElement {
  const { attach, url, failed } = useSlotImage(band.image?.urlAt);
  useFailedReport(failed, onFailedChange);
  const showsImage = url !== undefined && !failed;
  const tappable = view !== null && !failed;
  const style: CSSProperties = { backgroundColor: band.color };
  // The banner image rests dimmed; one that opens full size brightens under the pointer.
  const dim = tappable ? "lift" : "rest";
  return (
    <Stack
      aria-hidden={tappable ? undefined : "true"}
      data-slot="message-band"
      data-pigment={AVATAR_PIGMENT}
      cardCorners="top"
      imageFit="underFeather"
      feather={band.feather}
      featherToward="left"
      artDim={showsImage ? dim : undefined}
      featherSrc={showsImage ? url : undefined}
      // Moonlit Echoes: the banner sits at the card's top right, half its width, and dissolves toward the left; a phone widens
      // it to 55% and keeps it at least a minimum tall. The image rests dimmed and a tap target brightens under the pointer.
      className="relative ms-auto inline-1/2 @max-cq-28:inline-11/20 @max-cq-28:min-block-(--immersive-whisper-band-min-height-phone)"
      cap="whisper"
      ref={attach}
      style={style}
    >
      {band.image === undefined || failed ? (
        <FallbackLetter className="absolute inset-x-0 inset-bs-0 block-3/5" initials={band.fallback} scale="banner" />
      ) : null}
      {tappable ? <ArtViewButton view={view} /> : null}
    </Stack>
  );
}

/** Echo's tile: a positioned pane on the role's side (a portrait's height, Moonlit's fixed mobile height on a phone,
 *  never past the card's own foot), cover-cropped and feathered by its own mask. The mask sits on the inner tile
 *  only, so the button over it is an unmasked layer and its focus ring shows. */
export function EchoArtTile({
  art,
  view,
  onFailedChange,
}: {
  readonly art: NonNullable<BubbleDecoration["art"]>;
  readonly view: ArtView | null;
  readonly onFailedChange?: ArtFailedReport | undefined;
}): ReactElement {
  const { attach, url, failed } = useSlotImage(art.image?.urlAt);
  useFailedReport(failed, onFailedChange);
  const tappable = view !== null && !failed;
  const corner = art.side === "left" ? "topStart" : "topEnd";
  const paintStyle: CSSProperties = { backgroundColor: art.color, backgroundImage: url === undefined || failed ? undefined : `url("${url}")` };
  return (
    <Stack
      aria-hidden={tappable ? undefined : "true"}
      artPane="portrait"
      className={cn("absolute inset-bs-0", tappable ? undefined : "pointer-events-none", art.side === "left" ? "inset-s-0" : "inset-e-0")}
      ref={attach}
    >
      {/* The tile dims with its pane's hover: the button over it takes the pointer, so the tile is never hovered itself. */}
      <Stack
        data-slot="message-echo-art"
        data-pigment={AVATAR_PIGMENT}
        cardCorners={corner}
        hoverDim={tappable ? "parent" : undefined}
        imageFit="cover"
        artMask={art.side === "left" ? "start" : "end"}
        className="absolute inset-0"
        style={paintStyle}
      >
        {art.image === undefined || failed ? <FallbackLetter className="absolute inset-0" initials={art.fallback} /> : null}
      </Stack>
      {tappable ? <ArtViewButton view={view} corner={corner} /> : null}
    </Stack>
  );
}

// Tells the row whether its art failed to load, so the row can drop the letter chip that would repeat the fallback.
// Before paint: as a passive effect WebKit paints one frame with the chip before the row drops it.
function useFailedReport(failed: boolean, onFailedChange: ArtFailedReport | undefined): void {
  useLayoutEffect(() => {
    onFailedChange?.(failed);
  }, [failed, onFailedChange]);
}

/** Ripple's portrait: the Avatar asking for its image at the width its slot renders at (times the pixel ratio),
 *  not a fixed size. With no image the Avatar's own fallback shows. The portrait opens full size through `view`;
 *  one whose image failed to load is plain paint with no tap target, like whisper's band and echo's tile.
 *  `stickyClassName` pins the portrait to the card's top: on the portrait itself unwrapped, on its button wrapped. */
export function PortraitAvatar({
  urlAt,
  view,
  stickyClassName,
  className,
  size,
  shape,
  aspect,
  ring,
  cardCorners,
  fade,
  ...avatar
}: Omit<AvatarProps, AvatarLookKey> &
  Pick<AvatarProps, Exclude<AvatarLookKey, "keepMounted">> & {
    readonly urlAt: ((cssWidth: number) => string) | undefined;
    readonly view: ArtView | null;
    readonly stickyClassName: string;
  }): ReactElement {
  const { attach, url, failed } = useSlotImage(urlAt);
  const tappable = view !== null && !failed;
  const portrait = (
    <Avatar
      ref={attach}
      {...avatar}
      size={size}
      shape={shape}
      aspect={aspect}
      ring={ring}
      cardCorners={cardCorners}
      fade={fade}
      className={cn(tappable ? undefined : stickyClassName, className) ?? ""}
      {...(url === undefined || failed ? {} : { src: url })}
    />
  );
  if (!tappable) {
    return portrait;
  }
  return (
    <ArtButton view={view} cardCorners={cardCorners} className={cn(stickyClassName, "shrink-0") ?? ""}>
      {portrait}
    </ArtButton>
  );
}

/** The gutter chip: the Avatar with its image, opening full size through `view`. A chip whose image failed to load
 *  keeps the Avatar's initials and drops the tap target, like the other styles' art. `layoutClassName` seats the chip on
 *  whichever element is outermost: the chip, or the button that opens it. */
export function ChipAvatar({
  src,
  view,
  layoutClassName,
  size,
  shape,
  aspect,
  ring,
  cardCorners,
  fade,
  ...avatar
}: Omit<AvatarProps, "className" | "src" | AvatarLookKey> &
  Pick<AvatarProps, Exclude<AvatarLookKey, "keepMounted">> & {
    readonly src?: string;
    readonly view: ArtView | null;
    readonly layoutClassName: string;
  }): ReactElement {
  const { attach, failed } = useSlotImage(src === undefined ? undefined : (): string => src);
  const tappable = view !== null && !failed;
  const chip = (
    <Avatar
      ref={attach}
      {...avatar}
      size={size}
      shape={shape}
      aspect={aspect}
      ring={ring}
      cardCorners={cardCorners}
      fade={fade}
      className={tappable ? "" : layoutClassName}
      {...(src === undefined || failed ? {} : { src })}
    />
  );
  if (!tappable) {
    return chip;
  }
  return (
    <ArtButton view={view} className={layoutClassName}>
      {chip}
    </ArtButton>
  );
}
