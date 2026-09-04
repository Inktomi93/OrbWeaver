// Loud compatibility door for the retired Record CLI; Snap filmstrip owns transition capture.
import process from "node:process";
import { print } from "../_shared/artifacts.ts";
import { EXIT } from "../_shared/exit-contract.ts";
import { runTool } from "../_shared/run-tool.ts";
import { recordRetirement } from "./index.ts";

export function main(argv: readonly string[]): number {
  const result = recordRetirement(argv);
  print("RECORD RETIRED  transition capture is Snap's filmstrip arm; no browser or run slot was opened.");
  for (const error of result.errors) {
    print(`ARG ERROR    ${error}`);
  }
  print(`USE             ${result.recipe}`);
  return EXIT.misuse;
}

await runTool(() => Promise.resolve(main(process.argv.slice(2))));
