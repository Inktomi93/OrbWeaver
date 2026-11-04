// The component gallery is prebuilt once per run and served static, so no worker pays a cold transform inside a test timeout.
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import type { ConfigEnv, Plugin, UserConfig } from "vite";
import { createServer } from "vite";
import viteConfig from "../../packages/client/vite.config.ts";

const GALLERY_ENV: ConfigEnv = { command: "build", mode: "component-test" };
const DEV_SERVE_ENV: ConfigEnv = { command: "serve", mode: "development" };
const repoRoot = join(import.meta.dirname, "..", "..");

function configFor(env: ConfigEnv): UserConfig {
  return viteConfig(env);
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

test("the gallery HTML hook injects the jitless module and leaves app HTML unchanged", async ({ scratch }) => {
  let hook: Plugin["transformIndexHtml"];
  let galleryPlugin: Plugin | undefined;
  for (const option of configFor(GALLERY_ENV).plugins ?? []) {
    const plugin = await Promise.resolve(option);
    if (typeof plugin === "object" && plugin !== null && "name" in plugin && plugin.name === "orb:component-gallery" && "transformIndexHtml" in plugin) {
      hook = plugin.transformIndexHtml;
      galleryPlugin = plugin;
    }
  }
  expect(hook).toBeTypeOf("object");
  expect(typeof hook === "object" && "order" in hook ? hook.order : undefined).toBe("pre");
  if (typeof hook !== "object" || galleryPlugin === undefined) {
    throw new Error("gallery HTML hook is missing");
  }
  const server = await createServer({
    configFile: false,
    root: repoRoot,
    cacheDir: join(scratch, "vite-cache"),
    plugins: [galleryPlugin],
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, watch: null },
  });
  try {
    const html = "<html><head></head><body></body></html>";
    const gallery = await server.transformIndexHtml("/playwright/index.html", html);
    expect(gallery).toContain('<script type="module" src="/packages/client/src/lib/zod-jitless.ts"></script>');
    const app = await server.transformIndexHtml("/index.html", html);
    expect(app).not.toContain("/packages/client/src/lib/zod-jitless.ts");
  } finally {
    await server.close();
  }
});
