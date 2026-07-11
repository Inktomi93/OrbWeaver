// PersonaPanelSurface (FINAL-Persona §A.6 · rail-foot panel redesign) — the rail-foot account + persona
// panel. A prop-free @container CONSUMER the ROUTE injects into the app-shell rail-foot slot (mirrors the
// modal-slots seam — no feature→feature import). The rail avatar shows your CURRENT persona (#2); clicking
// opens a generous inline Popover (Discord account-panel energy; NOT a modal, §A.7b):
//   • ACCOUNT strip — opens the real `account` modal (features/auth `<AccountSurface>`, route-composed
//     over MODAL_SLOTS.account at home-page.tsx) via `openModal("account")` — the identity card + the
//     ONE mode-aware sign-out (POST /api/auth/logout lives there, `auth-bootstrap.ts`; this panel no
//     longer ships a second copy of that security-sensitive call). The cross-feature reach is a `#state`
//     write, never a `#features/auth` import (the sanctioned seam — the modal-slots pattern).
//   • PERSONA header — "playing as <current>" + ＋ New persona.
//   • the persona LIST — each row sets Current on body-click, with inline avatar/name edit + set-Default /
//     delete / a details disclosure (persona-panel-row.tsx).
//   • "This chat" (§A.6, folded in here — the ONE home for the per-chat picker; NO separate
//     features/chat picker) — present only when a chat is active (`PersonaThisChatSection` reads
//     `state/active-chat-store`); sets the Chat persona (#3), shows/re-pins the Anchor (#4), and the
//     reattribute escape hatch.
// The old "Persona settings" footer (notify toggle + restore-from-backup) MOVED to Settings → USER →
// Personas (features/settings/surfaces/persona-settings-surface.tsx) — those are peripheral prefs, not
// panel content. ONE scroll region: the popup itself caps to the Popover positioner's
// `--available-height` (Base UI-computed) instead of a nested `max-h-96` peephole around the list, so an
// expanded row's details use the full available panel height.
// All SERVER state via trpc (persona.* / settings / chat / worldInfo), zero Zustand.

import { blobUrl } from "@orb/contracts/assets";
import type { PersonaId } from "@orb/kit/ids";
import { initialsFor } from "@orb/kit/initials";
import { Avatar } from "@orb/ui/avatar";
import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the @orb/ui/icons subpath; tsc + vite resolve every glyph + Icon fine (the add-member-popover precedent).
import { ChevronRight, CircleUser, Drama, Icon, Plus, Star } from "@orb/ui/icons";
import { Container, Row, Stack } from "@orb/ui/layout";
import { Popover, PopoverPopup, PopoverTrigger } from "@orb/ui/popover";
import { Separator } from "@orb/ui/separator";
import { Text } from "@orb/ui/text";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import type { Trpc } from "#data";
import { QueryBoundary, useInvalidation, useTRPC } from "#data";
import { openModal } from "#state";
import { PersonaPanelRow } from "../components/persona-panel-row";
import { PersonaThisChatSection } from "../components/persona-this-chat-section";
import { useSetPersonaSeed } from "../hooks/use-persona-identity";
import { useCreatePersona, useRemovePersona } from "../hooks/use-persona-mutations";

type PersonaListItem = inferOutput<Trpc["persona"]["list"]>[number];

/** The rail-foot account + persona panel (route-injected into the app-shell rail-foot slot). */
export function PersonaPanelSurface(): ReactElement {
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
      <PanelBody />
    </QueryBoundary>
  );
}

function PanelBody(): ReactElement {
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
  const current =
    personas.find((persona) => persona.id === currentId) ??
    personas.find((persona) => persona.id === defaultId) ??
    personas[0] ??
    null;

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

  return (
    <Popover>
      <PanelTrigger current={current} />
      {/* max-h-(--available-height): the Popover positioner's own computed budget (Base UI CSS var,
          cascades to this Popup as its DOM descendant) — caps the WHOLE panel to the viewport instead of
          a nested peephole around just the list, so an expanded row's details get the full height. */}
      <PopoverPopup
        align="end"
        className="max-h-(--available-height) w-(--container-cq-sm) overflow-y-auto"
        side="right"
      >
        <Container size="md">
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
            {/* A micro-caps label under the divider — "Playing as" above is your ACTIVE persona; this
                marks the list below as the rest of your available roster, not a repeat of it. */}
            <Text size="micro" tone="muted" transform="caps">
              Your personas
            </Text>
            <Stack gap="field">
              {personas.length === 0 ? (
                <EmptyState
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
                    onSetDefault={(): void =>
                      setSeed.mutate({ section: "seeds", patch: { defaultPersonaId: persona.id } })
                    }
                    onToggleExpand={(): void =>
                      setExpandedId((prev) => (prev === persona.id ? null : persona.id))
                    }
                    onDelete={(): void => onDelete(persona.id)}
                  />
                ))
              )}
            </Stack>
            <PersonaThisChatSection />
          </Stack>
        </Container>
      </PopoverPopup>
    </Popover>
  );
}

/** The rail avatar button that opens the panel — shows the Current persona. */
function PanelTrigger({ current }: { readonly current: PersonaListItem | null }): ReactElement {
  const avatarSrc =
    current === null || current.avatarHash === null ? {} : { src: blobUrl(current.avatarHash) };
  const label = current === null ? "Account & personas" : `Playing as ${current.name}`;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <PopoverTrigger
            render={
              <Button intent="ghost" size="icon" aria-label={label}>
                <Avatar fallbackDelay={0} hueSeed={current?.id ?? "none"} size="md" {...avatarSrc}>
                  {current === null ? (
                    <Icon icon={CircleUser} size="md" />
                  ) : (
                    initialsFor(current.name)
                  )}
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

/** The account strip — opens the real `account` modal (features/auth `<AccountSurface>`: identity + role/
 *  mode badges + the ONE mode-aware sign-out). A `#state` write (`openModal`), never a `#features/auth`
 *  import — the sanctioned cross-feature seam (this panel holds no auth logic of its own). */
function AccountStrip(): ReactElement {
  return (
    <Button
      intent="ghost"
      className="w-full justify-between"
      onClick={(): void => openModal("account")}
    >
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
function PersonaHeader({
  current,
  onNew,
}: {
  readonly current: PersonaListItem | null;
  readonly onNew: () => void;
}): ReactElement {
  const avatarSrc =
    current === null || current.avatarHash === null ? {} : { src: blobUrl(current.avatarHash) };
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
