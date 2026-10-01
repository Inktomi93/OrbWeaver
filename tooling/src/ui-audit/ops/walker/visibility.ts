// Shared rendered/operable predicates, composed inside WALKER_PRIMITIVES for every census and backdrop probe.
// Inactivity alone does not hide paint; an off-frame retained box must also leave its subject wholly off-frame.
import { refuseDirectInvocation } from "../../../_shared/entrypoint.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route> --design-audit");

export const WALKER_VISIBILITY = `  function isOutsideViewport(rect) {
    return rect.width > 0 && rect.height > 0 &&
      (rect.right <= 0 || rect.bottom <= 0 || rect.left >= document.documentElement.clientWidth || rect.top >= document.documentElement.clientHeight);
  }
  function isVisible(el) {
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
  function isOperable(el) {
    return isVisible(el) && el.closest("[inert],[aria-hidden='true']") === null;
  }
`;
