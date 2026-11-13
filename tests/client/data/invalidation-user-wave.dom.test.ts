// @subject packages/client/src/data/invalidation.ts
import type { Invalidation } from "@orb/client/data";
import { useInvalidation } from "@orb/client/data";
import { AppDataProviders, createClientRuntime } from "@orb/testkit/browser";
import { expect, test } from "@orb/testkit/node";
import { makeTagView } from "@orb/testkit/node/helpers";
import { QueryObserver } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { vi } from "vitest";

const TAG_READ = "tag.listTags";

function CaptureInvalidation({ facades }: { readonly facades: Invalidation[] }): null {
  facades.push(useInvalidation(), useInvalidation());
  return null;
}

test("a burst of user-bus frames across hook facades refetches an open read once", async () => {
  const runtime = createClientRuntime("http://user-wave.test/api/trpc");
  const facades: Invalidation[] = [];
  // biome-ignore lint/correctness/noChildrenProp: The native createElement overload requires the provider's required children prop in its props argument.
  renderToString(createElement(AppDataProviders, { runtime, children: createElement(CaptureInvalidation, { facades }) }));
  const [invalidation, otherFacade] = facades;
  if (invalidation === undefined || otherFacade === undefined) {
    throw new Error("The production providers did not expose invalidation");
  }
  const before = [makeTagView({ name: "Before the burst" })];
  const after = [makeTagView({ name: "After the burst" })];
  // Each procedure the batch link sends counts as one read, so a burst batched into one request still counts each.
  let reads = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>((input) => {
      const url = input instanceof Request ? input.url : String(input);
      const procedures = new URL(url).pathname.slice("/api/trpc/".length).split(",");
      if (procedures.some((procedure) => procedure !== TAG_READ)) {
        return Promise.reject(new Error(`Unscripted user-wave request: ${url}`));
      }
      return Promise.resolve(
        Response.json(
          procedures.map(() => {
            reads += 1;
            return { result: { data: reads === 1 ? before : after } };
          }),
        ),
      );
    }),
  );
  const options = runtime.trpcProxy.tag.listTags.queryOptions();
  const unsubscribe = new QueryObserver(runtime.queryClient, options).subscribe(() => undefined);
  try {
    await runtime.queryClient.query(options);
    expect(reads).toBe(1);
    invalidation.invalidateUser({ type: "tagsChanged" });
    otherFacade.invalidateUser({ type: "tagsChanged" });
    invalidation.invalidateUser({ type: "tagsChanged" });
    await vi.waitFor(() => {
      expect(runtime.queryClient.getQueryData(options.queryKey)).toEqual(after);
      expect(runtime.queryClient.getQueryState(options.queryKey)?.fetchStatus).toBe("idle");
    });
    expect(reads).toBe(2);
  } finally {
    unsubscribe();
    runtime.queryClient.clear();
    vi.unstubAllGlobals();
  }
});
