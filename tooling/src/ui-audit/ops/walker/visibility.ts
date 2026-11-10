// Shared rendered/operable predicates, composed inside WALKER_PRIMITIVES for every census and backdrop probe.
// Inactivity alone does not hide paint; an off-frame retained box must also leave its subject wholly off-frame.
import { refuseDirectInvocation } from "../../../floor/cli/entrypoint.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route> --design-audit");

/** The rendered, visible and operable predicates.
 *  @remarks `isRendered` means laid out with a box, though a clip may hide its paint, so an sr-only node is rendered.
 *  The heading outline, the tab order and the families that exclude sr-only text under a named reason read it, so that
 *  reason stays in their accounting. `isVisible` adds core.ts's `isVisuallyHidden`: a clipped box paints nothing, so
 *  every paint and geometry rule reads it. `isOperable` stays rendered-based because the tap-target census names its
 *  sr-only stubs itself. */
export const WALKER_VISIBILITY = `  function isOutsideViewport(rect) {
    return rect.width > 0 && rect.height > 0 &&
      (rect.right <= 0 || rect.bottom <= 0 || rect.left >= document.documentElement.clientWidth || rect.top >= document.documentElement.clientHeight);
  }
  function isRendered(el) {
    if (!(el instanceof Element)) return false;
    var targetStyle = getComputedStyle(el);
    if (targetStyle.visibility === "hidden" || targetStyle.visibility === "collapse") return false;
    var rect = el.getBoundingClientRect();
    var outsideViewport = isOutsideViewport(rect);
    for (var renderAncestor = el; renderAncestor !== null; renderAncestor = renderAncestor.parentElement) {
      var ancestorStyle = getComputedStyle(renderAncestor);
      if (renderAncestor.hidden || ancestorStyle.display === "none") return false;
      if (outsideViewport && renderAncestor.matches("[inert][aria-hidden='true']") && isOutsideViewport(renderAncestor.getBoundingClientRect())) return false;
    }
    if (accumulatedOpacity(el) === 0) return false;
    return rect.width > 0 && rect.height > 0;
  }
  function isVisible(el) {
    return isRendered(el) && !isVisuallyHidden(el);
  }
  function isOperable(el) {
    return isRendered(el) && el.closest("[inert],[aria-hidden='true']") === null;
  }
`;
