import type { ChatId, RegexScriptId } from "@orb/kit/ids";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { peekQueryData, roomRosterOptions, useTRPC } from "#data";
import type { NotifyAction } from "#lib";
import { bindStopNoticeDoor, rethrowUnlessTrpcFailure } from "#lib";
import { regexStopControl, regexStopNextStep } from "../lib/regex-stop-copy.ts";

/**
 * Lends the open room to the notice for a script this browser stopped (`display-script-stops.ts`): its action lands on the
 * script's row, and its next step names the control the reader's own row holds. A room not yet read says no next step,
 * and a notice with none states the stop alone.
 */
export function useRegexStopNoticeDoor(chatId: ChatId | null, openScriptRow: (scriptId: RegexScriptId) => NotifyAction): void {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  useEffect(() => {
    if (chatId === null) {
      return;
    }
    // The viewer's library says which stopped scripts hold a switch of theirs. Warmed here so the first stop's notice can say.
    const library = trpc.regex.listScripts.queryOptions();
    if (peekQueryData(queryClient, library.queryKey) === undefined) {
      queryClient.query(library).catch(rethrowUnlessTrpcFailure);
    }
    return bindStopNoticeDoor({
      action: (script) => (script.id === null ? undefined : openScriptRow(script.id)),
      fix: (script) => {
        const isHost = peekQueryData(queryClient, roomRosterOptions(trpc, { chatId }).queryKey)?.viewerIsHost;
        const owned = peekQueryData(queryClient, library.queryKey);
        return isHost === undefined || owned === undefined
          ? undefined
          : regexStopNextStep(
              regexStopControl(
                isHost,
                owned.some((row) => row.id === script.id),
              ),
            );
      },
    });
  }, [chatId, openScriptRow, queryClient, trpc]);
}
