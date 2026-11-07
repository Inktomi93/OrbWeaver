import type { ReactElement } from "react";
import type { ControlSize } from "#lib";
import type { ButtonCoreProps, ButtonPaint } from "./core.tsx";
import { ButtonCore } from "./core.tsx";
import type { ButtonSize } from "./variants.ts";

/** Every Button prop EXCEPT the accessible-name requirement and the box reshapes — the shape a wrapper seal extends. */
export interface ButtonBaseProps extends ButtonCoreProps {
  /** The D336 control scale step, or the `band` and `stacked` boxes. @defaultValue "md" */
  size?: ButtonSize | undefined;
}

/** A button that carries its own name as an attribute — free to take ANY box, including the icon-only `square`.
 *  Two members rather than one optional pair: `aria-label?: string | undefined` would be satisfied by omitting it. */
type NamedButtonProps = ButtonBaseProps & ({ "aria-label": string } | { "aria-labelledby": string });

/** Or the box leaves room for a text child, which names the button the way N1 prefers. A shape the caller computes
 *  (`square={dense}`) is NOT assignable here — a box that MIGHT be icon-only is treated as icon-only, so such a call
 *  site states its name. */
type TextButtonProps = ButtonBaseProps & { square?: false | undefined };

/**
 * A box that is not a scale step leaves `size` (D336): `square` for icon-only and `wrap` for multiline reshape a scale
 * step, so neither combines with the other, nor with the `band` and `stacked` boxes. A glyph, inline-text or picture box is
 * its own component.
 */
type ButtonBox =
  | { square?: false | undefined; wrap?: false | undefined }
  | { square: boolean; wrap?: false | undefined; size?: ControlSize | undefined }
  | { wrap: boolean; square?: false | undefined; size?: ControlSize | undefined };

/**
 * ONE of the two: named by an attribute, or sized so a text child can name it. An icon-only box with no
 * `aria-label`/`aria-labelledby` matches neither and fails `tsc` — the compile-time half of §13.10 N1. The runtime half
 * (`ui-audit`'s `checkAccessibleName`) still catches the shapes a type cannot see, e.g. an empty string.
 */
export type ButtonProps = (NamedButtonProps | TextButtonProps) & ButtonPaint & ButtonBox;

export function Button({ variant = "solid", size = "md", square, wrap, ...rest }: ButtonProps): ReactElement {
  return <ButtonCore {...rest} variant={variant} scale={{ size, square, wrap }} />;
}
