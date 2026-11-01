export const router = {
  updateScript: authedProcedure
    .output(scriptViewSchema)
    .input(updateSchema)
    .mutation(({ ctx, input }) => ctx.services.regex.updateScript(input)),

  removeScript: authedProcedure
    .output(z.void())
    .input(idInputSchema)
    .mutation(({ ctx, input }) => ctx.services.regex.removeScript(input)),

  otherRemove: authedProcedure
    .output(removeResultSchema)
    .input(idInputSchema)
    .mutation(({ ctx, input }) => ctx.services.regex.otherRemove(input)),
};
