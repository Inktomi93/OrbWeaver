import type { Page } from "@playwright/test";

// The keyboard is an OWN-PROPERTY getter on the page's one `visualViewport`, shadowing the prototype's, so
// the native height keeps flowing through it (a real viewport change still reads) minus the covered band.
// `offsetTop` and `innerHeight` stay native: on iOS the layout viewport keeps its full height under the
// keyboard, which is why `readKeyboardInset` measures the visual viewport at all. The getter lives as long
// as the document; a reload drops it, like a real keyboard dismissed by navigation.
/** Emulate the visual viewport covered by a keyboard without resizing the layout viewport. */
export async function emulateSoftKeyboard(page: Page, coveredHeight: number): Promise<void> {
  await page.evaluate((height) => {
    // Tooling compiles without the DOM lib, so the in-page globals are reached structurally.
    const viewport = Reflect.get(globalThis, "visualViewport") as { dispatchEvent: (event: Event) => boolean } | null | undefined;
    if (viewport === null || viewport === undefined) {
      throw new Error("--soft-keyboard needs window.visualViewport, which this page does not have");
    }
    const state = Reflect.get(globalThis, "__snapSoftKeyboard") as { height: number } | undefined;
    if (state === undefined) {
      const nativeHeight = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(viewport) as object, "height")?.get;
      if (nativeHeight === undefined) {
        throw new Error("--soft-keyboard could not find VisualViewport's native height getter");
      }
      const created = { height };
      Reflect.set(globalThis, "__snapSoftKeyboard", created);
      Object.defineProperty(viewport, "height", {
        configurable: true,
        get: (): number => Math.max(0, (nativeHeight.call(viewport) as number) - created.height),
      });
    } else {
      state.height = height;
    }
    // Both events `keyboard-inset.ts` subscribes to: iOS resizes the visual viewport and scrolls it. `offsetTop`
    // stays the native value, 0 unless the page itself scrolled the visual viewport, so the inset arithmetic
    // (innerHeight - offsetTop - height) reads exactly the keyboard band.
    viewport.dispatchEvent(new Event("resize"));
    viewport.dispatchEvent(new Event("scroll"));
  }, coveredHeight);
}
