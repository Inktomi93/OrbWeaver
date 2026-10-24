export function buildRouter(deps: RouterDeps) {
  return router({
    send: procedure.mutation(async ({ ctx, input }) => {
      getLog().info({ chatId: input.chatId }, "chat: send");
    }),
    guard: middleware(({ ctx, next }) => {
      securityEvent("csrf_missing", {}, "security: csrf header missing");
      return next();
    }),
    renamed: procedure.query(({ ctx: context }) => {
      getLog().debug({}, "renamed binder is not ctx, so deps wins");
    }),
    method: {
      run(ctx: StageContext): void {
        getLog().info({}, "method parameter");
      },
    },
    parenthesized: (ctx) => getLog().info({}, "parenthesized arrow parameter"),
    bare: ctx => getLog().info({}, "bare arrow parameter"),
  });
}
