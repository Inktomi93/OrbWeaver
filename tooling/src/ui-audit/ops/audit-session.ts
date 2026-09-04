import { print } from "@orb/tooling/_shared/artifacts";
import { launchProbeSession } from "@orb/tooling/_shared/browser";
import type { ProbeSession } from "@orb/tooling/_shared/browser-contract";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import type { ExitCode } from "@orb/tooling/_shared/exit-contract";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { attachResolvedSession, resolveSessionAttach } from "../../snap/index.ts";
import type { Args } from "../contract/types.ts";

refuseDirectInvocation(import.meta.url, "pnpm design-audit <route>");

export interface AttachedAuditSession {
  readonly session: ProbeSession;
  readonly base: string;
}

/** Attach without fallback: a bare `--session` inherits its binding URL, while explicit `--base`
 * remains a composing navigation override. */
export async function launchOrAttachAuditSession(opts: Args): Promise<AttachedAuditSession | ExitCode> {
  if (opts.session === null) {
    const session = await launchProbeSession({
      headless: true,
      viewport: opts.viewport,
      device: opts.device,
      colorScheme: opts.colorScheme,
      reducedMotion: opts.reducedMotion,
      appearance: opts.appearance,
      theme: opts.theme,
      localStorage: [],
    });
    return { session, base: opts.base };
  }
  const attach = await resolveSessionAttach(opts.session);
  if (!attach.ok) {
    print(attach.message);
    return EXIT.toolError;
  }
  const session = await attachResolvedSession(attach);
  return { session, base: opts.baseExplicit ? opts.base : attach.row.binding.url };
}
