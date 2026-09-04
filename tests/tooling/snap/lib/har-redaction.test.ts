// Security controls for the one HAR disk-safety door. Every credential carrier gets a distinct canary;
// the positive control proves the raw fixture contains it before the serialized result proves it cannot.
import type { RawNetworkEvidence } from "../../../../tooling/src/snap/contract/har-redaction.ts";
import { REDACTED } from "../../../../tooling/src/snap/contract/har-redaction.ts";
import { redactNetworkEvidence, redactNetworkUrl } from "../../../../tooling/src/snap/lib/har-redaction.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("redacts every credential carrier while ordinary evidence remains useful", () => {
  const canaries = {
    auth: "CANARY_AUTH_8a1f",
    proxy: "CANARY_PROXY_87cd",
    cookieHeader: "CANARY_COOKIE_HEADER_c8ce",
    setCookieOne: "CANARY_SET_COOKIE_ONE_291a",
    setCookieTwo: "CANARY_SET_COOKIE_TWO_22a8",
    query: "CANARY_QUERY_API_KEY_4814",
    querySession: "CANARY_QUERY_SESSION_34ee",
    headerCsrf: "CANARY_HEADER_CSRF_fa67",
    cookie: "CANARY_COOKIE_VALUE_71c0",
    jsonPassword: "CANARY_JSON_PASSWORD_2e2f",
    jsonToken: "CANARY_JSON_TOKEN_43bc",
    formCsrf: "CANARY_FORM_CSRF_18a4",
    refererQuery: "CANARY_REFERER_QUERY_4fe1",
    locationQuery: "CANARY_LOCATION_QUERY_5c3d",
  } as const;
  const input = {
    url: `https://user:pass@example.test/search?q=useful&API_Key=${canaries.query}&SeSsIoN=${canaries.querySession}#private-fragment`,
    requestHeaders: [
      { name: "Accept", value: "application/json" },
      { name: "Content-Security-Policy", value: "default-src 'self'" },
      { name: "aUtHoRiZaTiOn", value: `Bearer ${canaries.auth}` },
      { name: "Proxy-Authorization", value: canaries.proxy },
      { name: "X-CsRf", value: canaries.headerCsrf },
      { name: "COOKIE", value: `sid=${canaries.cookieHeader}` },
      { name: "Referer", value: `https://example.test/source?page=2&session_token=${canaries.refererQuery}` },
    ],
    requestCookies: [{ name: "orb_session", value: canaries.cookie, path: "/", httpOnly: true }],
    postData: {
      mimeType: "application/json; charset=utf-8",
      text: JSON.stringify({
        message: "ordinary message",
        ["PaSsWoRd"]: canaries.jsonPassword,
        nested: [{ ["access_token"]: canaries.jsonToken, visible: 7 }],
      }),
    },
    responseHeaders: [
      { name: "Content-Type", value: "application/x-www-form-urlencoded" },
      { name: "Set-Cookie", value: `a=${canaries.setCookieOne}; HttpOnly` },
      { name: "set-cookie", value: `b=${canaries.setCookieTwo}; Secure` },
      { name: "Location", value: `/final?tab=details&password=${canaries.locationQuery}` },
    ],
    responseContent: {
      mimeType: "application/x-www-form-urlencoded",
      text: `name=useful&X-CSRF-Token=${canaries.formCsrf}`,
    },
  } satisfies RawNetworkEvidence;
  const raw = JSON.stringify(input);
  for (const canary of Object.values(canaries)) {
    expect(raw).toContain(canary);
  }

  const output = redactNetworkEvidence(input);
  const serialized = JSON.stringify(output);

  for (const canary of Object.values(canaries)) {
    expect(serialized).not.toContain(canary);
  }
  expect(output.query).toEqual([
    { name: "q", value: "useful" },
    { name: "API_Key", value: REDACTED },
    { name: "SeSsIoN", value: REDACTED },
  ]);
  expect(output.request.headers).toContainEqual({ name: "Accept", value: "application/json" });
  expect(output.request.headers).toContainEqual({ name: "Content-Security-Policy", value: "default-src 'self'" });
  expect(output.request.headers).toContainEqual({ name: "X-CsRf", value: REDACTED });
  expect(output.request.headers.find((header) => header.name === "Referer")?.value).toContain("page=2");
  expect(output.request.cookies).toEqual([{ name: "orb_session", value: REDACTED, path: "/", httpOnly: true }]);
  expect(output.request.postData?.text).toContain('"message":"ordinary message"');
  expect(output.request.postData?.text).toContain('"visible":7');
  expect(output.response.headers.filter((header) => header.name.toLowerCase() === "set-cookie")).toEqual([
    { name: "Set-Cookie", value: REDACTED },
    { name: "set-cookie", value: REDACTED },
  ]);
  expect(output.response.headers.find((header) => header.name === "Location")?.value).toContain("tab=details");
  expect(output.response.content?.params).toEqual([
    { name: "name", value: "useful" },
    { name: "X-CSRF-Token", value: REDACTED },
  ]);
});

test("raw CDP header maps accept array values without collapsing duplicate Set-Cookie evidence", () => {
  const first = "CANARY_DUP_COOKIE_1_9aa0";
  const second = "CANARY_DUP_COOKIE_2_f31c";
  const output = redactNetworkEvidence({
    url: "https://example.test/",
    responseHeaders: { "set-cookie": [`one=${first}`, `two=${second}`], server: "loopback" },
  });
  const serialized = JSON.stringify(output);

  expect(`${first}${second}`).toContain("CANARY_DUP_COOKIE");
  expect(serialized).not.toContain(first);
  expect(serialized).not.toContain(second);
  expect(output.response.headers).toEqual([
    { name: "server", value: "loopback" },
    { name: "set-cookie", value: REDACTED },
    { name: "set-cookie", value: REDACTED },
  ]);
});

test("signed URL carriers and malformed authorities cannot retain bearer material", () => {
  const canaries = {
    azure: "CANARY_AZURE_SIG_a111",
    awsSignature: "CANARY_AWS_SIGNATURE_b222",
    awsCredential: "CANARY_AWS_CREDENTIAL_c333",
    awsToken: "CANARY_AWS_TOKEN_d444",
    googleSignature: "CANARY_GOOGLE_SIGNATURE_e555",
    googleCredential: "CANARY_GOOGLE_CREDENTIAL_f666",
    malformedUserinfo: "CANARY_MALFORMED_USERINFO_0777",
  } as const;
  const signed = redactNetworkUrl(
    `https://assets.example.test/object?ordinary=kept&sig=${canaries.azure}&X-Amz-Signature=${canaries.awsSignature}&X-Amz-Credential=${canaries.awsCredential}&X-Amz-Security-Token=${canaries.awsToken}&X-Goog-Signature=${canaries.googleSignature}&X-Goog-Credential=${canaries.googleCredential}`,
  );
  const malformed = redactNetworkUrl(`https://user:${canaries.malformedUserinfo}@bad host/object?sig=${canaries.azure}`);
  const relative = redactNetworkUrl(`/next?tab=details&sig=${canaries.azure}#${canaries.awsToken}`);
  const headerEvidence = redactNetworkEvidence({
    url: "https://example.test/",
    requestHeaders: [{ name: "Referer", value: `https://source.test/?X-Goog-Signature=${canaries.googleSignature}` }],
    responseHeaders: [{ name: "Location", value: `/download?ordinary=kept&sig=${canaries.azure}` }],
  });
  const serialized = JSON.stringify({ signed, malformed, relative, headerEvidence });

  for (const canary of Object.values(canaries)) {
    expect(serialized).not.toContain(canary);
  }
  expect(signed.query.find((pair) => pair.name === "ordinary")?.value).toBe("kept");
  expect(signed.query.filter((pair) => pair.name !== "ordinary").every((pair) => pair.value === REDACTED)).toBe(true);
  expect(malformed.url.startsWith("[OMITTED]")).toBe(true);
  expect(malformed._orbMeasuredLimit.events).toContainEqual(expect.objectContaining({ kind: "unreadable", path: "$.url", retained: 0 }));
  expect(relative.url).toContain("tab=details");
  expect(relative.url).toContain("sig=[REDACTED]");
  expect(relative.url).toContain("#[REDACTED]");
  expect(headerEvidence.response.headers[0]?.value).toContain("ordinary=kept");
  expect(headerEvidence.response.headers[0]?.value).toContain("sig=[REDACTED]");
});

test("malformed JSON and form bodies are omitted without reflecting their raw secrets", () => {
  const jsonCanary = "CANARY_MALFORMED_JSON_d4c0";
  const formCanary = "CANARY_MALFORMED_FORM_fdc1";
  const json = redactNetworkEvidence({
    url: "https://example.test/",
    postData: { mimeType: "application/json", text: `{"password":"${jsonCanary}"` },
  });
  const form = redactNetworkEvidence({
    url: "https://example.test/",
    postData: { mimeType: "application/x-www-form-urlencoded", text: `password=${formCanary}&bad=%ZZ` },
  });

  expect(`{"password":"${jsonCanary}"`).toContain(jsonCanary);
  expect(`password=${formCanary}&bad=%ZZ`).toContain(formCanary);
  expect(json.request.postData?.omission?.reason).toBe("malformed-json");
  expect(form.request.postData?.omission?.reason).toBe("malformed-form");
  expect(JSON.stringify(json)).not.toContain(jsonCanary);
  expect(JSON.stringify(form)).not.toContain(formCanary);
});

test("oversize structured bodies are omitted and plain text is byte-bounded with exact accounting", () => {
  const structured = redactNetworkEvidence(
    {
      url: "https://example.test/",
      postData: { mimeType: "application/json", text: JSON.stringify({ safe: "x".repeat(80) }) },
    },
    { maxBodyBytes: 32 },
  );
  const plain = redactNetworkEvidence(
    {
      url: "https://example.test/",
      responseContent: { mimeType: "text/plain", text: `hello-${"é".repeat(40)}` },
    },
    { maxBodyBytes: 32 },
  );

  expect(structured.request.postData?.omission).toEqual({ reason: "body-too-large", limitBytes: 32 });
  expect(structured.request.postData?._orbMeasuredLimit).toEqual({ inputBytes: 91, retainedBytes: 0, truncated: true });
  expect(Buffer.byteLength(plain.response.content?.text ?? "", "utf8")).toBe(31);
  expect(plain.response.content?.text?.endsWith("[TRUNCATED]")).toBe(true);
  expect(plain._orbMeasuredLimit.events).toContainEqual({ kind: "body", path: "$.response.content", original: 86, retained: 20, omitted: 66 });
});

test("base64 is decoded only for allowlisted UTF-8 text; binary and invalid encodings stay metadata-only", () => {
  const canary = "CANARY_BASE64_TOKEN_f329";
  const invalidCanary = "CANARY_INVALID_BASE64_119a*";
  const text = redactNetworkEvidence({
    url: "https://example.test/",
    responseContent: {
      mimeType: "application/json",
      base64Encoded: true,
      text: Buffer.from(JSON.stringify({ token: canary, ordinary: "kept" })).toString("base64"),
    },
  });
  const binary = redactNetworkEvidence({
    url: "https://example.test/image",
    responseContent: { mimeType: "application/octet-stream", base64Encoded: true, text: Buffer.from([0, 1, 2]).toString("base64"), sizeBytes: 3 },
  });
  const nonUtf8 = redactNetworkEvidence({
    url: "https://example.test/not-text",
    responseContent: { mimeType: "text/plain", base64Encoded: true, text: Buffer.from([0xff, 0xfe]).toString("base64") },
  });
  const invalidBase64 = redactNetworkEvidence({
    url: "https://example.test/invalid-base64",
    responseContent: { mimeType: "text/plain", base64Encoded: true, text: invalidCanary },
  });

  expect(JSON.stringify({ token: canary })).toContain(canary);
  expect(invalidCanary).toContain("CANARY_INVALID_BASE64");
  expect(JSON.stringify(text)).not.toContain(canary);
  expect(JSON.stringify(invalidBase64)).not.toContain(invalidCanary);
  expect(text.response.content?.text).toBe(`{"ordinary":"kept","token":"${REDACTED}"}`);
  expect(text.response.content?.encoding).toBe("base64");
  expect(binary.response.content?.omission?.reason).toBe("mime-not-text");
  expect(binary.response.content?.sizeBytes).toBe(3);
  expect(nonUtf8.response.content?.omission?.reason).toBe("non-utf8");
  expect(invalidBase64.response.content?.omission?.reason).toBe("invalid-base64");
});

test("cycle, depth, field, and string caps have deterministic explicit receipts", () => {
  const cyclic: Record<string, unknown> = { safe: "abcdefghijklmnop" };
  cyclic["self"] = cyclic;
  cyclic["deep"] = { next: { next: { visible: true } } };
  cyclic["extra"] = "omitted by field cap";

  const output = redactNetworkEvidence(
    { url: "https://example.test/", postData: { mimeType: "application/json", value: cyclic } },
    { maxDepth: 2, maxFields: 20, maxStringBytes: 14 },
  );
  const fieldLimited = redactNetworkEvidence(
    { url: "https://example.test/", postData: { mimeType: "application/json", value: { a: 1, b: 2, c: 3 } } },
    { maxFields: 2 },
  );
  const kinds = [...output._orbMeasuredLimit.events, ...fieldLimited._orbMeasuredLimit.events].map((item) => item.kind);

  expect(output.request.postData?.text).toContain("[TRUNCATED]");
  expect(kinds).toContain("cycle");
  expect(kinds).toContain("depth");
  expect(kinds).toContain("fields");
  expect(kinds).toContain("string");
  expect(output._orbMeasuredLimit.events.every((item) => item.path.startsWith("$"))).toBe(true);
});

test("streaming and non-text bodies retain type, size, encoding, and a specific omission reason", () => {
  const streaming = redactNetworkEvidence({
    url: "https://example.test/events",
    responseContent: { mimeType: "text/event-stream", streaming: true, sizeBytes: 123, encoding: "identity" },
  });
  const binary = redactNetworkEvidence({
    url: "https://example.test/file",
    responseContent: { mimeType: "image/png", sizeBytes: 456, encoding: "gzip", text: "must-not-survive" },
  });

  expect(streaming.response.content).toMatchObject({
    mimeType: "text/event-stream",
    sizeBytes: 123,
    encoding: "identity",
    text: null,
    omission: { reason: "streaming" },
  });
  expect(binary.response.content).toMatchObject({ mimeType: "image/png", sizeBytes: 456, encoding: "gzip", text: null, omission: { reason: "mime-not-text" } });
  expect(JSON.stringify(binary)).not.toContain("must-not-survive");
});

test("equivalent unordered input serializes byte-identically", () => {
  const left = redactNetworkEvidence({
    url: "https://example.test/?b=2&a=1",
    requestHeaders: [
      { name: "Zebra", value: "z" },
      { name: "Accept", value: "a" },
    ],
    postData: { mimeType: "application/json", value: { zebra: 1, alpha: { two: 2, one: 1 } } },
  });
  const right = redactNetworkEvidence({
    url: "https://example.test/?b=2&a=1",
    requestHeaders: [
      { name: "Accept", value: "a" },
      { name: "Zebra", value: "z" },
    ],
    postData: { mimeType: "application/json", value: { alpha: { one: 1, two: 2 }, zebra: 1 } },
  });

  expect(JSON.stringify(left)).toBe(JSON.stringify(right));
  expect(left.request.headers).toEqual([
    { name: "Accept", value: "a" },
    { name: "Zebra", value: "z" },
  ]);
});

test("hostile getters cannot smuggle their secret through a thrown error or output", () => {
  const canary = "CANARY_THROWN_ERROR_750b";
  const hostile = new Proxy<RawNetworkEvidence>(
    { url: "https://example.test/" },
    {
      get() {
        throw new Error(canary);
      },
    },
  );
  let thrown = "";
  let output = "";
  try {
    output = JSON.stringify(redactNetworkEvidence(hostile));
  } catch (error) {
    thrown = String(error);
  }

  expect(new Error(canary).message).toContain(canary);
  expect(thrown).toBe("");
  expect(output).not.toContain(canary);
  expect(output).toContain('"kind":"unreadable"');
});
