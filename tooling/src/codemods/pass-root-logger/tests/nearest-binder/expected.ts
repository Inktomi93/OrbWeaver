export function buildRouter(deps: RouterDeps) {
  return router({
    send: procedure.mutation(async ({ ctx, input }) => {
      getLog(ctx.logger).info({ chatId: input.chatId }, "chat: send");
    }),
    guard: middleware(({ ctx, next }) => {
      securityEvent("csrf_missing", {}, "security: csrf header missing", ctx.logger);
      return next();
    }),
    renamed: procedure.query(({ ctx: context }) => {
      getLog(deps.logger).debug({}, "renamed binder is not ctx, so deps wins");
    }),
    method: {
      run(ctx: StageContext): void {
        getLog(ctx.logger).info({}, "method parameter");
      },
    },
    parenthesized: (ctx) => getLog(ctx.logger).info({}, "parenthesized arrow parameter"),
    bare: ctx => getLog(ctx.logger).info({}, "bare arrow parameter"),
  });
}
