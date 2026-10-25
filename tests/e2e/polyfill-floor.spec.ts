// The production bundle on a browser that lacks every builtin the polyfill entry installs (Temporal, RegExp.escape, Error.isError):
// Home and a chat render with no page error. The stack serves the built client, so this runs the shipped chunk order, not the dev server's.
import { chromium, expect, test, webkit } from "@playwright/test";
import { POLYFILLED_BUILTINS } from "../../packages/client/browser-targets.ts";
import { openOrCreateChat, waitForAppReady } from "./support/chat-room.ts";
import { WAIT_SETTLE_MS } from "./support/timeouts.ts";

// WebKit reports the `interactive-widget` viewport key as a console error; it is the engine's, not a script failure.
const ENGINE_NOTICE = 'Viewport argument key "interactive-widget"';
// Runs before any page script, like a browser that never shipped them.
const STRIP = POLYFILLED_BUILTINS.map((name) => `delete globalThis.${name};`).join(" ");

for (const [name, type] of [
  ["chromium", chromium],
  ["webkit", webkit],
] as const) {
  test(`${name} without the polyfilled builtins renders Home and a chat`, async ({ baseURL }) => {
    test.setTimeout(WAIT_SETTLE_MS * 4);
    const browser = await type.launch();
    try {
      const context = await browser.newContext(baseURL === undefined ? {} : { baseURL });
      await context.addInitScript(STRIP);
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
      page.on("console", (message) => {
        if (message.type() === "error" && !message.text().startsWith(ENGINE_NOTICE)) {
          errors.push(`console: ${message.text()}`);
        }
      });
      await page.goto("/");
      await waitForAppReady(page);
      await expect(page.getByRole("main", { name: "Home content" })).toBeVisible();

      // The entry put them back: Temporal answers, the escape is spec-correct, and Error.isError reads the slot across realms.
      const installed = await page.evaluate(() => {
        const frame = document.createElement("iframe");
        document.body.append(frame);
        const ForeignDomException: typeof DOMException = Reflect.get(frame.contentWindow ?? {}, "DOMException");
        const renamed = Object.assign(new Error("x"), { [Symbol.toStringTag]: "Renamed" });
        return {
          instant: typeof globalThis.Temporal.Now.instant().toString(),
          escaped: RegExp.escape("a.b"),
          isError: [new Error("x"), new ForeignDomException("x"), renamed, { [Symbol.toStringTag]: "Error" }].map((value) => Error.isError(value)),
        };
      });
      expect(installed).toEqual({ instant: "string", escaped: String.raw`\x61\.b`, isError: [true, true, true, false] });

      await openOrCreateChat(page);
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
    }
  });
}
