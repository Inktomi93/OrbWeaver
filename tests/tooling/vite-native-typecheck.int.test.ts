import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";
import { nativeTypecheck } from "../../packages/client/native-typecheck.config.ts";
import type { Plugin } from "../../packages/client/node_modules/vite/dist/node/index.js";
import { createLogger, createServer } from "../../packages/client/node_modules/vite/dist/node/index.js";
import viteConfig from "../../packages/client/vite.config.ts";
import { expect, test } from "../support/tool-fixtures.ts";
import { scaledBudget } from "./_load-budget.ts";

const TIMEOUT = scaledBudget(30_000);
const POLL = scaledBudget(5000);
const ERROR = "src/example.ts(1,7): error TS2322: Type 'number' is not assignable to type 'string'.";
const DRIVER = `import { appendFileSync, readFileSync } from "node:fs";
const input = JSON.parse(readFileSync("control.json", "utf8"));
appendFileSync("runs.jsonl", JSON.stringify({ pid: process.pid, ...input }) + "\\n");
process.on("disconnect", () => process.exit(70));
setTimeout(() => { console.log(input.text); process.exit(input.code); }, input.delay);
`;

function control(root: string, code: number, text: string, delay = 20): void {
  writeFileSync(join(root, "control.json"), JSON.stringify({ code, text, delay }));
}

function plant(root: string): string {
  const client = join(root, "packages", "client");
  mkdirSync(join(client, "src"), { recursive: true });
  mkdirSync(join(root, "packages", "contracts", "src"), { recursive: true });
  mkdirSync(join(root, "scripts"));
  writeFileSync(join(root, "scripts", "ts7.ts"), DRIVER);
  writeFileSync(join(root, "package.json"), '{"type":"module"}');
  writeFileSync(join(root, "runs.jsonl"), "");
  writeFileSync(join(client, "index.html"), "<html><body><p>Development fixture</p></body></html>");
  writeFileSync(join(client, "src", "example.ts"), "export const value = 1;");
  writeFileSync(join(root, "platform.d.ts"), "// initial\n");
  return client;
}

function runs(root: string): number {
  return readFileSync(join(root, "runs.jsonl"), "utf8").trim().split("\n").filter(Boolean).length;
}

const plugins = (viteConfig as { readonly plugins: readonly Plugin[] }).plugins;

test("native type feedback renders initial errors, clears on repair, and preserves typed ESLint feedback", { timeout: TIMEOUT }, async ({ scratch }) => {
  const root = plant(scratch);
  control(scratch, 1, ERROR);
  const require = createRequire(import.meta.url);
  const parser = pathToFileURL(require.resolve("typescript-eslint")).href;
  writeFileSync(join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: { strict: true, target: "esnext", noEmit: true }, include: ["src"] }));
  writeFileSync(
    join(root, "eslint.config.js"),
    `import ts from ${JSON.stringify(parser)};
export default [{ files: ["src/**/*.ts"], languageOptions: { parser: ts.parser, parserOptions: { projectService: true, tsconfigRootDir: ${JSON.stringify(root)} } }, plugins: { "@typescript-eslint": ts.plugin }, rules: { "@typescript-eslint/no-floating-promises": "error" } }];`,
  );
  writeFileSync(join(root, "src", "lint.ts"), "Promise.resolve(42);\n");
  const lintPlugin = plugins.find((plugin) => plugin.name === "vite-plugin-checker");
  if (lintPlugin === undefined) {
    throw new Error("Missing production ESLint checker");
  }
  const logs: string[] = [];
  const logger = createLogger("silent");
  logger.error = (message): void => {
    logs.push(message);
  };
  logger.info = (message): void => {
    logs.push(message);
  };
  const server = await createServer({
    configFile: false,
    customLogger: logger,
    root,
    logLevel: "silent",
    plugins: [nativeTypecheck(scratch), lintPlugin],
    optimizeDeps: { noDiscovery: true },
    server: { port: 0, host: "127.0.0.1" },
  });
  try {
    server.config.logger.error = (message): void => {
      logs.push(message);
    };
    server.config.logger.info = (message): void => {
      logs.push(message);
    };
    await server.listen();
    const browser = await chromium.launch({ headless: true });
    try {
      await expect.poll(() => logs.join("\n"), { timeout: POLL }).toContain(ERROR);
      const page = await browser.newPage();
      const address = server.httpServer?.address();
      if (address === null || typeof address !== "object") {
        throw new Error("Vite did not listen");
      }
      await page.goto(`http://127.0.0.1:${address.port}`);
      const overlay = page.locator("vite-error-overlay");
      await expect.poll(() => overlay.locator(".message-body").allTextContents(), { timeout: POLL }).toEqual([expect.stringContaining("TS2322")]);
      expect(await overlay.locator(".message-body").isVisible()).toBe(true);
      control(scratch, 0, "");
      writeFileSync(join(root, "src", "example.ts"), "export const value = 'fixed';");
      await expect.poll(() => overlay.count(), { timeout: POLL }).toBe(0);
      await expect.poll(() => logs.join("\n"), { timeout: POLL }).toContain("No type errors");
      const lint = page.locator("vite-plugin-checker-error-overlay");
      await expect.poll(() => lint.locator(".message-body").allTextContents(), { timeout: POLL }).toEqual([expect.stringContaining("no-floating-promises")]);
      await lint.getByRole("button").click();
      await expect.poll(() => lint.locator(".message-body").isVisible(), { timeout: POLL }).toBe(true);
      control(scratch, 2, "compiler unavailable");
      writeFileSync(join(root, "src", "example.ts"), "export const value = 'edited again';");
      await expect.poll(() => overlay.locator(".message-body").allTextContents(), { timeout: POLL }).toEqual([expect.stringContaining("no verdict")]);
      expect(await lint.locator(".message-body").allTextContents()).toEqual([expect.stringContaining("no-floating-promises")]);
    } finally {
      await browser.close();
    }
  } finally {
    await server.close();
  }
});

test("source and root replacement edits coalesce without overlapping checks or publishing a stale clean", { timeout: TIMEOUT }, async ({ scratch }) => {
  const root = plant(scratch);
  control(scratch, 0, "", 600);
  const server = await createServer({
    configFile: false,
    root,
    plugins: [nativeTypecheck(scratch)],
    logLevel: "silent",
    server: { middlewareMode: true },
    optimizeDeps: { noDiscovery: true },
  });
  const messages: string[] = [];
  server.config.logger.info = (text): void => {
    messages.push(text);
  };
  server.config.logger.error = (text): void => {
    messages.push(text);
  };
  try {
    await expect.poll(() => runs(scratch), { timeout: POLL }).toBe(1);
    control(scratch, 1, ERROR);
    for (const name of ["first.ts", "second.ts", "third.ts"]) {
      writeFileSync(join(scratch, "packages", "contracts", "src", name), "export const value = 1;");
    }
    await expect.poll(() => messages.join("\n"), { timeout: POLL }).toContain(ERROR);
    expect(runs(scratch)).toBe(2);
    expect(messages.join("\n")).not.toContain("No type errors");
    for (let cycle = 0; cycle < 3; cycle += 1) {
      const before = runs(scratch);
      unlinkSync(join(scratch, "platform.d.ts"));
      writeFileSync(join(scratch, "platform.d.ts"), `// replacement ${cycle}\n`);
      await expect.poll(() => runs(scratch), { timeout: POLL }).toBe(before + 1);
      await expect.poll(() => messages.filter((text) => text.includes(ERROR)).length, { timeout: POLL }).toBe(cycle + 2);
    }
    const before = runs(scratch);
    unlinkSync(join(scratch, "packages", "contracts", "src", "first.ts"));
    await expect.poll(() => runs(scratch), { timeout: POLL }).toBe(before + 1);
  } finally {
    await server.close();
  }
  const completed = runs(scratch);
  writeFileSync(join(scratch, "platform.d.ts"), "// closed\n");
  expect(runs(scratch)).toBe(completed);
});
