// Stories for the composer's SLASH-COMMAND dispatch (client-architecture-lockdown.md §6c) — the real
// ComposerStory wrapped in a SlashCommandRegistry, so a `.ct.tsx` drives the PRODUCTION path (registry →
// mounts → runner publish → dispatch) rather than a test double of the seam itself.
//
// Two fake contributions, each pinning one axis of the contract:
//   `/spy`    — a runnable command whose mount publishes a runner that records `chatId:args` into a DOM
//               readout, so a test can prove the runner FIRED with the right arguments.
//   `/locked` — a command that is registered but NOT runnable in this context; it proves an unavailable
//               command is still OFFERED (disabled, with its reason) and is REFUSED with that reason on
//               send, never silently posted.
// `registered: false` mounts the same tree with an EMPTY registry — the zero-registrant baseline.

import type { ContributorRegistry, SlashCommandContribution, SlashCommandMountProps } from "@orb/client/lib";
import { createContributorRegistry } from "@orb/client/lib";
import { SlashCommandRegistryProvider } from "@orb/client/state";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { ComposerStory } from "../_ct-stories";
import { SLASH_LOCKED_REASON } from "../fixtures";

function SpySlashMount({ context, onRunner, onFire }: SlashCommandMountProps & { readonly onFire: (fired: string) => void }): null {
  useEffect(() => {
    onRunner((args: string): void => onFire(`${String(context.chatId)}:${args}`));
  }, [context.chatId, onRunner, onFire]);
  return null;
}

function LockedSlashMount({ onRunner, onFire }: SlashCommandMountProps & { readonly onFire: (fired: string) => void }): null {
  useEffect(() => {
    onRunner((): void => onFire("locked-ran"));
  }, [onRunner, onFire]);
  return null;
}

/** The two fake contributions (or the empty baseline) as a registry. Module-scope + pure (D54 full-compile
 *  — manual memo is banned; the compiler caches the call site). */
function buildSlashRegistry(registered: boolean, onFire: (fired: string) => void): ContributorRegistry<SlashCommandContribution> {
  const contributions: readonly SlashCommandContribution[] = registered
    ? [
        {
          id: "spy",
          label: "Spy",
          describe: "Records its args",
          usage: "<text>",
          mount: (props): ReactElement => <SpySlashMount {...props} onFire={onFire} />,
        },
        {
          id: "locked",
          label: "Locked",
          describe: "Never runnable here",
          unavailableReason: (): string => SLASH_LOCKED_REASON,
          mount: (props): ReactElement => <LockedSlashMount {...props} onFire={onFire} />,
        },
      ]
    : [];
  return createContributorRegistry<SlashCommandContribution>("slash-commands", contributions);
}

export interface SlashComposerStoryProps {
  /** @defaultValue true — mounts the two fake commands; `false` is the EMPTY-registry baseline. */
  readonly registered?: boolean;
}

/** The composer over a slash-command registry. `ct-slash-fired` shows the runner's captured `chatId:args`. */
export function SlashComposerStory({ registered = true }: SlashComposerStoryProps): ReactElement {
  const [fired, setFired] = useState<string | null>(null);
  const registry = buildSlashRegistry(registered, setFired);

  return (
    <SlashCommandRegistryProvider value={registry}>
      <ComposerStory />
      <div data-testid="ct-slash-fired">{fired ?? ""}</div>
    </SlashCommandRegistryProvider>
  );
}
