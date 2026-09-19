// THE FILE-ORIGIN FENCE, AT ITS ACTUAL BOUNDARY (#1538 item 4).
//
// The header over `isFileOriginNoise`/`isFileOriginRequest` used to claim ONE narrowing rule for both
// halves — "the two URLs must be IDENTICAL" — which is true only of the CONSOLE half. A `CapturedRequest`
// carries one URL, so the request half narrows on Chromium's exact failure text plus the `file:` scheme,
// and it therefore fences ANY `file://` request the browser blocks as cross-origin, not only the CDP
// attach's own. The comment now says that; these arms pin the boundary it describes, so the two cannot
// drift apart again silently. The last arm is the one that matters for blinding: a genuinely missing
// sibling fails with a DIFFERENT text and stays a failure.
import type { CapturedConsole, CapturedRequest } from "@orb/tooling/_shared/browser";
import {
  isDevToolsFrontendNoise,
  isFileOriginNoise,
  isFileOriginRequest,
  partitionFailedRequests,
  verdictConsoleErrors,
} from "../../../../tooling/src/snap/ops/noise.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const DOCUMENT = "file:///tmp/mock.html";

function request(over: Partial<CapturedRequest>): CapturedRequest {
  return { url: DOCUMENT, method: "GET", status: null, failed: null, type: "document", ...over } satisfies CapturedRequest;
}

function consoleError(text: string): CapturedConsole {
  return { type: "error", text, location: null, line: `[error] ${text}` } satisfies CapturedConsole;
}

// #2431 instrument plant: the VENDORED DevTools frontend the appearance/cascade pass loads enables the
// `Autofill` domain the pinned browser does not expose, so its protocol client logs two method-not-found
// errors per attach — measured on `pnpm snap home --cascade …` 2026-09-19 as `counted(console-errors)` on a
// page whose product surface had none, i.e. two false console errors on EVERY `--matrix` cell. The call site
// is inside a byte-hash-pinned vendored closure, so the fence is the answer; these arms are its boundary.
const FRONTEND_SCRIPT = "http://127.0.0.1:44271/serve_rev/@33c2f401a9c8ddad2159eb0ab83aa244a5247361/core/protocol_client/protocol_client.js";

function frontendError(text: string, url = FRONTEND_SCRIPT): CapturedConsole {
  return { type: "error", text, location: { url, line: 0, column: 617_907 }, line: `[error] ${text}` } satisfies CapturedConsole;
}

test("the DevTools-frontend fence takes the Autofill method-not-found pair and nothing else", () => {
  expect(isDevToolsFrontendNoise(frontendError(`Request Autofill.enable failed. {"code":-32601,"message":"'Autofill.enable' wasn't found"}`))).toBe(true);
  expect(isDevToolsFrontendNoise(frontendError(`Request Autofill.setAddresses failed. {"code":-32601,"message":"'Autofill.setAddresses' wasn't found"}`))).toBe(
    true,
  );
  // A protocol call that failed for a REAL reason is the bridge's own CSS/DOM read going wrong — the one
  // failure that makes a cascade receipt untrustworthy. It stays a console error.
  expect(isDevToolsFrontendNoise(frontendError(`Request CSS.getMatchedStylesForNode failed. {"code":-32000,"message":"Node is not an Element"}`))).toBe(false);
  // …and the ORIGIN fence: the same text from a PRODUCT script is never this class.
  expect(isDevToolsFrontendNoise(frontendError(`Request Autofill.enable failed. {"code":-32601}`, "http://localhost:5173/src/main.tsx"))).toBe(false);
  // A console error with no location cannot be attributed to the frontend at all.
  expect(isDevToolsFrontendNoise(consoleError(`Request Autofill.enable failed. {"code":-32601}`))).toBe(false);
});

test("the verdict count excludes the frontend pair and still counts a real product error beside it", () => {
  expect(
    verdictConsoleErrors([
      frontendError(`Request Autofill.enable failed. {"code":-32601,"message":"'Autofill.enable' wasn't found"}`),
      frontendError(`Request Autofill.setAddresses failed. {"code":-32601,"message":"'Autofill.setAddresses' wasn't found"}`),
      consoleError("TypeError: undefined is not a function"),
    ]),
  ).toBe(1);
});

test("the CONSOLE half fences only the attach's own event — two DIFFERENT urls stay a real error", () => {
  const sameUrl = `Unsafe attempt to load URL ${DOCUMENT} from frame with URL ${DOCUMENT}. 'file:' URLs are treated as unique security origins.`;
  const sibling = `Unsafe attempt to load URL file:///tmp/other.png from frame with URL ${DOCUMENT}. 'file:' URLs are treated as unique security origins.`;

  expect(isFileOriginNoise(consoleError(sameUrl))).toBe(true);
  expect(isFileOriginNoise(consoleError(sibling))).toBe(false);
});

test("the REQUEST half narrows on the failure TEXT and the scheme — it has no second url, and says so", () => {
  // The attach's own blocked request.
  expect(isFileOriginRequest(request({ failed: "origin" }))).toBe(true);
  // The documented residue: a SIBLING file url blocked the same way is fenced too. Pinned deliberately —
  // this is the reach the comment now declares, not an accident a reader has to rediscover.
  expect(isFileOriginRequest(request({ url: "file:///tmp/other.png", failed: "origin" }))).toBe(true);
  // What keeps that residue from blinding a real defect: an absent sibling fails with a different text.
  expect(isFileOriginRequest(request({ url: "file:///tmp/other.png", failed: "net::ERR_FILE_NOT_FOUND" }))).toBe(false);
  // …and the scheme fence holds: an http request blocked as cross-origin is never this class.
  expect(isFileOriginRequest(request({ url: "http://127.0.0.1:5173/x.js", failed: "origin" }))).toBe(false);
});

test("the partition routes each class to its own bucket, so nothing is dropped on the way to the verdict", () => {
  const { failed, fileOrigin } = partitionFailedRequests([
    request({ failed: "origin" }),
    request({ url: "file:///tmp/other.png", failed: "net::ERR_FILE_NOT_FOUND" }),
    request({ url: "http://127.0.0.1:5173/ok.js", status: 200 }),
  ]);

  expect(fileOrigin).toHaveLength(1);
  expect(failed.map((entry) => entry.failed)).toEqual(["net::ERR_FILE_NOT_FOUND"]);
});
