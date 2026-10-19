// The root appRouter: one thin router per domain front door + the loose public procs. The type AppRouter
// is what the client type-imports; it is `typeof` the root router, so its only possible home is here,
// hence the one sanctioned no-inline-types exception below.

import { bugReportDiagnosticsSchema, clientErrorReportSchema } from "@orb/contracts/diagnostics";
import type * as TRPCCore from "@trpc/server/unstable-core-do-not-import";
import { z } from "zod";
import { isOwner } from "#domain/admin";
import { readBugReportDiagnostics, recordClientError } from "#foundation/observability";
import { adminRouter } from "./routers/admin.ts";
import { assetsRouter } from "./routers/assets.ts";
import { automationRouter } from "./routers/automation.ts";
import { characterRouter } from "./routers/character.ts";
import { chatRouter } from "./routers/chat.ts";
import { connectionRouter } from "./routers/connection.ts";
import { credentialsRouter } from "./routers/credentials.ts";
import { databankRouter } from "./routers/databank.ts";
import { discoveryRouter } from "./routers/discovery.ts";
import { imageryRouter } from "./routers/imagery.ts";
import { invitesRouter } from "./routers/invites.ts";
import { notificationsRouter } from "./routers/notifications.ts";
import { personaRouter } from "./routers/persona.ts";
import { pluginRouter } from "./routers/plugin.ts";
import { presetRouter } from "./routers/preset.ts";
import { refineryRouter } from "./routers/refinery.ts";
import { regexRouter } from "./routers/regex.ts";
import { rosterPresetRouter } from "./routers/roster-preset.ts";
import { rpgRouter } from "./routers/rpg.ts";
import { searchRouter } from "./routers/search.ts";
import { sessionsRouter } from "./routers/sessions.ts";
import { settingsRouter } from "./routers/settings.ts";
import { shareRouter } from "./routers/share.ts";
import { statsRouter } from "./routers/stats.ts";
import { streamRouter } from "./routers/stream.ts";
import { tagRouter } from "./routers/tag.ts";
import { workloadsRouter } from "./routers/workloads.ts";
import { worldInfoRouter } from "./routers/world-info.ts";
import { authedProcedure, publicProcedure, t } from "./trpc.ts";

export const appRouter = t.router({
  // @server-only: deployment readiness probe used by the boot supervisor and external health checks; it is
  // deliberately public, carries no input, and has no browser UI consumer.
  health: publicProcedure.query(() => ({ ok: true }) as const),
  // @test-fixture: the CT typed-read template — the client-data CTs (_ct-stories.tsx) type a suspense
  // query against this echo; it ships as the minimal round-trip fixture, no production UI consumer.
  echo: publicProcedure.input(z.object({ message: z.string() })).query(({ input }) => ({ message: input.message })),

  // The client error boundary's fire-and-forget report. publicProcedure (anonymous-allowed): a render
  // throw can happen before auth resolves, or because auth is broken. Always returns { ok: true } — the
  // sink is best-effort and never throws.
  clientError: publicProcedure.input(clientErrorReportSchema).mutation(({ input }) => {
    recordClientError(input);
    return { ok: true } as const;
  }),

  // The production "Report a bug" read: runtime facts for any signed-in caller, and the grammar-checked
  // error census for the OWNER only (`isOwner`, D17 — the log ring is principal-blind, the `/api/_debug`
  // posture). No input, no db read. Never the dev capture, which stays behind `/api/_debug`.
  bugReportDiagnostics: authedProcedure
    .output(bugReportDiagnosticsSchema)
    .query(({ ctx }) => readBugReportDiagnostics({ includeServerErrors: isOwner(ctx.auth) })),

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
  refinery: refineryRouter,
  rosterPreset: rosterPresetRouter,
  rpg: rpgRouter,

  search: searchRouter,
  sessions: sessionsRouter,
  settings: settingsRouter,
  share: shareRouter,
  stats: statsRouter,
  stream: streamRouter,
  tag: tagRouter,
  workloads: workloadsRouter,
  regex: regexRouter,
  worldInfo: worldInfoRouter,
});

export type AppRouter = typeof appRouter;

/** Invokes a procedure through the full middleware ladder without HTTP. */
export const createCaller: TRPCCore.RouterCaller<TRPCCore.inferRouterRootTypes<AppRouter>, AppRouter["_def"]["record"]> = t.createCallerFactory(appRouter);
