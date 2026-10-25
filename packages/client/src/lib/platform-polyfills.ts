// The client's polyfill entry: main.tsx imports it first, and the build gives it a chunk of its own (vite.config.ts).
// The sync shims install before the first await, so no other module has run when they land. Temporal loads asynchronously and only where
// missing, which is why `orb/browser-support` refuses a module-top-level use of any `POLYFILLED_BUILTINS` member: siblings do not wait for it.
import { POLYFILLED_BUILTINS } from "../../browser-targets.ts";
import { isError, regExpEscape } from "./platform-shims.ts";

type Polyfilled = (typeof POLYFILLED_BUILTINS)[number];

const define = (target: object, name: string, value: unknown): void => {
  Object.defineProperty(target, name, { value, writable: true, configurable: true, enumerable: false });
};

const POLYFILLS = {
  // The chunk loads only where Temporal is missing, so a browser with it pays nothing.
  ["Temporal"]: {
    present: (): boolean => "Temporal" in globalThis,
    install: async (): Promise<void> => {
      await import("temporal-polyfill/global");
    },
  },
  "RegExp.escape": {
    present: (): boolean => typeof RegExp.escape === "function",
    install: (): Promise<void> => Promise.resolve(define(RegExp, "escape", regExpEscape)),
  },
  "Error.isError": {
    present: (): boolean => typeof Error.isError === "function",
    install: (): Promise<void> => Promise.resolve(define(Error, "isError", isError)),
  },
} satisfies Record<Polyfilled, { present: () => boolean; install: () => Promise<void> }>;

// Every install starts before any await, and the shims define their builtin as `Promise.resolve` evaluates it, so they land in this module's first turn.
const pending = POLYFILLED_BUILTINS.filter((name) => !POLYFILLS[name].present()).map((name) => POLYFILLS[name].install());
await Promise.all(pending);
