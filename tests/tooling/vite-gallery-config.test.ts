// The component gallery is prebuilt once per run and served static, so no worker pays a cold transform inside a test timeout.
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import type { ConfigEnv, Plugin, UserConfig } from "vite";
import viteConfig from "../../packages/client/vite.config.ts";

const GALLERY_ENV: ConfigEnv = { command: "build", mode: "component-test" };
const DEV_SERVE_ENV: ConfigEnv = { command: "serve", mode: "development" };
const repoRoot = join(import.meta.dirname, "..", "..");

function configFor(env: ConfigEnv): UserConfig {
  return viteConfig(env) as UserConfig;
}

test("the gallery builds playwright/index.html into an owned cache directory and keeps no dev optimizer scan", () => {
  const config = configFor(GALLERY_ENV);
  expect(config.root).toBe(repoRoot);
  expect(config.build?.emptyOutDir).toBe(true);
  expect(config.build?.outDir).toMatch(/packages[\\/]client[\\/]node_modules[\\/]\.vite-ct-gallery-\d+$/);
  expect(config.build?.rolldownOptions?.input).toBe(join(repoRoot, "playwright", "index.html"));
  expect(config.optimizeDeps?.entries).toBeUndefined();
});

test("the dev app keeps its optimizer scan and builds into dist", () => {
  const config = configFor(DEV_SERVE_ENV);
  expect(config.optimizeDeps?.entries).toEqual(["./index.html", "../ui/src/**/index.ts"]);
  expect(config.build?.outDir).toBe("dist");
});

test("the gallery preview binds loopback on the dev port, refuses a stale server and carries the gallery CSP", () => {
  const config = configFor(GALLERY_ENV);
  expect(config.preview?.host).toBe("127.0.0.1");
  expect(config.preview?.port).toBe(config.server?.port);
  expect(config.preview?.strictPort).toBe(true);
  expect(config.preview?.proxy).toEqual({});
  const csp = config.preview?.headers?.["Content-Security-Policy"];
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("script-src 'self'");
});

test("the injected zod-jitless script is added before bundling so the build emits it", async () => {
  let hook: Plugin["transformIndexHtml"];
  for (const option of configFor(GALLERY_ENV).plugins ?? []) {
    const plugin = await Promise.resolve(option);
    if (typeof plugin === "object" && plugin !== null && "name" in plugin && plugin.name === "orb:component-gallery" && "transformIndexHtml" in plugin) {
      hook = plugin.transformIndexHtml;
    }
  }
  expect(hook).toBeTypeOf("object");
  expect(typeof hook === "object" && "order" in hook ? hook.order : undefined).toBe("pre");
});
