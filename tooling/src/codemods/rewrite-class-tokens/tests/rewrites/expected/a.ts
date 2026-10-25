const base = cn("flex h-(--size-control-sm) pointer-coarse:min-h-(--size-touch-target) !w-(--size-avatar-lg) -ms-(--size-slider-inset)");
const chunks = `${base} before:size-(--size-glyph-xs) @max-cq-32:me-slider-inset data-[orientation=vertical]:h-(--size-control-sm) w-1/2 h-(--leading-label) h-3/4 @cq-28/save-bar:order-none @cq-96:flex`;
const variants = tv({
  base: "p-row h-(--size-control-sm)",
  variants: { size: { sm: ["size-(--size-glyph-xs)", "min-h-(--size-touch-target)"] } },
});
const variable = "var(--size-glyph-xs)";
const calc = "calc(var(--size-control-sm) - var(--spacing-control-smaller))";
const width = `${variable} w-(--size-control-sm)`;
// h-control-sm in a comment stays.
const lookalike = "menu-checkbox disabled-checkbox h-control-small";
export { base, chunks, variants, variable, calc, width, lookalike };
