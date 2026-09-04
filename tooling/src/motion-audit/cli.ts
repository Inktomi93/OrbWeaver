// Compatibility refusal only. The browser/stage/parser/run doors live exclusively in Snap; pure motion
// collectors and verdicts remain importable through ./index.ts for Snap's --motion arm.
import process from "node:process";
import { print } from "../_shared/artifacts.ts";
import { EXIT } from "../_shared/exit-contract.ts";
import { runTool } from "../_shared/run-tool.ts";

function replacement(argv: readonly string[]): string {
  const out: string[] = [];
  let index = 0;
  while (index < argv.length) {
    const token = argv[index] as string;
    if (token === "--selector") {
      index += 1;
      out.push("--motion", argv[index] ?? "");
    } else if (token === "--window") {
      index += 1;
      out.push("--motion-window", argv[index] ?? "");
    } else if (token === "--no-throttle") {
      out.push("--motion-no-throttle");
    } else {
      out.push(token);
    }
    index += 1;
  }
  if (!out.includes("--motion")) {
    out.push("--motion");
  }
  return ["pnpm", "snap", ...out].map((value) => `'${value.replaceAll("'", `'"'"'`)}'`).join(" ");
}

function main(): number {
  print("RETIRED      pnpm motion-audit has no execution path; Snap is the sole rendered-instrument CLI.");
  print(`REPLACEMENT  ${replacement(process.argv.slice(2))}`);
  return EXIT.misuse;
}

await runTool(main);
