import { auditRenderedTextContrast } from "@orb/testkit/browser/pixel-contrast.ts";
import { routeOrbSocket } from "@orb/testkit/node/route-orb-socket.ts";
import { expect, test } from "@playwright/experimental-ct-react";

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
