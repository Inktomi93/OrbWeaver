import type { ServerResponse } from "node:http";
import { afterEach, vi } from "vitest";
import viteConfig from "../../packages/client/vite.config.ts";
import { expect, test } from "../support/tool-fixtures.ts";

type Middleware = (request: unknown, response: Pick<ServerResponse, "setHeader">, next: (cause?: unknown) => void) => void;

interface TestServer {
  readonly config: {
    readonly logger: {
      error: ReturnType<typeof vi.fn>;
      info: ReturnType<typeof vi.fn>;
    };
  };
  readonly middlewares: {
    use: (handler: Middleware) => void;
  };
  restart: () => Promise<void>;
  readonly watcher: {
    add: (file: string) => void;
    on: (event: "change", handler: (file: string) => void) => void;
  };
}

interface ConfiguredPlugin {
  readonly name: string;
  configureServer?: (server: TestServer) => void;
}

async function configuredPlugin(name: string): Promise<ConfiguredPlugin> {
  const options = (viteConfig as { readonly plugins?: readonly unknown[] }).plugins ?? [];
  for (const option of options) {
    const plugin = await Promise.resolve(option);
    if (typeof plugin === "object" && plugin !== null && "name" in plugin && plugin.name === name) {
      return plugin as ConfiguredPlugin;
    }
  }
  throw new Error(`missing vite plugin ${name}`);
}

function deferred(): { readonly promise: Promise<void>; reject: (cause: Error) => void; resolve: () => void } {
  let rejectPromise: (cause: Error) => void = () => undefined;
  let resolvePromise: () => void = () => undefined;
  const promise = new Promise<void>((resolve, reject) => {
    rejectPromise = reject;
    resolvePromise = resolve;
  });
  return { promise, reject: rejectPromise, resolve: resolvePromise };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test("the CSP middleware continues successful requests and sends async failures through Vite's error path", async () => {
  const middlewareHandlers: Middleware[] = [];
  const logger = { error: vi.fn(), info: vi.fn() };
  const plugin = await configuredPlugin("orb:dev-csp-mirror");
  plugin.configureServer?.({
    config: { logger },
    middlewares: { use: (handler) => middlewareHandlers.push(handler) },
    restart: vi.fn(async () => undefined),
    watcher: { add: vi.fn(), on: vi.fn() },
  });
  const middleware = middlewareHandlers[0];
  expect(middleware).toBeTypeOf("function");

  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { headers: { "Content-Security-Policy": "default-src 'self'; script-src 'unsafe-eval'" } })),
  );
  const next = vi.fn();
  const setHeader = vi.fn();
  middleware?.({}, { setHeader }, next);
  await flushPromises();
  expect(setHeader).toHaveBeenCalledWith("Content-Security-Policy", "default-src 'self'; script-src 'unsafe-eval'");
  expect(next).toHaveBeenCalledWith();

  const failure = new Error("response closed before CSP header");
  const failedNext = vi.fn();
  middleware?.(
    {},
    {
      setHeader: vi.fn(() => {
        throw failure;
      }),
    },
    failedNext,
  );
  await flushPromises();
  expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("dev CSP mirror failed"), expect.objectContaining({ error: failure }));
  expect(failedNext).toHaveBeenCalledWith(failure);
});

test("the workspace export watcher restarts on watched changes and logs restart rejection", async () => {
  const watched: string[] = [];
  let onChange: ((file: string) => void) | undefined;
  const firstRestart = deferred();
  const restart = vi.fn(() => firstRestart.promise);
  const logger = { error: vi.fn(), info: vi.fn() };
  const plugin = await configuredPlugin("orb:workspace-exports-restart");
  plugin.configureServer?.({
    config: { logger },
    middlewares: { use: vi.fn() },
    restart,
    watcher: {
      add: (file) => watched.push(file),
      on: (_event, handler) => {
        onChange = handler;
      },
    },
  });
  expect(watched).toHaveLength(3);
  expect(onChange).toBeTypeOf("function");

  onChange?.("/unwatched/package.json");
  expect(restart).not.toHaveBeenCalled();
  onChange?.(watched[0] ?? "");
  expect(restart).toHaveBeenCalledOnce();
  expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("restarting dev server"), { timestamp: true });
  firstRestart.resolve();
  await flushPromises();
  expect(logger.error).not.toHaveBeenCalled();

  const failure = new Error("restart refused");
  const failedRestart = deferred();
  restart.mockImplementationOnce(() => failedRestart.promise);
  onChange?.(watched[1] ?? "");
  failedRestart.reject(failure);
  await flushPromises();
  expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("workspace-export restart failed"), expect.objectContaining({ error: failure }));
});
