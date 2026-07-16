// The Identity (persona) chrome widget's render — ONE widget, TWO lenses (shell-chrome-unification.md §B):
// `presentation:"bar"` is the desktop rail.end avatar chip + popover; `presentation:"sheet"` inlines the
// SAME sections (Account strip · Playing-as header · persona rows · this-chat) into the mobile You sheet —
// this is where mobile persona switching lives (the §B ruling-1 gap closing). One data fetch, one section
// stack, two wrappers. Cross-feature reach to auth is a #state write (openModal), never a #features/auth
// import. All server state via trpc, zero Zustand.

import { blobUrl } from "@orb/contracts/assets";
import type { PersonaId } from "@orb/kit/ids";
import { initialsFor } from "@orb/kit/initials";
import { Avatar } from "@orb/ui/avatar";
import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import { ChevronRight, CircleUser, Drama, Icon, Plus, Star } from "@orb/ui/icons";
import { Container, Row, Stack } from "@orb/ui/layout";
import { Popover, PopoverPopup, PopoverTrigger } from "@orb/ui/popover";
import { Separator } from "@orb/ui/separator";
import { Text } from "@orb/ui/text";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement, ReactNode } from "react";
import { useState } from "react";
import type { Trpc } from "#data";
import { QueryBoundary, useInvalidation, useTRPC } from "#data";
import type { ChromePresentation } from "#state";
import { openModal } from "#state";
import { PersonaPanelRow } from "../components/persona-panel-row";
import { PersonaThisChatSection } from "../components/persona-this-chat-section";
import { useSetPersonaSeed } from "../hooks/use-persona-identity";
import { useCreatePersona, useRemovePersona } from "../hooks/use-persona-mutations";

type PersonaListItem = inferOutput<Trpc["persona"]["list"]>[number];

/** The Identity widget's render, keyed to the lens `personaChrome.body(presentation)` asks for. */
export function PersonaPanelSurface({ presentation }: { readonly presentation: ChromePresentation }): ReactElement {
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

function PanelBody({ presentation }: { readonly presentation: ChromePresentation }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const setSeed = useSetPersonaSeed({ trpc, invalidation });
  const create = useCreatePersona({ trpc, invalidation });
  const remove = useRemovePersona({ trpc, invalidation });
  const { data: personas } = useSuspenseQuery(trpc.persona.list.queryOptions());
  const { data: settings } = useSuspenseQuery(trpc.settings.getUserSettings.queryOptions());

  const [expandedId, setExpandedId] = useState<PersonaId | null>(null);
  const currentId = settings.config.seeds.currentPersonaId;
  const defaultId = settings.config.seeds.defaultPersonaId;
  // Mirrors useViewer.currentPersona: current-pointer -> default-pointer -> first owned -> null.
  const current = personas.find((persona) => persona.id === currentId) ?? personas.find((persona) => persona.id === defaultId) ?? personas[0] ?? null;

  const setCurrent = (personaId: PersonaId): void => {
    setSeed.mutate({ section: "seeds", patch: { currentPersonaId: personaId } });
  };
  const onCreate = async (): Promise<void> => {
    try {
      const created = await create.mutateAsync({ input: { name: "New persona", description: "" } });
      setExpandedId(created.id);
    } catch {
      // `createEntityMutation`'s errorToast already surfaced the failure — nothing to expand.
    }
  };
  const onDelete = (personaId: PersonaId): void => {
    remove.mutate({ personaId });
    if (expandedId === personaId) {
      setExpandedId(null);
    }
  };

  // The ONE section stack both lenses render — the desktop popover body and the mobile sheet inline.
  const sections: ReactNode = (
    <Stack gap="row">
      <AccountStrip />
      <Separator />
      <PersonaHeader
        current={current}
        onNew={(): void => {
          void onCreate();
        }}
      />
      <Separator />
      <Text size="micro" tone="muted" transform="caps">
        Your personas
      </Text>
      <Stack gap="field">
        {personas.length === 0 ? (
          <EmptyState
            action={
              <Button
                intent="primary"
                size="sm"
                onClick={(): void => {
                  void onCreate();
                }}
              >
                <Icon icon={Plus} size="sm" />
                Create persona
              </Button>
            }
            icon={<Icon icon={Drama} size="md" />}
            title="No personas yet"
            description="Create one to start speaking as a distinct identity."
          />
        ) : (
          personas.map((persona) => (
            <PersonaPanelRow
              key={persona.id}
              persona={persona}
              isCurrent={persona.id === current?.id}
              isDefault={persona.id === defaultId}
              expanded={persona.id === expandedId}
              onSetCurrent={(): void => setCurrent(persona.id)}
              onSetDefault={(): void => setSeed.mutate({ section: "seeds", patch: { defaultPersonaId: persona.id } })}
              onToggleExpand={(): void => setExpandedId((prev) => (prev === persona.id ? null : persona.id))}
              onDelete={(): void => onDelete(persona.id)}
            />
          ))
        )}
      </Stack>
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
      <PopoverPopup aria-label="Account & personas" align="end" className="max-h-(--available-height) w-(--container-cq-sm) overflow-y-auto" side="right">
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
        <Text weight="medium">Account</Text>
      </Row>
      <Icon icon={ChevronRight} size="sm" />
    </Button>
  );
}

/** The "playing as" identity + the create affordance. */
function PersonaHeader({ current, onNew }: { readonly current: PersonaListItem | null; readonly onNew: () => void }): ReactElement {
  const avatarSrc = current === null || current.avatarHash === null ? {} : { src: blobUrl(current.avatarHash) };
  return (
    <Row gap="row" align="center" className="justify-between">
      <Row gap="field" align="center" className="min-w-0">
        <Avatar fallbackDelay={0} hueSeed={current?.id ?? "none"} size="sm" {...avatarSrc}>
          {current === null ? <Icon icon={Star} size="sm" /> : initialsFor(current.name)}
        </Avatar>
        <Stack gap="field" className="min-w-0">
          <Text size="micro" tone="muted" transform="caps">
            Playing as
          </Text>
          <Text weight="medium" className="truncate">
            {current === null ? "No persona yet" : current.name}
          </Text>
        </Stack>
      </Row>
      <Button intent="primary" size="sm" onClick={onNew}>
        <Icon icon={Plus} size="sm" />
        New persona
      </Button>
    </Row>
  );
}
