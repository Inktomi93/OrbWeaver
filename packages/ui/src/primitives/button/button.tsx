import type { ReactElement } from "react";
import { use } from "react";
import type { ControlSize } from "#lib";
import { ButtonWrapContext } from "./button-wrap.ts";
import type { ButtonCoreProps, ButtonPaint, ButtonStretch } from "./core.tsx";
import { ButtonCore } from "./core.tsx";

/** Every Button prop EXCEPT the accessible-name requirement and the box reshapes — the shape a wrapper seal extends. */
export interface ButtonBaseProps extends ButtonCoreProps {
  /** The D336 control scale step. @defaultValue "md" */
  size?: ControlSize | undefined;
}

/** A button that carries its own name as an attribute — free to take ANY box, including the icon-only `square`.
 *  Two members rather than one optional pair: `aria-label?: string | undefined` would be satisfied by omitting it. */
type NamedButtonProps = ButtonBaseProps & ({ "aria-label": string } | { "aria-labelledby": string });

/** Or the box leaves room for a text child, which names the button the way N1 prefers. A shape the caller computes
 *  (`square={dense}`) is NOT assignable here — a box that MIGHT be icon-only is treated as icon-only, so such a call
 *  site states its name. */
type TextButtonProps = ButtonBaseProps & { square?: false | undefined };

/**
 * A box that is not a scale step leaves `size` (D336): `square` (icon-only), `wrap` (multiline) and `stacked` (a line
 * per fact) reshape a scale step, so none combines with another. A square also takes no `stretch`: it is its step's
 * width, not a share of the row. A glyph, band, inline-text or picture box is its own component.
 */
type ButtonBox =
  | { square?: false | undefined; wrap?: false | undefined; stacked?: false | undefined }
  | { square: boolean; wrap?: false | undefined; stacked?: false | undefined; stretch?: undefined; width?: undefined; grow?: undefined }
  | { wrap: boolean; square?: false | undefined; stacked?: false | undefined; minHeight?: undefined }
  | { stacked: boolean; square?: false | undefined; wrap?: false | undefined; minHeight?: undefined };

/**
 * ONE of the two: named by an attribute, or sized so a text child can name it. An icon-only box with no
 * `aria-label`/`aria-labelledby` matches neither and fails `tsc` — the compile-time half of §13.10 N1. The runtime half
 * (`ui-audit`'s `checkAccessibleName`) still catches the shapes a type cannot see, e.g. an empty string.
 */
export type ButtonProps = (NamedButtonProps | TextButtonProps) & ButtonPaint & ButtonBox & ButtonStretch;

export function Button({ variant = "solid", size = "md", square, wrap: stated, stacked, ...rest }: ButtonProps): ReactElement {
  const hostWraps = use(ButtonWrapContext);
  // The scale keeps the `wrap` key whole, so the class-owner census maps it onto the button.wrap axis.
  const wrap = stated ?? (hostWraps && square !== true && stacked !== true ? true : undefined);
  return <ButtonCore {...rest} variant={variant} scale={{ size, square, wrap, stacked }} />;
}
