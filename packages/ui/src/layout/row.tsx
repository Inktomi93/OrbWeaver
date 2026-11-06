import type { ComponentProps, ReactElement } from "react";
import type { VariantProps } from "tailwind-variants";
import { rowVariants } from "./variants.ts";

export interface RowProps extends ComponentProps<"div">, VariantProps<typeof rowVariants> {}

/**
 * Horizontal flex row on the intent-token spacing scale (UI-Arch §4; ui-package-design §6.1).
 *
 * Usage: `<Row gap="field" justify="between">…</Row>`.
 */
export function Row({
  className,
  gap,
  align,
  justify,
  padding,
  paddingInline,
  paddingBlock,
  hiddenAt,
  srOnlyAt,
  touchFloor,
  reveal,
  divider,
  dividerWeight,
  dividerTone,
  dividerStyle,
  tone,
  receded,
  inertUntilHover,
  focusTarget,
  scrollFade,
  ground,
  plate,
  cardCorners,
  tracks,
  ...props
}: RowProps): ReactElement {
  return (
    <div
      data-tone={tone}
      {...props}
      className={rowVariants({
        gap,
        align,
        justify,
        padding,
        paddingInline,
        paddingBlock,
        hiddenAt,
        srOnlyAt,
        touchFloor,
        reveal,
        divider,
        dividerWeight,
        dividerTone,
        dividerStyle,
        tone,
        receded,
        inertUntilHover,
        focusTarget,
        scrollFade,
        ground,
        plate,
        cardCorners,
        tracks,
        className,
      })}
    />
  );
}
