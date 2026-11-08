import type { ComponentProps, CSSProperties, ReactElement } from "react";
import type { VariantProps } from "tailwind-variants";
import { stackVariants } from "./variants.ts";

export interface StackProps extends ComponentProps<"div">, VariantProps<typeof stackVariants> {
  readonly featherSrc?: string | undefined;
  /** The CSS length a `reserve` box holds. */
  readonly reserveBlock?: string | undefined;
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
  gapNarrow,
  align,
  justify,
  padding,
  paddingInline,
  paddingBlock,
  paddingBlockStart,
  paddingBlockEnd,
  paddingInlineStart,
  paddingInlineEnd,
  paddingInlineNarrow,
  paddingBlockStartNarrow,
  paddingInlineEndNarrow,
  indent,
  layer,
  passThrough,
  reach,
  readingFlow,
  rows,
  container,
  hiddenAt,
  srOnlyAt,
  touchFloor,
  divider,
  dividerWeight,
  dividerTone,
  dividerStyle,
  tone,
  receded,
  ground,
  plate,
  fade,
  fadeFrom,
  ink,
  cap,
  width,
  centred,
  grow,
  floor,
  push,
  maxHeight,
  self,
  placed,
  textAlign,
  order,
  height,
  minHeight,
  minWidth,
  focusTarget,
  scroll,
  scrollFade,
  cardCorners,
  hoverDim,
  imageFit,
  artDecoration,
  artMask,
  artPane,
  columnMeasure,
  feather,
  featherToward,
  artDim,
  featherSrc,
  reserve,
  reserveBlock,
  style,
  arrival,
  ...props
}: StackProps): ReactElement {
  const imageStyle: (CSSProperties & { "--art-image"?: string; "--stack-reserve"?: string }) | undefined =
    featherSrc === undefined && reserveBlock === undefined
      ? style
      : {
          ...style,
          ...(featherSrc === undefined ? {} : { "--art-image": `url("${featherSrc}")` }),
          ...(reserveBlock === undefined ? {} : { "--stack-reserve": reserveBlock }),
        };
  return (
    <div
      data-tone={tone}
      {...props}
      data-art-image={feather === undefined ? undefined : featherSrc !== undefined}
      style={imageStyle}
      className={stackVariants({
        gap,
        gapNarrow,
        align,
        justify,
        padding,
        paddingInline,
        paddingBlock,
        paddingBlockStart,
        paddingBlockEnd,
        paddingInlineStart,
        paddingInlineEnd,
        paddingInlineNarrow,
        paddingBlockStartNarrow,
        paddingInlineEndNarrow,
        indent,
        layer,
        passThrough,
        reach,
        readingFlow,
        rows,
        container,
        hiddenAt,
        srOnlyAt,
        touchFloor,
        divider,
        dividerWeight,
        dividerTone,
        dividerStyle,
        tone,
        receded,
        ground,
        plate,
        fade,
        fadeFrom,
        ink,
        cap,
        width,
        centred,
        grow,
        floor,
        push,
        maxHeight,
        self,
        placed,
        textAlign,
        order,
        height,
        minHeight,
        minWidth,
        focusTarget,
        scroll,
        scrollFade,
        cardCorners,
        hoverDim,
        imageFit,
        artDecoration,
        artMask,
        artPane,
        columnMeasure,
        feather,
        featherToward,
        artDim,
        reserve,
        arrival,
        className,
      })}
    />
  );
}
