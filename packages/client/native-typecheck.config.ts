// Cold native checks release their host lease between edits; typed ESLint keeps its own dev worker.
import { spawn } from "node:child_process";
import { watch } from "node:fs";
import { join, relative } from "node:path";
import process from "node:process";
import { finished } from "node:stream/promises";
import type { HtmlTagDescriptor, Plugin } from "vite";

const EVENT = "orb:native-typecheck";
const REQUEST = `${EVENT}:request`;
const MODULE = "/@orb/native-typecheck";
const DEBOUNCE_MS = 150;
const SOURCE = /\.[cm]?tsx?$/u;
const ROOT_INPUT = /^(?:tsconfig.*\.json|.*\.d\.ts|package\.json)$/u;

interface CheckState {
  readonly checking: boolean;
  readonly failed: boolean;
  readonly text: string;
}

function completedState(code: number | null, output: string): CheckState {
  if (code === 0) {
    return { checking: false, failed: false, text: "No type errors" };
  }
  const diagnostic = code === 1 && /\berror TS\d+:/u.test(output);
  return {
    checking: false,
    failed: true,
    text: `${diagnostic ? "Type errors" : "Type checker failed; no verdict"}\n${output.trim()}`,
  };
}

const CLIENT = `import { ErrorOverlay } from "/@vite/client";
let overlay;
const clear = () => { overlay?.close(); overlay = undefined; };
if (import.meta.hot) {
  import.meta.hot.on(${JSON.stringify(EVENT)}, (state) => {
    if (state.checking) return;
    clear();
    if (state.failed) {
      overlay = new ErrorOverlay({ message: state.text, stack: "", plugin: "native TypeScript" });
      document.body.appendChild(overlay);
    }
  });
  import.meta.hot.send(${JSON.stringify(REQUEST)});
  import.meta.hot.on("vite:ws:connect", () => import.meta.hot.send(${JSON.stringify(REQUEST)}));
  import.meta.hot.dispose(clear);
}
`;

/** Vite owns edit notifications and presentation; the canonical native launcher owns compiler admission. */
export function nativeTypecheck(root: string): Plugin {
  let close = async (): Promise<void> => undefined;
  return {
    name: "orb:native-typecheck",
    apply: "serve",
    resolveId(id): string | null {
      return id === MODULE ? MODULE : null;
    },
    load(id): string | null {
      return id === MODULE ? CLIENT : null;
    },
    transformIndexHtml(): HtmlTagDescriptor[] {
      return [{ tag: "script", attrs: { type: "module", src: MODULE }, injectTo: "body" }];
    },
    configureServer(server): void {
      let stopped = false;
      let generation = 0;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let active: ReturnType<typeof spawn> | undefined;
      let completion: Promise<void> = Promise.resolve();
      let state: CheckState = { checking: true, failed: false, text: "Native TypeScript check pending" };
      const publish = (next: CheckState): void => {
        state = next;
        server.ws.send({ type: "custom", event: EVENT, data: next });
      };
      const report = (next: CheckState): void => {
        publish(next);
        const log = next.failed ? server.config.logger.error : server.config.logger.info;
        log(`[native TypeScript] ${next.text}`);
      };
      const replay = (_data: unknown, client: { send: (event: string, data: CheckState) => void }): void => client.send(EVENT, state);
      server.ws.on(REQUEST, replay);

      const run = (): void => {
        if (stopped || active !== undefined) {
          return;
        }
        clearTimeout(timer);
        const started = generation;
        publish({ checking: true, failed: false, text: "Native TypeScript checking" });
        server.config.logger.info("[native TypeScript] checking client program");
        const child = spawn(process.execPath, [join(root, "scripts", "ts7.ts"), "--noEmit", "--pretty", "false", "-p", "packages/client/tsconfig.json"], {
          cwd: root,
          detached: process.platform !== "win32",
          stdio: ["ignore", "pipe", "pipe", "ipc"],
        });
        active = child;
        let output = "";
        child.stdout?.setEncoding("utf8").on("data", (chunk: string) => {
          output += chunk;
        });
        child.stderr?.setEncoding("utf8").on("data", (chunk: string) => {
          output += chunk;
        });
        const exit = new Promise<number | null>((resolve) => {
          child.once("error", (error) => {
            output += error.message;
            resolve(null);
          });
          child.once("exit", resolve);
        });
        let streamFailed = false;
        const drained = Promise.all(
          [child.stdout, child.stderr].map(async (stream) => {
            if (stream !== null) {
              try {
                await finished(stream, { cleanup: true });
              } catch (error) {
                streamFailed = true;
                output += error instanceof Error ? error.message : String(error);
              }
            }
          }),
        );
        // Node can omit ChildProcess.close after an IPC disconnect; exit plus drained pipes owns completion.
        completion = Promise.all([exit, drained]).then(([code]) => {
          active = undefined;
          if (!stopped && started === generation) {
            report(completedState(streamFailed ? null : code, output));
          }
          if (!stopped && started !== generation) {
            run();
          }
        });
      };
      const invalidate = (): void => {
        if (stopped) {
          return;
        }
        generation += 1;
        publish({ ...state, checking: true });
        clearTimeout(timer);
        timer = setTimeout(run, DEBOUNCE_MS);
      };
      const changed = (_event: string, file: string): void => {
        const path = relative(root, file).replaceAll("\\", "/");
        if (path.startsWith("packages/") && (SOURCE.test(path) || /\/(?:tsconfig.*|package)\.json$/u.test(path))) {
          invalidate();
        }
      };
      server.watcher.add(join(root, "packages"));
      server.watcher.on("all", changed);
      // A nonrecursive root watch survives config replacement without watching sibling worktrees or reports.
      const rootWatch = watch(root, (_event, file) => {
        if (file !== null && ROOT_INPUT.test(file)) {
          invalidate();
        }
      });
      rootWatch.on("error", (error) => {
        stopped = true;
        clearTimeout(timer);
        if (active?.connected) {
          active.disconnect();
        }
        server.config.logger.error(`[native TypeScript] root watch failed: ${error.message}`);
        publish({ checking: false, failed: true, text: `Type checker watch failed; no verdict\n${error.message}` });
      });
      close = async (): Promise<void> => {
        stopped = true;
        clearTimeout(timer);
        rootWatch.close();
        server.watcher.off("all", changed);
        server.ws.off(REQUEST, replay);
        // Disconnect also fires when Vite dies; the wrapper owns compiler-tree termination and lease release.
        if (active?.connected) {
          active.disconnect();
        }
        await completion;
      };
      run();
    },
    async closeBundle(): Promise<void> {
      await close();
    },
  };
}
