import { isUtf8 } from "node:buffer";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type {
  DiskSafeBody,
  DiskSafeCookie,
  DiskSafeNameValue,
  DiskSafeNetworkEvidence,
  DiskSafeUrlEvidence,
  HarBodyContext,
  HarJsonCursor,
  HarRedactionContext,
  NetworkBodyInput,
  NetworkBodyOmissionReason,
  NetworkCookieInput,
  NetworkEvidenceLimits,
  NetworkHeaderInput,
  NetworkHeadersInput,
  NetworkLimitEvent,
  RawNetworkEvidence,
  RedactedJsonValue,
} from "../contract/har-redaction.ts";
import { REDACTED } from "../contract/har-redaction.ts";
import { resolveNetworkEvidenceLimits } from "./har-redaction-limits.ts";
import { renderParsedUrl } from "./network-url-render.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");
const OMITTED = "[OMITTED]";
const TRUNCATED = "[TRUNCATED]";
const RELATIVE_URL_BASE = "http://orb.invalid/";

function event(context: HarRedactionContext, receipt: NetworkLimitEvent): void {
  context.events.push(receipt);
}

function bytePrefix(value: string, maxBytes: number): string {
  let bytes = 0;
  let output = "";
  for (const character of value) {
    const next = Buffer.byteLength(character, "utf8");
    if (bytes + next > maxBytes) {
      break;
    }
    output += character;
    bytes += next;
  }
  return output;
}

function bounded(
  value: string,
  path: string,
  context: HarRedactionContext,
  options: { readonly kind?: "body" | "string"; readonly maxBytes?: number } = {},
): string {
  const maxBytes = options.maxBytes ?? context.limits.maxStringBytes;
  const bytes = Buffer.byteLength(value, "utf8");
  if (bytes <= maxBytes) {
    return value;
  }
  const suffixBytes = Buffer.byteLength(TRUNCATED, "utf8");
  const retained = Math.max(0, maxBytes - suffixBytes);
  const prefix = bytePrefix(value, retained);
  const prefixBytes = Buffer.byteLength(prefix, "utf8");
  event(context, { kind: options.kind ?? "string", path, original: bytes, retained: prefixBytes, omitted: bytes - prefixBytes });
  return `${prefix}${TRUNCATED}`;
}

export function isSensitiveEvidenceName(name: string): boolean {
  const compact = name.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
  return /(?:authorization|proxyauthorization|cookie|setcookie|apikey|accesskeyid|token|session|sessionid|csrf|xsrf|auth|password|passwd|clientsecret|secret|credentials?|privatekey|signature|sig)$/.test(
    compact,
  );
}

function urlHeaderName(name: string): boolean {
  return /^(?:content-location|location|origin|referer|referrer|x-original-url|x-rewrite-url)$/i.test(name);
}

function headerValue(name: string, value: string, path: string, context: HarRedactionContext): string {
  if (isSensitiveEvidenceName(name)) {
    return REDACTED;
  }
  return urlHeaderName(name) ? urlEvidence(value, context, path).url : bounded(value, path, context);
}

function isHeaderList(input: NetworkHeadersInput): input is readonly NetworkHeaderInput[] {
  return Array.isArray(input);
}

function headers(input: NetworkHeadersInput | undefined, path: string, context: HarRedactionContext): readonly DiskSafeNameValue[] {
  if (input === undefined) {
    return [];
  }
  const raw = isHeaderList(input)
    ? input
    : Object.entries(input).flatMap(([name, value]) => (typeof value === "string" ? [{ name, value }] : value.map((member) => ({ name, value: member }))));
  const sorted = raw
    .map((item, index) => ({ ...item, index }))
    .toSorted((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || a.index - b.index);
  if (sorted.length > context.limits.maxEntries) {
    event(context, { kind: "entries", path, original: sorted.length, retained: context.limits.maxEntries, omitted: sorted.length - context.limits.maxEntries });
  }
  return sorted.slice(0, context.limits.maxEntries).map((item, index) => {
    const name = bounded(item.name, `${path}[${index}].name`, context);
    const valuePath = `${path}[${index}].value`;
    return { name, value: headerValue(item.name, item.value, valuePath, context) };
  });
}

function cookies(input: readonly NetworkCookieInput[] | undefined, path: string, context: HarRedactionContext): readonly DiskSafeCookie[] {
  if (input === undefined) {
    return [];
  }
  if (input.length > context.limits.maxEntries) {
    event(context, { kind: "entries", path, original: input.length, retained: context.limits.maxEntries, omitted: input.length - context.limits.maxEntries });
  }
  return input.slice(0, context.limits.maxEntries).map((cookie, index) => {
    const text = (value: string, field: string): string => bounded(value, `${path}[${index}].${field}`, context);
    return {
      name: text(cookie.name, "name"),
      value: REDACTED,
      ...(cookie.path === undefined ? {} : { path: text(cookie.path, "path") }),
      ...(cookie.domain === undefined ? {} : { domain: text(cookie.domain, "domain") }),
      ...(cookie.expires === undefined ? {} : { expires: text(cookie.expires, "expires") }),
      ...(cookie.httpOnly === undefined ? {} : { httpOnly: cookie.httpOnly }),
      ...(cookie.secure === undefined ? {} : { secure: cookie.secure }),
      ...(cookie.sameSite === undefined ? {} : { sameSite: text(cookie.sameSite, "sameSite") }),
    };
  });
}

function formPairs(raw: string): readonly DiskSafeNameValue[] | null {
  const decode = (value: string): string | null => {
    // @orb-waive caught-failure-ownership(catch): malformed form encoding is the negative parse result; the body caller turns null into an explicit malformed-form omission and never exposes the decoder error. Ends if null stops producing that omission.
    try {
      return decodeURIComponent(value.replaceAll("+", " "));
    } catch {
      return null;
    }
  };
  const pairs: DiskSafeNameValue[] = [];
  for (const part of raw.split("&")) {
    const split = part.indexOf("=");
    const name = decode(split < 0 ? part : part.slice(0, split));
    const value = decode(split < 0 ? "" : part.slice(split + 1));
    if (name === null || value === null) {
      return null;
    }
    pairs.push({ name, value });
  }
  return pairs;
}

function sanitizePairs(input: readonly DiskSafeNameValue[], path: string, context: HarRedactionContext): readonly DiskSafeNameValue[] {
  if (input.length > context.limits.maxEntries) {
    event(context, { kind: "entries", path, original: input.length, retained: context.limits.maxEntries, omitted: input.length - context.limits.maxEntries });
  }
  return input.slice(0, context.limits.maxEntries).map((pair, index) => ({
    name: bounded(pair.name, `${path}[${index}].name`, context),
    value: isSensitiveEvidenceName(pair.name) ? REDACTED : bounded(pair.value, `${path}[${index}].value`, context),
  }));
}

function querySuffix(query: readonly DiskSafeNameValue[]): string {
  return query.length === 0
    ? ""
    : `?${query.map((pair) => `${encodeURIComponent(pair.name)}=${pair.value === REDACTED ? REDACTED : encodeURIComponent(pair.value)}`).join("&")}`;
}

function unreadableUrlEvidence(
  raw: string,
  queryPath: string,
  urlPath: string,
  context: HarRedactionContext,
): { readonly url: string; readonly query: readonly DiskSafeNameValue[] } {
  const question = raw.indexOf("?");
  const rawQuery = question < 0 ? "" : (raw.slice(question + 1).split("#", 1)[0] ?? "");
  const parsedQuery = formPairs(rawQuery);
  const query = parsedQuery === null ? [] : sanitizePairs(parsedQuery, queryPath, context);
  const rawBytes = Buffer.byteLength(raw);
  event(context, { kind: "unreadable", path: urlPath, original: rawBytes, retained: 0, omitted: rawBytes });
  if (parsedQuery === null) {
    event(context, { kind: "unreadable", path: queryPath, original: null, retained: 0, omitted: null });
  }
  return { url: `${OMITTED}${querySuffix(query)}`, query };
}

function urlEvidence(raw: string, context: HarRedactionContext, path = "$"): { readonly url: string; readonly query: readonly DiskSafeNameValue[] } {
  const queryPath = `${path}.query`;
  const urlPath = `${path}.url`;
  if (URL.canParse(raw) || URL.canParse(raw, RELATIVE_URL_BASE)) {
    const parsed = URL.canParse(raw) ? new URL(raw) : new URL(raw, RELATIVE_URL_BASE);
    const query = sanitizePairs(
      [...parsed.searchParams].map(([name, value]) => ({ name, value })),
      queryPath,
      context,
    );
    parsed.username = parsed.username === "" ? "" : REDACTED;
    parsed.password = parsed.password === "" ? "" : REDACTED;
    parsed.search = "";
    for (const pair of query) {
      parsed.searchParams.append(pair.name, pair.value);
    }
    if (parsed.hash !== "") {
      parsed.hash = REDACTED;
    }
    const rendered = renderParsedUrl(raw, parsed).replaceAll("%5BREDACTED%5D", REDACTED);
    return { url: bounded(rendered, urlPath, context, { maxBytes: context.limits.maxUrlBytes }), query };
  }
  return unreadableUrlEvidence(raw, queryPath, urlPath, context);
}

export function redactNetworkUrl(raw: string, overrides: Partial<NetworkEvidenceLimits> = {}): DiskSafeUrlEvidence {
  const limits = resolveNetworkEvidenceLimits(overrides);
  const events: NetworkLimitEvent[] = [];
  const evidence = urlEvidence(raw, { limits, events });
  return { ...evidence, _orbMeasuredLimit: { policy: limits, events } };
}

function jsonValue(value: unknown, cursor: HarJsonCursor): RedactedJsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return typeof value === "number" && !Number.isFinite(value) ? null : value;
  }
  if (typeof value === "string") {
    return bounded(value, cursor.path, cursor);
  }
  if (typeof value !== "object") {
    event(cursor, { kind: "unsupported", path: cursor.path, original: null, retained: 0, omitted: 1 });
    return OMITTED;
  }
  if (cursor.active.has(value)) {
    event(cursor, { kind: "cycle", path: cursor.path, original: null, retained: 0, omitted: 1 });
    return OMITTED;
  }
  if (cursor.depth >= cursor.limits.maxDepth) {
    event(cursor, { kind: "depth", path: cursor.path, original: cursor.depth, retained: cursor.limits.maxDepth, omitted: 1 });
    return OMITTED;
  }
  cursor.active.add(value);
  const source: readonly unknown[] | readonly [string, unknown][] = Array.isArray(value)
    ? value
    : Object.keys(value)
        .toSorted()
        .map((key) => {
          // @orb-waive caught-failure-ownership(catch): a hostile property getter becomes an explicit unreadable event plus [OMITTED]; the caught error can contain the secret and must never cross this disk-safety boundary. Ends if either marker or receipt is removed.
          try {
            return [key, Reflect.get(value, key)] as const;
          } catch {
            const safeKey = bounded(key, `${cursor.path}.$key`, cursor);
            event(cursor, { kind: "unreadable", path: `${cursor.path}.${safeKey}`, original: null, retained: 0, omitted: 1 });
            return [key, OMITTED] as const;
          }
        });
  const remaining = Math.max(0, cursor.limits.maxFields - cursor.state.fields);
  const kept = source.slice(0, remaining);
  cursor.state.fields += kept.length;
  if (source.length > kept.length) {
    event(cursor, { kind: "fields", path: cursor.path, original: source.length, retained: kept.length, omitted: source.length - kept.length });
  }
  const child = (path: string): HarJsonCursor => ({ ...cursor, path, depth: cursor.depth + 1 });
  const result: RedactedJsonValue = Array.isArray(value)
    ? kept.map((member, index) => jsonValue(member, child(`${cursor.path}[${index}]`)))
    : Object.fromEntries(
        (kept as readonly [string, unknown][]).map(([key, member]) => {
          const safeKey = bounded(key, `${cursor.path}.$key`, cursor);
          return [safeKey, isSensitiveEvidenceName(key) ? REDACTED : jsonValue(member, child(`${cursor.path}.${safeKey}`))];
        }),
      );
  cursor.active.delete(value);
  return result;
}

function sanitizeJson(value: unknown, path: string, context: HarRedactionContext): string {
  return JSON.stringify(jsonValue(value, { ...context, path, depth: 0, state: { fields: 0 }, active: new WeakSet() }));
}

function textMime(mimeType: string): boolean {
  const mime = mimeType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  return (
    mime.startsWith("text/") ||
    mime.endsWith("+json") ||
    mime.endsWith("+xml") ||
    /^application\/(?:ecmascript|graphql|javascript|json|sql|x-www-form-urlencoded|xml)$/.test(mime)
  );
}

function omittedBody(context: HarBodyContext, reason: NetworkBodyOmissionReason, inputBytes: number | null, limitBytes: number | null): DiskSafeBody {
  return {
    mimeType: context.mimeType,
    sizeBytes: context.input.sizeBytes ?? null,
    encoding: context.encoding,
    text: null,
    params: null,
    omission: { reason, limitBytes },
    _orbMeasuredLimit: { inputBytes, retainedBytes: 0, truncated: reason === "body-too-large" || reason === "sanitized-body-too-large" },
  };
}

function preflightBody(context: HarBodyContext): DiskSafeBody | null {
  if (context.input.streaming === true) {
    return omittedBody(context, "streaming", context.input.sizeBytes ?? null, null);
  }
  if (context.input.unavailableReason !== undefined) {
    return omittedBody(context, context.input.unavailableReason, context.input.sizeBytes ?? null, null);
  }
  if (context.rawMimeType === null || !textMime(context.rawMimeType)) {
    return omittedBody(context, "mime-not-text", context.input.sizeBytes ?? null, null);
  }
  return null;
}

function decodeBody(context: HarBodyContext): { readonly raw: string | null; readonly inputBytes: number | null } | DiskSafeBody {
  const raw = context.input.text ?? null;
  if (raw === null || context.input.base64Encoded !== true) {
    return { raw, inputBytes: raw === null ? null : Buffer.byteLength(raw, "utf8") };
  }
  const compact = raw.replaceAll(/\s/g, "");
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(compact)) {
    return omittedBody(context, "invalid-base64", Buffer.byteLength(raw), null);
  }
  const decoded = Buffer.from(compact, "base64");
  if (!isUtf8(decoded)) {
    return omittedBody(context, "non-utf8", decoded.byteLength, null);
  }
  return { raw: decoded.toString("utf8"), inputBytes: decoded.byteLength };
}

function sanitizeBodyText(
  context: HarBodyContext,
  raw: string | null,
  inputBytes: number | null,
): { readonly kind: "sanitized"; readonly text: string; readonly params: readonly DiskSafeNameValue[] | null } | DiskSafeBody {
  if (Object.hasOwn(context.input, "value")) {
    return { kind: "sanitized", text: sanitizeJson(context.input.value, `${context.path}.value`, context), params: null };
  }
  if (context.rawMimeType?.toLowerCase().includes("json") === true) {
    if (raw === null) {
      return omittedBody(context, "unavailable", null, null);
    }
    // @orb-waive caught-failure-ownership(catch): invalid JSON becomes a typed malformed-json omission; parser messages are intentionally discarded because future runtimes may quote secret-bearing input. Ends if the omission stops owning the failure.
    try {
      return { kind: "sanitized", text: sanitizeJson(JSON.parse(raw), `${context.path}.json`, context), params: null };
    } catch {
      return omittedBody(context, "malformed-json", inputBytes, null);
    }
  }
  if (context.rawMimeType?.toLowerCase().includes("x-www-form-urlencoded") === true) {
    if (raw === null) {
      return omittedBody(context, "unavailable", null, null);
    }
    const parsed = formPairs(raw);
    if (parsed === null) {
      return omittedBody(context, "malformed-form", inputBytes, null);
    }
    const params = sanitizePairs(parsed, `${context.path}.params`, context);
    return {
      kind: "sanitized",
      params,
      text: params.map((pair) => `${encodeURIComponent(pair.name)}=${pair.value === REDACTED ? REDACTED : encodeURIComponent(pair.value)}`).join("&"),
    };
  }
  if (raw === null) {
    return omittedBody(context, "unavailable", null, null);
  }
  return { kind: "sanitized", text: bounded(raw, context.path, context, { kind: "body", maxBytes: context.limits.maxBodyBytes }), params: null };
}

function body(input: NetworkBodyInput | undefined, path: string, parent: HarRedactionContext): DiskSafeBody | null {
  if (input === undefined) {
    return null;
  }
  const rawMimeType = input.mimeType ?? null;
  const mimeType = rawMimeType === null ? null : bounded(rawMimeType, `${path}.mimeType`, parent);
  let encoding: string | null = null;
  if (input.base64Encoded === true) {
    encoding = "base64";
  } else if (input.encoding !== null && input.encoding !== undefined) {
    encoding = bounded(input.encoding, `${path}.encoding`, parent);
  }
  const context: HarBodyContext = { ...parent, input, path, rawMimeType, mimeType, encoding };
  const early = preflightBody(context);
  if (early !== null) {
    return early;
  }
  const decoded = decodeBody(context);
  if (!("raw" in decoded)) {
    return decoded;
  }
  const structured = rawMimeType?.includes("json") === true || rawMimeType?.includes("x-www-form-urlencoded") === true;
  if (decoded.inputBytes !== null && decoded.inputBytes > context.limits.maxBodyBytes && structured) {
    event(context, { kind: "body", path, original: decoded.inputBytes, retained: 0, omitted: decoded.inputBytes });
    return omittedBody(context, "body-too-large", decoded.inputBytes, context.limits.maxBodyBytes);
  }
  const sanitized = sanitizeBodyText(context, decoded.raw, decoded.inputBytes);
  if (!("kind" in sanitized)) {
    return sanitized;
  }
  const { text, params } = sanitized;
  const retainedBytes = Buffer.byteLength(text, "utf8");
  if (retainedBytes > context.limits.maxBodyBytes) {
    event(context, { kind: "body", path, original: retainedBytes, retained: 0, omitted: retainedBytes });
    return omittedBody(context, "sanitized-body-too-large", decoded.inputBytes, context.limits.maxBodyBytes);
  }
  return {
    mimeType,
    sizeBytes: context.input.sizeBytes ?? null,
    encoding: context.encoding,
    text,
    params,
    omission: null,
    _orbMeasuredLimit: { inputBytes: decoded.inputBytes, retainedBytes, truncated: context.events.some((item) => item.path.startsWith(path)) },
  };
}

function fallback(limits: NetworkEvidenceLimits): DiskSafeNetworkEvidence {
  return {
    url: OMITTED,
    query: [],
    request: { headers: [], cookies: [], postData: null },
    response: { headers: [], cookies: [], content: null },
    _orbMeasuredLimit: { policy: limits, events: [{ kind: "unreadable", path: "$", original: null, retained: 0, omitted: null }] },
  };
}

export function redactNetworkEvidence(input: RawNetworkEvidence, overrides: Partial<NetworkEvidenceLimits> = {}): DiskSafeNetworkEvidence {
  const limits = resolveNetworkEvidenceLimits(overrides);
  // @orb-waive caught-failure-ownership(catch): a hostile proxy/getter at the outer trust boundary fails closed to one generic unreadable receipt; the caught value may itself contain a secret and is never logged or serialized. Ends if fallback stops being the terminal safe result.
  try {
    const events: NetworkLimitEvent[] = [];
    const context = { limits, events } satisfies HarRedactionContext;
    const url = urlEvidence(input.url, context);
    return {
      url: url.url,
      query: url.query,
      request: {
        headers: headers(input.requestHeaders, "$.request.headers", context),
        cookies: cookies(input.requestCookies, "$.request.cookies", context),
        postData: body(input.postData, "$.request.postData", context),
      },
      response: {
        headers: headers(input.responseHeaders, "$.response.headers", context),
        cookies: cookies(input.responseCookies, "$.response.cookies", context),
        content: body(input.responseContent, "$.response.content", context),
      },
      _orbMeasuredLimit: { policy: limits, events },
    };
  } catch {
    return fallback(limits);
  }
}
