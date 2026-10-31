/* eslint-disable orb/ct-responder-reads-input -- the subject is routeTrpc's own response semantics, so each responder is the scripted marker under test */
// Native route failures must fail the owning CT even when the page handles the network error and keeps rendering.
import { authConfigSchema } from "@orb/contracts/auth-config";
import { presetDetailSchema, presetIdInputSchema } from "@orb/contracts/preset";
import { DEFAULT_UPLOAD_CAPS } from "@orb/contracts/uploads";
import { serveCorpusProcedures } from "@orb/testkit/ct";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { expect, test } from "@playwright/test";
import { routeAuthConfig } from "../node/route-auth-config.ts";
import {
  abortProcedure,
  isTrpcRequestFor,
  malformedOrForwardTrpcWire,
  readTrpcOutput,
  routeTrpc,
  trpcEndSubscription,
  trpcError,
  trpcHold,
} from "../node/route-trpc.ts";

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

test("successful native response capture binds repeated batch paths to the validated input and owning output", async ({ page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const first = await caller.preset.create({ name: "First response", kind: "generation" });
  const second = await caller.preset.create({ name: "Second response", kind: "generation" });
  await page.route(`${ORIGIN}/**`, (route) => route.fulfill({ contentType: "text/html", body: `<h1>${HEADING}</h1>` }));
  await page.goto(ORIGIN);
  await routeTrpc(page, serveCorpusProcedures(caller, ["preset.get"]));
  const response = page.waitForResponse((item) => isTrpcRequestFor(item.url(), "preset.get"));
  await page.evaluate(
    async ({ firstId, secondId }) => {
      await fetch(`/api/trpc/preset.get,preset.get?batch=1&input=${encodeURIComponent(JSON.stringify({ 0: { id: firstId }, 1: { id: secondId } }))}`);
    },
    { firstId: first.id, secondId: second.id },
  );
  const actual = await response;
  await expect(readTrpcOutput(actual, "preset.get", presetDetailSchema)).rejects.toThrow("exactly one matching procedure");
  const captured = await readTrpcOutput(actual, "preset.get", presetDetailSchema, { schema: presetIdInputSchema, matches: (input) => input.id === second.id });
  expect(captured).toEqual(second);
});

test("native output capture validates unbatched success and refuses server errors and malformed output", async ({ page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const preset = await caller.preset.create({ name: "Output validation", kind: "generation" });
  await page.route(`${ORIGIN}/**`, (route) => route.fulfill({ contentType: "text/html", body: `<h1>${HEADING}</h1>` }));
  await page.goto(ORIGIN);
  await routeTrpc(page, serveCorpusProcedures(caller, ["preset.get"]));
  const successful = page.waitForResponse((item) => isTrpcRequestFor(item.url(), "preset.get"));
  await page.evaluate(async (id) => {
    await fetch(`/api/trpc/preset.get?input=${encodeURIComponent(JSON.stringify({ id }))}`);
  }, preset.id);
  expect(await readTrpcOutput(await successful, "preset.get", presetDetailSchema)).toEqual(preset);
  await routeTrpc(page, { "preset.get": () => trpcError({ code: "FORBIDDEN", message: "Scripted refusal" }) });
  const refused = page.waitForResponse((item) => isTrpcRequestFor(item.url(), "preset.get"));
  await page.evaluate(async (id) => {
    await fetch(`/api/trpc/preset.get?input=${encodeURIComponent(JSON.stringify({ id }))}`);
  }, preset.id);
  await expect(readTrpcOutput(await refused, "preset.get", presetDetailSchema)).rejects.toThrow("successful result");
  await routeTrpc(page, { "preset.get": () => malformedOrForwardTrpcWire({ id: "invalid-produced-id" }) });
  const malformed = page.waitForResponse((item) => isTrpcRequestFor(item.url(), "preset.get"));
  await page.evaluate(async (id) => {
    await fetch(`/api/trpc/preset.get?input=${encodeURIComponent(JSON.stringify({ id }))}`);
  }, preset.id);
  await expect(readTrpcOutput(await malformed, "preset.get", presetDetailSchema)).rejects.toThrow();
});

test("abortProcedure refuses a procedure alone or batched, leaves others served, and its restore lifts the refusal", async ({ page }) => {
  await page.route(`${ORIGIN}/**`, (route) => route.fulfill({ contentType: "application/json", body: "{}" }));
  await page.goto(ORIGIN);
  const probe = (path: string): Promise<"served" | "refused"> =>
    page.evaluate(
      async (url) =>
        await fetch(url).then(
          () => "served" as const,
          () => "refused" as const,
        ),
      path,
    );
  const lift = await abortProcedure(page, "preset.list");
  expect(await probe("/api/trpc/preset.list")).toBe("refused");
  expect(await probe("/api/trpc/character.list,preset.list?batch=1")).toBe("refused");
  expect(await probe("/api/trpc/character.list")).toBe("served");
  await lift();
  expect(await probe("/api/trpc/preset.list")).toBe("served");
});

test("routeAuthConfig serves a parsed config the client accepts, and a captured body verbatim", async ({ page }) => {
  const config = authConfigSchema.parse({
    mode: "local",
    localEnabled: true,
    oidcEnabled: false,
    oidcProviderName: "",
    localFirstRun: false,
    discreetLogin: false,
    defaultHandle: null,
    multiHumanCapable: true,
    forbidExternalMedia: false,
    trustHtml: false,
    allowInteractiveCards: false,
    uploads: DEFAULT_UPLOAD_CAPS,
    transport: "https",
    clientScope: "private",
    share: { state: "off", url: null },
  });
  await page.route(`${ORIGIN}/**`, (route) => route.fulfill({ contentType: "text/html", body: "<p>auth</p>" }));
  await page.goto(ORIGIN);
  await routeAuthConfig(page, config);
  const served: unknown = await page.evaluate(async () => (await fetch("/api/auth/config")).json());
  expect(authConfigSchema.parse(served)).toEqual(config);
  const captured = JSON.stringify({ ...config, mode: "oidc", localEnabled: false, oidcEnabled: true });
  await routeAuthConfig(page, captured);
  expect(await page.evaluate(async () => (await fetch("/api/auth/config")).text())).toBe(captured);
});
