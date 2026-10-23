import { connectionsListSection } from "@orb/client/features/credentials";
import { CtClientProviders, CtConfigGroupBody } from "@orb/testkit/browser/ct-data-providers.tsx";
import { isolationRegistry } from "@orb/testkit/browser/ct-isolation.ts";
import type { ReactElement } from "react";

const sections = isolationRegistry("configSections", "isolates connection editor cache controls from unrelated settings contributions", [
  connectionsListSection,
]);

export function ConnectionPromptCacheStory({ width }: { readonly width: number }): ReactElement {
  return (
    <CtClientProviders>
      <div style={{ width, overflow: "visible" }}>
        <CtConfigGroupBody anchor={connectionsListSection.anchor} sections={sections} />
      </div>
    </CtClientProviders>
  );
}
