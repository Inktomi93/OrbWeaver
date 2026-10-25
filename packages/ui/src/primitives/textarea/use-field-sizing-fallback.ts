import type { Ref, RefCallback } from "react";
import { useLayoutEffect, useRef } from "react";

// `field-sizing: content` is the native autosize, and the skin keeps it where the browser has it. Below that
// (Safari before 26.2, Firefox before 152) the box is measured and sized in script instead, from the same
// content, inside the same min and max rows (those ride `min-height` and `max-height`, which clamp the height set here).
// Only `getComputedStyle` is read: `computedStyleMap` is not in Firefox, and Firefox 138 to 151 runs this arm.

interface Sized {
  /** The text the height was measured for. */
  value: string;
  /** The inline height this hook wrote, so a different inline height is known to be the caller's. */
  height: string;
  /** Whether a class fixes the height, so `field-sizing` would never have sized the box. Read once, at mount. */
  fixedByCascade: boolean;
}
const sized = new WeakMap<HTMLTextAreaElement, Sized>();

// Asked at each use, not once at load, so the answer follows the document the field is in.
function nativeFieldSizing(): boolean {
  return CSS.supports("field-sizing", "content");
}

// `field-sizing` only sizes a box whose block size is auto: the cascade's height is the `auto` height or it is fixed.
function fixedByCascade(field: HTMLTextAreaElement): boolean {
  field.style.height = "";
  const cascade = getComputedStyle(field).height;
  field.style.height = "auto";
  const auto = getComputedStyle(field).height;
  field.style.height = "";
  return cascade !== auto;
}

function sizeToContent(field: HTMLTextAreaElement): void {
  const own = sized.get(field);
  // An inline height that this hook did not write is the caller's, and wins.
  if (field.style.height !== "" && field.style.height !== own?.height) {
    return;
  }
  const fixed = own?.fixedByCascade ?? fixedByCascade(field);
  if (fixed) {
    sized.set(field, { value: field.value, height: "", fixedByCascade: true });
    return;
  }
  const scrolled = field.scrollTop;
  // A zero height lets the scroll height report the content alone; the min and max rows then clamp the height set below.
  field.style.height = "0";
  const chrome = field.offsetHeight - field.clientHeight;
  const height = `${field.scrollHeight + chrome}px`;
  field.style.height = height;
  field.scrollTop = scrolled;
  sized.set(field, { value: field.value, height, fixedByCascade: false });
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
 * property this does nothing. Otherwise it sizes the box when it mounts (in the commit, before the first paint), on
 * each input, when `value` changes without an input event, and when its width changes and the lines rewrap.
 * Pass the caller's own ref as `forwardedRef` so both receive the node.
 */
export function useFieldSizingFallback(forwardedRef?: Ref<HTMLTextAreaElement>): RefCallback<HTMLTextAreaElement> {
  const node = useRef<HTMLTextAreaElement | null>(null);
  // Every commit asks, but only a changed value measures: reading `value` forces no layout, and a controlled value changes with no input event.
  useLayoutEffect(() => {
    const field = node.current;
    if (field !== null && !nativeFieldSizing() && sized.get(field)?.value !== field.value) {
      sizeToContent(field);
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
