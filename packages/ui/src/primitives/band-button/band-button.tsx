import type { ReactElement } from "react";
import { variantProps } from "#lib";
import type { ButtonCoreProps, ButtonPaint, ButtonStretch } from "../button/core.tsx";
import { ButtonCore } from "../button/core.tsx";
import { bandButtonVariants } from "./variants.ts";

/** A band is a control, so it carries a name: a text child or an attribute. */
type BandButtonProps = ButtonCoreProps & ButtonPaint & ButtonStretch;

/** The control that names a region in a list pane. Its box is the sm height with the tight gap and inset. */
export function BandButton({ variant = "ghost", ...rest }: BandButtonProps): ReactElement {
  return <ButtonCore {...rest} variant={variant} box={variantProps(bandButtonVariants, {})} />;
}
