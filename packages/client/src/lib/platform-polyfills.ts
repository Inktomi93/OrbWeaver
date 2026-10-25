// The client's polyfill entry: main.tsx imports it first, and the awaits below finish before any other module runs.
// Each builtin installs only where the browser lacks it; `POLYFILLED_BUILTINS` (browser-targets.ts) is the list the compat lint trusts.
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
    install: (): void => define(RegExp, "escape", regExpEscape),
  },
  "Error.isError": {
    present: (): boolean => typeof Error.isError === "function",
    install: (): void => define(Error, "isError", isError),
  },
} satisfies Record<Polyfilled, { present: () => boolean; install: () => void | Promise<void> }>;

for (const name of POLYFILLED_BUILTINS) {
  if (!POLYFILLS[name].present()) {
    await POLYFILLS[name].install();
  }
}
