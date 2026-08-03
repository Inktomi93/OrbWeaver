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

let distDir: string;
let app: Hono;

const SECRET_CONTENTS = "top-secret-outside-the-bundle";
let secretPath: string;

beforeAll(async () => {
  distDir = await mkdtemp(join(tmpdir(), "orb-spa-"));
  await writeFile(join(distDir, "index.html"), INDEX_HTML);
  await mkdir(join(distDir, "assets"));
  await writeFile(join(distDir, "assets", "app-abc123.js"), HASHED_JS);
  // public/-copied files are name-stable (NOT hashed) — must revalidate.
  await mkdir(join(distDir, "backgrounds"));
  await writeFile(join(distDir, "backgrounds", "day.png"), "png-bytes");
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

  test("traversal through the static handler never escapes the bundle root", async () => {
    const attempts = ["/../secret.txt", "/%2e%2e/secret.txt", "/assets/..%2f..%2fsecret.txt"];
    const responses = await Promise.all(attempts.map((path) => app.request(path, { headers: { accept: "*/*" } })));
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
