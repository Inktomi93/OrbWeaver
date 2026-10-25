// The client's polyfill entry: src/entry.ts imports it, awaits it, and only then loads the app graph (main.tsx), so no app module
// evaluates before these installs finish and `orb/browser-support` trusts `POLYFILLED_BUILTINS` everywhere. Keep this module's own
// imports to the shims. Temporal loads asynchronously and only where missing; the sync shims land in this module's first turn.
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

// Every install starts before any await, and each shim defines its builtin as `Promise.resolve` evaluates it.
const pending = POLYFILLED_BUILTINS.filter((name) => !POLYFILLS[name].present()).map((name) => POLYFILLS[name].install());
await Promise.all(pending);
