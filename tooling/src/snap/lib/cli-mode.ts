// Pure strict-modal argv ownership for Snap's browser-free/admin modes. The ordinary parser accepts the
// whole Snap vocabulary before dispatch; this layer proves an early-return mode did not quietly discard
// a drive/output flag. cli.ts runs it before any browser, stage, or run slot is allocated.
import { splitPageSuffix } from "../../_shared/argv.ts";
import type { Args } from "../contract/types.ts";

interface ModalGrammar {
  readonly name: string;
  readonly flags: ReadonlyMap<string, "boolean" | "required" | "optional">;
}

function argvToken(argv: readonly string[], index: number): string {
  const token = argv[index];
  if (token === undefined) {
    throw new Error(`INSTRUMENT ERROR: argv index ${String(index)} disappeared during modal validation`);
  }
  return token;
}

function modalGrammar(args: Args): ModalGrammar | null {
  if (args.help) {
    return {
      name: "help",
      flags: new Map([
        ["--help", "boolean"],
        ["-h", "boolean"],
      ]),
    };
  }
  if (args.materializeDevToolsAssets) {
    return { name: "--materialize-devtools-assets", flags: new Map([["--materialize-devtools-assets", "boolean"]]) };
  }
  if (args.sessionStatus) {
    return { name: "--session-status", flags: new Map([["--session-status", "optional"]]) };
  }
  if (args.sessionClose !== null) {
    return {
      name: "--session-close",
      flags: new Map([
        ["--session-close", "required"],
        ["--force", "boolean"],
      ]),
    };
  }
  if (args.sessionSweep) {
    return { name: "--session-sweep", flags: new Map([["--session-sweep", "boolean"]]) };
  }
  if (args.sessionExport !== null) {
    return {
      name: "--session-export",
      flags: new Map([
        ["--session-export", "required"],
        ["--out", "required"],
      ]),
    };
  }
  if (args.stageStatus) {
    return { name: "--stage-status", flags: new Map([["--stage-status", "boolean"]]) };
  }
  if (args.stageSweep) {
    return { name: "--stage-sweep", flags: new Map([["--stage-sweep", "boolean"]]) };
  }
  if (args.stageDown) {
    return {
      name: "--stage-down",
      flags: new Map([
        ["--stage-down", "boolean"],
        ["--stage-owner", "required"],
        ["--force", "boolean"],
      ]),
    };
  }
  return null;
}

export function modalModeErrors(args: Args, argv: readonly string[]): readonly string[] {
  const grammar = modalGrammar(args);
  if (grammar === null || args.sessionDaemon !== null) {
    return [];
  }
  const unrelated: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argvToken(argv, index);
    const { flag } = splitPageSuffix(token);
    const kind = grammar.flags.get(flag);
    if (kind === undefined || token !== flag) {
      unrelated.push(token);
      continue;
    }
    if (kind === "boolean") {
      continue;
    }
    const value = argv[index + 1];
    if (value !== undefined && !value.startsWith("-")) {
      index += 1;
    } else if (kind === "required") {
      // The ordinary parser owns the exact missing-value diagnostic.
    }
  }
  return unrelated.length === 0 ? [] : [`${grammar.name} is a strict modal mode and does not combine with unrelated drive/output args: ${unrelated.join(" ")}`];
}
