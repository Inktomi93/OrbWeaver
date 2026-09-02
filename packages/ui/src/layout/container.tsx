import type { ComponentProps, CSSProperties, ReactElement } from "react";
import type { VariantProps } from "tailwind-variants";
import { variantProps } from "#lib";
import { containerVariants } from "./variants.ts";

export interface ContainerProps extends ComponentProps<"div">, VariantProps<typeof containerVariants> {
  /** Optional `container-name` so descendants can target `@container/<name>` queries. */
  name?: string;
}

// `name` is a style attr, not a class: `@container/${name}` is a dynamic class Tailwind's static
// scanner cannot see, so `container-name` goes through `style` instead (sanctioned inline-style exception).
export function Container({ className, name, size, style, ...props }: ContainerProps): ReactElement {
  const named: CSSProperties | undefined = name === undefined ? style : { ...style, containerName: name };
  // The className AND the `data-size` axis stamp, from ONE selection object (#1080). `size` has no
  // `defaultVariants` arm here, so an unset container stamps nothing rather than a guessed default.
  return <div {...props} style={named} {...variantProps(containerVariants, { size }, className)} />;
}
