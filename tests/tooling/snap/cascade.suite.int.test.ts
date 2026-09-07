// @instrument-proof: the nine planted browser-cascade families plus important, shorthand/longhand,
// source order, and owner custom CSS must produce direct official-SDK Active/Overloaded receipts.
// @instrument-absence-proof: a computed browser default is legal only through the explicit no-declaration
// arm; zero declarations for an ordinary query remain an instrument error.
import { access, readFile } from "node:fs/promises";
import type { Server } from "node:http";
import { createServer } from "node:http";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { launchProbeSession, withProbeSession } from "@orb/tooling/_shared/browser";
import type { DevToolsCascadeRawDeclaration, DevToolsCascadeRawReceipt } from "@orb/tooling/_shared/devtools-runtime";
import { prepareDevToolsCascadeRuntime } from "@orb/tooling/_shared/devtools-runtime";
import { expect, test } from "../../support/tool-fixtures.ts";
import { scaledBudget } from "../_load-budget.ts";

const ASSET_ROOT = fileURLToPath(new URL("../../../tooling/src/snap/lib/devtools-frontend", import.meta.url));
const FIXTURE = fileURLToPath(new URL("./ops/fixtures/cascade.html", import.meta.url));

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((done, reject) => server.close((error) => (error === undefined ? done() : reject(error))));
}

async function startFixture(): Promise<{ readonly url: string; readonly close: () => Promise<void> }> {
  const html = await readFile(FIXTURE);
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(html);
  });
  await new Promise<void>((done, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", done);
  });
  const address = server.address();
  if (address === null || typeof address === "string" || address.address !== "127.0.0.1") {
    throw new Error("cascade fixture did not bind IPv4 loopback");
  }
  return { url: `http://127.0.0.1:${address.port}/`, close: () => closeServer(server) };
}

function row(receipts: readonly DevToolsCascadeRawReceipt[], selector: string): DevToolsCascadeRawReceipt {
  const receipt = receipts.find((candidate) => candidate.selector === selector);
  if (receipt === undefined) {
    throw new Error(`missing planted cascade receipt: ${selector}`);
  }
  return receipt;
}

function declaration(receipt: DevToolsCascadeRawReceipt, value: string): DevToolsCascadeRawDeclaration {
  const candidate = receipt.declarations.find((entry) => entry.value === value);
  if (candidate === undefined) {
    throw new Error(`missing planted declaration ${receipt.selector}=${value}`);
  }
  return candidate;
}

test("the official DevTools SDK reports the planted cascade matrix without mutating the product page", { timeout: scaledBudget(60_000) }, async () => {
  const [runtime, fixture] = await Promise.all([prepareDevToolsCascadeRuntime(ASSET_ROOT), startFixture()]);
  try {
    const session = await launchProbeSession({
      headless: true,
      viewport: { width: 1280, height: 720 },
      colorScheme: null,
      reducedMotion: false,
      localStorage: [],
      persistentProfileDir: runtime.profileDir,
      browserArgs: runtime.browserArgs,
    });
    await withProbeSession({ ...session, cleanup: [runtime.close] }, async ({ page }) => {
      await page.goto(fixture.url, { waitUntil: "load" });
      await page.evaluate(
        `(async()=>{const element=document.querySelector("#transition");getComputedStyle(element).color;await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);element.classList.add("on")})()`,
      );
      const productDom = await page.content();
      const receipts = await runtime.query(page, [
        { selector: "#layered", property: "color" },
        { selector: "#specific", property: "color" },
        { selector: "#inline", property: "color" },
        { selector: "#inherited", property: "color" },
        { selector: "#custom", property: "color" },
        { selector: "#cycle", property: "color" },
        { selector: "#undefined", property: "color" },
        { selector: "#animation", property: "color" },
        { selector: "#transition", property: "color" },
        { selector: "#important", property: "color" },
        { selector: "#longhand", property: "margin-left" },
        { selector: "#owner-wins", property: "color" },
        { selector: "#owner-loses", property: "color" },
        { selector: "#source-order", property: "color" },
        { selector: "#computed-default", property: "opacity", allowComputedDefault: true },
        { selector: "#user-agent", property: "display" },
        { selector: "#mixed", property: "background-color" },
        { selector: ".representative", property: "color", matchIndex: 0 },
        { selector: ".representative", property: "color", matchIndex: 1 },
      ]);

      expect(receipts).toHaveLength(19);
      expect(declaration(row(receipts, "#layered"), "blue").state).toBe("Active");
      expect(declaration(row(receipts, "#layered"), "red").state).toBe("Overloaded");
      expect(declaration(row(receipts, "#specific"), "blue").state).toBe("Active");
      expect(declaration(row(receipts, "#inline"), "lime").state).toBe("Active");
      expect(declaration(row(receipts, "#inherited"), "purple")).toMatchObject({ state: "Active", inherited: true });
      expect(row(receipts, "#custom").computedValue).toBe("rgb(255, 165, 0)");
      expect(row(receipts, "#cycle").computedValue).toBe("rgb(0, 128, 0)");
      expect(row(receipts, "#undefined").computedValue).toBe("rgb(0, 128, 128)");
      expect(row(receipts, "#animation").declarations).toContainEqual(expect.objectContaining({ state: "Active", styleType: "Animation" }));
      expect(row(receipts, "#transition").declarations).toContainEqual(expect.objectContaining({ state: "Active", styleType: "Transition" }));
      expect(declaration(row(receipts, "#important"), "red !important")).toMatchObject({ state: "Active", important: true });
      expect(declaration(row(receipts, "#longhand"), "4px").state).toBe("Active");
      expect(declaration(row(receipts, "#owner-wins"), "blue")).toMatchObject({ state: "Active", ownerCustomCss: true });
      expect(declaration(row(receipts, "#owner-loses"), "blue")).toMatchObject({ state: "Overloaded", ownerCustomCss: true });
      expect(declaration(row(receipts, "#source-order"), "blue").state).toBe("Active");
      expect(declaration(row(receipts, "#source-order"), "blue").sourceUrl).toBe("/workspace/packages/client/src/styles/globals.css");
      expect(row(receipts, "#computed-default")).toMatchObject({ computedDefault: true, declarations: [] });
      expect(row(receipts, "#user-agent").declarations).toContainEqual(expect.objectContaining({ state: "Active", sourceUrl: null, styleSheetId: null }));
      expect(row(receipts, "#mixed").declarations).toEqual([expect.objectContaining({ state: "Active", value: "blue" })]);
      expect(
        receipts.filter((receipt) => receipt.selector === ".representative").map(({ matchIndex, computedValue }) => ({ matchIndex, computedValue })),
      ).toEqual([
        { matchIndex: 0, computedValue: "rgb(255, 0, 0)" },
        { matchIndex: 1, computedValue: "rgb(0, 0, 255)" },
      ]);
      expect(await page.content()).toBe(productDom);

      await page.evaluate(`(() => {
        const sheets = document.head.querySelectorAll("style");
        document.head.insertBefore(sheets[1], sheets[0]);
      })()`);
      const swappedDom = await page.content();
      const [swapped] = await runtime.query(page, [{ selector: "#source-order", property: "color" }]);
      expect(swapped && declaration(swapped, "red").state).toBe("Active");
      expect(await page.content()).toBe(swappedDom);
    });
  } finally {
    await fixture.close();
    await runtime.close();
  }
});

test("an ordinary zero-declaration query fails loud", { timeout: scaledBudget(60_000) }, async () => {
  const [runtime, fixture] = await Promise.all([prepareDevToolsCascadeRuntime(ASSET_ROOT), startFixture()]);
  try {
    const session = await launchProbeSession({
      headless: true,
      viewport: { width: 320, height: 240 },
      colorScheme: null,
      reducedMotion: false,
      localStorage: [],
      persistentProfileDir: runtime.profileDir,
      browserArgs: runtime.browserArgs,
    });
    await withProbeSession({ ...session, cleanup: [runtime.close] }, async ({ page }) => {
      await page.goto(fixture.url, { waitUntil: "load" });
      await page.evaluate(`document.querySelector("#transition").classList.add("on")`);
      await expect(runtime.query(page, [{ selector: "#computed-default", property: "opacity" }])).rejects.toThrow("declaration population is zero");
      await expect(runtime.query(page, [{ selector: "#null-only", property: "background-color" }])).rejects.toThrow("declaration population is zero");
      await expect(runtime.query(page, [{ selector: "#absent", property: "color" }])).rejects.toThrow("match index 0 is outside population 0");
      await expect(runtime.query(page, [{ selector: "#layered", property: "color:red" }])).rejects.toThrow("invalid CSS property name");
      await expect(
        runtime.query(
          page,
          Array.from({ length: 33 }, (_, index) => ({ selector: `#query-${index}`, property: "color" })),
        ),
      ).rejects.toThrow("cascade query population must be 1..32");
      await page.evaluate(`(() => {
        const style = document.createElement("style");
        style.textContent = Array.from({ length: 257 }, (_, index) => "#overflow { color: rgb(" + index % 255 + ", 0, 0) }").join("\\n");
        document.head.append(style);
        const element = document.createElement("div");
        element.id = "overflow";
        document.body.append(element);
      })()`);
      await expect(runtime.query(page, [{ selector: "#overflow", property: "color" }])).rejects.toThrow("declaration receipt overflow");
    });
  } finally {
    await fixture.close();
    await runtime.close();
  }
});

test("the DevTools cascade observer preserves the rated page media identity", { timeout: scaledBudget(60_000) }, async () => {
  const [runtime, fixture] = await Promise.all([prepareDevToolsCascadeRuntime(ASSET_ROOT), startFixture()]);
  try {
    const session = await launchProbeSession({
      headless: true,
      viewport: { width: 320, height: 240 },
      colorScheme: "dark",
      reducedMotion: true,
      contrast: "more",
      reducedTransparency: true,
      localStorage: [],
      persistentProfileDir: runtime.profileDir,
      browserArgs: runtime.browserArgs,
    });
    await withProbeSession({ ...session, cleanup: [runtime.close] }, async ({ page }) => {
      await page.goto(fixture.url, { waitUntil: "load" });
      // String-body evaluate: this is a NODE-world test (DOM-less program), so an in-page callback cannot be
      // typed here and a browser-world helper would drag lib.dom in through the import (type-worlds #1351;
      // the appearance-invariant-runtime precedent).
      const readMedia = async (): Promise<readonly boolean[]> =>
        await page.evaluate<boolean[]>(
          `[${["(prefers-color-scheme: dark)", "(prefers-reduced-motion: reduce)", "(prefers-contrast: more)", "(prefers-reduced-transparency: reduce)"]
            .map((query) => `matchMedia(${JSON.stringify(query)}).matches`)
            .join(", ")}]`,
        );
      expect(await readMedia()).toEqual([true, true, true, true]);
      const [mediaReceipt] = await runtime.query(page, [{ selector: "#media-identity", property: "color" }]);
      expect(mediaReceipt?.computedValue).toBe("rgb(0, 0, 255)");
      expect(await readMedia()).toEqual([true, true, true, true]);
      await sleep(250);
      expect(await readMedia()).toEqual([true, true, true, true]);
      await expect(runtime.query(page, [{ selector: "#absent", property: "color" }])).rejects.toThrow("match index 0 is outside population 0");
      await expect(runtime.query(page, [{ selector: ".representative", property: "color", matchIndex: 2 }])).rejects.toThrow(
        "match index 2 is outside population 2",
      );
      await expect(runtime.query(page, [{ selector: ".representative", property: "color", matchIndex: -1 }])).rejects.toThrow("invalid cascade match index");
      expect(await readMedia()).toEqual([true, true, true, true]);
    });
  } finally {
    await fixture.close();
    await runtime.close();
  }
});

test("a disconnected browser and runtime cleanup fail visibly", { timeout: scaledBudget(60_000) }, async () => {
  const [runtime, fixture] = await Promise.all([prepareDevToolsCascadeRuntime(ASSET_ROOT), startFixture()]);
  try {
    const session = await launchProbeSession({
      headless: true,
      viewport: { width: 320, height: 240 },
      colorScheme: null,
      reducedMotion: false,
      localStorage: [],
      persistentProfileDir: runtime.profileDir,
      browserArgs: runtime.browserArgs,
    });
    await session.page.goto(fixture.url, { waitUntil: "load" });
    await session.browser.close();
    await expect(runtime.query(session.page, [{ selector: "#layered", property: "color" }])).rejects.toThrow("cascade browser is disconnected");
    await runtime.close();
    await expect(access(runtime.profileDir)).rejects.toThrow();
  } finally {
    await fixture.close();
    await runtime.close();
  }
});
