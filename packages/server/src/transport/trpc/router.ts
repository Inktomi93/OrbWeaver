// transport/trpc/router — the root `appRouter`: one thin router per domain front door + the loose
// public procs (core/Tier-4-Transport.md §"router.ts"). The type `AppRouter` is what the client type-imports
// (`@orb/client` → `import type { AppRouter }`); it is `typeof` the root router, so its ONLY possible home
// is here (a value below `server` in the cake cannot reference a server value — it can't live in
// `@orb/contracts`), hence the one sanctioned `no-inline-types` exception below.
//
// FLAG[PD-46]: the `chat` router (`send`/`swipe`/`start`/`streamMessages` + the chat SSE subscription) lands
// when the chat + memory domains are built WHOLE at Phase 5 (ledger D16). The `embeddings` inline `embed`
// (admin) router is FLAG[PD-90] — the producer-ownership check crosses embeddings+character (composition →
// `entry/`, not a thin driver); the bulk embed path is the admin `embed-corpus` workload.

import { z } from "zod";
import { adminRouter } from "./routers/admin";
import { buddyRouter } from "./routers/buddy";
import { characterRouter } from "./routers/character";
import { chatRouter } from "./routers/chat";
import { connectionRouter } from "./routers/connection";
import { credentialsRouter } from "./routers/credentials";
import { discoveryRouter } from "./routers/discovery";
import { notificationsRouter } from "./routers/notifications";
import { personaRouter } from "./routers/persona";
import { presetRouter } from "./routers/preset";
import { searchRouter } from "./routers/search";
import { settingsRouter } from "./routers/settings";
import { statsRouter } from "./routers/stats";
import { tagRouter } from "./routers/tag";
import { workloadsRouter } from "./routers/workloads";
import { worldInfoRouter } from "./routers/world-info";
import { publicProcedure, t } from "./trpc";

export const appRouter = t.router({
  // Loose public procs — liveness + an echo diagnostic (anonymous-allowed; the per-IP public bucket
  // covers them). The real readiness probe is `entry/http` `/api/healthz` (it reads lifecycle + engines).
  health: publicProcedure.query(() => ({ ok: true }) as const),
  echo: publicProcedure
    .input(z.object({ message: z.string() }))
    .query(({ input }) => ({ message: input.message })),

  admin: adminRouter,
  buddy: buddyRouter,
  character: characterRouter,
  chat: chatRouter,
  connection: connectionRouter,
  credentials: credentialsRouter,
  discovery: discoveryRouter,
  notifications: notificationsRouter,
  persona: personaRouter,
  preset: presetRouter,
  search: searchRouter,
  settings: settingsRouter,
  stats: statsRouter,
  tag: tagRouter,
  workloads: workloadsRouter,
  worldInfo: worldInfoRouter,
});

// biome-ignore lint/plugin/no-inline-types: AppRouter is the client's type-import contract — `typeof` the root router has no other home (a package below `server` in the cake cannot reference this server value).
export type AppRouter = typeof appRouter;

// The server-side caller factory — `createCaller(ctx)` invokes a procedure through the full middleware
// ladder without HTTP (the sanctioned tRPC seam for internal/server-side calls + the gate/router tests).
export const createCaller = t.createCallerFactory(appRouter);
