import type { ComponentProps, CSSProperties, ReactElement } from "react";
import type { VariantProps } from "tailwind-variants";
import { stackVariants } from "./variants.ts";

export interface StackProps extends ComponentProps<"div">, VariantProps<typeof stackVariants> {
  readonly featherSrc?: string | undefined;
}

/**
 * Vertical flex stack on the intent-token spacing scale (UI-Arch §4; ui-package-design §6.1).
 *
 * Usage: `<Stack gap="row" padding="block">…</Stack>` — never `className="flex flex-col gap-2"`
 * in feature code (gate no-raw-spacing: structural layout goes through layout primitives).
 */
export function Stack({
  className,
  gap,
  align,
  justify,
  padding,
  rows,
  container,
  hiddenAt,
  srOnlyAt,
  touchFloor,
  divider,
  dividerWeight,
  dividerTone,
  dividerStyle,
  receded,
  ground,
  plate,
  highlight,
  spoiler,
  slide,
  lifted,
  fade,
  fadeFrom,
  ink,
  opacityMotion,
  focusTarget,
  scrollFade,
  cardCorners,
  hoverDim,
  imageFit,
  artDecoration,
  artMask,
  artPane,
  columnMeasure,
  feather,
  featherSrc,
  style,
  arrival,
  ...props
}: StackProps): ReactElement {
  const imageStyle: (CSSProperties & { "--art-image"?: string }) | undefined =
    featherSrc === undefined ? style : { ...style, "--art-image": `url("${featherSrc}")` };
  return (
    <div
      {...props}
      data-art-image={feather === undefined ? undefined : featherSrc !== undefined}
      style={imageStyle}
      className={stackVariants({
        gap,
        align,
        justify,
        padding,
        rows,
        container,
        hiddenAt,
        srOnlyAt,
        touchFloor,
        divider,
        dividerWeight,
        dividerTone,
        dividerStyle,
        receded,
        ground,
        plate,
        highlight,
        spoiler,
        slide,
        lifted,
        fade,
        fadeFrom,
        ink,
        opacityMotion,
        focusTarget,
        scrollFade,
        cardCorners,
        hoverDim,
        imageFit,
        artDecoration,
        artMask,
        artPane,
        columnMeasure,
        feather,
        arrival,
        className,
      })}
    />
  );
}
