// The display-pass regex set one viewer's transcript renders through, in the order it is applied, read whole from
// `regex.listDisplayScripts`.
//
// THE SERVER RESOLVES IT; THE CLIENT NEVER RE-UNIONS IT. A display script runs where it is attached: the room's
// tiers (global, preset, each seat, the room) resolved under the host exactly as the turn resolves its prompt side,
// then the viewer's own globals last, so a viewer can always counter-style what the room draws. A non-host member
// receives the room's tiers only while the host shares them (`chat.setHostDisplayScripts`); otherwise their own
// globals alone. Each entry names where it came from (`from`), which the room's `On screen` roster shows.
//
// RENDER-ONLY. The set never reaches the composer, an edit textarea, the wire or canon: the display pass runs on
// the way to the DOM and nowhere else, which is what makes the host's sharing switch safe to hand out.
//
// It lives in `#data` because its consumers are the chat message list and the room's Regex section, and features
// cannot import each other.

import type { RegexDisplayEntry } from "@orb/contracts/chat";
import type { RegexScriptRow } from "@orb/contracts/regex";
import type { ChatId } from "@orb/kit/ids";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { peekQueryData } from "./peek-query.ts";
import { useSuspenseQuery } from "./suspense-reads.ts";
import type { Trpc } from "./trpc.ts";
import { useTRPC } from "./trpc.ts";

const NO_ENTRIES: never[] = [];

/** The one spelling of the read's options for the transcript and the warm-up. The roster's suspending read
 *  builds the same options inline, because the suspending reader refuses this overloaded return type; the input
 *  is the key, so both land on one cache entry. */
function displayScriptQuery(trpc: Trpc, chatId: ChatId | null): ReturnType<Trpc["regex"]["listDisplayScripts"]["queryOptions"]> {
  return trpc.regex.listDisplayScripts.queryOptions({ chatId });
}

// Module scope keeps the `select` reference stable, so the projection is recomputed only when the entries change.
function scriptsOf(entries: readonly RegexDisplayEntry[]): readonly RegexScriptRow[] {
  return entries.length === 0 ? NO_ENTRIES : entries.map((entry) => entry.script);
}

/**
 * The scripts a transcript renders through, in run order. Pass `null` for a surface outside any room (a
 * draft-greeting preview), which reads the viewer's own globals.
 *
 * A read that has not landed, or that failed, renders through nothing: the display pass is optional, and the
 * stored text is what shows. The roster below is the surface that reports the failure.
 */
export function useDisplayScripts(chatId: ChatId | null): readonly RegexScriptRow[] {
  const trpc = useTRPC();
  const { data } = useQuery({ ...displayScriptQuery(trpc, chatId), placeholderData: NO_ENTRIES, select: scriptsOf });
  return data ?? NO_ENTRIES;
}

/** The same set with each script's source, for the room's `On screen` roster. It suspends, and a refused read (a
 *  viewer who is not in the room) reaches the caller's error boundary. */
export function useDisplayEntries(chatId: ChatId): readonly RegexDisplayEntry[] {
  const trpc = useTRPC();
  return useSuspenseQuery(trpc.regex.listDisplayScripts.queryOptions({ chatId })).data;
}

/**
 * Warm the read from outside the transcript's suspense boundary (#514): the room's owner calls this in the same
 * render that mounts the boundary, so the request leaves with the canon and roster reads instead of after them.
 *
 * It queries only an absent cache entry and subscribes to nothing; the readers above own freshness. A failed
 * warm-up leaves the key errored in the query cache, where the roster's suspending read throws it to its error
 * boundary and the transcript renders through nothing. `usePrefetchQuery` excludes `skipToken`, which tRPC's
 * `queryOptions()` output carries; the imperative `query` accepts the options as they are.
 */
export function usePrefetchDisplayScripts(chatId: ChatId): void {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  // Rebuilt inside the effect: `queryOptions()` returns a fresh object every render, and the room cannot change
  // without a remount, so this runs once per open.
  useEffect(() => {
    const options = displayScriptQuery(trpc, chatId);
    if (peekQueryData(queryClient, options.queryKey) === undefined) {
      // the transcript's reader falls back to no scripts and the roster's suspending reader surfaces the error, so a failed warm-up needs no handler of its own. Ends if either reader stops sharing this key.
      void queryClient.query(options).catch(() => undefined);
    }
  }, [queryClient, trpc, chatId]);
}
