// The `/imagine` runner mount — rendered invisibly by each slash-command host (composer + palette) in its
// OWN fiber. It publishes a runner that parses the args (the ONE grammar in `imagine-command`) and opens the
// imagine modal seeded with the mode + prompt. `unavailableReason` already gates a room-less invocation; the
// null-chatId guard here is the belt.

import { useEffect } from "react";
import type { SlashCommandMountProps } from "#lib";
import { openImagine } from "#state";
import { parseImagineArgs } from "../lib/imagine-command.ts";

export function ImagineSlashMount({ context, onRunner }: SlashCommandMountProps): null {
  useEffect(() => {
    onRunner((args: string): void => {
      if (context.chatId === null) {
        return;
      }
      const { mode, prompt } = parseImagineArgs(args);
      openImagine({ chatId: context.chatId, mode, prompt });
    });
  }, [context.chatId, onRunner]);
  return null;
}
