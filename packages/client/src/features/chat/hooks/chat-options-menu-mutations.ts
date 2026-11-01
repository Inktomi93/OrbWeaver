import type { inferInput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";

// The #40 GAME front-door mutations — the ⋯ menu's start/stop rides the rpg procs DIRECTLY
// (lockdown §12 — a feature rides another domain's tRPC procedure directly, never its client; the rpg
// feature's own direct `trpc.chat.listMessages` read, `rpg-choice-echo.tsx`, is the live precedent). Both
// repaint `chat.getChat` (the pointer MIRROR the takeover gate + this menu read) AND `chat.listChats`:
// the LIST row renders the same fact from a different read (`isGame`/`gamePaused`, derived server-side off
// the same pointer), so leaving it out left the ⚔ marker claiming "Game chat" for the rest of the session
// while the room's own pane said otherwise — measured at t+0 and t+2000 ms (#863 P2). A mutation's
// invalidation set is a UX surface: it must name EVERY read that renders the toggled fact.
export const useStartGame = createEntityMutation<inferInput<Trpc["rpg"]["createGame"]>, unknown>({
  options: (trpc) => trpc.rpg.createGame.mutationOptions(),
  invalidates: (trpc, vars) => [trpc.chat.getChat.queryFilter({ chatId: vars.chatId }), trpc.chat.listChats.queryFilter()],
  errorToast: "Couldn't start the game.",
});

export const useSetGameEngaged = createEntityMutation<inferInput<Trpc["rpg"]["updateConfig"]>, unknown>({
  options: (trpc) => trpc.rpg.updateConfig.mutationOptions(),
  invalidates: (trpc, vars) => [trpc.chat.getChat.queryFilter({ chatId: vars.chatId }), trpc.chat.listChats.queryFilter()],
  errorToast: "Couldn't switch the game.",
});
