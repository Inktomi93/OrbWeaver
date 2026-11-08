import type { ReactElement } from "react";
import type { VariantProps } from "tailwind-variants";
import { variantProps } from "#lib";
import type { ButtonCoreProps } from "../button/core.tsx";
import { ButtonCore } from "../button/core.tsx";
import { pictureButtonVariants } from "./variants.ts";

/**
 * A button that wraps a picture. The picture's own `alt` or label names it, so no attribute name is required. With no
 * style it draws nothing of its own; `ghost` takes the neutral ghost tint for a picture tile with a caption.
 */
export type PictureButtonProps = Omit<ButtonCoreProps, "variant" | "tone" | "ink" | "focal" | "placed"> &
  Pick<VariantProps<typeof pictureButtonVariants>, "caption"> &
  PictureReach & {
    readonly variant?: "ghost" | undefined;
  };

/** The `floor` reach sets `relative` to anchor its hit area, which would override a `placed` position, so the two are never named together. */
export type PictureReach =
  | { readonly reach?: undefined; readonly placed?: ButtonCoreProps["placed"] }
  | { readonly reach: "floor"; readonly placed?: undefined };

export function PictureButton({ variant, caption, reach, ...rest }: PictureButtonProps): ReactElement {
  return <ButtonCore {...rest} variant={variant} box={variantProps(pictureButtonVariants, { painted: variant !== undefined, caption, reach })} />;
}
