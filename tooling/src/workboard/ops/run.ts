// Command dispatch — one arm per WorkCommand kind, nothing else decides what a verb does.
import { print } from "../../_shared/artifacts.ts";
import type { WorkCommand } from "../contract/types.ts";
import { runLifecycle } from "./lifecycle.ts";
import { create, help, list, show } from "./report.ts";

export function runWorkCommand(command: WorkCommand): void {
  if (command.kind === "help") {
    help();
    return;
  }
  if (command.kind === "show") {
    show(command.issue);
    return;
  }
  if (command.kind === "list") {
    list(command.status);
    return;
  }
  if (command.kind === "create") {
    create(command);
    return;
  }
  print(`work-item — #${runLifecycle(command)} ${command.kind}`);
}
