// import-onboarding-card — the first-run "bring your SillyTavern stuff over" home card (R5 placement: a
// dismissible card the route composes onto the Chats LANDING; the permanent entry is the Backup & Restore
// settings pane). A LEAF component (not a surfaces/ containment-consumer): it establishes no layout box of
// its own and must NOT steal focus on mount (it appears beside the landing hero), so it deliberately lives
// in components/. FRESHNESS is a pure render derivation — the card shows only for a fresh account (zero
// chats yet) that hasn't dismissed it; its "Upload" opens the import flow (Settings → Backup & Restore via
// openSettingsTo) and dismisses, and the X dismisses. Dismiss is device-local (import-onboarding-store) —
// there is no server onboarding latch for it (adding one is a contract change, out of this slice).
//
// It reads the SAME `chat.listChats` query the landing suspends on (a non-suspense read here — the card
// must never block the landing), so the cache dedupes: N readers, one fetch.

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

// The settings category the Upload action deep-links to (the opaque string openSettingsTo carries; the
// settings shell validates it against its own registry — the SETTINGS_CATEGORIES `backup` entry).
const BACKUP_CATEGORY = "backup";

/** The dismissible first-run import card — renders `null` unless the account is fresh + undismissed. */
export function ImportOnboardingCard(): ReactElement | null {
  const trpc = useTRPC();
  const dismissed = useImportOnboardingDismissed();
  // Non-suspense: while it resolves (or for a returning user with chats) the card is simply absent — it
  // never flashes-then-yanks and never blocks the landing behind it.
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
    // Center + column-cap to line up with the landing hero's reading column (the route mounts this above
    // the ChatLandingSurface, which uses the same max width). Pads top/sides; the hero pads below.
    <Stack align="center" padding="section" className="w-full pb-0">
      <Card
        padding="section"
        className="@container w-full max-w-(--width-shell-content)"
        data-testid={testId("importOnboardingCard")}
      >
        {/* Container-query collapse: the card can be full-width (desktop) or ~viewport-narrow (375px). Below
            the @md container width the text+button Row stacks to a column so the heading wraps as normal
            lines and the buttons sit below it — never staircased words with buttons floating mid-paragraph
            (the field/variants @max-md precedent). Desktop (@min-md) keeps the flat between-justified Row. */}
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
