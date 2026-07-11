// The /admin/* pane. GATED (router.tsx `beforeLoad: requireAdminRole` — authed + owner ∪ admin; a plain
// user is bounced home before mount), but the user-admin SURFACES are their own lane
// (`features/user-admin` is still a reserved stub) — this body is the honest placeholder until they
// land. PLAIN import for now: `lazyRouteComponent` earns its keep once this is a real, heavy bundle.

import { Stack } from "@orb/ui/layout";
import { Heading, Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { testId } from "#lib";

export function AdminPage(): ReactElement {
  return (
    <Stack
      align="center"
      justify="center"
      gap="block"
      className="min-h-dvh bg-background text-foreground"
      data-testid={testId("adminPage")}
    >
      <Heading level={1}>admin</Heading>
      <Text size="label" tone="muted">
        User administration surfaces land with the user-admin lane.
      </Text>
    </Stack>
  );
}
