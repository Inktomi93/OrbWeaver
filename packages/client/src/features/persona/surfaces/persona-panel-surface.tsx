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
import { FileTrigger } from "@orb/ui/file-trigger";
import { ChevronRight, CircleUser, Drama, Icon, Plus, Upload } from "@orb/ui/icons";
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
import { notify } from "#lib";
import type { ChromePresentation } from "#state";
import { openModal } from "#state";
import { PersonaPanelRow } from "../components/persona-panel-row.tsx";
import { PersonaThisChatSection } from "../components/persona-this-chat-section.tsx";
import { useSetPersonaSeed } from "../hooks/use-persona-identity.ts";
import { useCreatePersona, useImportPersonaFile, useRemovePersona } from "../hooks/use-persona-mutations.ts";

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
  const importPersona = useImportPersonaFile({ trpc, invalidation });
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
  // F3: IMPORT is a band affordance beside the ONE primary (the ruled anatomy) — it used to live in a
  // settings pane, three clicks and a different surface away from the personas it restores.
  const onImportFile = async (file: File): Promise<void> => {
    try {
      const restored = await importPersona.mutateAsync({ fileText: await file.text() });
      notify.success(`Restored “${restored.name}”.`);
      setExpandedId(restored.id);
    } catch (error) {
      // The SERVER's refusal reason, rendered as words — "written by a newer version of orbweaver" is a
      // different problem from "that isn't a persona file", and the user can only act on the difference.
      notify.error(error instanceof Error ? error.message : "Couldn't restore the persona.");
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
      {/* ONE HOME FOR THE PLAYING-AS PERSONA (side-eye 2026-08-03 P2). This band used to render the current
          persona's avatar + name under a `PLAYING AS` kicker, 40px above the SAME persona's row in the list
          below — one identity, two anatomies, 40px apart. The row is the better home (it is where you switch,
          and it already carries `aria-current` and the selected tint), so it now says "Playing as" in words
          and the band is what a band is: the collection's name and its two verbs. */}
      <PersonaHeader
        onImport={(file): void => {
          void onImportFile(file);
        }}
        onNew={(): void => {
          void onCreate();
        }}
      />
      <Separator />
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

/** The roster's BAND — its name and its two verbs. The playing-as identity lives on the row (see above). */
const IMPORT_LABEL = "Restore a persona from a backup file";

function PersonaHeader({ onNew, onImport }: { readonly onNew: () => void; readonly onImport: (file: File) => void }): ReactElement {
  return (
    <Row gap="row" align="center" className="justify-between">
      <Text size="micro" tone="muted" transform="caps">
        Your personas
      </Text>
      {/* Exactly ONE primary (New); Import sits beside it as a ghost icon — the preset band's grammar.
          `size="icon"` (not `sm`) so the icon-only trigger keeps the token-driven 44px coarse floor, and the
          native `title` is the SAME string as the aria-label so tooltip and accessible name can't drift. */}
      <Row gap="field" align="center">
        <FileTrigger
          accept="application/json"
          onFilesSelected={([file]): void => {
            if (file !== undefined) {
              onImport(file);
            }
          }}
        >
          {({ open }): ReactElement => (
            <Button aria-label={IMPORT_LABEL} intent="ghost" onClick={open} size="icon" title={IMPORT_LABEL}>
              <Icon icon={Upload} size="sm" />
            </Button>
          )}
        </FileTrigger>
        <Button intent="primary" size="sm" onClick={onNew}>
          <Icon icon={Plus} size="sm" />
          New persona
        </Button>
      </Row>
    </Row>
  );
}
