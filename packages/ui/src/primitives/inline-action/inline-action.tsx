import type { ReactElement } from "react";
import type { VariantProps } from "tailwind-variants";
import type { ToneInkSelection } from "#lib";
import { variantProps } from "#lib";
import type { ButtonCoreProps } from "../button/core.tsx";
import { ButtonCore } from "../button/core.tsx";
import { inlineActionVariants } from "./variants.ts";

export type InlineStep = NonNullable<VariantProps<typeof inlineActionVariants>["step"]>;

/** A text-height action draws no fill, so it takes only the fill-less styles and never the focal lift. */
export type InlineActionProps = Omit<ButtonCoreProps, "variant" | "tone" | "ink" | "focal"> &
  ToneInkSelection & {
    /** @defaultValue "ghost" */
    readonly variant?: "ghost" | "link" | undefined;
    readonly step: InlineStep;
  };

export function InlineAction({ step, variant = "ghost", ...rest }: InlineActionProps): ReactElement {
  return <ButtonCore {...rest} variant={variant} box={variantProps(inlineActionVariants, { step })} />;
}
