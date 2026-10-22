// Native route failures must fail the owning CT even when the page handles the network error and keeps rendering.
import { expect, test } from "@playwright/test";
import { malformedOrForwardTrpcWire, routeTrpc, trpcEndSubscription, trpcError, trpcHold } from "../node/route-trpc.ts";

const ORIGIN = "http://route-trpc.test";
const HEADING = "The subject heading still renders";

for (const subscription of [false, true]) {
  test(`an unlisted ${subscription ? "subscription" : "query"} fails automatically despite a visible heading`, async ({ page }) => {
    test.fail(true, "An unlisted procedure must fail through the native Playwright lifecycle.");
    await page.route(`${ORIGIN}/**`, (route) => route.fulfill({ contentType: "text/html", body: `<h1>${HEADING}</h1>` }));
    await page.goto(ORIGIN);
    await routeTrpc(page, {});
    await page.evaluate(async (isSubscription) => {
      // The surface handles transport refusal; an unlisted request must still fail the host test.
      await fetch(`/api/trpc/${isSubscription ? "stream.connect" : "health"}`, {
        headers: { accept: isSubscription ? "text/event-stream" : "application/json" },
      }).catch(() => null);
    }, subscription);
    await expect(page.getByRole("heading", { name: HEADING, exact: true })).toBeVisible();
  });
}

test("a complete ordinary fixture serves its canonical wire response without failing the CT", async ({ page }) => {
  await page.route(`${ORIGIN}/**`, (route) => route.fulfill({ contentType: "text/html", body: `<h1>${HEADING}</h1>` }));
  await page.goto(ORIGIN);
  const recorder = await routeTrpc(page, { health: { ok: true } });
  const response = await page.evaluate(async () => {
    const result = await fetch("/api/trpc/health");
    return await result.json();
  });
  expect(response).toEqual({ result: { data: { ok: true } } });
  expect(recorder.count("health")).toBe(1);
  await expect(page.getByRole("heading", { name: HEADING, exact: true })).toBeVisible();
});

test("an explicitly ended subscription receives a terminal response without fabricated events", async ({ page }) => {
  await page.route(`${ORIGIN}/**`, (route) => route.fulfill({ contentType: "text/html", body: `<h1>${HEADING}</h1>` }));
  await page.goto(ORIGIN);
  const recorder = await routeTrpc(page, { "stream.connect": () => trpcEndSubscription() });
  const response = await page.evaluate(async () => {
    const result = await fetch("/api/trpc/stream.connect", { headers: { accept: "text/event-stream" } });
    return { status: result.status, body: await result.text() };
  });
  expect(response).toEqual({ status: 204, body: "" });
  expect(recorder.count("stream.connect")).toBe(1);
});

test("declared failures and malformed wire data retain their explicit response semantics", async ({ page }) => {
  await page.route(`${ORIGIN}/**`, (route) => route.fulfill({ contentType: "text/html", body: `<h1>${HEADING}</h1>` }));
  await page.goto(ORIGIN);
  await routeTrpc(page, { health: () => trpcError({ code: "FORBIDDEN", message: "Scripted refusal", reason: "fixture-refusal" }) });
  const refused = await page.evaluate(async () => (await fetch("/api/trpc/health")).json());
  expect(refused).toEqual({ error: { code: -32_003, message: "Scripted refusal", data: { code: "FORBIDDEN", reason: "fixture-refusal" } } });
  const malformed = { ok: "forward-shape", vendorField: true };
  await routeTrpc(page, { health: malformedOrForwardTrpcWire(malformed) });
  const forwarded = await page.evaluate(async () => (await fetch("/api/trpc/health")).json());
  expect(forwarded).toEqual({ result: { data: malformed } });
});

test("a declared hold keeps its complete batch pending until explicitly released", async ({ page }) => {
  await page.route(`${ORIGIN}/**`, (route) => route.fulfill({ contentType: "text/html", body: `<h1>${HEADING}</h1>` }));
  await page.goto(ORIGIN);
  const held = trpcHold<"health">();
  const recorder = await routeTrpc(page, { health: held });
  const response = page.evaluate(async () => (await fetch("/api/trpc/health,health?batch=1&input=%7B%7D")).json());
  await held.requested;
  expect(recorder.count("health")).toBe(2);
  held.release({ ok: true });
  expect(await response).toEqual([{ result: { data: { ok: true } } }, { result: { data: { ok: true } } }]);
});
