import type { Ref, RefCallback } from "react";
import { useLayoutEffect, useRef } from "react";

// `field-sizing: content` is the native autosize, and the skin keeps it where the browser has it. Below that
// (Safari before 26.2, Firefox before 152) the box is measured and sized in script instead, from the same
// content, inside the same min and max rows (those ride `min-height` and `max-height`, which clamp the height set here).

// Asked at each use, not once at load, so the answer follows the document the field is in.
function nativeFieldSizing(): boolean {
  return CSS.supports("field-sizing", "content");
}

// `field-sizing` only sizes a box whose block size is auto, so a caller that fixes the height keeps it.
function sizeToContent(field: HTMLTextAreaElement): void {
  field.style.height = "";
  const authored = field.computedStyleMap().get("block-size");
  if (!(authored instanceof CSSKeywordValue && authored.value === "auto")) {
    return;
  }
  const scrolled = field.scrollTop;
  // A zero height lets the scroll height report the content alone; the min and max rows then clamp the height set below.
  field.style.height = "0";
  const chrome = field.offsetHeight - field.clientHeight;
  field.style.height = `${field.scrollHeight + chrome}px`;
  field.scrollTop = scrolled;
}

function assign<T>(ref: Ref<T> | undefined, node: T | null): ReturnType<RefCallback<T>> {
  if (typeof ref === "function") {
    return ref(node);
  }
  if (ref) {
    ref.current = node;
  }
  return undefined;
}

/**
 * The script arm of `field-sizing: content` for a textarea: returns the ref to put on it. Where the browser has the
 * property this does nothing. Otherwise it sizes the box when it mounts, on each input, on each commit (a controlled
 * value changes without an input event) and when its width changes and the lines rewrap. The mount sizing runs in the
 * commit, before the first paint. Pass the caller's own ref as `forwardedRef` so both receive the node.
 */
export function useFieldSizingFallback(forwardedRef?: Ref<HTMLTextAreaElement>): RefCallback<HTMLTextAreaElement> {
  const node = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    if (node.current !== null && !nativeFieldSizing()) {
      sizeToContent(node.current);
    }
  });
  return (field) => {
    node.current = field;
    const forwarded = assign(forwardedRef, field);
    if (field === null || nativeFieldSizing()) {
      return forwarded;
    }
    const resize = (): void => sizeToContent(field);
    resize();
    field.addEventListener("input", resize);
    let width = field.offsetWidth;
    const observer = new ResizeObserver(() => {
      if (field.offsetWidth !== width) {
        width = field.offsetWidth;
        resize();
      }
    });
    observer.observe(field);
    return () => {
      field.removeEventListener("input", resize);
      observer.disconnect();
      node.current = null;
      if (typeof forwarded === "function") {
        forwarded();
      } else {
        assign(forwardedRef, null);
      }
    };
  };
}
