// transport/trpc/router — the root `appRouter`: one thin router per domain front door + the loose
// public procs (core/Tier-4-Transport.md §"router.ts"). The type `AppRouter` is what the client type-imports
// (`@orb/client` → `import type { AppRouter }`); it is `typeof` the root router, so its ONLY possible home
// is here (a value below `server` in the cake cannot reference a server value — it can't live in
// `@orb/contracts`), hence the one sanctioned `no-inline-types` exception below.
//
// FLAG[PD-46]: the `chat` router (`send`/`swipe`/`start`/`streamMessages` + the chat SSE subscription) lands
// when the chat + memory domains are built WHOLE at Phase 5 (ledger D16). The inline single-card embed
// (PD-90) is `admin.embedCharacterCard` — the cross-domain producer-ownership check is composed at
// `entry/` into admin's `EmbedProducerPort`; the bulk embed path is the admin `embed-corpus` workload.

import { z } from "zod";
import { recordClientError } from "#foundation/observability";
import { adminRouter } from "./routers/admin";
import { assetsRouter } from "./routers/assets";
import { buddyRouter } from "./routers/buddy";
import { characterRouter } from "./routers/character";
import { chatRouter } from "./routers/chat";
import { connectionRouter } from "./routers/connection";
import { credentialsRouter } from "./routers/credentials";
import { discoveryRouter } from "./routers/discovery";
import { invitesRouter } from "./routers/invites";
import { notificationsRouter } from "./routers/notifications";
import { personaRouter } from "./routers/persona";
import { presetRouter } from "./routers/preset";
import { searchRouter } from "./routers/search";
import { sessionsRouter } from "./routers/sessions";
import { settingsRouter } from "./routers/settings";
import { statsRouter } from "./routers/stats";
import { tagRouter } from "./routers/tag";
import { workloadsRouter } from "./routers/workloads";
import { worldInfoRouter } from "./routers/world-info";
import { publicProcedure, t } from "./trpc";

// PD-58 — the client→server error-report verb's wire bounds. Generous (a real stack/ownerStack can run
// long) but finite: this rejects a pathologically oversized payload at the transport edge BEFORE it's
// parsed/logged; the sink (`recordClientError`) truncates independently to a log-line-friendly length —
// two independent caps, not a shared constant, because they guard different things (wire abuse vs. log
// line size) and live in different tiers.
const CLIENT_ERROR_TEXT_MAX = 20_000;
const CLIENT_ERROR_URL_MAX = 4000;
const CLIENT_ERROR_REQUEST_ID_MAX = 200;

export const appRouter = t.router({
  // Loose public procs — liveness + an echo diagnostic (anonymous-allowed; the per-IP public bucket
  // covers them). The real readiness probe is `entry/http` `/api/healthz` (it reads lifecycle + engines).
  health: publicProcedure.query(() => ({ ok: true }) as const),
  echo: publicProcedure
    .input(z.object({ message: z.string() }))
    .query(({ input }) => ({ message: input.message })),

  // PD-58 — the client error boundary's fire-and-forget report. `publicProcedure` (anonymous-allowed):
  // a render throw can happen before auth resolves, or BECAUSE auth is broken, so this must never itself
  // require a working session. `recordClientError` (foundation/observability) writes the report into the
  // same log stream + `/api/_debug/errors` ring a server error lands in. Always returns `{ ok: true }` —
  // the sink is best-effort and never throws; a validation failure on a malformed/oversized report is the
  // ONLY rejection path (mapped to BAD_REQUEST by tRPC's own input-parse failure, upstream of the handler).
  clientError: publicProcedure
    .input(
      z.object({
        message: z.string().max(CLIENT_ERROR_TEXT_MAX),
        stack: z.string().max(CLIENT_ERROR_TEXT_MAX).optional(),
        ownerStack: z.string().max(CLIENT_ERROR_TEXT_MAX).optional(),
        url: z.string().max(CLIENT_ERROR_URL_MAX),
        // biome-ignore lint/plugin/no-raw-id: opaque client-supplied correlation string, not an entity id (mirrors X-Request-Id's own charset-only validation in observability/middleware.ts — never a TypeID/nanoid-branded domain id).
        requestId: z.string().max(CLIENT_ERROR_REQUEST_ID_MAX).optional(),
      }),
    )
    .mutation(({ input }) => {
      recordClientError(input);
      return { ok: true } as const;
    }),

  admin: adminRouter,
  assets: assetsRouter,
  buddy: buddyRouter,
  character: characterRouter,
  chat: chatRouter,
  connection: connectionRouter,
  credentials: credentialsRouter,
  discovery: discoveryRouter,
  invites: invitesRouter,
  notifications: notificationsRouter,
  persona: personaRouter,
  preset: presetRouter,
  search: searchRouter,
  sessions: sessionsRouter,
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
