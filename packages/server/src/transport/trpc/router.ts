// The root appRouter: one thin router per domain front door + the loose public procs. The type AppRouter
// is what the client type-imports; it is `typeof` the root router, so its only possible home is here,
// hence the one sanctioned no-inline-types exception below.

import { z } from "zod";
import { recordClientError } from "#foundation/observability";
import { adminRouter } from "./routers/admin";
import { assetsRouter } from "./routers/assets";
import { automationRouter } from "./routers/automation";
import { characterRouter } from "./routers/character";
import { chatRouter } from "./routers/chat";
import { connectionRouter } from "./routers/connection";
import { credentialsRouter } from "./routers/credentials";
import { databankRouter } from "./routers/databank";
import { discoveryRouter } from "./routers/discovery";
import { imageryRouter } from "./routers/imagery";
import { invitesRouter } from "./routers/invites";
import { notificationsRouter } from "./routers/notifications";
import { personaRouter } from "./routers/persona";
import { pluginRouter } from "./routers/plugin";
import { presetRouter } from "./routers/preset";
import { regexRouter } from "./routers/regex";
import { rpgRouter } from "./routers/rpg";
import { searchRouter } from "./routers/search";
import { sessionsRouter } from "./routers/sessions";
import { settingsRouter } from "./routers/settings";
import { statsRouter } from "./routers/stats";
import { streamRouter } from "./routers/stream";
import { tagRouter } from "./routers/tag";
import { workloadsRouter } from "./routers/workloads";
import { worldInfoRouter } from "./routers/world-info";
import { publicProcedure, t } from "./trpc";

// The client→server error-report verb's wire bounds. Generous but finite: rejects a pathologically
// oversized payload at the transport edge before it's parsed/logged; the sink (recordClientError)
// truncates independently to a log-line-friendly length.
const CLIENT_ERROR_TEXT_MAX = 20_000;
const CLIENT_ERROR_URL_MAX = 4000;
const CLIENT_ERROR_REQUEST_ID_MAX = 200;

export const appRouter = t.router({
  health: publicProcedure.query(() => ({ ok: true }) as const),
  // @test-fixture: the CT typed-read template — the client-data CTs (_ct-stories.tsx) type a suspense
  // query against this echo; it ships as the minimal round-trip fixture, no production UI consumer.
  echo: publicProcedure.input(z.object({ message: z.string() })).query(({ input }) => ({ message: input.message })),

  // The client error boundary's fire-and-forget report. publicProcedure (anonymous-allowed): a render
  // throw can happen before auth resolves, or because auth is broken. Always returns { ok: true } — the
  // sink is best-effort and never throws.
  clientError: publicProcedure
    .input(
      z.object({
        message: z.string().max(CLIENT_ERROR_TEXT_MAX),
        stack: z.string().max(CLIENT_ERROR_TEXT_MAX).optional(),
        ownerStack: z.string().max(CLIENT_ERROR_TEXT_MAX).optional(),
        url: z.string().max(CLIENT_ERROR_URL_MAX),
        // @orb-gate-ignore no-raw-id: opaque client-supplied correlation string, not an entity id (mirrors X-Request-Id's own charset-only validation in observability/middleware.ts — never a TypeID/nanoid-branded domain id).
        requestId: z.string().max(CLIENT_ERROR_REQUEST_ID_MAX).optional(),
      }),
    )
    .mutation(({ input }) => {
      recordClientError(input);
      return { ok: true } as const;
    }),

  admin: adminRouter,
  assets: assetsRouter,
  automation: automationRouter,
  character: characterRouter,
  chat: chatRouter,
  connection: connectionRouter,
  credentials: credentialsRouter,
  databank: databankRouter,
  discovery: discoveryRouter,
  imagery: imageryRouter,
  invites: invitesRouter,
  notifications: notificationsRouter,
  persona: personaRouter,
  plugin: pluginRouter,
  preset: presetRouter,
  rpg: rpgRouter,

  search: searchRouter,
  sessions: sessionsRouter,
  settings: settingsRouter,
  stats: statsRouter,
  stream: streamRouter,
  tag: tagRouter,
  workloads: workloadsRouter,
  regex: regexRouter,
  worldInfo: worldInfoRouter,
});

// @orb-gate-ignore no-inline-types: AppRouter is the client's type-import contract — `typeof` the root router has no other home (a package below `server` in the cake cannot reference this server value).
export type AppRouter = typeof appRouter;

/** Invokes a procedure through the full middleware ladder without HTTP. */
export const createCaller = t.createCallerFactory(appRouter);
