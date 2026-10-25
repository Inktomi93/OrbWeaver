import { QueryBoundary } from "@orb/client/components";
import { requireQueryBoundary, useSuspenseQuery } from "@orb/client/data";
import { CtAppDataProviders, CtIsolation } from "@orb/testkit/browser";
import type { ReactElement } from "react";
import { Component } from "react";

requireQueryBoundary();

function Reader(): ReactElement {
  const { data } = useSuspenseQuery({ queryKey: ["boundary-scope-probe"], queryFn: (): Promise<string> => Promise.resolve("loaded value") });
  return <p>{data}</p>;
}

/** Shows the message a throw carries; the production shell shows its own error surface here. */
class Catch extends Component<{ readonly children: ReactElement }, { readonly message: string | null }> {
  override state = { message: null as string | null };
  static getDerivedStateFromError(error: Error): { message: string } {
    return { message: error.message };
  }
  override render(): ReactElement {
    return this.state.message === null ? this.props.children : <p role="alert">{this.state.message}</p>;
  }
}

/** The read under the production QueryBoundary. */
export function ReadInsideBoundaryStory(): ReactElement {
  return (
    <CtIsolation subject="QueryBoundary" isolates="The boundary needs the app data providers, not the section registries.">
      <CtAppDataProviders>
        <QueryBoundary fallback={<p>loading</p>}>
          <Reader />
        </QueryBoundary>
      </CtAppDataProviders>
    </CtIsolation>
  );
}

/** The same read with only a plain Suspense above it, as a region skeleton would be. */
export function ReadOutsideBoundaryStory(): ReactElement {
  return (
    <CtIsolation subject="Suspense" isolates="A plain Suspense above a read is the case under test; no boundary or registry mounts.">
      <CtAppDataProviders>
        <Catch>
          <Reader />
        </Catch>
      </CtAppDataProviders>
    </CtIsolation>
  );
}
