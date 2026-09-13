// CDP network events are normalized once at the typed handler boundary; retained records and HAR never
// reinterpret raw protocol objects with Reflect.
import type { CDPSession, Page } from "@playwright/test";
import { networkRecordsForPages, selectNetworkBodies, wirePageNetwork } from "../../../tooling/src/_shared/browser-network.ts";
import { buildNetworkHar } from "../../../tooling/src/snap/lib/network-har.ts";
import { networkHarReceipt } from "../../../tooling/src/snap/lib/network-har-receipt.ts";
import { expect, test } from "../../support/tool-fixtures.ts";

class FakeCdp {
  readonly #listeners = new Map<string, ((event: never) => void)[]>();
  readonly sendImpl: (method: string) => Promise<unknown>;

  constructor(sendImpl: (method: string) => Promise<unknown> = async () => ({})) {
    this.sendImpl = sendImpl;
  }

  on(event: string, listener: (event: never) => void): void {
    const listeners = this.#listeners.get(event) ?? [];
    listeners.push(listener);
    this.#listeners.set(event, listeners);
  }

  send(method: string): Promise<unknown> {
    return this.sendImpl(method);
  }

  emit(event: string, value: unknown): void {
    for (const listener of this.#listeners.get(event) ?? []) {
      listener(value as never);
    }
  }
}

function pageOwner(page: Page): { readonly contexts: readonly { readonly pages: readonly Page[] }[] } {
  return { contexts: [{ pages: [page] }] };
}

async function installed(cdp = new FakeCdp(), bodyReadTimeoutMs?: number): Promise<{ readonly cdp: FakeCdp; readonly page: Page }> {
  // @orb-waive no-test-fabrication(Page): Page has no public constructor; browser-network uses this value only as the WeakMap key Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  // for the controller installed below. Ends when that controller seam accepts an opaque identity or this uses a real page.
  const page = {} as Page;
  await wirePageNetwork(
    // @orb-waive no-test-fabrication(unknown): CDPSession has no public constructor; FakeCdp implements the exact on/send event boundary Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    // exercised here. Ends when wirePageNetwork accepts that structural boundary or this suite uses a real CDP session.
    cdp as unknown as CDPSession,
    page,
    { contextIndex: 2, pageIndex: 3, window: { value: 4 } },
    bodyReadTimeoutMs === undefined ? {} : { bodyReadTimeoutMs },
  );
  return { cdp, page };
}

function request(requestId: string): Record<string, unknown> {
  return {
    requestId,
    timestamp: 10,
    wallTime: 1_700_000_000,
    type: "Fetch",
    documentURL: "https://example.test/app",
    initiator: { type: "script", stack: { raw: "not retained" } },
    request: {
      url: "https://example.test/api?token=secret",
      method: "POST",
      headers: { accept: "application/json", "Content-Type": "application/json" },
      hasPostData: true,
      postData: '{"ordinary":true}',
      rawProtocolOnly: "not retained",
    },
  };
}

function response(requestId: string): Record<string, unknown> {
  return {
    requestId,
    type: "Fetch",
    response: {
      status: 201,
      statusText: "Created",
      headers: { "Content-Type": "application/json" },
      mimeType: "application/json",
      protocol: "h2",
      connectionId: 7,
      remoteIPAddress: "127.0.0.1",
      remotePort: 443,
      securityState: "secure",
      timing: {
        proxyStart: -1,
        proxyEnd: -1,
        dnsStart: 1,
        dnsEnd: 2,
        connectStart: 2,
        connectEnd: 4,
        sslStart: 2,
        sslEnd: 3,
        sendStart: 4,
        sendEnd: 5,
        receiveHeadersStart: 6,
        receiveHeadersEnd: 8,
      },
      securityDetails: {
        protocol: "TLS 1.3",
        keyExchange: "",
        cipher: "AES_128_GCM",
        certificateId: 1,
        subjectName: "example.test",
        sanList: ["example.test"],
        issuer: "test",
        validFrom: 1,
        validTo: 2,
        signedCertificateTimestampList: [],
        certificateTransparencyCompliance: "unknown",
        encryptedClientHello: false,
      },
      rawProtocolOnly: "not retained",
    },
  };
}

test("typed CDP handlers retain only the normalized request/response/initiator/extra contract", async () => {
  const { cdp, page } = await installed();
  cdp.emit("Network.requestWillBeSentExtraInfo", {
    requestId: "happy",
    headers: { cookie: "orb_session=secret" },
    headersText: "Cookie: orb_session=secret\r\n",
    associatedCookies: [{ cookie: { name: "orb_session", value: "secret", path: "/", domain: "example.test", httpOnly: true, secure: true, sameSite: "Lax" } }],
  });
  cdp.emit("Network.responseReceivedExtraInfo", {
    requestId: "happy",
    statusCode: 201,
    headers: { "Set-Cookie": "orb_session=secret; Path=/; HttpOnly" },
    headersText: "HTTP/2 201\r\n",
  });
  cdp.emit("Network.requestWillBeSent", request("happy"));
  cdp.emit("Network.responseReceived", response("happy"));
  cdp.emit("Network.loadingFinished", { requestId: "happy", timestamp: 10.25, encodedDataLength: 64 });

  const records = await networkRecordsForPages([page]);
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({
    initiatorType: "script",
    request: { method: "POST", url: "https://example.test/api?token=secret", hasPostData: true, postData: '{"ordinary":true}' },
    requestExtra: { headersText: "Cookie: orb_session=secret\r\n", cookies: [expect.objectContaining({ name: "orb_session", sameSite: "Lax" })] },
    response: { status: 201, protocol: "h2", timing: { dnsStart: 1, receiveHeadersEnd: 8 }, securityDetails: { protocol: "TLS 1.3" } },
    responseExtra: { statusCode: 201, headersText: "HTTP/2 201\r\n" },
  });
  expect(records[0]?.request).not.toHaveProperty("rawProtocolOnly");
  expect(records[0]?.response).not.toHaveProperty("rawProtocolOnly");

  const har = (await buildNetworkHar(pageOwner(page))) as { readonly log: { readonly entries: readonly Record<string, unknown>[] } };
  expect(har.log.entries).toHaveLength(1);
  expect(JSON.stringify(har)).not.toContain("rawProtocolOnly");
  expect(JSON.stringify(har)).not.toContain("secret");
});

test("omitted optional protocol fields normalize to explicit HAR fallbacks", async () => {
  const { cdp, page } = await installed();
  cdp.emit("Network.requestWillBeSent", {
    ...request("omitted"),
    initiator: { type: "other" },
    request: { url: "https://example.test/omitted", method: "GET", headers: { good: "yes", malformed: 42 } },
  });
  cdp.emit("Network.responseReceived", {
    requestId: "omitted",
    type: "Document",
    response: { status: 204, statusText: "No Content", headers: {}, mimeType: "", connectionId: 0, securityState: "neutral" },
  });
  cdp.emit("Network.loadingFinished", { requestId: "omitted", timestamp: 10.1, encodedDataLength: 0 });

  const [record] = await networkRecordsForPages([page]);
  expect(record).toMatchObject({
    initiatorType: "other",
    request: { headers: [{ name: "good", value: "yes" }], hasPostData: false, postData: null },
    requestExtra: null,
    response: {
      protocol: "unknown",
      timing: null,
      remoteIPAddress: "",
      remotePort: -1,
      securityDetails: null,
      fromDiskCache: false,
      fromServiceWorker: false,
      fromPrefetchCache: false,
    },
    responseExtra: null,
  });
  const har = (await buildNetworkHar(pageOwner(page))) as {
    readonly log: { readonly entries: readonly { readonly request: Record<string, unknown>; readonly response: Record<string, unknown> }[] };
  };
  expect(har.log.entries[0]).toMatchObject({
    request: { httpVersion: "unknown", headersSize: -1 },
    response: { status: 204, httpVersion: "unknown", headersSize: -1, _securityDetails: null },
  });
});

test("hung request and response body reads time out, release retention, and persist explicit omissions", async () => {
  const cdp = new FakeCdp((method) =>
    method === "Network.getRequestPostData" || method === "Network.getResponseBody" ? new Promise(() => undefined) : Promise.resolve({}),
  );
  const installedPage = await installed(cdp, 5);
  const { page } = installedPage;
  cdp.emit("Network.requestWillBeSent", {
    ...request("timeout"),
    request: { url: "https://example.test/timeout", method: "POST", headers: {}, hasPostData: true },
  });
  cdp.emit("Network.responseReceived", response("timeout"));
  selectNetworkBodies([page], "timeout");
  cdp.emit("Network.loadingFinished", { requestId: "timeout", timestamp: 10.25, encodedDataLength: 64 });

  const [record] = await networkRecordsForPages([page]);
  expect(record?.requestBody).toEqual({ text: null, unavailableReason: "timeout", truncatedAt: null });
  expect(record?.responseBody).toEqual({ text: null, base64Encoded: false, unavailableReason: "timeout", truncatedAt: null });
  const har = (await buildNetworkHar(pageOwner(page))) as {
    readonly log: {
      readonly entries: readonly {
        readonly request: { readonly postData: { readonly omission: unknown } };
        readonly response: { readonly content: unknown };
      }[];
    };
  };
  expect(har.log.entries[0]?.request.postData.omission).toEqual({ reason: "timeout", limitBytes: null });
  expect(har.log.entries[0]?.response.content).toMatchObject({ _orbOmission: { reason: "timeout", limitBytes: null } });
});

test("HAR receipt distinguishes event and body measured-limit shapes and refuses malformed event receipts", () => {
  const har = {
    log: {
      entries: [
        {
          _orb: { contextIndex: 0, pageIndex: 0 },
          _orbMeasuredLimit: { policy: {}, events: [{ kind: "body", path: "$.body", original: 9, retained: 4, omitted: 5 }] },
          request: { postData: { _orbMeasuredLimit: { inputBytes: 9, retainedBytes: 4, truncated: true } } },
          response: { content: { _orbMeasuredLimit: null } },
        },
      ],
    },
  };
  expect(networkHarReceipt(har).limits[0]?.events).toEqual([{ kind: "body", path: "$.body", original: 9, retained: 4, omitted: 5 }]);
  expect(() =>
    networkHarReceipt({
      log: { entries: [{ _orb: { contextIndex: 0, pageIndex: 0 }, _orbMeasuredLimit: { events: { kind: "not-an-array" } } }] },
    }),
  ).toThrow("HAR measured-limit receipt has no events array");
  expect(() =>
    networkHarReceipt({
      log: { entries: [{ _orb: { contextIndex: 0, pageIndex: 0 }, _orbMeasuredLimit: { inputBytes: "9", retainedBytes: 4, truncated: true } }] },
    }),
  ).toThrow("HAR measured-limit receipt has an unrecognized shape");
});
