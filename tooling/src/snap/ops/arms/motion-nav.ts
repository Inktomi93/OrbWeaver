// The `--motion-goto` input: the same bridge nav `--goto` runs, dispatched while the motion trace is recording.
import type { Page } from "@playwright/test";
import { print } from "../../../floor/artifacts/artifacts.ts";
import { refuseDirectInvocation } from "../../../floor/cli/entrypoint.ts";
import { runNav } from "../../../floor/instrument/nav.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route> --motion-goto <target>");

export async function navigateInsideWindow(page: Page, target: string): Promise<boolean> {
  const outcome = await runNav(page, "goto", target);
  if (!outcome.ok) {
    print(`NAV FAILED  --motion-goto ${target}: ${outcome.reason}`);
  }
  return outcome.ok;
}
