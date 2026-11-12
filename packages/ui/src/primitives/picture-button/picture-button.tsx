import type { ReactElement } from "react";
import type { VariantProps } from "tailwind-variants";
import { variantProps } from "#lib";
import type { ButtonCoreProps } from "../button/core.tsx";
import { ButtonCore } from "../button/core.tsx";
import { Icon, ImagePlus, Upload } from "../icons/index.ts";
import { pictureButtonVariants, pictureCueVariants } from "./variants.ts";

/**
 * A button that wraps a picture. The picture's own `alt` or label names it, so no attribute name is required. With no
 * style it draws nothing of its own; `ghost` takes the neutral ghost tint for a picture tile with a caption.
 *
 * `cue="replace"` marks a round picture that a file replaces: a glyph at its corner that the house hover reveal shows on hover and
 * focus (and always where the pointer cannot hover), and a drop layer while the host sets `data-drag-over` on the button.
 */
export type PictureButtonProps = Omit<ButtonCoreProps, "variant" | "tone" | "ink" | "focal" | "placed"> &
  Pick<VariantProps<typeof pictureButtonVariants>, "caption"> &
  PictureReach &
  PictureCue & {
    readonly variant?: "ghost" | undefined;
  };

/** The `floor` reach sets `relative` to anchor its hit area, which would override a `placed` position, so the two are never named together. */
export type PictureReach =
  | { readonly reach?: undefined; readonly placed?: ButtonCoreProps["placed"] }
  | { readonly reach: "floor"; readonly placed?: undefined };

/** The cue's parts are round, so it belongs to the `pill` shape, and it anchors them with `relative`, so it never takes a `placed` position. */
type PictureCue = { readonly cue?: undefined } | { readonly cue: "replace"; readonly shape: "pill"; readonly placed?: undefined };

export function PictureButton({ variant, caption, reach, cue, children, ...rest }: PictureButtonProps): ReactElement {
  const slots = pictureCueVariants();
  return (
    <ButtonCore {...rest} variant={variant} box={variantProps(pictureButtonVariants, { painted: variant !== undefined, caption, reach, cue })}>
      {children}
      {cue === undefined ? null : (
        <>
          <span aria-hidden={true} className={slots.mark()} data-slot="picture-cue-mark">
            <Icon icon={ImagePlus} size="xs" />
          </span>
          <span aria-hidden={true} className={slots.drop()} data-slot="picture-cue-drop">
            <Icon icon={Upload} size="sm" />
          </span>
        </>
      )}
    </ButtonCore>
  );
}
