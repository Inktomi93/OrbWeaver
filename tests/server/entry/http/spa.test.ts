// entry/http/spa — the prod SPA static-serve over a REAL Hono app + a real temp bundle dir. Pins the
// four load-bearing behaviors: hashed /assets/* get the immutable cache; index.html (direct, "/", and
// the history fallback) revalidates (no-cache); an /api/* miss NEVER gets HTML; a non-navigation miss
// (stale hashed asset, Accept without text/html) 404s instead of receiving HTML-as-JS. Plus the
// resolveSpaDistDir dev-skip / prod-fatal split and the serveStatic traversal belt.

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brotliCompressSync, brotliDecompressSync, gunzipSync, gzipSync, zstdCompressSync, zstdDecompressSync } from "node:zlib";
import { registerSpa, resolveSpaDistDir, securityHeaders } from "@orb/server/entry/http";
import { Hono } from "hono";
import { afterAll, beforeAll, describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

const OK = 200;
const NOT_FOUND = 404;
const INDEX_HTML = "<!doctype html><title>orb</title>";
const HASHED_JS = "console.log('hashed')";
const LARGE_HASHED_JS = HASHED_JS.repeat(256);
const NAV_HEADERS = { accept: "text/html,application/xhtml+xml" };
/** The shipped directive, in the shape a crawler must receive — never an HTML document. */
const ROBOTS_TXT = "User-agent: *\nDisallow: /\n";

let distDir: string;
let app: Hono;
let hinted: Hono;

const SECRET_CONTENTS = "top-secret-outside-the-bundle";
let secretPath: string;

beforeAll(async () => {
  distDir = await mkdtemp(join(tmpdir(), "orb-spa-"));
  await writeFile(join(distDir, "index.html"), INDEX_HTML);
  await writeFile(join(distDir, "index.html.br"), brotliCompressSync(INDEX_HTML));
  await mkdir(join(distDir, "assets"));
  await writeFile(join(distDir, "assets", "app-abc123.js"), HASHED_JS);
  await writeFile(join(distDir, "assets", "large-abc123.js"), LARGE_HASHED_JS);
  await writeFile(join(distDir, "assets", "precompressed-abc123.js"), LARGE_HASHED_JS);
  await writeFile(join(distDir, "assets", "precompressed-abc123.js.br"), brotliCompressSync(LARGE_HASHED_JS));
  await writeFile(join(distDir, "assets", "precompressed-abc123.js.gz"), gzipSync(LARGE_HASHED_JS));
  await writeFile(join(distDir, "assets", "precompressed-abc123.js.zst"), zstdCompressSync(LARGE_HASHED_JS));
  // F1 belt teeth: a sourcemap + a raw source file that REALLY exist in the served dir — without the
  // belt serveStatic would 200 them (a re-shipped map leaks all of `src/**` via sourcesContent). The
  // belt must 404 them despite their presence on disk.
  await writeFile(join(distDir, "assets", "app-abc123.js.map"), '{"version":3,"sourcesContent":["SECRET SOURCE"]}');
  await writeFile(join(distDir, "assets", "app-abc123.js.map.gz"), gzipSync("SECRET SOURCE"));
  await writeFile(join(distDir, "assets", "leak.ts"), "export const secret = 1;");
  // public/-copied files are name-stable (NOT hashed) — must revalidate.
  await mkdir(join(distDir, "backgrounds"));
  await writeFile(join(distDir, "backgrounds", "day.png"), "png-bytes");
  // #194: robots.txt is a `public/`-copied file like any other, and the whole defect was that it did NOT
  // exist — so the history fallback answered a crawler with index.html and Lighthouse read 45 lines of
  // HTML as robots syntax. The fix is the FILE (packages/client/public/robots.txt); this fixture is what
  // proves the serving half needs no config, because real files already win over the fallback.
  await writeFile(join(distDir, "robots.txt"), ROBOTS_TXT);
  // A real file OUTSIDE distDir — proves the traversal guard rejects rather than merely 404ing on a
  // nonexistent path (ENOENT would 404 either way; this sentinel gives the test actual teeth).
  secretPath = join(distDir, "..", "secret.txt");
  await writeFile(secretPath, SECRET_CONTENTS);

  app = new Hono();
  app.use("*", securityHeaders({ dev: false, allowExternalMedia: () => false }));
  // A stand-in API route registered BEFORE the SPA (mirrors app.ts order: SPA is last).
  app.get("/api/known", (c) => c.json({ ok: true }));
  registerSpa(app, { distDir });
  const hintsDir = join(distDir, "hinted");
  await mkdir(join(hintsDir, "assets"), { recursive: true });
  await writeFile(join(hintsDir, "assets", "entry-abc.js"), HASHED_JS);
  await writeFile(join(hintsDir, "assets", "style-abc.css"), "body{color:inherit}");
  await writeFile(join(hintsDir, "robots.txt"), ROBOTS_TXT);
  await writeFile(
    join(hintsDir, "index.html"),
    `<!doctype html>
    <!-- <link rel="modulepreload" href="/assets/comment.js"> -->
    <script src="/assets/entry-abc.js" type="module"></script>
    <link href="/assets/style-abc.css" rel="stylesheet">
    <link rel="modulepreload" href="/assets/entry-abc.js">
    <link rel="stylesheet" href="https://example.com/assets/style-abc.css">
    <link rel="modulepreload" href="/assets/missing.js">`,
  );
  hinted = new Hono();
  hinted.get("/api/known", (c) => c.json({ ok: true }));
  registerSpa(hinted, { distDir: hintsDir });
});

afterAll(async () => {
  await rm(distDir, { recursive: true, force: true });
  await rm(secretPath, { force: true });
});

describe("registerSpa", () => {
  test.each([
    ["GET", "*/*"],
    ["GET", "text/html"],
    ["HEAD", "*/*"],
    ["HEAD", "text/html"],
  ])("refuses a decoded NUL filename before file lookup: %s %s", async (method, accept) => {
    const res = await app.request("/assets/app-abc123.js%00", { method, headers: { accept } });
    expect(res.status).toBe(NOT_FOUND);
    expect(await res.text()).toBe(method === "HEAD" ? "" : "404 Not Found");
  });

  test.each([
    ["zstd;q=1, br;q=0.5", "zstd"],
    ["gzip;q=1, br;q=0.1", "gzip"],
    ["BR;q=1, gzip;q=0.5", "br"],
    ["*;q=1, br;q=0", "zstd"],
    ["identity;q=1, gzip;q=0.5", null],
  ])("honors encoding preferences: %s", async (encoding, expected) => {
    const res = await app.request("/assets/precompressed-abc123.js", { headers: { "accept-encoding": encoding } });
    expect(res.headers.get("content-encoding")).toBe(expected);
    const bytes = Buffer.from(await res.arrayBuffer());
    let decoded = bytes;
    if (expected === "zstd") {
      decoded = zstdDecompressSync(bytes);
    } else if (expected === "br") {
      decoded = brotliDecompressSync(bytes);
    } else if (expected === "gzip") {
      decoded = gunzipSync(bytes);
    }
    expect(decoded.toString()).toBe(LARGE_HASHED_JS);
  });

  test("refuses a request that explicitly rejects every available representation", async () => {
    const res = await app.request("/assets/precompressed-abc123.js", { headers: { "accept-encoding": "*;q=0, identity;q=0" } });
    expect(res.status).toBe(406);
  });

  test("does not promise runtime compression for a byte-range response", async () => {
    const res = await app.request("/assets/large-abc123.js", { headers: { "accept-encoding": "gzip, identity;q=0", range: "bytes=0-9" } });
    expect(res.status).toBe(406);
  });

  test("a precompressed byte range describes and returns the encoded representation", async () => {
    const res = await app.request("/assets/precompressed-abc123.js", { headers: { "accept-encoding": "br, identity;q=0", range: "bytes=0-9" } });
    const encoded = brotliCompressSync(LARGE_HASHED_JS);
    expect(res.status).toBe(206);
    expect(res.headers.get("content-encoding")).toBe("br");
    expect(res.headers.get("content-range")).toBe(`bytes 0-9/${encoded.length}`);
    expect(Buffer.from(await res.arrayBuffer())).toEqual(encoded.subarray(0, 10));
  });

  test("serves build-time Brotli bytes ahead of gzip when both are accepted", async () => {
    const res = await app.request("/assets/precompressed-abc123.js", { headers: { "accept-encoding": "gzip, br" } });
    expect(res.headers.get("content-encoding")).toBe("br");
    const compressed = Buffer.from(await res.arrayBuffer());
    expect(compressed).toEqual(brotliCompressSync(LARGE_HASHED_JS));
    expect(brotliDecompressSync(compressed).toString()).toBe(LARGE_HASHED_JS);
    expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
  });

  test.each(["/", "/index.html", "/chats/example"])("revalidates the HTML shell at %s with a body-free 304", async (path) => {
    const first = await app.request(path, { headers: NAV_HEADERS });
    const tag = first.headers.get("etag");
    expect(tag).toBeTruthy();
    const cached = await app.request(path, { headers: { ...NAV_HEADERS, "if-none-match": tag ?? "" } });
    expect(cached.status).toBe(304);
    expect(await cached.text()).toBe("");
    expect(cached.headers.get("cache-control")).toBe("no-cache");
    expect(cached.headers.get("etag")).toBe(tag);
    expect(cached.headers.get("content-security-policy")).toContain("script-src 'self'");
  });

  test("compresses a negotiated static bundle and preserves its immutable cache", async () => {
    const res = await app.request("/assets/large-abc123.js", { headers: { "accept-encoding": "gzip" } });
    expect(res.status).toBe(OK);
    expect(res.headers.get("content-encoding")).toBe("gzip");
    expect(res.headers.get("vary")).toContain("Accept-Encoding");
    expect(res.headers.get("content-length")).toBeNull();
    expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(res.headers.get("content-security-policy")).toContain("script-src 'self'");
    const compressed = Buffer.from(await res.arrayBuffer());
    expect(compressed.byteLength).toBeLessThan(Buffer.byteLength(LARGE_HASHED_JS));
    expect(gunzipSync(compressed).toString()).toBe(LARGE_HASHED_JS);
  });

  test.each([undefined, "identity", "gzip;q=0, br;q=0, deflate;q=0"])("keeps the original bytes when compression is not accepted: %s", async (encoding) => {
    const res = await app.request("/assets/precompressed-abc123.js", { headers: encoding === undefined ? {} : { "accept-encoding": encoding } });
    expect(res.headers.get("content-encoding")).toBeNull();
    expect(res.headers.get("vary")).toContain("Accept-Encoding");
    expect(await res.text()).toBe(LARGE_HASHED_JS);
  });

  test("compressed HTML retains Vary and the cache policy on revalidation", async () => {
    const headers = { ...NAV_HEADERS, "accept-encoding": "br, gzip" };
    const first = await app.request("/", { headers });
    expect(first.headers.get("content-encoding")).toBe("br");
    const tag = first.headers.get("etag");
    expect(tag).toBeTruthy();
    const cached = await app.request("/", { headers: { ...headers, "if-none-match": tag ?? "" } });
    expect(cached.status).toBe(304);
    expect(cached.headers.get("vary")).toContain("Accept-Encoding");
    expect(cached.headers.get("cache-control")).toBe("no-cache");
    expect(await cached.text()).toBe("");
  });

  test("a redeployed HTML shell invalidates its old ETag", async () => {
    const root = join(distDir, "updated");
    await mkdir(root);
    await writeFile(join(root, "index.html"), INDEX_HTML);
    const isolated = new Hono();
    registerSpa(isolated, { distDir: root });
    const first = await isolated.request("/", { headers: NAV_HEADERS });
    const tag = first.headers.get("etag");
    expect(tag).toBeTruthy();
    const updated = "<!doctype html><title>updated</title>";
    await writeFile(join(root, "index.html"), updated);
    const res = await isolated.request("/", { headers: { ...NAV_HEADERS, "if-none-match": tag ?? "" } });
    expect(res.status).toBe(OK);
    expect(res.headers.get("etag")).not.toBe(tag);
    expect(await res.text()).toBe(updated);
  });

  test("HTML HEAD does not advertise an ETag computed from its empty response body", async () => {
    const res = await app.request("/", { method: "HEAD", headers: NAV_HEADERS });
    expect(res.status).toBe(OK);
    expect(res.headers.get("etag")).toBeNull();
    expect(await res.text()).toBe("");
  });

  test("preserves byte-range responses without compression", async () => {
    const res = await app.request("/assets/large-abc123.js", { headers: { "accept-encoding": "gzip", range: "bytes=0-9" } });
    expect(res.status).toBe(206);
    expect(res.headers.get("content-encoding")).toBeNull();
    expect(res.headers.get("content-range")).toBe(`bytes 0-9/${Buffer.byteLength(LARGE_HASHED_JS)}`);
    expect(await res.text()).toBe(LARGE_HASHED_JS.slice(0, 10));
  });

  test("HEAD keeps its original content length and no response body", async () => {
    const res = await app.request("/assets/large-abc123.js", { method: "HEAD", headers: { "accept-encoding": "gzip" } });
    expect(res.status).toBe(OK);
    expect(res.headers.get("content-encoding")).toBeNull();
    expect(res.headers.get("content-length")).toBe(String(Buffer.byteLength(LARGE_HASHED_JS)));
    expect(await res.text()).toBe("");
  });

  test("does not compress an API response registered before the SPA", async () => {
    const isolated = new Hono();
    isolated.get("/api/stream", (c) => c.body(LARGE_HASHED_JS, OK, { "content-type": "text/event-stream" }));
    registerSpa(isolated, { distDir });
    const res = await isolated.request("/api/stream", { headers: { "accept-encoding": "gzip" } });
    expect(res.headers.get("content-encoding")).toBeNull();
    expect(await res.text()).toBe(LARGE_HASHED_JS);
  });

  test("a hashed /assets/* file serves with the long immutable cache", async () => {
    const res = await app.request("/assets/app-abc123.js");
    expect(res.status).toBe(OK);
    expect(await res.text()).toBe(HASHED_JS);
    expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
  });

  test("GET / serves index.html with no-cache (revalidate every navigation)", async () => {
    const res = await app.request("/", { headers: NAV_HEADERS });
    expect(res.status).toBe(OK);
    expect(await res.text()).toBe(INDEX_HTML);
    expect(res.headers.get("cache-control")).toBe("no-cache");
  });

  test("a name-stable non-hashed file (public/ copy) revalidates, never immutable", async () => {
    const res = await app.request("/backgrounds/day.png");
    expect(res.status).toBe(OK);
    expect(res.headers.get("cache-control")).toBe("no-cache");
  });

  test("an unknown path with an html Accept falls back to index.html (history fallback)", async () => {
    const res = await app.request("/chats/some-spa-route", { headers: NAV_HEADERS });
    expect(res.status).toBe(OK);
    expect(await res.text()).toBe(INDEX_HTML);
    expect(res.headers.get("cache-control")).toBe("no-cache");
  });

  test("an /api/* miss stays a plain 404 — NEVER index.html, even with an html Accept", async () => {
    const res = await app.request("/api/nope", { headers: NAV_HEADERS });
    expect(res.status).toBe(NOT_FOUND);
    expect(res.headers.get("content-type") ?? "").not.toContain("text/html");
    expect(await res.text()).not.toContain("<!doctype");
  });

  test("an API route registered before the SPA still wins", async () => {
    const res = await app.request("/api/known", { headers: NAV_HEADERS });
    expect(res.status).toBe(OK);
    expect(await res.json()).toEqual({ ok: true });
  });

  test("a stale hashed-asset request (no html Accept) 404s instead of receiving HTML-as-JS", async () => {
    const res = await app.request("/assets/app-gone999.js", { headers: { accept: "*/*" } });
    expect(res.status).toBe(NOT_FOUND);
  });

  // F1 (pre-auth-attack-surface audit 2026-08-09): a sourcemap that physically exists in the served dir
  // must 404 at the SPA boundary — the belt fires before serveStatic, so a build-config regression that
  // re-ships `.map` can't leak the first-party source via `sourcesContent`. Non-HTML 404 (the /api-miss
  // posture), never index.html-as-JSON.
  test("F1: an unauthed GET /assets/*.js.map is 404'd by the belt even though the file exists on disk", async () => {
    const res = await app.request("/assets/app-abc123.js.map", { headers: { accept: "*/*" } });
    expect(res.status).toBe(NOT_FOUND);
    const body = await res.text();
    expect(body).not.toContain("SECRET SOURCE");
    expect(body).not.toContain("<!doctype");
  });

  test("F1: a raw .ts source path is 404'd by the belt (never served, never the HTML fallback)", async () => {
    // No html Accept on the direct probe...
    const asset = await app.request("/assets/leak.ts", { headers: { accept: "*/*" } });
    expect(asset.status).toBe(NOT_FOUND);
    expect(await asset.text()).not.toContain("secret");
    // ...AND a navigation Accept must NOT smuggle the source in as the history fallback.
    const nav = await app.request("/assets/leak.ts", { headers: NAV_HEADERS });
    expect(nav.status).toBe(NOT_FOUND);
    expect(await nav.text()).not.toContain("secret");
  });

  test("traversal through the static handler never escapes the bundle root", async () => {
    const attempts = ["/../secret.txt", "/%2e%2e/secret.txt", "/assets/..%2f..%2fsecret.txt"];
    // `Promise.resolve` is not decoration: hono types `app.request` as `Response | Promise<Response>`
    // (hono-base.d.ts — one signature, a union return), so a bare `Promise.all` over the mapped calls is
    // aggregating values that the type system says may not be thenable. Normalizing each one keeps the
    // fan-out honest under both arms of that union instead of relying on Promise.all's coercion.
    const responses = await Promise.all(attempts.map((path) => Promise.resolve(app.request(path, { headers: { accept: "*/*" } }))));
    const bodies = await Promise.all(responses.map((res) => res.text()));
    // A real sentinel file exists at each traversal target — a broken guard would leak it as a 200
    // carrying SECRET_CONTENTS, not just 404 on a missing path.
    for (const res of responses) {
      expect(res.status).not.toBe(OK);
    }
    for (const body of bodies) {
      expect(body).not.toContain(SECRET_CONTENTS);
    }
  });

  // ── #194: a crawler asks with a NON-html Accept, which is the arm the history fallback deliberately
  // refuses — so a robots.txt that exists is answered as itself, and one that does not is a plain 404
  // rather than the SPA shell. Both arms are pinned: the bug was never the serving order, it was that
  // no file was ever shipped, and a future "helpful" widening of the fallback would re-create it.
  test("#194 robots.txt serves as its own TEXT, never the SPA shell", async () => {
    const res = await app.request("/robots.txt", { headers: { accept: "text/plain,*/*" } });
    expect(res.status).toBe(OK);
    const body = await res.text();
    expect(body).toBe(ROBOTS_TXT);
    expect(body).not.toContain("<!doctype html>");
    // Name-stable like every other public/-copied file, so a redeploy is picked up.
    expect(res.headers.get("cache-control")).toBe("no-cache");
  });

  test("#194 a NAVIGATION to robots.txt still gets the file, not the history fallback", async () => {
    // Lighthouse fetches robots.txt with a browser-ish Accept, which is exactly how the SPA shell got
    // parsed as robots syntax. Real files are served before the fallback runs, in both Accept arms.
    const res = await app.request("/robots.txt", { headers: NAV_HEADERS });
    expect(res.status).toBe(OK);
    expect(await res.text()).toBe(ROBOTS_TXT);
  });
});

describe("resolveSpaDistDir", () => {
  test("bundle present → the dir; missing in dev → null (skip, vite owns the SPA)", () => {
    expect(resolveSpaDistDir({ distDir, prod: false })).toBe(distDir);
    expect(resolveSpaDistDir({ distDir: join(distDir, "nope"), prod: false })).toBeNull();
  });

  test("missing bundle in prod is boot-fatal (an API-only origin must not pose as the app)", () => {
    expect(() => resolveSpaDistDir({ distDir: join(distDir, "nope"), prod: true })).toThrow("no client bundle");
  });
});

describe("SPA early hints", () => {
  test.each([
    ["abrupt empty comment", "<!-->"],
    ["abrupt dashed empty comment", "<!--->"],
    ["ordinary closed comment", '<!-- <script type="module" src="/assets/hidden.js"></script> -->'],
    ["alternate closed comment", '<!-- <script type="module" src="/assets/hidden.js"></script> --!>'],
  ])("preserves hints following an %s", async (_name, fragment) => {
    const root = await mkdtemp(join(distDir, "following-comment-hints-"));
    await mkdir(join(root, "assets"));
    await writeFile(join(root, "assets", "real.js"), HASHED_JS);
    await writeFile(join(root, "assets", "hidden.js"), HASHED_JS);
    const html = `${fragment}<script type="module" src="/assets/real.js"></script>`;
    await writeFile(join(root, "index.html"), html);
    const isolated = new Hono();
    registerSpa(isolated, { distDir: root });
    const sent: string[][] = [];
    const res = await isolated.fetch(new Request("http://localhost/", { headers: NAV_HEADERS }), {
      outgoing: {
        headersSent: false,
        writeEarlyHints: ({ link }: { link: string[] }): void => {
          sent.push(link);
        },
      },
    });
    expect(res.status).toBe(OK);
    expect(await res.text()).toBe(html);
    expect(sent).toEqual([["</assets/real.js>; rel=modulepreload; crossorigin"]]);
  });

  test.each([
    ["enclosed tag", '<!-- <script type="module" src="/assets/hidden.js"></script> -->'],
    ["split tag name", '<scr<!-- ignored -->ipt type="module" src="/assets/hidden.js"></script>'],
    ["split asset path", '<script type="module" src="/assets/hid<!-- ignored -->den.js"></script>'],
    ["alternate comment close", '<!-- <script type="module" src="/assets/hidden.js"></script> --!>'],
    ["unclosed comment", '<!-- <script type="module" src="/assets/hidden.js"></script>'],
  ])("does not manufacture hints from a %s", async (_name, fragment) => {
    const root = await mkdtemp(join(distDir, "comment-hints-"));
    await mkdir(join(root, "assets"));
    await writeFile(join(root, "assets", "real.js"), HASHED_JS);
    await writeFile(join(root, "assets", "hidden.js"), HASHED_JS);
    const html = `<script type="module" src="/assets/real.js"></script>${fragment}`;
    await writeFile(join(root, "index.html"), html);
    const isolated = new Hono();
    registerSpa(isolated, { distDir: root });
    const sent: string[][] = [];
    const res = await isolated.fetch(new Request("http://localhost/", { headers: NAV_HEADERS }), {
      outgoing: {
        headersSent: false,
        writeEarlyHints: ({ link }: { link: string[] }): void => {
          sent.push(link);
        },
      },
    });
    expect(res.status).toBe(OK);
    expect(await res.text()).toBe(html);
    expect(sent).toEqual([["</assets/real.js>; rel=modulepreload; crossorigin"]]);
  });

  test("refreshes hints when a deployment replaces the HTML while the server stays up", async () => {
    const root = join(distDir, "redeployed-hints");
    await mkdir(join(root, "assets"), { recursive: true });
    await writeFile(join(root, "assets", "old.js"), HASHED_JS);
    await writeFile(join(root, "assets", "new.js"), HASHED_JS);
    await writeFile(join(root, "index.html"), '<script type="module" src="/assets/old.js"></script>');
    const isolated = new Hono();
    registerSpa(isolated, { distDir: root });
    const sent: string[][] = [];
    const bindings = {
      outgoing: {
        headersSent: false,
        writeEarlyHints: ({ link }: { link: string[] }): void => {
          sent.push(link);
        },
      },
    };
    await isolated.fetch(new Request("http://localhost/", { headers: NAV_HEADERS }), bindings);
    await writeFile(join(root, "index.html"), '<script type="module" src="/assets/new.js"></script>');
    await isolated.fetch(new Request("http://localhost/", { headers: NAV_HEADERS }), bindings);
    expect(sent).toEqual([["</assets/old.js>; rel=modulepreload; crossorigin"], ["</assets/new.js>; rel=modulepreload; crossorigin"]]);
  });

  test.each([
    ["/", "GET", {}, true],
    ["/chats/example", "GET", {}, true],
    ["/assets/entry-abc.js", "GET", {}, false],
    ["/api/known", "GET", {}, false],
    ["/api/missing", "GET", {}, false],
    ["/robots.txt", "GET", {}, false],
    ["/", "HEAD", {}, false],
    ["/", "GET", { "if-none-match": "cached" }, false],
    ["/", "GET", { "sec-fetch-mode": "cors" }, false],
    ["/", "GET", { "sec-fetch-dest": "iframe" }, false],
  ])("hints only eligible document navigations: %s %s %j", async (path, method, headers, eligible) => {
    const sent: string[][] = [];
    await hinted.fetch(new Request(`http://localhost${path}`, { method, headers: { ...NAV_HEADERS, ...headers } }), {
      outgoing: {
        headersSent: false,
        writeEarlyHints: ({ link }: { link: string[] }): void => {
          sent.push(link);
        },
      },
    });
    const expected = eligible
      ? [["</assets/entry-abc.js>; rel=modulepreload; crossorigin", "</assets/style-abc.css>; rel=preload; as=style; crossorigin"]]
      : [];
    expect(sent).toEqual(expected);
  });
});

describe("source artifacts", () => {
  test.each(["/assets/app-abc123%2Ejs%2Emap", "/assets/app-abc123.js.map.gz"])("blocks source copies at %s", async (path) => {
    const res = await app.request(path, { headers: NAV_HEADERS });
    expect(res.status).toBe(NOT_FOUND);
  });
});
