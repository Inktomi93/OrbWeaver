// PersonaPanelSurface (FINAL-Persona §A.6 · owner consolidated-panel brief) — the rail-foot account +
// persona panel. A prop-free @container CONSUMER the ROUTE injects into the app-shell rail-foot slot
// (mirrors the modal-slots seam — no feature→feature import). The rail avatar shows your CURRENT persona
// (#2); clicking opens a generous inline Popover (Discord account-panel energy; NOT a modal, §A.7b):
//   • ACCOUNT strip — a working Log out (`POST /api/auth/logout`) + a reserved identity spot (the client
//     whoami/account UI is the deferred auth feature #50 — NOT built here).
//   • PERSONA header — "playing as <current>" + ＋ New persona.
//   • the persona LIST — each row sets Current on body-click, with inline set-Default / edit / delete
//     (the row owns expand-to-edit + the delete confirm).
//   • "This chat" (§A.6, folded in here — the ONE home for the per-chat picker; NO separate
//     features/chat picker) — present only when a chat is active (`PersonaThisChatSection` reads
//     `state/active-chat-store`); sets the Chat persona (#3), shows/re-pins the Anchor (#4), and the
//     reattribute escape hatch.
//   • a global footer — the switch-notifications pref + restore-from-backup.
// All SERVER state via trpc (persona.* / settings / chat / worldInfo), zero Zustand.

import { blobUrl } from "@orb/contracts/assets";
import { CSRF_HEADER } from "@orb/contracts/identity";
import { personaBackupSchema } from "@orb/contracts/persona";
import type { PersonaId } from "@orb/kit/ids";
import { Avatar } from "@orb/ui/avatar";
import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the @orb/ui/icons subpath; tsc + vite resolve every glyph + Icon fine (the add-member-popover precedent).
import { CircleUser, Drama, Icon, Plus, Star, Upload } from "@orb/ui/icons";
import { Container, Row, Section, Stack } from "@orb/ui/layout";
import { Popover, PopoverPopup, PopoverTrigger } from "@orb/ui/popover";
import { Separator } from "@orb/ui/separator";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import type { Trpc } from "#data";
import { QueryBoundary, useInvalidation, useTRPC } from "#data";
import { notify } from "#lib";
import { PersonaPanelRow } from "../components/persona-panel-row";
import { PersonaThisChatSection } from "../components/persona-this-chat-section";
import { useSetPersonaPrefs, useSetPersonaSeed } from "../hooks/use-persona-identity";
import {
  useCreatePersona,
  useImportPersona,
  useRemovePersona,
} from "../hooks/use-persona-mutations";

type PersonaListItem = inferOutput<Trpc["persona"]["list"]>[number];

function initials(name: string): string {
  const trimmed = name.trim();
  return trimmed === "" ? "?" : trimmed.slice(0, 2).toUpperCase();
}

/** Log out via the always-present server route; hard-redirect to /login on success. */
async function logout(): Promise<void> {
  try {
    const res = await fetch("/api/auth/logout", {
      method: "POST",
      headers: { [CSRF_HEADER]: "1" },
    });
    if (res.ok) {
      globalThis.location.assign("/login");
      return;
    }
  } catch {
    // fall through to the toast
  }
  notify.error("Couldn't log out — try again.");
}

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
    const created = await create.mutateAsync({ input: { name: "New persona", description: "" } });
    setExpandedId(created.id);
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
      <PopoverPopup side="right" align="end" className="w-(--container-cq-sm)">
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
            <Stack gap="field" className="max-h-96 overflow-y-auto">
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
            <Separator />
            <PanelFooter showNotifications={settings.config.persona.showNotifications} />
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
                  {current === null ? <Icon icon={CircleUser} size="md" /> : initials(current.name)}
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

/** The account strip — a reserved identity spot (auth #50) + a working Log out. */
function AccountStrip(): ReactElement {
  return (
    <Row gap="row" align="center" className="justify-between">
      <Row gap="field" align="center" className="min-w-0">
        <Avatar fallbackDelay={0} size="sm">
          <Icon icon={CircleUser} size="sm" />
        </Avatar>
        <Stack gap="field" className="min-w-0">
          <Text weight="medium">Account</Text>
          <Text size="micro" tone="muted">
            Sign-in details arrive with accounts.
          </Text>
        </Stack>
      </Row>
      <Button
        intent="ghost"
        size="sm"
        onClick={(): void => {
          void logout();
        }}
      >
        Log out
      </Button>
    </Row>
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
          {current === null ? <Icon icon={Star} size="sm" /> : initials(current.name)}
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

/** Global persona settings: the notifications pref + restore-from-backup (`persona.import`). */
function PanelFooter({ showNotifications }: { readonly showNotifications: boolean }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const setPrefs = useSetPersonaPrefs({ trpc, invalidation });
  const importPersona = useImportPersona({ trpc, invalidation });
  const fileRef = useRef<HTMLInputElement>(null);

  const onRestoreFile = async (file: File): Promise<void> => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      notify.error("That file isn't valid JSON.");
      return;
    }
    const rawRows = Array.isArray(parsed) ? parsed : [parsed];
    let ok = 0;
    for (const raw of rawRows) {
      const candidate = personaBackupSchema.safeParse(raw);
      if (candidate.success) {
        importPersona.mutate({ input: candidate.data });
        ok += 1;
      }
    }
    notify.info(ok === 0 ? "No valid personas in that file." : `Restoring ${ok} persona(s)…`);
  };

  return (
    <Section heading="Persona settings">
      <Row gap="row" align="center" className="justify-between">
        <Text size="label">Notify me when my persona changes in a chat</Text>
        <Switch
          checked={showNotifications}
          onCheckedChange={(next): void =>
            setPrefs.mutate({ section: "persona", patch: { showNotifications: next } })
          }
        />
      </Row>
      <Row gap="row" align="center" className="justify-between">
        <Text size="label">Restore personas from a backup</Text>
        <Button intent="secondary" size="sm" onClick={(): void => fileRef.current?.click()}>
          <Icon icon={Upload} size="sm" />
          Restore…
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          hidden={true}
          onChange={(event): void => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file !== undefined) {
              void onRestoreFile(file);
            }
          }}
        />
      </Row>
    </Section>
  );
}
