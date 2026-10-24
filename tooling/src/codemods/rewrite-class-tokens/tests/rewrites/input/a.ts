const base = cn("flex h-control-sm pointer-coarse:min-h-touch-target !w-avatar-lg -ms-slider-inset");
const chunks = `${base} before:size-glyph-xs @max-lg:me-slider-inset data-[orientation=vertical]:h-control-sm w-avatar-lg/50`;
const variants = tv({
  base: "p-4 h-control-sm",
  variants: { size: { sm: ["size-glyph-xs", "min-h-touch-target"] } },
});
const variable = "var(--spacing-glyph-xs)";
const calc = "calc(var(--spacing-control-sm) - var(--spacing-control-smaller))";
const width = `${variable} w-(--spacing-control-sm)`;
// h-control-sm in a comment stays.
const lookalike = "menu-checkbox disabled-checkbox h-control-small";
export { base, chunks, variants, variable, calc, width, lookalike };
