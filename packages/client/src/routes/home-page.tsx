import { Stack } from "@orb/ui/layout";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactElement } from "react";
import type { ChatBusDeps } from "#data";
import { createInvalidation, useTRPC } from "#data";
import { ChatRoomSurface } from "#features/chat";
import { chatStream, draftChat } from "#state";

// The `/` home: the composition root's CONTENT mount for the chat pane (UI-Arch §4.1 — the full
// four-region rail frame is a later app-shell task; today the pane fills the viewport). A route MAY
// import a feature surface (the same route→feature seam `router.tsx` uses for `AppShell`); a feature
// may not import another feature (that's what the §32 slot registries are for), so the mount + the
// `ChatBusDeps` assembly live HERE, at the route. `stream` is the chat-stream singleton; `invalidate`
// is the central seam rebuilt per render from the provided tRPC proxy + QueryClient (stateless +
// fire-and-forget, identity churn is harmless — the subscription keys off ids, not deps identity).
// A DRAFT handle is the real "new chat" landing state — empty transcript + a live composer, no server
// read — until the chat-list selection flow lands and promotes it to a committed chat on first send.
export function HomePage(): ReactElement {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const invalidation = createInvalidation({ queryClient, trpc });
  const busDeps: ChatBusDeps = { stream: chatStream, invalidate: invalidation.invalidate };

  return (
    <Stack className="h-dvh bg-background text-foreground">
      <ChatRoomSurface initialHandle={draftChat("landing")} busDeps={busDeps} />
    </Stack>
  );
}
