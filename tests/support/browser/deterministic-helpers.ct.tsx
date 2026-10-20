import { auditRenderedTextContrast } from "@orb/testkit/browser/pixel-contrast.ts";
import { routeOrbSocket } from "@orb/testkit/node/route-orb-socket.ts";
import { routeTrpc, trpcError } from "@orb/testkit/node/route-trpc.ts";
import { expect, test } from "@playwright/experimental-ct-react";
import { RawTrpcObservationStory } from "../../client/compose/_mount-stories.tsx";
import { labelInNameFindings } from "./accessible-names.ts";
import { beginAutosaveStatusTranscript, readAutosaveStatusTranscript } from "./autosave-status-transcript.ts";
import { lastInkColumn, readCanvasBandInk, solidColumns } from "./canvas-ink.ts";
import { frameFingerprint, frameFingerprintPair } from "./weave-drive.ts";

test("socket frames wait for completed attaches", async ({ page }) => {
  await page.route("http://orb.test/**", (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><body></body>" }));
  await page.goto("http://orb.test/");
  await page.route("**/api/trpc/**", (route) => route.fulfill({ contentType: "application/json", body: '{"result":{"data":null}}' }));
  const recorder = await routeOrbSocket(page, { awaitAttaches: 2 });
  const connected = page.waitForRequest((request) => request.url().includes("stream.connect"));
  let served = false;
  const stream = page
    .evaluate(async () => {
      const response = await fetch("/api/trpc/stream.connect", { headers: { accept: "text/event-stream" } });
      return await response.text();
    })
    .then((body) => {
      served = true;
      return body;
    });
  await connected;
  await page.evaluate(async () => {
    await fetch("/api/trpc/stream.attach", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ref: { channel: "user" } }),
    });
  });
  expect(recorder.attaches()).toEqual([{ channel: "user" }]);
  expect(served).toBe(false);
  await page.evaluate(async () => {
    await fetch("/api/trpc/stream.attach", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ref: { channel: "user" } }),
    });
  });
  expect(await stream).toContain('"type":"serverReady"');
  expect(recorder.connects()).toBe(1);
});

test("contrast identities are deterministic per page and clean up root text owners", async ({ page }) => {
  await page.setContent(
    '<body style="margin:0;background:white"><div style="display:inline-block;color:black;background:white;padding:20px">Readable</div></body>',
  );
  const root = page.getByText("Readable", { exact: true });
  const first = await auditRenderedTextContrast(page, root, { floor: 4.5, label: "first" });
  const second = await auditRenderedTextContrast(page, root, { floor: 4.5, label: "second" });
  expect(first.subjects.map(({ subject }) => subject)).toEqual(["data-orb-contrast-owner-1-0"]);
  expect(second.subjects.map(({ subject }) => subject)).toEqual(["data-orb-contrast-owner-2-0"]);
  expect(await root.evaluate((element) => element.getAttributeNames().filter((name) => name.startsWith("data-orb-contrast-owner")))).toEqual([]);
});

test("closing a page terminates a socket whose expected attaches never arrived", async ({ page }) => {
  await page.route("http://orb.test/**", (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><body></body>" }));
  await page.goto("http://orb.test/");
  const recorder = await routeOrbSocket(page, { awaitAttaches: 1 });
  const connected = page.waitForRequest((request) => request.url().includes("stream.connect"));
  const stream = page.evaluate(async () => {
    const response = await fetch("/api/trpc/stream.connect", { headers: { accept: "text/event-stream" } });
    return await response.text();
  });
  const closed = expect(stream).rejects.toThrow("closed");
  await connected;
  await page.close();
  await closed;
  expect(recorder.attaches()).toEqual([]);
});

for (const outcome of ["aborted", 401, 500] as const) {
  test(`an attach with outcome ${String(outcome)} fails the socket instead of delivering frames`, async ({ page }) => {
    await page.route("http://orb.test/**", (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><body></body>" }));
    await page.goto("http://orb.test/");
    await page.route("**/api/trpc/stream.attach", async (route) => {
      if (outcome === "aborted") {
        await route.abort("failed");
      } else {
        await route.fulfill({ status: outcome, contentType: "application/json", body: '{"error":{"message":"attach refused"}}' });
      }
    });
    const recorder = await routeOrbSocket(page, { awaitAttaches: 1 });
    const connected = page.waitForRequest((request) => request.url().includes("stream.connect"));
    const stream = page.evaluate(async () => {
      const response = await fetch("/api/trpc/stream.connect", { headers: { accept: "text/event-stream" } });
      return await response.text();
    });
    const failed = expect(stream).rejects.toThrow("Failed to fetch");
    await connected;
    const status = await page.evaluate(async () => {
      try {
        const response = await fetch("/api/trpc/stream.attach", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ref: { channel: "user" } }),
        });
        return response.status;
      } catch {
        return null;
      }
    });
    expect(status).toBe(outcome === "aborted" ? null : outcome);
    await failed;
    expect(recorder.attaches()).toEqual([{ channel: "user" }]);
  });
}

test("a deferred successful attach cannot release frames before the HTTP request finishes", async ({ page }) => {
  await page.route("http://orb.test/**", (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><body></body>" }));
  await page.goto("http://orb.test/");
  const arrived = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  await page.route("**/api/trpc/stream.attach", async (route) => {
    arrived.resolve();
    await release.promise;
    await route.fulfill({ contentType: "application/json", body: '{"result":{"data":null}}' });
  });
  await routeOrbSocket(page, { awaitAttaches: 1 });
  let served = false;
  const stream = page
    .evaluate(async () => {
      const response = await fetch("/api/trpc/stream.connect", { headers: { accept: "text/event-stream" } });
      return await response.text();
    })
    .then((body) => {
      served = true;
      return body;
    });
  const attach = page.evaluate(async () => {
    const response = await fetch("/api/trpc/stream.attach", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ref: { channel: "user" } }),
    });
    return response.status;
  });
  await arrived.promise;
  try {
    await page.evaluate(async () => {
      await fetch("/barrier");
    });
    expect(served).toBe(false);
  } finally {
    release.resolve();
  }
  expect(await attach).toBe(200);
  expect(await stream).toContain('"type":"serverReady"');
});

test("socket observations preserve malformed IDs and raw cursors but ignore missing refs without claiming admission", async ({ page }) => {
  await page.route("http://orb.test/**", (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><body></body>" }));
  await page.goto("http://orb.test/");
  const trpc = await routeTrpc(page, { "stream.attach": null, "stream.detach": null });
  const recorder = await routeOrbSocket(page);
  await page.evaluate(async () => {
    for (const body of [
      { ref: { channel: "user" }, sinceSeq: 0 },
      { ref: { channel: "chat", chatId: "invalid" } },
      { ref: { channel: "unknown" } },
      { ref: { channel: "user" }, sinceSeq: "wrong" },
      {},
      null,
    ]) {
      await fetch("/api/trpc/stream.attach", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    }
    await fetch("/api/trpc/stream.attach,stream.detach?batch=1", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ 0: { ref: { channel: "notifications" } }, 1: { ref: { channel: "user" } } }),
    });
    await fetch("/api/trpc/stream.attach,stream.detach?batch=1", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify([{ ref: { channel: "chat", chatId: "array-malformed" }, sinceSeq: "array-raw" }, { ref: { channel: "notifications" } }]),
    });
  });
  expect(recorder.attachRequests()).toEqual([
    { ref: { channel: "user" }, sinceSeq: 0 },
    { ref: { channel: "chat", chatId: "invalid" }, sinceSeq: null },
    { ref: { channel: "unknown" }, sinceSeq: null },
    { ref: { channel: "user" }, sinceSeq: "wrong" },
    { ref: { channel: "notifications" }, sinceSeq: null },
    { ref: { channel: "chat", chatId: "array-malformed" }, sinceSeq: "array-raw" },
  ]);
  expect(recorder.detaches()).toEqual([{ channel: "user" }, { channel: "notifications" }]);
  expect(trpc.unstubbed()).toEqual([]);
});

test("the production typed client keeps batch inputs raw, path-correlated and distinct from missing calls", async ({ mount, page }) => {
  const backgroundUrl = "  https://example.test/art.png  ";
  const videoUrl = "https://example.test/watch";
  const recorder = await routeTrpc(page, {
    "settings.addExternalBackground": trpcError(),
    "databank.scrapeYoutube": trpcError(),
    "settings.resetUserConfig": trpcError(),
  });
  expect(recorder.inputs("settings.addExternalBackground")).toEqual([]);
  expect(recorder.lastInput("settings.resetUserConfig")).toBeUndefined();
  expect(() => recorder.requireLastInput("settings.resetUserConfig")).toThrow("has not been called");
  await mount(<RawTrpcObservationStory backgroundUrl={backgroundUrl} videoUrl={videoUrl} />);
  const batched = page.waitForRequest((request) => request.url().includes("settings.addExternalBackground,databank.scrapeYoutube,settings.resetUserConfig"));
  await page.getByRole("button", { name: "Send observed batch", exact: true }).click();
  expect((await batched).method()).toBe("POST");
  await expect(page.getByText("Observed batch settled", { exact: true })).toBeVisible();
  expect(recorder.inputs("settings.addExternalBackground")).toEqual([{ url: backgroundUrl }]);
  expect(recorder.lastInput("databank.scrapeYoutube")).toEqual({ url: videoUrl });
  expect(recorder.requireLastInput("databank.scrapeYoutube")).toEqual({ url: videoUrl });
  expect(recorder.inputs("settings.resetUserConfig")).toEqual([undefined]);
  expect(recorder.requireLastInput("settings.resetUserConfig")).toBeUndefined();
  expect(recorder.count("settings.resetUserConfig")).toBe(1);

  await page.evaluate(async () => {
    await fetch("/api/trpc/settings.addExternalBackground", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: 41, forwardField: true }),
    });
  });
  expect(recorder.requireLastInput("settings.addExternalBackground")).toEqual({ url: 41, forwardField: true });
  expect(recorder.inputs("settings.addExternalBackground")).toEqual([{ url: backgroundUrl }, { url: 41, forwardField: true }]);
  await page.evaluate(async () => {
    await fetch("/api/trpc/settings.addExternalBackground,databank.scrapeYoutube?batch=1", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify([
        { url: 42, arrayField: true },
        { url: "  array-video  ", lang: null },
      ]),
    });
  });
  expect(recorder.requireLastInput("settings.addExternalBackground")).toEqual({ url: 42, arrayField: true });
  expect(recorder.requireLastInput("databank.scrapeYoutube")).toEqual({ url: "  array-video  ", lang: null });
});

test.describe("maintained browser boundaries", () => {
  test.use({ deviceScaleFactor: 2 });

  test("weave readouts preserve native RGBA sums, missing-pair refusal and context sentinel", async ({ page }) => {
    await page.setContent(
      '<canvas id="first" width="2" height="1"></canvas><canvas id="second" width="1" height="1"></canvas><canvas id="occupied"></canvas><div id="not-canvas"></div>',
    );
    await page.evaluate(() => {
      const first = document.querySelector("#first");
      const second = document.querySelector("#second");
      const occupied = document.querySelector("#occupied");
      if (!(first instanceof HTMLCanvasElement && second instanceof HTMLCanvasElement && occupied instanceof HTMLCanvasElement)) {
        throw new Error("canvas fixtures missing");
      }
      const a = first.getContext("2d");
      const b = second.getContext("2d");
      if (a === null || b === null || occupied.getContext("bitmaprenderer") === null) {
        throw new Error("native canvas contexts unavailable");
      }
      a.fillStyle = "rgb(10, 20, 30)";
      a.fillRect(0, 0, 1, 1);
      a.fillStyle = "rgb(40, 50, 60)";
      a.fillRect(1, 0, 1, 1);
      b.fillStyle = "rgb(3, 5, 7)";
      b.fillRect(0, 0, 1, 1);
    });
    expect(await frameFingerprint(page.locator("#first"))).toBe("50:70:90");
    expect(await frameFingerprintPair(page.locator("#first, #second"))).toEqual(["50:70:90", "3:5:7"]);
    expect(await frameFingerprint(page.locator("#occupied"))).toBe("no-ctx");
    await expect(frameFingerprintPair(page.locator("#absent"))).rejects.toThrow();
    await expect(frameFingerprintPair(page.locator("#first"))).rejects.toThrow();
    await expect(frameFingerprintPair(page.locator("canvas"))).rejects.toThrow();
    await expect(frameFingerprint(page.locator("#not-canvas"))).rejects.toThrow();
  });

  test("canvas bands preserve backing-store coordinates, alpha counts and native DPR", async ({ page }) => {
    await page.setContent('<canvas id="band" width="3" height="2"></canvas><canvas id="occupied"></canvas><div id="not-canvas"></div>');
    await page.evaluate(() => {
      const canvas = document.querySelector("#band");
      const occupied = document.querySelector("#occupied");
      if (!(canvas instanceof HTMLCanvasElement && occupied instanceof HTMLCanvasElement)) {
        throw new Error("canvas fixtures missing");
      }
      const context = canvas.getContext("2d");
      if (context === null || occupied.getContext("bitmaprenderer") === null) {
        throw new Error("native canvas contexts unavailable");
      }
      context.fillStyle = "rgb(255, 0, 0)";
      context.fillRect(0, 0, 1, 2);
      context.fillStyle = "rgba(0, 0, 255, 0.5)";
      context.fillRect(1, 0, 1, 1);
    });
    const band = await readCanvasBandInk(page.locator("#band"), 0, 1);
    expect(band).toEqual({ widthPx: 3, bandHeightPx: 2, dpr: 2, columnInk: [2, 1, 0], dominantColor: "255,0,0" });
    expect(solidColumns(band)).toEqual([0]);
    expect(lastInkColumn(band)).toBe(1);
    await expect(readCanvasBandInk(page.locator("#occupied"), 0, 1)).rejects.toThrow();
    await expect(readCanvasBandInk(page.locator("#not-canvas"), 0, 1)).rejects.toThrow();
  });

  test("name cloning removes descriptions and hidden text without changing the source control", async ({ page }) => {
    await page.setContent(
      '<button type="button" aria-label="Aria — character" aria-describedby="desc">Aria <span id="desc">responding</span><span aria-hidden="true">secret</span></button><button type="button" aria-label="Open palette">Jump</button>',
    );
    const findings = await labelInNameFindings(page);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.detail).toContain('"jump"');
    await expect(page.getByRole("button", { name: "Aria — character", exact: true })).toHaveText("Aria respondingsecret");
  });

  test("autosave records ordered distinct transitions and reads raw JSON without healing malformed bytes", async ({ page }) => {
    await page.setContent('<p id="status" data-slot="autosave-status">Saved</p>');
    expect(await readAutosaveStatusTranscript(page)).toEqual([]);
    await beginAutosaveStatusTranscript(page);
    expect(await readAutosaveStatusTranscript(page)).toEqual([]);
    await page.locator("#status").evaluate((node) => {
      node.textContent = " Saving… ";
    });
    await page.evaluate(() => {
      document.body.append(document.createTextNode("unrelated mutation"));
    });
    expect(await readAutosaveStatusTranscript(page)).toEqual(["Saving…"]);
    await page.locator("#status").evaluate((node) => {
      node.textContent = "";
    });
    await page.locator("#status").evaluate((node) => {
      const replacement = document.createElement("div");
      replacement.id = "status";
      replacement.setAttribute("data-slot", "autosave-status");
      replacement.textContent = "Saved";
      node.replaceWith(replacement);
    });
    expect(await readAutosaveStatusTranscript(page)).toEqual(["Saving…", "Saved"]);
    const sink = page.locator('script[type="application/json"]');
    // A script element renders no text, so the retrying read is its textContent property, not toHaveText.
    await expect(sink).toHaveJSProperty("textContent", '["Saving…","Saved"]');
    await sink.evaluate((node) => {
      node.textContent = '[1,"raw",null]';
    });
    expect(await readAutosaveStatusTranscript(page)).toEqual([1, "raw", null]);
    await sink.evaluate((node) => {
      node.textContent = "{";
    });
    await expect(readAutosaveStatusTranscript(page)).rejects.toThrow();
    await sink.evaluate((node) => {
      node.remove();
    });
    expect(await readAutosaveStatusTranscript(page)).toEqual([]);
  });
});
