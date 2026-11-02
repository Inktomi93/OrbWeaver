import { CtClientProviders, CtConfigGroupBody, configSections, isolationRegistry } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import { Container } from "@orb/ui/layout";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactElement } from "react";

// The live room refetches `workloads.list` when a job settles; this stands in for that event while the dialog stays open.
function ReloadReads({ name }: { readonly name: string }): ReactElement {
  const queryClient = useQueryClient();
  return (
    <Button
      onClick={(): void => {
        queryClient.invalidateQueries().catch(globalThis.reportError);
      }}
    >
      {name}
    </Button>
  );
}

/** The registered production jobs section, with a door to refetch its reads from outside the open dialog. */
export function RunDependencyStory({ reloadName }: { readonly reloadName: string }): ReactElement {
  const section = configSections.get("workloads-jobs");
  const sections = isolationRegistry("configSections", "isolates the run dialog from unrelated settings sections", [section]);
  return (
    <CtClientProviders>
      <Container style={{ inlineSize: 960 }}>
        <ReloadReads name={reloadName} />
        <CtConfigGroupBody anchor={section.anchor} sections={sections} />
      </Container>
    </CtClientProviders>
  );
}
