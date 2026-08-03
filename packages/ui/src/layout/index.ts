/**
 * `@orb/ui/layout` — the layout primitives + the containment provider (UI-Arch §4;
 * ui-package-design §6.1). Structural spacing in feature code goes through THESE (intent-token
 * variants), never raw scale classes; `<Container>` is the one writer of `container-type`.
 */

export type { ContainerProps } from "./container.tsx";
export { Container } from "./container.tsx";
export type { GridProps } from "./grid.tsx";
export { Grid } from "./grid.tsx";
export type { RowProps } from "./row.tsx";
export { Row } from "./row.tsx";
export type { SectionProps } from "./section.tsx";
export { Section } from "./section.tsx";
export type { StackProps } from "./stack.tsx";
export { Stack } from "./stack.tsx";
export type { SurfaceProps, SurfaceTier } from "./surface.tsx";
export { Surface } from "./surface.tsx";
export type { ToolbarButtonProps, ToolbarProps, ToolbarSeparatorProps } from "./toolbar.tsx";
export { Toolbar, ToolbarButton, ToolbarSeparator } from "./toolbar.tsx";
