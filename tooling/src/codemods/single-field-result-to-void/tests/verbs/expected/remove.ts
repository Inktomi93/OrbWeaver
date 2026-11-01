export function createRemove(ctx: Context): Service["removeScript"] {
  return async ({ scriptId }) => {
    await ctx.db.delete(scriptId);
    if (scriptId === "") {
      // A different single-field object stays: it is not the planned field.
      return { count: 0 };
    }
  };
}

export async function withAnnotation(ctx: Context): Promise<void> {
  await ctx.db.delete("x");
}
