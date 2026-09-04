// NOT A PROGRAM. Snap is the sole rendered-instrument front door (docs/design/1208-instrument-substrate.md
// §12.3); this dir is the design/a11y walker + rule engine Snap's `--design-audit` arm runs, entered through ./index.ts.
//
// THIS FILE EXISTS ONLY BECAUSE THE TEMPLATE REQUIRES AN ARGV DOOR (gate `tooling-slot-template` arm B:
// every tool dir owns cli.ts + index.ts, or a BASH_FRONTED_TOOLS row it does not qualify for). It carries
// NO argv translation and NO migration recipe beyond the one spelling below — the owner's 2026-09-04
// ruling on #1315: the product is unlaunched, so a retired spelling is GREP-FIXED at its call sites, not
// kept alive behind a door that has to be maintained, tested and eventually retired a second time.
import { print } from "../_shared/artifacts.ts";
import { EXIT } from "../_shared/exit-contract.ts";
import { runTool } from "../_shared/run-tool.ts";

function main(): number {
  print("NOT A CLI    this tool has no program; Snap is the sole rendered-instrument front door.");
  print("RUN INSTEAD  pnpm snap <route> --design-audit [--fail-on P0|P1|P2|P3]");
  return EXIT.misuse;
}

await runTool(() => Promise.resolve(main()));
