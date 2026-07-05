import { useQueryClient } from "@tanstack/react-query";
import type { ReactElement } from "react";
import type { ChatBusDeps } from "#data";
import { createInvalidation, useTRPC } from "#data";
import { AppShell } from "#features/app-shell";
import { ChatRoomSurface } from "#features/chat";
import { chatStream, draftChat } from "#state";

// The `/` home: the composition root. It mounts the four-region <AppShell> (UI-Arch §4.1) and composes
// the (already-built) <ChatRoomSurface> into the shell's `chats` CONTENT slot. A ROUTE may import a
// feature front door (the same route→feature seam `router.tsx` uses); a feature may NOT import another
// feature — so app-shell stays domain-agnostic (it renders regions + slots) and the chat mount + its
// `ChatBusDeps` assembly live HERE. Every other rail section falls back to the shell's own
// <SectionPlaceholder> until its feature lands (unwired ≠ fabricated).
//
// `stream` is the chat-stream singleton; `invalidate` is the central seam rebuilt per render from the
// provided tRPC proxy + QueryClient (stateless + fire-and-forget — identity churn is harmless, the
// subscription keys off ids, not deps identity). A DRAFT handle is the real "new chat" landing state:
// empty transcript + a live composer, no server read, until first send promotes it to a committed chat.
export function HomePage(): ReactElement {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const invalidation = createInvalidation({ queryClient, trpc });
  const busDeps: ChatBusDeps = { stream: chatStream, invalidate: invalidation.invalidate };

  return (
    <AppShell
      sections={{
        chats: {
          content: <ChatRoomSurface initialHandle={draftChat("landing")} busDeps={busDeps} />,
        },
      }}
    />
  );
}
