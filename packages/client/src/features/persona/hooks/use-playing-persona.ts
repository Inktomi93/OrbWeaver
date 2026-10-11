// "Who is playing" for the persona switcher (both lenses), read from ONE place, and the verbs that change the
// three persona pointers: a switch moves the room seat and the last-played pointer, the crown moves only the
// default, and the card pin moves only the room's anchor. None of them writes another's pointer.

import type { PersonaId } from "@orb/kit/ids";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { useGatedQuery, useInvalidation, useTRPC } from "#data";
import { notify } from "#lib";
import { useActiveChatId } from "#state";
import { resolveNewChatPersona, resolvePlayingPersona } from "../lib/persona-current.ts";
import { useSetChatActivePersona, useSetChatAnchorPersona } from "./use-chat-persona.ts";
import { useSetPersonaSeed } from "./use-persona-identity.ts";

type PersonaListItem = inferOutput<Trpc["persona"]["list"]>[number];
type ChatDetail = inferOutput<Trpc["chat"]["getChat"]>;

export interface PlayingPersonaState {
  readonly personas: readonly PersonaListItem[];
  readonly seeds: { readonly currentPersonaId: string | null; readonly defaultPersonaId: string | null };
  readonly notifyOnChange: boolean;
  /** Who a new chat starts you as, and which pointer decided it (the no-room head). */
  readonly newChat: ReturnType<typeof resolveNewChatPersona<PersonaListItem>>;
  /** The persona playing now: the room seat when a room is open, else who a new chat starts you as. */
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
    newChat: resolveNewChatPersona(personas, seeds),
    playing: resolvePlayingPersona(personas, seeds, chat === null ? null : { seatId: chat.viewerActivePersonaId }),
    chat,
    seatBindsPresets:
      chat === null || (chat.anchorPersonaId === null || chat.anchorState !== "live" ? chat.viewerIsHost : personas.some((p) => p.id === chat.anchorPersonaId)),
  };
}

/** The crown's two verbs, shared by the switcher and the Settings list. Writes only the default. */
export function useDefaultPersona(notifyOnChange: boolean): { readonly set: (persona: PersonaListItem) => void; readonly clear: () => void } {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const setSeed = useSetPersonaSeed({ trpc, invalidation });
  const say = (message: string): void => {
    if (notifyOnChange) {
      notify.info(message);
    }
  };
  return {
    set: (persona): void => {
      setSeed.mutate({ section: "seeds", patch: { defaultPersonaId: persona.id } }, { onSuccess: (): void => say(`${persona.name} is now your default.`) });
    },
    clear: (): void => {
      setSeed.mutate({ section: "seeds", patch: { defaultPersonaId: null } }, { onSuccess: (): void => say("Default persona cleared.") });
    },
  };
}

/** The card pin's verb (host only; the server refuses anyone else). `null` unpins. Writes only the anchor. */
export function useCardPin(state: PlayingPersonaState): (persona: { readonly id: PersonaId; readonly name: string } | null) => void {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const setAnchor = useSetChatAnchorPersona({ trpc, invalidation });
  const { chat, notifyOnChange } = state;
  return (persona): void => {
    if (chat === null) {
      return;
    }
    setAnchor.mutate(
      { chatId: chat.id, personaId: persona?.id ?? null },
      {
        onSuccess: (): void => {
          if (notifyOnChange) {
            notify.info(persona === null ? "Card unpinned." : `Card pinned to ${persona.name}.`);
          }
        },
      },
    );
  };
}

/** The ONE switch verb, live only with a room open: moves the seat and records the persona as last played.
 *  A no-op write (already the seat / already last played) is skipped. */
export function useSwitchPersona(state: PlayingPersonaState): (persona: PersonaListItem) => void {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const setSeed = useSetPersonaSeed({ trpc, invalidation });
  const setActive = useSetChatActivePersona({ trpc, invalidation });
  const { chat, seeds, notifyOnChange } = state;
  return (persona): void => {
    if (chat === null) {
      return;
    }
    if (persona.id !== chat.viewerActivePersonaId) {
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
    if (persona.id !== seeds.currentPersonaId) {
      setSeed.mutate({ section: "seeds", patch: { currentPersonaId: persona.id } });
    }
  };
}
