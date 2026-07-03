import type { ComponentProps, CSSProperties, ReactElement } from "react";
import type { VariantProps } from "tailwind-variants";
import { containerVariants } from "./variants";

export interface ContainerProps
  extends ComponentProps<"div">,
    VariantProps<typeof containerVariants> {
  /** Optional `container-name` so descendants can target `@container/<name>` queries. */
  name?: string;
}

/**
 * THE containment provider — the anchor tier of the 4-tier container model (UI-Arch §4).
 * layout/ OWNS `container-type`: feature code never writes raw containment; it wraps a surface in
 * `<Container>` and the surface's `@container` queries resolve.
 *
 * WHY `name` is a style attr, not a class: the named-container utility would be `@container/${name}`
 * — a dynamic class Tailwind's static scanner cannot see, so it would never be generated. Setting
 * `container-name` via `style={{ containerName: name }}` is the sanctioned exception to the
 * no-inline-style rule (a string value, not a numeric literal — ui-package-design §6.1).
 *
 * Usage: `<Container name="panel" size="md"><MySurface /></Container>`.
 */
export function Container({
  className,
  name,
  size,
  style,
  ...props
}: ContainerProps): ReactElement {
  const named: CSSProperties | undefined =
    name === undefined ? style : { ...style, containerName: name };
  return <div {...props} style={named} className={containerVariants({ size, className })} />;
}
