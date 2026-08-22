// entry/http/spa — the prod SPA static-serve over a REAL Hono app + a real temp bundle dir. Pins the
// four load-bearing behaviors: hashed /assets/* get the immutable cache; index.html (direct, "/", and
// the history fallback) revalidates (no-cache); an /api/* miss NEVER gets HTML; a non-navigation miss
// (stale hashed asset, Accept without text/html) 404s instead of receiving HTML-as-JS. Plus the
// resolveSpaDistDir dev-skip / prod-fatal split and the serveStatic traversal belt.

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerSpa, resolveSpaDistDir } from "@orb/server/entry/http";
import { Hono } from "hono";
import { afterAll, beforeAll, describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

const OK = 200;
const NOT_FOUND = 404;
const INDEX_HTML = "<!doctype html><title>orb</title>";
const HASHED_JS = "console.log('hashed')";
const NAV_HEADERS = { accept: "text/html,application/xhtml+xml" };
/** The shipped directive, in the shape a crawler must receive — never an HTML document. */
const ROBOTS_TXT = "User-agent: *\nDisallow: /\n";

let distDir: string;
let app: Hono;

const SECRET_CONTENTS = "top-secret-outside-the-bundle";
let secretPath: string;

beforeAll(async () => {
  distDir = await mkdtemp(join(tmpdir(), "orb-spa-"));
  await writeFile(join(distDir, "index.html"), INDEX_HTML);
  await mkdir(join(distDir, "assets"));
  await writeFile(join(distDir, "assets", "app-abc123.js"), HASHED_JS);
  // F1 belt teeth: a sourcemap + a raw source file that REALLY exist in the served dir — without the
  // belt serveStatic would 200 them (a re-shipped map leaks all of `src/**` via sourcesContent). The
  // belt must 404 them despite their presence on disk.
  await writeFile(join(distDir, "assets", "app-abc123.js.map"), '{"version":3,"sourcesContent":["SECRET SOURCE"]}');
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
  // A stand-in API route registered BEFORE the SPA (mirrors app.ts order: SPA is last).
  app.get("/api/known", (c) => c.json({ ok: true }));
  registerSpa(app, { distDir });
});

afterAll(async () => {
  await rm(distDir, { recursive: true, force: true });
  await rm(secretPath, { force: true });
});

describe("registerSpa", () => {
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
