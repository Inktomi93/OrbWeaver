// The Identity (persona) chrome widget's render — ONE widget, TWO lenses (shell-chrome-unification.md §B):
// `presentation:"bar"` is the desktop rail.end avatar chip + popover; `presentation:"sheet"` inlines the
// SAME sections (Account strip · roster · this-chat) into the mobile You sheet — this is where mobile
// persona switching lives (the §B ruling-1 gap closing). One data fetch, one section stack, two wrappers.
// The roster and the this-chat section are the SAME components the Personas config group registers as
// anchored sections (config-revamp-design.md §6.8.2) — three mounts, one anatomy; only the config mount
// stamps anchor ids. Cross-feature reach to auth is a #state write (openModal), never a #features/auth
// import. All server state via trpc, zero Zustand.

import { blobUrl } from "@orb/contracts/assets";
import { initialsFor } from "@orb/kit/initials";
import { Avatar } from "@orb/ui/avatar";
import { Button } from "@orb/ui/button";
import { ChevronRight, CircleUser, Icon } from "@orb/ui/icons";
import { Container, Row, Stack } from "@orb/ui/layout";
import { Popover, PopoverPopup, PopoverTrigger } from "@orb/ui/popover";
import { Separator } from "@orb/ui/separator";
import { Text } from "@orb/ui/text";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement, ReactNode } from "react";
import type { Trpc } from "#data";
import { QueryBoundary, useTRPC } from "#data";
import type { ChromePresentation } from "#state";
import { openModal } from "#state";
import { PersonaRoster } from "../components/persona-roster.tsx";
import { PersonaThisChatSection } from "../components/persona-this-chat-section.tsx";
import { resolveCurrentPersona } from "../lib/persona-current.ts";

type PersonaListItem = inferOutput<Trpc["persona"]["list"]>[number];

export interface PersonaPanelSurfaceProps {
  readonly presentation: ChromePresentation;
}

/** The Identity widget's render, keyed to the lens `personaChrome.body(presentation)` asks for. */
export function PersonaPanelSurface({ presentation }: PersonaPanelSurfaceProps): ReactElement {
  return (
    <QueryBoundary
      fallback={
        <Avatar fallbackDelay={0} size="md">
          <Icon icon={CircleUser} size="md" />
        </Avatar>
      }
      renderError={(): ReactElement => (
        <Avatar fallbackDelay={0} size="md">
          <Icon icon={CircleUser} size="md" />
        </Avatar>
      )}
    >
      <PanelBody presentation={presentation} />
    </QueryBoundary>
  );
}

function PanelBody({ presentation }: PersonaPanelSurfaceProps): ReactElement {
  const trpc = useTRPC();
  const { data: personas } = useSuspenseQuery(trpc.persona.list.queryOptions());
  const { data: settings } = useSuspenseQuery(trpc.settings.getUserSettings.queryOptions());
  const current = resolveCurrentPersona(personas, settings.config.seeds);

  // The ONE section stack both lenses render — the desktop popover body and the mobile sheet inline.
  const sections: ReactNode = (
    <Stack gap="row">
      <AccountStrip />
      <Separator />
      <PersonaRoster />
      <PersonaThisChatSection />
    </Stack>
  );

  // The sheet lens: the same sections inline in the You bottom sheet (no popover, no trigger) — the
  // drawer provides the containment, so this is the mobile persona switcher.
  if (presentation === "sheet") {
    return sections;
  }

  // The bar lens: the desktop rail.end avatar chip, opening the sections in a side popover.
  return (
    <Popover>
      <PanelTrigger current={current} />
      {/* max-h-(--available-height) caps the whole panel to the viewport, not just a nested list peephole. */}
      {/* aria-label names the popup dialog — it has no visible title element (the body opens with the
          Account strip), so a bare role=dialog would be nameless to AT. */}
      <PopoverPopup
        aria-label="Account & personas"
        align="end"
        className="relative max-h-(--available-height) w-(--container-cq-sm) overflow-y-auto"
        side="right"
      >
        <Container size="md">{sections}</Container>
      </PopoverPopup>
    </Popover>
  );
}

/** The rail avatar button that opens the panel — shows the Current persona. */
function PanelTrigger({ current }: { readonly current: PersonaListItem | null }): ReactElement {
  const avatarSrc = current === null || current.avatarHash === null ? {} : { src: blobUrl(current.avatarHash) };
  const label = current === null ? "Account & personas" : `Playing as ${current.name}`;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <PopoverTrigger
            render={
              <Button intent="ghost" size="icon" aria-label={label}>
                <Avatar fallbackDelay={0} hueSeed={current?.id ?? "none"} size="md" {...avatarSrc}>
                  {current === null ? <Icon icon={CircleUser} size="md" /> : initialsFor(current.name)}
                </Avatar>
              </Button>
            }
          />
        }
      />
      <TooltipPopup side="right">{label}</TooltipPopup>
    </Tooltip>
  );
}

/** Opens the account modal via `#state` write (never a `#features/auth` import). */
function AccountStrip(): ReactElement {
  return (
    <Button intent="ghost" className="w-full justify-between" onClick={(): void => openModal("account")}>
      <Row gap="field" align="center" className="min-w-0">
        <Avatar fallbackDelay={0} size="sm">
          <Icon icon={CircleUser} size="sm" />
        </Avatar>
        {/* RATIFIED raw axes (#582, the character-facet-row precedent): the strip's own name, one step
            under `promoted` — body step at medium, deliberately. */}
        <Text weight="medium">Account</Text>
      </Row>
      <Icon icon={ChevronRight} size="sm" />
    </Button>
  );
}
