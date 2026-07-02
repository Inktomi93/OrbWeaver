import { tv } from "tailwind-variants";

// The media-grid cell skin (ui-package-design §6.1 / work-order #6). Cells are square (aspect
// reserved by the grid host, not by the image) so nothing shifts while thumbnails lazy-load. The
// `group` parent lets the selected badge react to `data-selected` without a second wrapper.
export const mediaGridVariants = tv({
  slots: {
    root: "relative overflow-auto overscroll-contain",
    cell: [
      "group relative flex aspect-square cursor-pointer items-center justify-center overflow-hidden rounded-control bg-muted outline-none",
      "transition-colors duration-(--motion-fast) ease-out-expo",
      "hover:ring-2 hover:ring-ring/50",
      "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      "data-selected:ring-2 data-selected:ring-primary",
    ],
    image: "h-full w-full object-cover",
    placeholder: "h-full w-full bg-muted",
    selectedBadge:
      "absolute top-field right-field flex items-center justify-center rounded-full bg-primary p-field text-primary-foreground",
  },
});
