// @subject packages/server/src/transport/trpc/router.ts
// tRPC replaces a result with its parsed output, so a strip-mode output drops a key the producer returns and an absent
// output ships whatever the producer built. Every query and mutation declares a strict output; a subscription's
// result is its frame iterable, which tRPC's single output parse cannot judge.
import { appRouter } from "@orb/server/transport/trpc";
import { stripObjectPaths } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { z } from "zod";

interface MountedOutput {
  readonly name: string;
  readonly kind: string;
  readonly output: z.core.$ZodType | undefined;
}

function mountedOutputs(): readonly MountedOutput[] {
  return Object.entries(appRouter._def.procedures).map(([name, procedure]): MountedOutput => {
    if (typeof procedure !== "function") {
      throw new Error("the native procedure table contains an unresolved non-procedure entry");
    }
    // The router types its table as queries and mutations; a subscription is a runtime kind beside them.
    const kind: string = procedure._def.type;
    const output = "output" in procedure._def ? procedure._def.output : undefined;
    if (output !== undefined && !(output instanceof z.core.$ZodType)) {
      throw new Error(`${name}: the mounted output parser is not a zod schema`);
    }
    return { name, kind, output };
  });
}

test("every query and mutation declares an output that refuses an undeclared key at every object it reaches", () => {
  const judged = mountedOutputs().filter(({ kind }) => kind !== "subscription");
  expect(judged.length).toBeGreaterThan(0);
  expect(judged.filter(({ output }) => output === undefined).map(({ name }) => name)).toEqual([]);
  expect(judged.flatMap(({ name, output }) => (output === undefined ? [] : stripObjectPaths(output).map((path) => `${name} ${path}`)))).toEqual([]);
});

test("the census passes over subscriptions only", () => {
  const passed = mountedOutputs().filter(({ kind }) => kind === "subscription");
  expect(passed.map(({ name }) => name).toSorted()).toEqual(["chat.impersonateStream", "stream.connect"]);
});

test("a void output refuses a value its producer starts returning", () => {
  const star = mountedOutputs().find(({ name }) => name === "chat.star")?.output;
  if (star === undefined) {
    throw new Error("chat.star declares no output parser");
  }
  expect(z.safeParse(star, undefined).success).toBe(true);
  expect(z.safeParse(star, { starred: true }).success).toBe(false);
});
