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
import { isFileOriginNoise, isFileOriginRequest, partitionFailedRequests } from "../../../../tooling/src/snap/ops/noise.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const DOCUMENT = "file:///tmp/mock.html";

function request(over: Partial<CapturedRequest>): CapturedRequest {
  return { url: DOCUMENT, method: "GET", status: null, failed: null, type: "document", ...over } satisfies CapturedRequest;
}

function consoleError(text: string): CapturedConsole {
  return { type: "error", text, location: null, line: `[error] ${text}` } satisfies CapturedConsole;
}

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
