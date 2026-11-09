// The production bundle on a browser that lacks every builtin the polyfill entry installs (Temporal, RegExp.escape, Error.isError):
// Home and a chat render with no page error. The stack serves the built client, so this runs the shipped chunk order, not the dev server's.
import type { BrowserType, LaunchOptions } from "@playwright/test";
import { chromium, expect, test, webkit } from "@playwright/test";
import { POLYFILLED_BUILTINS } from "../../packages/client/browser-targets.ts";
import { openOrCreateChat, waitForAppReady } from "./support/chat-room.ts";
import { WAIT_SETTLE_MS } from "./support/timeouts.ts";

// WebKit reports the `interactive-widget` viewport key as a console error; it is the engine's, not a script failure.
const ENGINE_NOTICE = 'Viewport argument key "interactive-widget"';
// Runs before any page script, like a browser that never shipped them.
const STRIP = POLYFILLED_BUILTINS.map((name) => `delete globalThis.${name};`).join(" ");

// A direct launch inherits the project's launch options, whose args are the Chromium switches the config builds; WebKit exits on them.
const BROWSERS: readonly (readonly [string, BrowserType, LaunchOptions])[] = [
  ["chromium", chromium, {}],
  ["webkit", webkit, { args: [] }],
];

for (const [name, type, launchOptions] of BROWSERS) {
  test(`${name} without the polyfilled builtins renders Home and a chat`, async ({ baseURL }) => {
    test.setTimeout(WAIT_SETTLE_MS * 4);
    const browser = await type.launch(launchOptions);
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
        const foreign: unknown = Reflect.get(frame.contentWindow ?? {}, "DOMException");
        const foreignError: unknown = typeof foreign === "function" ? Reflect.construct(foreign, ["x"]) : null;
        const renamed = Object.assign(new Error("x"), { [Symbol.toStringTag]: "Renamed" });
        return {
          instant: typeof globalThis.Temporal.Now.instant().toString(),
          escaped: RegExp.escape("a.b"),
          isError: [new Error("x"), foreignError, renamed, { [Symbol.toStringTag]: "Error" }].map((value) => Error.isError(value)),
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
