import { afterEach, describe, vi } from "vitest";
import { withViewTransition } from "../../../packages/client/src/lib/view-transition.ts";
import { expect, test } from "../../support/fixtures.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("withViewTransition", () => {
  test("uses the native transition when neither reduced-motion preference is active", () => {
    const update = vi.fn();
    const start = vi.fn((callback: () => void) => callback());
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    vi.stubGlobal("document", { querySelector: () => null, startViewTransition: start });

    withViewTransition(update);

    expect(start).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledOnce();
  });

  test("skips the native snapshot when the app-level reduced-motion preference is active", () => {
    const update = vi.fn();
    const start = vi.fn();
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    vi.stubGlobal("document", { querySelector: (selector: string) => (selector === '[data-reduced-motion="true"]' ? {} : null), startViewTransition: start });

    withViewTransition(update);

    expect(start).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledOnce();
  });
});
