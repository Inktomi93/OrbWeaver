// The ONE importable interactive-element vocabulary for the ui-audit walker fleet (#1074, orb-ui
// mechanism audit F2). `INTERACTIVE_SELECTOR` (ops/walker/core.ts) omitted `textarea` and `summary`
// while five sibling census vocabularies (`INTERACTIVE_CTX` core.ts, `INTERACTIVE_ISLAND_SELECTOR`
// census-decor.ts, `CHILD_SUBSTANTIVE_SEL` census-quality.ts, `IMPLICIT_ROLES` census-interactive.ts)
// already carried both — so Textarea/MacroTextarea (a native `<textarea>`, textarea.tsx:54) and
// ToolCallBlock's `<summary>` disclosure were invisible to tap-target, aria-name, door, obscured,
// row-void binding, and the composite-credit veto: vocabulary DRIFT, not a judgment call. String-union
// dispatch discipline (Spine-TypeScript-and-Patterns.md): one importable tuple, derived selector text,
// every consumer imports it — a sixth interactive tag cannot fork a new hand-typed literal.
export const INTERACTIVE_TAGS = ["a", "button", "input", "select", "textarea", "summary"] as const;
type InteractiveTag = (typeof INTERACTIVE_TAGS)[number];

/** ARIA-role equivalent the base "is this an offered control" vocabulary recognizes alongside the
 *  native tags above (`[role=button]` — a Base UI primitive rendered on a non-native element). */
export const INTERACTIVE_ROLES = ["button"] as const;

/** The tag portion of the vocabulary, with `a` swapped for the href-qualified form some consumers
 *  need (an anchor with no `href` offers no navigation, `census-quality.ts`'s `CHILD_SUBSTANTIVE_SEL`) —
 *  still derived from the ONE tuple, so textarea/summary reach that consumer too. */
export function interactiveTagSelector(options?: { readonly anchorRequiresHref?: boolean }): readonly string[] {
  const anchorRequiresHref = options?.anchorRequiresHref ?? false;
  return INTERACTIVE_TAGS.map((tag) => (tag === "a" && anchorRequiresHref ? "a[href]" : tag));
}

const INTERACTIVE_BASE_SELECTOR = [...interactiveTagSelector(), ...INTERACTIVE_ROLES.map((role) => `[role=${role}]`), "[tabindex]"].join(",");

/** Interpolated into the walker's in-page JS (the `INACTIVE_KIND_EXPR` precedent, `_shared/wcag.ts`):
 *  the base tap-target/aria-name/door/obscured/row-void/composite-credit selector — `ops/walker/core.ts`'s
 *  `INTERACTIVE_SELECTOR` is spelled EXACTLY ONCE, here, so it cannot drift from its siblings again. */
export const INTERACTIVE_SELECTOR_JS = JSON.stringify(INTERACTIVE_BASE_SELECTOR);

/** The implicit ARIA role for every native interactive tag EXCEPT `input` (whose role depends on its
 *  `type` attribute and is dispatched separately, `census-interactive.ts`'s `doorRole`) — keyed
 *  EXHAUSTIVELY off `INTERACTIVE_TAGS` so a tag added to the tuple without a role mapping is a compile
 *  error (`Exclude<InteractiveTag, "input">`), never a silent gap in the door-name census. */
export const IMPLICIT_INTERACTIVE_ROLES: Record<Exclude<InteractiveTag, "input">, string> = {
  a: "link",
  button: "button",
  select: "combobox",
  textarea: "textbox",
  summary: "button",
};
export const IMPLICIT_INTERACTIVE_ROLES_JS = JSON.stringify(IMPLICIT_INTERACTIVE_ROLES);
