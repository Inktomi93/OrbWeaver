// A handler that reads `input` needs a zod `.input(<schema>)` on its builder chain: without one tRPC types `input`
// as `undefined`, so a field read is a compile error on the real procedure ladder.
import { expectTypeOf, test } from "vitest";
import { z } from "zod";
import { authedProcedure } from "#server/transport/trpc/trpc.ts";

const withInput = authedProcedure.input(z.object({ id: z.string() }));

test("a declared input schema types the handler's input", () => {
  withInput.query(({ input }) => {
    expectTypeOf(input).toEqualTypeOf<{ id: string }>();
    return input.id;
  });
});

test("a shared builder's parser reaches a procedure built on it", () => {
  withInput
    .use(({ next }) => next())
    .mutation(({ input }) => {
      expectTypeOf(input.id).toBeString();
      return input.id;
    });
});

test("a handler on a chain with no .input() cannot read input fields", () => {
  authedProcedure.query(({ input }) => {
    expectTypeOf(input).toBeUndefined();
    // @ts-expect-error input is undefined when the chain declares no parser
    return input.id;
  });
  authedProcedure.mutation((opts) => {
    expectTypeOf(opts.input).toBeUndefined();
    // @ts-expect-error input is undefined when the chain declares no parser
    return opts.input.id;
  });
});
