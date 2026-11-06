import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { MessageListInputChannelsStory } from "./_input-channel-stories.tsx";

const INPUT_EVENTS = ["wheel", "touchstart", "touchmove", "keydown"] as const;
const LOG_LABEL = "Input channels";
const INPUT_ATTRIBUTES = { listeners: "data-input-listeners", calls: "data-input-calls" } as const;
const STORY = "tests/ui/primitives/message-list/_input-channel-stories/MessageListInputChannelsStory";
const PROFILES = [
  ["wheel-only", ["wheel"], ["wheel", "keydown"]],
  ["touch-only", ["touchstart", "touchmove"], ["touchstart", "touchmove", "keydown"]],
  ["combined", ["wheel", "touchstart", "touchmove"], ["wheel", "touchstart", "touchmove", "keydown"]],
] as const;

function exerciseInputs(
  node: Element,
  { events, attributes }: { readonly events: typeof INPUT_EVENTS; readonly attributes: typeof INPUT_ATTRIBUTES },
): { readonly listeners: string | null; readonly calls: string | null } {
  const box = node.getBoundingClientRect();
  for (const type of events) {
    const point = new Touch({
      identifier: 1,
      target: node,
      clientX: box.left + box.width / 2,
      clientY: box.top + box.height / 2 + (type === "touchmove" ? 1 : 0),
    });
    let event: Event;
    if (type === "keydown") {
      event = new KeyboardEvent(type, { key: "ArrowUp", bubbles: true });
    } else if (type === "wheel") {
      event = new WheelEvent(type, { deltaY: -1, bubbles: true });
    } else {
      event = new TouchEvent(type, { touches: [point], changedTouches: [point], bubbles: true });
    }
    node.dispatchEvent(event);
  }
  return { listeners: node.getAttribute(attributes.listeners), calls: node.getAttribute(attributes.calls) };
}

// Records which input listeners the list attaches to its scroller and how many of their runs reach the reader callback. That callback is
// recognised by what it does (it stamps the reader's time with one `performance.now()` read), never by listener identity, so the list
// may wrap a channel.
async function trackInputs(page: Page, available: readonly string[]): Promise<void> {
  await page.addInitScript(
    ({ events, availableEvents, attributes }) => {
      const nativeAdd = EventTarget.prototype.addEventListener;
      const nativeRemove = EventTarget.prototype.removeEventListener;
      const tracked = new Set<string>(events);
      const availableSet = new Set<string>(availableEvents);
      const registrations = new WeakMap<EventTarget, Map<string, Map<EventListenerOrEventListenerObject, EventListener>>>();
      const nativeNow = performance.now.bind(performance);
      let clockReads = 0;
      performance.now = (): number => {
        clockReads += 1;
        return nativeNow();
      };
      for (const event of events.filter((type) => type !== "keydown")) {
        const property = `on${event}`;
        for (let prototype: object | null = HTMLElement.prototype; prototype !== null; prototype = Reflect.getPrototypeOf(prototype)) {
          Reflect.deleteProperty(prototype, property);
        }
        if (availableSet.has(event)) {
          Object.defineProperty(HTMLElement.prototype, property, { configurable: true, writable: true, value: null });
        }
      }
      const isSubject = (target: EventTarget): target is HTMLElement =>
        target instanceof HTMLElement && target.getAttribute("data-slot") === "message-list-scroll";
      const publish = (target: HTMLElement): void => {
        const active = registrations.get(target);
        target.setAttribute(attributes.listeners, events.filter((type) => active?.has(type) === true).join(","));
      };
      EventTarget.prototype.addEventListener = function record(this: EventTarget, type, listener, options): void {
        // The virtualizer listens for touches in the capture phase for its own iOS deferral; the list's reader channels never capture.
        const capturing = options === true || (typeof options === "object" && options.capture === true);
        if (!(isSubject(this) && tracked.has(type)) || listener === null || capturing) {
          nativeAdd.call(this, type, listener, options);
          return;
        }
        const byType = registrations.get(this) ?? new Map<string, Map<EventListenerOrEventListenerObject, EventListener>>();
        const callbacks = byType.get(type) ?? new Map<EventListenerOrEventListenerObject, EventListener>();
        const wrapped: EventListener = (event): void => {
          const readsBefore = clockReads;
          if (typeof listener === "function") {
            listener.call(this, event);
          } else {
            listener.handleEvent(event);
          }
          if (clockReads > readsBefore) {
            this.setAttribute(attributes.calls, String(Number(this.getAttribute(attributes.calls) ?? "0") + 1));
          }
        };
        callbacks.set(listener, wrapped);
        byType.set(type, callbacks);
        registrations.set(this, byType);
        publish(this);
        nativeAdd.call(this, type, wrapped, options);
      };
      EventTarget.prototype.removeEventListener = function record(this: EventTarget, type, listener, options): void {
        const byType = registrations.get(this);
        const callbacks = byType?.get(type);
        const wrapped = listener === null ? undefined : callbacks?.get(listener);
        nativeRemove.call(this, type, wrapped ?? listener, options);
        if (listener !== null) {
          callbacks?.delete(listener);
        }
        if (callbacks?.size === 0) {
          byType?.delete(type);
        }
        if (isSubject(this)) {
          publish(this);
        }
      };
    },
    { events: INPUT_EVENTS, availableEvents: available, attributes: INPUT_ATTRIBUTES },
  );
}

for (const [name, available, expected] of PROFILES) {
  test(`the list's reader-input callback handles simulated ${name} APIs and releases its native listeners`, async ({ mount, page }) => {
    await trackInputs(page, available);
    const mounted = await mount<typeof MessageListInputChannelsStory>(STORY, { ariaLabel: LOG_LABEL });
    const log = page.getByRole("log", { name: LOG_LABEL, exact: true });
    await expect(log).toHaveAttribute(INPUT_ATTRIBUTES.listeners, expected.join(","));
    await log.evaluate(exerciseInputs, { events: INPUT_EVENTS, attributes: INPUT_ATTRIBUTES });
    await expect(log).toHaveAttribute(INPUT_ATTRIBUTES.calls, String(expected.length));
    const retired = await log.elementHandle();
    await mounted.unmount();
    const after = await retired.evaluate(exerciseInputs, { events: INPUT_EVENTS, attributes: INPUT_ATTRIBUTES });
    expect(after).toEqual({ listeners: "", calls: String(expected.length) });
  });
}

test("a Space on a button inside the list presses it and is not reader input, while a Space elsewhere scrolls and is", async ({ mount, page }) => {
  await trackInputs(page, []);
  await mount<typeof MessageListInputChannelsStory>(STORY, { ariaLabel: LOG_LABEL });
  const log = page.getByRole("log", { name: LOG_LABEL, exact: true });
  await expect(log).toHaveAttribute(INPUT_ATTRIBUTES.listeners, "keydown");
  const pressSpace = (node: Element): void => {
    node.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
  };
  await page.getByRole("button", { name: "Earlier", exact: true }).evaluate(pressSpace);
  expect(await log.getAttribute(INPUT_ATTRIBUTES.calls)).toBeNull();
  await log.evaluate(pressSpace);
  await expect(log).toHaveAttribute(INPUT_ATTRIBUTES.calls, "1");
});

test("a touch that starts on the leading action is not reader input, and one anywhere else in the list is", async ({ mount, page }) => {
  await trackInputs(page, ["touchstart", "touchmove"]);
  await mount<typeof MessageListInputChannelsStory>(STORY, { ariaLabel: LOG_LABEL });
  const log = page.getByRole("log", { name: LOG_LABEL, exact: true });
  await expect(log).toHaveAttribute(INPUT_ATTRIBUTES.listeners, "touchstart,touchmove,keydown");
  const touchFrom = (node: Element): void => {
    const box = node.getBoundingClientRect();
    const point = new Touch({ identifier: 1, target: node, clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 });
    node.dispatchEvent(new TouchEvent("touchstart", { touches: [point], changedTouches: [point], bubbles: true }));
  };
  await page.getByRole("button", { name: "Earlier", exact: true }).evaluate(touchFrom);
  expect(await log.getAttribute(INPUT_ATTRIBUTES.calls)).toBeNull();
  await log.getByText("Line 2", { exact: true }).evaluate(touchFrom);
  await expect(log).toHaveAttribute(INPUT_ATTRIBUTES.calls, "1");
});
