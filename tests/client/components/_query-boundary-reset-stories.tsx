import { QueryBoundary } from "@orb/client/components";
import { useSuspenseQuery } from "@orb/client/data";
import { CtAppDataProviders, CtIsolation } from "@orb/testkit/browser";
import type { ReactElement } from "react";
import { useDeferredValue } from "react";

const FAILING_KEY = "b";
const READ_DELAY_MS = 50;

// Counts kept outside React, so a story's render can say how often the child rendered and how often the read ran.
const counts = { renders: 0, reads: new Map<string, number>() };

function Thrower({ name }: { readonly name: string }): never {
  counts.renders += 1;
  throw new Error(`render failed for ${name}`);
}

/** A child that throws on render for every key, under a boundary keyed on that key. */
export function ThrowingChildStory({ name }: { readonly name: string }): ReactElement {
  return (
    <CtIsolation subject="QueryBoundary" isolates="The boundary's reset on a key change, with a child that is not a read.">
      <CtAppDataProviders>
        <QueryBoundary
          resetKeys={[name]}
          fallback={<p>loading</p>}
          renderError={(): ReactElement => (
            <p role="alert">
              failed {name} after {counts.renders} renders
            </p>
          )}
        >
          <Thrower name={name} />
        </QueryBoundary>
      </CtAppDataProviders>
    </CtIsolation>
  );
}

function KeyedRead({ name }: { readonly name: string }): ReactElement {
  const { data } = useSuspenseQuery({
    queryKey: ["query-boundary-reset-probe", name],
    retry: false,
    queryFn: async (): Promise<string> => {
      counts.reads.set(name, (counts.reads.get(name) ?? 0) + 1);
      await new Promise((resolve) => setTimeout(resolve, READ_DELAY_MS));
      if (name === FAILING_KEY) {
        throw new Error(`read failed for ${name}`);
      }
      return `loaded ${name}`;
    },
  });
  return <p>{data}</p>;
}

/** A read keyed on a deferred copy of `name`, the shape a search field feeds; the key `b` always fails. */
export function DeferredKeyStory({ name }: { readonly name: string }): ReactElement {
  const deferred = useDeferredValue(name);
  return (
    <CtIsolation subject="QueryBoundary" isolates="The boundary's reset when a deferred key change lands on a failing fresh key.">
      <CtAppDataProviders>
        <QueryBoundary
          resetKeys={[deferred]}
          fallback={<p>loading</p>}
          renderError={(): ReactElement => (
            <p role="alert">
              failed {deferred} after {counts.reads.get(deferred) ?? 0} reads
            </p>
          )}
        >
          <KeyedRead name={deferred} />
        </QueryBoundary>
      </CtAppDataProviders>
    </CtIsolation>
  );
}
