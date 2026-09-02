// Command dispatch — one arm per WorkCommand kind, nothing else decides what a verb does.
import { print } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { WorkCommand } from "../contract/types.ts";
import { requireRedDodAtMint } from "./dod.ts";
import { runLifecycle } from "./lifecycle.ts";
import { create, file, help, list, overview, show } from "./report.ts";

refuseDirectInvocation(import.meta.url, "pnpm work:item <command>");

export function runWorkCommand(command: WorkCommand): void {
  if (command.kind === "help") {
    help();
    return;
  }
  if (command.kind === "show") {
    show(command.issues);
    return;
  }
  if (command.kind === "list") {
    list(command.status);
    return;
  }
  if (command.kind === "overview") {
    overview();
    return;
  }
  if (command.kind === "create") {
    create(command);
    return;
  }
  if (command.kind === "file") {
    file(command);
    return;
  }
  // RED-FIRST at mint, ONCE per invocation and BEFORE any board call (#923): a green bar refuses at
  // zero GitHub cost, and an N-row `dod` fan-out proves the one command a single time.
  if (command.kind === "dod") {
    requireRedDodAtMint(command.command);
  }
  if (command.kind === "refute" && command.dod !== null) {
    requireRedDodAtMint(command.dod);
  }
  // One line naming every row that transitioned — `#1003 #1004 #1005 review` — so a batched call's
  // receipt is as specific as a single-row one's.
  print(
    `work-item — ${runLifecycle(command)
      .map((issue) => `#${issue}`)
      .join(" ")} ${command.kind}`,
  );
}
