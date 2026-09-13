// The request ring's planted controls use tiny limits so each fence is crossed deliberately. The fake
// page is only an EventEmitter because this test owns the ring's event/accounting contract; the sibling
// browser integration proves the same attachment against Playwright.
import { EventEmitter } from "node:events";
import type { Page, Request, Response } from "@playwright/test";
import { REQUEST_BODY_BUDGET_BYTES, REQUEST_BODY_CAP_BYTES, REQUEST_RING_CAPACITY } from "../../../../tooling/src/snap/index.ts";
import { RequestRing } from "../../../../tooling/src/snap/ops/request-ring.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

interface FakeRequestSpec {
  readonly url: string;
  readonly type?: string;
  readonly bodySize?: number;
  readonly sizes?: () => Promise<Awaited<ReturnType<Request["sizes"]>>>;
}

function fakePage(): EventEmitter & Page {
  return new EventEmitter() as EventEmitter & Page;
}

function fakeRequest(spec: FakeRequestSpec): Request {
  // @orb-waive no-test-fabrication(unknown): minimal Playwright Request event double; RequestRing reads exactly these six methods, Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  // while requests.int.test.ts proves the same path with real Playwright Request instances.
  return {
    method: () => "GET",
    url: () => spec.url,
    resourceType: () => spec.type ?? "fetch",
    timing: () => ({ responseEnd: 7 }),
    failure: () => null,
    sizes:
      spec.sizes ??
      (async (): Promise<Awaited<ReturnType<Request["sizes"]>>> => ({
        requestBodySize: 1,
        requestHeadersSize: 2,
        responseBodySize: spec.bodySize ?? 0,
        responseHeadersSize: 3,
      })),
  } as unknown as Request;
}

function fakeResponse(request: Request, body: string, contentType: string): Response {
  // @orb-waive no-test-fabrication(unknown): minimal Playwright Response event double; RequestRing reads exactly these five methods, Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  // while requests.int.test.ts proves the same path with real Playwright Response instances.
  return {
    request: () => request,
    url: () => request.url(),
    status: () => 200,
    headers: () => ({ "content-type": contentType }),
    body: async () => Buffer.from(body),
  } as unknown as Response;
}

function issue(page: EventEmitter & Page, url: string, body: string, contentType: string): Request {
  const request = fakeRequest({ url, bodySize: Buffer.byteLength(body) });
  page.emit("request", request);
  page.emit("response", fakeResponse(request, body, contentType));
  page.emit("requestfinished", request);
  return request;
}

function deferred<T>(): { readonly promise: Promise<T>; readonly resolve: (value: T) => void; readonly reject: (reason: Error) => void } {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((accept, refuse) => {
    resolve = accept;
    reject = refuse;
  });
  return { promise, resolve, reject };
}

test("the shipped lifetime, entry, and aggregate fences are the design's exact limits", () => {
  expect(REQUEST_RING_CAPACITY).toBe(4096);
  expect(REQUEST_BODY_CAP_BYTES).toBe(262_144);
  expect(REQUEST_BODY_BUDGET_BYTES).toBe(33_554_432);
  expect(new RequestRing().receipt()).toMatchObject({
    capacity: 4096,
    bodyCapBytes: 262_144,
    bodyBudgetBytes: 33_554_432,
  });
});

test("attachment is idempotent and the 4096-entry lifetime fence evicts oldest rows without renumbering", async () => {
  const ring = new RequestRing({ capacity: 2, bodyCapBytes: 256, bodyBudgetBytes: 1024 });
  const page = fakePage();
  ring.attachPage(page);
  ring.attachPage(page);

  expect(page.listenerCount("request")).toBe(1);
  expect(page.listenerCount("response")).toBe(1);
  expect(page.listenerCount("requestfinished")).toBe(1);
  expect(page.listenerCount("requestfailed")).toBe(1);
  issue(page, "http://fixture/0", "{}", "application/json");
  issue(page, "http://fixture/1", "{}", "application/json");
  issue(page, "http://fixture/2", "{}", "application/json");

  const window = await ring.read(0, null);
  expect(window.total).toBe(3);
  expect(window.entries.map((entry) => entry.index)).toEqual([1, 2]);
  expect(window.window).toEqual({ start: 0, end: 3, retainedStart: 1, evicted: 1 });
  expect(window.ring).toMatchObject({ capacity: 2, seen: 3, retained: 2, evicted: 1 });
});

test("only whole application/json bodies enter the per-entry and aggregate budgets", async () => {
  const ring = new RequestRing({ capacity: 10, bodyCapBytes: 5, bodyBudgetBytes: 7 });
  const page = fakePage();
  ring.attachPage(page);
  const stop = ring.beginBodyCapture("fixture/");
  issue(page, "http://fixture/kept", "1234", "application/json; charset=utf-8");
  issue(page, "http://fixture/oversize", "123456", "application/json");
  issue(page, "http://fixture/css", "{}", "text/css");
  issue(page, "http://fixture/budget", "5678", "application/json");
  stop();

  const kept = await ring.read(0, "kept");
  const oversize = await ring.read(0, "oversize");
  const css = await ring.read(0, "css");
  const budget = await ring.read(0, "budget");
  expect(kept.body).toMatchObject({ kind: "captured", bytes: 4, text: "1234" });
  expect(oversize.body).toMatchObject({ kind: "not-retained", reason: "over-entry-cap", bytes: 6 });
  expect(css.body).toMatchObject({ kind: "not-retained", reason: "ineligible-content-type", contentType: "text/css" });
  expect(budget.body).toMatchObject({ kind: "not-retained", reason: "over-aggregate-budget", bytes: 4 });
  expect(budget.ring).toMatchObject({
    bodyCapBytes: 5,
    bodyBudgetBytes: 7,
    bodyRetainedBytes: 4,
    bodiesCaptured: 1,
    bodiesNotRetained: {
      "ineligible-content-type": 1,
      "over-entry-cap": 1,
      "over-aggregate-budget": 1,
      "evicted-before-read": 0,
      "read-error": 0,
    },
  });
  expect(kept.entries[0]?.sizes).toEqual({ requestBodySize: 1, requestHeadersSize: 2, responseBodySize: 4, responseHeadersSize: 3 });
});

test("request-body returns the newest matching response in the checkpoint window", async () => {
  const ring = new RequestRing();
  const page = fakePage();
  ring.attachPage(page);
  const stop = ring.beginBodyCapture("same.json");
  issue(page, "http://fixture/same.json", '{"version":1}', "application/json");
  issue(page, "http://fixture/same.json", '{"version":2}', "application/json");
  stop();

  const read = await ring.read(0, "same.json");
  expect(read.entries.map((entry) => entry.index)).toEqual([0, 1]);
  expect(read.body).toMatchObject({ kind: "captured", url: "http://fixture/same.json", text: '{"version":2}' });
});

test("a checkpoint is a stable lifetime sequence mark, not a destructive clear", async () => {
  const ring = new RequestRing({ capacity: 4, bodyCapBytes: 256, bodyBudgetBytes: 1024 });
  const page = fakePage();
  ring.attachPage(page);
  issue(page, "http://fixture/boot", "{}", "application/json");
  expect(ring.markCheckpoint()).toBe(1);
  const stop = ring.beginBodyCapture("action");
  issue(page, "http://fixture/action", "{}", "application/json");
  stop();

  const window = await ring.read(ring.checkpoint(), null);
  expect(window.total).toBe(1);
  expect(window.entries.map((entry) => entry.url)).toEqual(["http://fixture/action"]);
  expect((await ring.read(0, "boot")).body).toMatchObject({ kind: "error", url: "http://fixture/boot" });
  expect((await ring.read(0, "action")).body).toMatchObject({ kind: "captured", url: "http://fixture/action" });
});

test("plain reads return a bounded snapshot without waiting for unfinished sizes or reading bodies", async () => {
  const ring = new RequestRing();
  const page = fakePage();
  const sizes = deferred<Awaited<ReturnType<Request["sizes"]>>>();
  const body = deferred<Buffer>();
  let bodyReads = 0;
  ring.attachPage(page);
  const request = fakeRequest({ url: "http://fixture/pending", sizes: () => sizes.promise });
  const response = fakeResponse(request, "{}", "application/json") as Response & { body: () => Promise<Buffer> };
  response.body = (): Promise<Buffer> => {
    bodyReads += 1;
    return body.promise;
  };
  page.emit("request", request);
  page.emit("response", response);

  let settled = false;
  const read = ring.read(0, null).then((value) => {
    settled = true;
    return value;
  });
  await Promise.resolve();
  expect(settled).toBe(true);
  expect((await read).entries[0]).toMatchObject({ sizes: null, status: 200 });
  expect(bodyReads).toBe(0);
  sizes.resolve({ requestBodySize: 1, requestHeadersSize: 2, responseBodySize: 2, responseHeadersSize: 3 });
  body.resolve(Buffer.from("{}"));
});

test("body reads wait only for matching eligible work and retain explicit failures", async () => {
  const ring = new RequestRing();
  const page = fakePage();
  const selectedBody = deferred<Buffer>();
  const unrelatedBody = deferred<Buffer>();
  ring.attachPage(page);
  const stopSelected = ring.beginBodyCapture("selected");
  const stopUnrelated = ring.beginBodyCapture("unrelated");
  const emitDeferred = (url: string, body: ReturnType<typeof deferred<Buffer>>): void => {
    const request = fakeRequest({ url });
    const response = fakeResponse(request, "", "application/json") as Response & { body: () => Promise<Buffer> };
    response.body = (): Promise<Buffer> => body.promise;
    page.emit("request", request);
    page.emit("response", response);
  };
  emitDeferred("http://fixture/selected.json", selectedBody);
  emitDeferred("http://fixture/unrelated", unrelatedBody);
  const ignored = fakeRequest({ url: "http://fixture/ignored" });
  const ignoredResponse = fakeResponse(ignored, "{}", "application/json") as Response & { body: () => Promise<Buffer> };
  let ignoredBodyReads = 0;
  ignoredResponse.body = (): Promise<Buffer> => {
    ignoredBodyReads += 1;
    return Promise.resolve(Buffer.from("{}"));
  };
  page.emit("request", ignored);
  page.emit("response", ignoredResponse);
  const css = fakeRequest({ url: "http://fixture/selected.css" });
  const cssResponse = fakeResponse(css, "body", "text/css") as Response & { body: () => Promise<Buffer> };
  let cssBodyReads = 0;
  cssResponse.body = (): Promise<Buffer> => {
    cssBodyReads += 1;
    return Promise.resolve(Buffer.from("body"));
  };
  page.emit("request", css);
  page.emit("response", cssResponse);

  let selectedSettled = false;
  const selected = ring.read(0, "selected.json").then((value) => {
    selectedSettled = true;
    return value;
  });
  await Promise.resolve();
  expect(selectedSettled).toBe(false);
  selectedBody.resolve(Buffer.from('{"ok":true}'));
  await expect(selected).resolves.toMatchObject({ body: { kind: "captured", url: "http://fixture/selected.json" } });
  expect(cssBodyReads).toBe(0);
  expect(ignoredBodyReads).toBe(0);
  expect((await ring.read(0, "selected.css")).body).toMatchObject({ kind: "not-retained", reason: "ineligible-content-type" });

  stopSelected();
  stopUnrelated();
  unrelatedBody.reject(new Error("fixture body failed"));
  await expect(ring.read(0, "unrelated")).resolves.toMatchObject({
    body: { kind: "not-retained", reason: "read-error" },
    ring: { bodiesNotRetained: { "read-error": 1 } },
  });
});
