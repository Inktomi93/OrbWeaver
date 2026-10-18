import { auditRenderedTextContrast } from "@orb/testkit/browser/pixel-contrast.ts";
import { routeOrbSocket } from "@orb/testkit/node/route-orb-socket.ts";
import { routeTrpc, trpcError } from "@orb/testkit/node/route-trpc.ts";
import { expect, test } from "@playwright/experimental-ct-react";
import { RawTrpcObservationStory } from "../../client/compose/_mount-stories.tsx";

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
