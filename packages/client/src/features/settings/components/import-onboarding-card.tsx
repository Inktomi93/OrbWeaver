// import-onboarding-card — the first-run "bring your SillyTavern stuff over" home card, a dismissible
// card the route composes onto the Chats landing (the permanent entry is the Backup & Restore settings
// pane). Freshness is a pure render derivation — the card shows only for a fresh account that hasn't
// dismissed it; Upload opens the import flow and dismisses, the X just dismisses. Dismiss is
// device-local, no server onboarding latch.
//
// Reads the same chat.listChats query the landing suspends on (non-suspense here — never blocks the
// landing), so the cache dedupes: N readers, one fetch.

import { Button } from "@orb/ui/button";
import { Card } from "@orb/ui/card";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the @orb/ui/icons subpath; tsc + vite resolve every glyph + Icon fine (the chat-landing-surface.tsx precedent).
import { Archive, Icon, Upload, X } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useTRPC } from "#data";
import { testId } from "#lib";
import { dismissImportOnboarding, openSettingsTo, useImportOnboardingDismissed } from "#state";

const BACKUP_CATEGORY = "backup";

/** The dismissible first-run import card — renders `null` unless the account is fresh + undismissed. */
export function ImportOnboardingCard(): ReactElement | null {
  const trpc = useTRPC();
  const dismissed = useImportOnboardingDismissed();
  const chatsQuery = useQuery(trpc.chat.listChats.queryOptions({}));
  const fresh = chatsQuery.data !== undefined && chatsQuery.data.length === 0;
  if (dismissed || !fresh) {
    return null;
  }

  const startImport = (): void => {
    openSettingsTo(BACKUP_CATEGORY);
    dismissImportOnboarding();
  };

  return (
    <Stack align="center" padding="section" className="w-full pb-0">
      <Card
        padding="section"
        className="@container w-full max-w-(--width-shell-content)"
        data-testid={testId("importOnboardingCard")}
      >
        <Row
          align="center"
          gap="section"
          justify="between"
          className="@max-md:flex-col @max-md:items-start"
        >
          <Row align="center" gap="row" className="min-w-0">
            <Icon icon={Archive} size="lg" className="text-primary shrink-0" />
            <Stack gap="field" className="min-w-0">
              <Text size="body" weight="semibold">
                Bring your SillyTavern stuff over
              </Text>
              <Text size="body" tone="muted">
                Upload your ST export zip — characters, chats, personas, and lorebooks all come
                across.
              </Text>
            </Stack>
          </Row>
          <Row align="center" gap="row" className="shrink-0">
            <Button
              intent="primary"
              onClick={startImport}
              data-testid={testId("importOnboardingUpload")}
            >
              <Icon icon={Upload} size="sm" />
              Upload
            </Button>
            <Button
              intent="ghost"
              aria-label="Dismiss"
              onClick={dismissImportOnboarding}
              data-testid={testId("importOnboardingDismiss")}
            >
              <Icon icon={X} size="sm" />
            </Button>
          </Row>
        </Row>
      </Card>
    </Stack>
  );
}
