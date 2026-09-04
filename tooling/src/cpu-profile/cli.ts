// Compatibility refusal only. The browser/stage/parser/run doors live exclusively in Snap; pure perf
// collectors and verdicts remain importable through ./index.ts for Snap's --perf/--boot-trace arms.
import process from "node:process";
import { print } from "../_shared/artifacts.ts";
import { EXIT } from "../_shared/exit-contract.ts";
import { runTool } from "../_shared/run-tool.ts";

const LEGACY_VALUE_FLAGS = new Map([
  ["--settle", "--pause"],
  ["--cycles", "--perf-cycles"],
  ["--jsclick", "--dom-click"],
  ["--wheelburst", "--wheel-burst"],
]);

function translatedArgs(argv: readonly string[]): { readonly args: string[]; readonly cpu: boolean } {
  const args: string[] = [];
  let cpu = false;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] as string;
    if (token === "--cpuprofile") {
      cpu = true;
    } else {
      const replacement = LEGACY_VALUE_FLAGS.get(token);
      args.push(replacement ?? token);
      if (replacement !== undefined && argv[index + 1] !== undefined) {
        index += 1;
        args.push(argv[index] as string);
      }
    }
  }
  return { args, cpu };
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function snapCommand(args: readonly string[], arm: string): string {
  return ["pnpm", "snap", ...args, arm].map(shellQuote).join(" ");
}

function main(): number {
  const translated = translatedArgs(process.argv.slice(2));
  print("RETIRED      pnpm perf-meter has no execution path; Snap is the sole rendered-instrument CLI.");
  print(`REPLACEMENT  ${snapCommand(translated.args, "--perf")}`);
  if (translated.cpu) {
    const cpuArgs = translated.args.filter((token, index, args) => token !== "--perf-cycles" && args[index - 1] !== "--perf-cycles");
    print(`CPU PROFILE  ${snapCommand(cpuArgs, "--cpu-profile")}`);
  }
  return EXIT.misuse;
}

await runTool(main);
