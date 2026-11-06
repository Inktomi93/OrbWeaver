import { expect, test } from "@orb/testkit/node";
import { createKeyboardInsetReader } from "@orb/ui/lib";

test("keyboard coverage uses the CSS layout height when innerHeight changes independently", () => {
  const previousViewport = Object.getOwnPropertyDescriptor(globalThis, "visualViewport");
  const previousHeight = Object.getOwnPropertyDescriptor(globalThis, "innerHeight");
  Object.defineProperty(globalThis, "visualViewport", { configurable: true, value: { height: 500, offsetTop: 0, scale: 1 } });
  Object.defineProperty(globalThis, "innerHeight", { configurable: true, value: 500 });
  try {
    expect(createKeyboardInsetReader()(800).inset).toBe(300);
  } finally {
    if (previousViewport === undefined) {
      Reflect.deleteProperty(globalThis, "visualViewport");
    } else {
      Object.defineProperty(globalThis, "visualViewport", previousViewport);
    }
    if (previousHeight === undefined) {
      Reflect.deleteProperty(globalThis, "innerHeight");
    } else {
      Object.defineProperty(globalThis, "innerHeight", previousHeight);
    }
  }
});

test("keyboard state survives native layout resizing and clears on dismissal or zoom", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "visualViewport");
  const viewport = { height: 500, offsetTop: 0, scale: 1 };
  Object.defineProperty(globalThis, "visualViewport", { configurable: true, value: viewport });
  try {
    const read = createKeyboardInsetReader();
    expect(read(800)).toEqual({ inset: 300, open: true });
    expect(read(500)).toEqual({ inset: 0, open: true });
    viewport.height = 800;
    expect(read(800)).toEqual({ inset: 0, open: false });
    viewport.height = 500;
    viewport.offsetTop = 40;
    expect(read(800)).toEqual({ inset: 260, open: true });
    viewport.scale = 1.1;
    expect(read(800)).toEqual({ inset: 0, open: false });
    viewport.scale = 1;
    viewport.height = 750;
    expect(read(800)).toEqual({ inset: 0, open: false });
  } finally {
    if (previous === undefined) {
      Reflect.deleteProperty(globalThis, "visualViewport");
    } else {
      Object.defineProperty(globalThis, "visualViewport", previous);
    }
  }
});
