// "Who is playing" for every persona surface — the switcher's chip, head and rows (both lenses) and the
// Settings list — read from ONE place, and the one verb that changes it. With a room open the answer is the
// viewer's SEAT; with none it is the global pointer. A switch inside a room always moves the seat; the
// "Everywhere" scope (and any switch with no room) also writes the global pointer.

import type { PersonaId } from "@orb/kit/ids";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { peekQueryData, useGatedQuery, useInvalidation, useTRPC } from "#data";
import { notify } from "#lib";
import { useActiveChatId } from "#state";
import { resolveCurrentPersona, resolvePlayingPersona } from "../lib/persona-current.ts";
import { useSetChatActivePersona } from "./use-chat-persona.ts";
import { useSetPersonaSeed } from "./use-persona-identity.ts";

type PersonaListItem = inferOutput<Trpc["persona"]["list"]>[number];
type ChatDetail = inferOutput<Trpc["chat"]["getChat"]>;

/** How far the next switch reaches. Inside a room it always moves the seat; `everywhere` also moves the
 *  global pointer. Never stored. */
type SwitchScope = "everywhere" | "chat";

export interface PlayingPersonaState {
  readonly personas: readonly PersonaListItem[];
  readonly seeds: { readonly currentPersonaId: string | null; readonly defaultPersonaId: string | null };
  readonly notifyOnChange: boolean;
  /** The global pointer's persona (what a new chat starts as when nothing connects). */
  readonly current: PersonaListItem | null;
  /** The persona playing now: the room seat when a room is open, else `current`. */
  readonly playing: PersonaListItem | null;
  /** The open room's detail, or `null` while none is open (or it has not loaded). */
  readonly chat: ChatDetail | null;
  /** True when preset text follows the viewer's seat: no room, or the viewer is the anchor human — the owner
   *  of the anchor persona, else the host (ADR 0250). Otherwise the seat speaks only the viewer's own lines. */
  readonly seatBindsPresets: boolean;
}

export function usePlayingPersona(): PlayingPersonaState {
  const trpc = useTRPC();
  const { data: personas } = useSuspenseQuery(trpc.persona.list.queryOptions());
  const { data: settings } = useSuspenseQuery(trpc.settings.getUserSettings.queryOptions());
  const chatId = useActiveChatId();
  // Gated, not suspended: with no chat open there is no room, and a switch must not block on a room read.
  const { data: loaded } = useGatedQuery(chatId, (id) => trpc.chat.getChat.queryOptions({ chatId: id }));
  const chat = chatId !== null && loaded !== undefined ? loaded : null;
  const seeds = settings.config.seeds;
  return {
    personas,
    seeds,
    notifyOnChange: settings.config.persona.showNotifications,
    current: resolveCurrentPersona(personas, seeds),
    playing: resolvePlayingPersona(personas, seeds, chat === null ? null : { seatId: chat.viewerActivePersonaId }),
    chat,
    seatBindsPresets: chat === null || (chat.anchorPersonaId === null ? chat.viewerIsHost : personas.some((p) => p.id === chat.anchorPersonaId)),
  };
}

/** The default pin's two verbs, shared by the switcher and the Settings list. Clearing is a quiet edit of a
 *  stored preference, so it says so and offers Undo. */
export function useDefaultPin(state: PlayingPersonaState): { readonly pin: (personaId: PersonaId) => void; readonly clear: () => void } {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const queryClient = useQueryClient();
  const setSeed = useSetPersonaSeed({ trpc, invalidation });
  // The persona being cleared, as a branded id (the stored pointer is a lenient plain string).
  const previousId = state.personas.find((persona) => persona.id === state.seeds.defaultPersonaId)?.id;
  // Undo reads the default AS IT IS NOW, not as it was when the notice was raised: a pin made since is newer
  // than the one being restored and must not be overwritten by a stale Undo.
  const defaultNow = (): string | null => peekQueryData(queryClient, trpc.settings.getUserSettings.queryKey())?.config.seeds.defaultPersonaId ?? null;
  const pin = (personaId: PersonaId): void => {
    setSeed.mutate({ section: "seeds", patch: { defaultPersonaId: personaId } });
  };
  const clear = (): void => {
    setSeed.mutate(
      { section: "seeds", patch: { defaultPersonaId: null } },
      {
        onSuccess: (): void => {
          notify.info({
            title: "Default persona cleared",
            ...(previousId === undefined
              ? {}
              : {
                  action: {
                    label: "Undo",
                    onClick: (): void => {
                      if (defaultNow() === null) {
                        pin(previousId);
                      } else {
                        notify.info("You've picked a new default since — nothing to undo.");
                      }
                    },
                  },
                }),
          });
        },
      },
    );
  };
  return { pin, clear };
}

/** The ONE switch verb. A no-op write (already the seat / already the pointer) is skipped. */
export function useSwitchPersona(state: PlayingPersonaState, scope: SwitchScope): (persona: PersonaListItem) => void {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const setSeed = useSetPersonaSeed({ trpc, invalidation });
  const setActive = useSetChatActivePersona({ trpc, invalidation });
  const { chat, current, notifyOnChange } = state;
  return (persona): void => {
    if (chat !== null && persona.id !== chat.viewerActivePersonaId) {
      setActive.mutate(
        { chatId: chat.id, personaId: persona.id },
        {
          onSuccess: (): void => {
            if (notifyOnChange) {
              notify.info(`Now playing as ${persona.name} in this chat.`);
            }
          },
        },
      );
    }
    if ((chat === null || scope === "everywhere") && persona.id !== current?.id) {
      setSeed.mutate({ section: "seeds", patch: { currentPersonaId: persona.id } });
    }
  };
}
