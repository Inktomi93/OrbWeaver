// Positive controls for every browser-diagnostic carrier persisted by Snap. Canary bytes must exist in
// raw fixtures and disappear from every disk-safe projection without destroying ordinary provenance.
import type { BrowserDiagnostic } from "../../../../tooling/src/_shared/browser-diagnostics.ts";
import { redactedRequestUrl } from "../../../../tooling/src/_shared/browser-request-url.ts";
import {
  redactBrowserDiagnostic,
  redactBrowserDiagnostics,
  redactBrowserPageError,
  redactCapturedConsole,
  redactCapturedRequest,
} from "../../../../tooling/src/snap/lib/browser-evidence-redaction.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

function diagnostic(overrides: Partial<BrowserDiagnostic> = {}): BrowserDiagnostic {
  return {
    origin: "page-console",
    source: "console-api",
    level: "error",
    category: "console",
    text: "ordinary diagnostic",
    timestamp: 123,
    location: { url: "https://example.test/ordinary", line: 7, column: 3 },
    stack: null,
    requestId: "request-7",
    issueCode: null,
    details: null,
    backendNodeId: 42,
    contextIndex: 1,
    pageIndex: 2,
    evidenceWindow: 3,
    raw: null,
    ...overrides,
  };
}

test("page console, browser log, Audits, and orb-console carriers lose signed URL and credential canaries", () => {
  const canaries = {
    pageText: "CANARY_PAGE_TEXT_SIG_a1",
    pageLocation: "CANARY_PAGE_LOCATION_AMZ_b2",
    browserStack: "CANARY_BROWSER_STACK_GOOG_c3",
    browserRaw: "CANARY_BROWSER_RAW_AUTH_d4",
    auditDetails: "CANARY_AUDIT_DETAILS_SIG_e5",
    auditRaw: "CANARY_AUDIT_RAW_TOKEN_f6",
    orbText: "CANARY_ORB_TEXT_SESSION_07",
    orbStack: "CANARY_ORB_STACK_SIG_18",
    orbRoute: "CANARY_ORB_ROUTE_SIG_29",
  } as const;
  const raw = [
    diagnostic({
      text: `failed https://cdn.test/a?sig=${canaries.pageText}`,
      location: { url: `https://cdn.test/a?X-Amz-Signature=${canaries.pageLocation}`, line: 9, column: 1 },
      raw: { text: `https://cdn.test/a?sig=${canaries.pageText}` },
    }),
    diagnostic({
      origin: "browser-log",
      source: "network",
      stack: { callFrames: [{ url: `https://gcs.test/o?X-Goog-Signature=${canaries.browserStack}` }] },
      raw: { authorization: `Bearer ${canaries.browserRaw}`, ordinary: "kept" },
    }),
    diagnostic({
      origin: "audits",
      source: "audits",
      issueCode: "MixedContentIssue",
      details: { request: { sig: canaries.auditDetails, requestId: "request-7" } },
      raw: { issue: { ["access_token"]: canaries.auditRaw } },
    }),
    diagnostic({
      origin: "orb-console-ring",
      source: "orb-console-ring",
      category: "rejection",
      text: `session=${canaries.orbText} ordinary=kept`,
      location: { url: `/route?tab=kept&sig=${canaries.orbRoute}`, line: 0, column: null },
      stack: `at load (https://app.test/route?sig=${canaries.orbStack})`,
      details: { route: `/route?sig=${canaries.orbRoute}`, subtype: "rejection" },
      raw: { route: `/route?sig=${canaries.orbRoute}`, text: `session=${canaries.orbText}` },
    }),
  ] satisfies readonly BrowserDiagnostic[];
  const rawSerialized = JSON.stringify(raw);
  for (const canary of Object.values(canaries)) {
    expect(rawSerialized).toContain(canary);
  }

  const safe = redactBrowserDiagnostics(raw);
  const serialized = JSON.stringify(safe);
  for (const canary of Object.values(canaries)) {
    expect(serialized).not.toContain(canary);
  }
  expect(serialized).toContain("[REDACTED]");
  expect(safe.records).toHaveLength(4);
  expect(safe.records[1]).toMatchObject({
    origin: "browser-log",
    source: "network",
    level: "error",
    requestId: "request-7",
    backendNodeId: 42,
    contextIndex: 1,
    pageIndex: 2,
    evidenceWindow: 3,
  });
  expect(JSON.stringify(safe.records[1]?.raw)).toContain('"ordinary":"kept"');
  expect(safe.records[3]?.text).toContain("ordinary=kept");
  expect(safe.records[3]?.location?.url).toContain("tab=kept");
});

test("request, captured-console, and page-error projections scrub signed URLs before persistence", () => {
  const requestCanary = "CANARY_FAILED_REQUEST_SIG_3a";
  const consoleCanary = "CANARY_CAPTURED_CONSOLE_SIG_4b";
  const pageErrorCanary = "CANARY_PAGE_ERROR_SIG_5c";
  const authorizationCanary = "CANARY_PAGE_ERROR_AUTH_6d";
  const request = redactCapturedRequest({
    method: "GET",
    url: `https://blob.test/file?ordinary=kept&sig=${requestCanary}`,
    status: null,
    failed: `net error at https://blob.test/file?sig=${requestCanary}`,
    type: "image",
  });
  const console = redactCapturedConsole({
    type: "error",
    text: `load failed https://blob.test/file?sig=${consoleCanary}`,
    location: { url: `https://app.test/?sig=${consoleCanary}`, line: 1, column: 2 },
    line: `[error] load failed https://blob.test/file?sig=${consoleCanary}`,
  });
  const pageError = redactBrowserPageError({
    kind: "runtime",
    name: "Error",
    message: `request https://blob.test/file?sig=${pageErrorCanary} Authorization: Bearer ${authorizationCanary}`,
    stack: `payload={"sig":"${pageErrorCanary}","ordinary":"kept"}`,
  });
  const serialized = JSON.stringify({ request, console, pageError });

  expect(`${requestCanary}${consoleCanary}${pageErrorCanary}`).toContain("CANARY_");
  expect(serialized).not.toContain(requestCanary);
  expect(serialized).not.toContain(consoleCanary);
  expect(serialized).not.toContain(pageErrorCanary);
  expect(serialized).not.toContain(authorizationCanary);
  expect(request.url).toContain("ordinary=kept");
  expect(request.url).toContain("sig=[REDACTED]");
  expect(console.location?.line).toBe(1);
  expect(pageError.kind).toBe("runtime");
  expect(pageError.stack).toContain('"ordinary":"kept"');
});

test("request-summary identities redact credentials, named secret path values, and sensitive query values before becoming map keys", () => {
  const raw = "https://user:password@example.test/api/token/path-secret/resource?ordinary=kept&signature=query-secret";
  const safe = redactedRequestUrl(raw);

  expect(raw).toContain("path-secret");
  expect(safe).not.toContain("user");
  expect(safe).not.toContain("password");
  expect(safe).not.toContain("path-secret");
  expect(safe).not.toContain("query-secret");
  expect(safe).toContain("/token/%5BREDACTED%5D/resource");
  expect(safe).toContain("ordinary=kept");
});

test("projection is deterministic, bounded, cyclic-safe, and hostile getters cannot echo thrown secrets", () => {
  const cycle: Record<string, unknown> = { ordinary: "kept" };
  cycle["self"] = cycle;
  const left = redactBrowserDiagnostic(diagnostic({ raw: { z: 2, a: cycle }, text: "x".repeat(80) }), { maxStringBytes: 24 });
  const right = redactBrowserDiagnostic(diagnostic({ raw: { a: cycle, z: 2 }, text: "x".repeat(80) }), { maxStringBytes: 24 });
  const capped = redactBrowserDiagnostics([diagnostic(), diagnostic()], { maxEntries: 1 });
  const canary = "CANARY_HOSTILE_DIAGNOSTIC_6d";
  const hostile = new Proxy(diagnostic(), {
    get() {
      throw new Error(canary);
    },
  });
  let thrown = "";
  let hostileSerialized = "";
  try {
    hostileSerialized = JSON.stringify(redactBrowserDiagnostic(hostile));
  } catch (error) {
    thrown = String(error);
  }

  expect(JSON.stringify(left)).toBe(JSON.stringify(right));
  expect(left.text.endsWith("[TRUNCATED]")).toBe(true);
  expect(left._orbMeasuredLimit.events.map((event) => event.kind)).toEqual(expect.arrayContaining(["cycle", "string"]));
  expect(capped.records).toHaveLength(1);
  expect(capped._orbMeasuredLimit.events).toEqual([{ kind: "entries", path: "$", original: 2, retained: 1, omitted: 1 }]);
  expect(new Error(canary).message).toContain(canary);
  expect(thrown).toBe("");
  expect(hostileSerialized).not.toContain(canary);
  expect(hostileSerialized).toContain('"category":"unreadable"');
});
