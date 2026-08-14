// The door's SINGLETONS — constructed exactly once, here, because the registration door is now TWO
// modules and both need the same instances (client-architecture-lockdown.md §7).
//
// WHY THIS FILE EXISTS (the code-split, #43): `main.tsx` is the BOOT half of the door — it runs for every
// visitor, authenticated or not. `compose/authed-app.tsx` is the AUTHED half — it holds every registry
// assembly, so it statically imports every feature front door, and it is reached through a lazy route
// boundary so an unauthenticated client never downloads or parses it. Two modules, one QueryClient / one
// tRPC client / one options proxy: they live here so neither half constructs a second set (a second
// QueryClient is two caches; a second tRPC client is a second link chain). Nothing but the two door
// modules may import this file (`client-compose-tier-door-only`).

import { createAppQueryClient, createTrpcClient, createTrpcProxy } from "#data";

export const queryClient = createAppQueryClient();
export const trpcClient = createTrpcClient();
/** The door's `trpc` OPTIONS proxy — the cross-domain read channel a contributor is injected (§12): it lets
 *  rpg read `chat.getChat` CACHE-FIRST (game-ness) without importing chat's client (the agent bridge uses
 *  it too). */
export const trpcProxy = createTrpcProxy(trpcClient, queryClient);
