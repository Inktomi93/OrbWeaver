// The Identity (persona) chrome widget's render — the rail SWITCHER (#866 S4, the frequency law: the rail
// slot carries only what travels with a switch). ONE widget, TWO lenses:
// `presentation:"bar"` is the desktop rail.end avatar chip + popover; `presentation:"sheet"` inlines the
// same grammar into the mobile You sheet. Both render: the WHO-HEAD (who you are playing as) → the SWITCH rows
// (`PersonaSwitchList` — radio-style, with the inline edit door and pin)
// → the ACCOUNT FOOT (the retired account modal's facts + Log out, owner-ruled F-3). The bar lens adds
// the CONTEXTUAL block while a chat room is open: an Applies scope (`Everywhere | This chat`) that routes
// the next switch to the seed pointer vs the per-participant slot, plus the re-attribute escape hatch —
// and the "Manage personas" door into Config (list editing, import/export, lore books and the anchor
// re-pin all live THERE now, not here). All server state via trpc, zero Zustand beyond the shell doors.

import { blobUrl } from "@orb/contracts/assets";
import { initialsFor } from "@orb/kit/initials";
import { Avatar } from "@orb/ui/avatar";
import { Button } from "@orb/ui/button";
import { CircleUser, History, Icon, SlidersHorizontal } from "@orb/ui/icons";
import { Container, Row, Stack } from "@orb/ui/layout";
import { Popover, PopoverClose, PopoverPopup, PopoverTrigger } from "@orb/ui/popover";
import type { SelectItems } from "@orb/ui/select";
import { Select } from "@orb/ui/select";
import { Separator } from "@orb/ui/separator";
import { Text } from "@orb/ui/text";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement, ReactNode } from "react";
import { useState } from "react";
import { QueryBoundary } from "#components";
import type { Trpc } from "#data";
import { useGatedQuery, useInvalidation, useReattributePersona, useTRPC } from "#data";
import { deriveChatTitle, notify } from "#lib";
import type { ChromePresentation } from "#state";
import { closeModal, openConfigTo, useActiveChatId } from "#state";
import { PersonaAccountFoot } from "../components/persona-account-foot.tsx";
import { PersonaSwitchList } from "../components/persona-switch-list.tsx";
import { ChatAnchorRow } from "../components/persona-this-chat-section.tsx";
import { useSetChatActivePersona } from "../hooks/use-chat-persona.ts";
import { useSetPersonaSeed } from "../hooks/use-persona-identity.ts";
import { resolveCurrentPersona } from "../lib/persona-current.ts";

type PersonaListItem = inferOutput<Trpc["persona"]["list"]>[number];
type ChatDetail = inferOutput<Trpc["chat"]["getChat"]>;

/** The next switch's reach — a LOCAL lens on the switch rows, never stored: Everywhere is the seed
 *  pointer (`seeds.currentPersonaId`, the existing playing-as mechanism), This chat is the
 *  per-participant slot (`setActivePersona`). */
type SwitchScope = "everywhere" | "chat";

const SCOPE_ITEMS: SelectItems<SwitchScope> = [
  { label: "Everywhere", value: "everywhere" },
  { label: "This chat", value: "chat" },
];

/** The room's name in the kicker. HOOK: the participant-first room title (the chat header's helper) replaces
 *  this one call when it lands on main. */
function roomLabel(chat: ChatDetail): string {
  return deriveChatTitle(
    chat.title,
    chat.participants.filter((p) => p.kind === "character").map((p) => p.displayName),
  );
}

export interface PersonaPanelSurfaceProps {
  readonly presentation: ChromePresentation;
}

/** The Identity widget's render, keyed to the lens `personaChrome.body(presentation)` asks for. */
export function PersonaPanelSurface({ presentation }: PersonaPanelSurfaceProps): ReactElement {
  return (
    // DELIBERATELY UNRESERVED (#1098). Both lenses are FLOATING bodies — a rail popover and a mobile
    // sheet — so nothing in page flow sits below this to shift, which is the whole point of a reserved
    // box. Reserving would instead inflate the popover to a remembered height before its content exists
    // and hand the positioner a phantom box to place against. The quiet fixed Avatar shared by the
    // pending AND error arms is the considered wait here, and it already never resizes.
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
  const invalidation = useInvalidation();
  const { data: personas } = useSuspenseQuery(trpc.persona.list.queryOptions());
  const { data: settings } = useSuspenseQuery(trpc.settings.getUserSettings.queryOptions());
  const chatId = useActiveChatId();
  // Gated, not suspended: with no chat open the contextual block simply isn't (the board draws none), and
  // the switcher must not block on a room read to switch globally.
  const { data: chat } = useGatedQuery(chatId, (id) => trpc.chat.getChat.queryOptions({ chatId: id }));
  const setSeed = useSetPersonaSeed({ trpc, invalidation });
  const setActive = useSetChatActivePersona({ trpc, invalidation });

  // The SHEET has no contextual block (a phone switch is the Everywhere mechanism), so its scope is fixed.
  const [pickedScope, setPickedScope] = useState<SwitchScope>("everywhere");
  const chatOpen = presentation === "bar" && chatId !== null && chat !== undefined;
  const scope: SwitchScope = chatOpen ? pickedScope : "everywhere";

  const seeds = settings.config.seeds;
  const current = resolveCurrentPersona(personas, seeds);
  const notifyOnChange = settings.config.persona.showNotifications;

  // In a room, who is playing is the SEAT persona (what preset text and your lines use), whatever Applies
  // says; Applies only picks what the next switch writes. With no room open it is the global pointer.
  const seatId = chatOpen ? chat.viewerActivePersonaId : null;
  const playing = (seatId === null ? undefined : personas.find((p) => p.id === seatId)) ?? current;
  const currentId = chatOpen ? seatId : (current?.id ?? null);

  const onSwitch = (persona: PersonaListItem): void => {
    // The marked row is not always the one the scope would write, so a no-op write is skipped here.
    if (persona.id === (scope === "chat" ? seatId : current?.id)) {
      return;
    }
    if (scope === "chat" && chatId !== null) {
      setActive.mutate(
        { chatId, personaId: persona.id },
        {
          onSuccess: (): void => {
            if (notifyOnChange) {
              notify.info(`Now playing as ${persona.name} in this chat.`);
            }
          },
        },
      );
      return;
    }
    setSeed.mutate({ section: "seeds", patch: { currentPersonaId: persona.id } });
  };
  const onPin = (persona: PersonaListItem): void => {
    setSeed.mutate({ section: "seeds", patch: { defaultPersonaId: persona.id } });
  };

  const sections: ReactNode = (
    <Stack gap="row">
      <WhoHead current={playing} />
      <Separator />
      <Stack gap="field">
        <Text voice="kicker">Switch persona</Text>
        <PersonaSwitchList
          cardPinId={chatOpen ? chat.anchorPersonaId : null}
          currentId={currentId}
          defaultId={seeds.defaultPersonaId}
          onPin={onPin}
          onSwitch={onSwitch}
          personas={personas}
          presentation={presentation}
        />
      </Stack>
      {chatOpen ? <ChatScopeBlock chat={chat} notifyOnChange={notifyOnChange} onScopeChange={setPickedScope} personas={personas} scope={pickedScope} /> : null}
      <ManageDoor presentation={presentation} />
      <Separator />
      <PersonaAccountFoot />
    </Stack>
  );

  // The sheet lens: the same grammar inline in the You bottom sheet (no popover, no trigger) — the
  // drawer provides the containment, so this is the mobile persona switcher.
  if (presentation === "sheet") {
    return sections;
  }

  // The bar lens: the desktop rail.end avatar chip, opening the switcher in a side popover.
  return (
    <Popover>
      <PanelTrigger current={current} />
      {/* max-h-(--available-height) caps the whole panel to the viewport, not just a nested list peephole. */}
      {/* aria-label names the popup dialog — it has no visible title element (the body opens with the
          who-head), so a bare role=dialog would be nameless to AT. */}
      <PopoverPopup
        aria-label="Account & personas"
        align="end"
        className="relative max-h-(--available-height) w-(--container-cq-sm) overflow-y-auto overscroll-contain"
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

/** WHO you are playing as — the board's head strip, and the one place "Playing as" is said. */
function WhoHead({ current }: { readonly current: PersonaListItem | null }): ReactElement {
  const avatarSrc = current === null || current.avatarHash === null ? {} : { src: blobUrl(current.avatarHash) };
  return (
    <Row gap="row" align="center" className="min-w-0" data-slot="persona-who-head">
      <Avatar fallbackDelay={0} hueSeed={current?.id ?? "none"} size="md" {...avatarSrc}>
        {current === null ? <Icon icon={CircleUser} size="md" /> : initialsFor(current.name)}
      </Avatar>
      <Stack className="min-w-0 flex-1">
        <Text className="truncate" voice="label">
          {current?.name ?? "No persona yet"}
        </Text>
        <Text className="truncate" voice="gloss">
          {current === null ? "Create one under Manage personas." : "Playing as"}
        </Text>
      </Stack>
    </Row>
  );
}

/** The contextual in-chat block (bar lens, chat open): where the next switch APPLIES, plus re-attribute. */
function ChatScopeBlock({
  chat,
  personas,
  scope,
  onScopeChange,
  notifyOnChange,
}: {
  readonly chat: ChatDetail;
  readonly personas: readonly PersonaListItem[];
  readonly scope: SwitchScope;
  readonly onScopeChange: (scope: SwitchScope) => void;
  readonly notifyOnChange: boolean;
}): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const reattribute = useReattributePersona({ trpc, invalidation });
  const targetId = chat.viewerActivePersonaId;
  const targetName =
    targetId === null
      ? null
      : (personas.find((p) => p.id === targetId)?.name ?? chat.identities.find((e) => e.kind === "persona" && e.id === targetId)?.name ?? null);

  // One call, no pre-read: the server resolves "every user row I authored in this chat" itself
  // (`{kind:"mine"}`). The verb returns no affected-rows count, so the confirming toast names the persona
  // and rides the same showNotifications opt-out as the switch — it fires on the server's ACK.
  const onReattribute = (): void => {
    if (targetId === null) {
      return;
    }
    reattribute.mutate(
      { chatId: chat.id, scope: { kind: "mine" }, personaId: targetId },
      {
        onSuccess: (): void => {
          if (notifyOnChange) {
            notify.info(`Your messages in this chat now read as ${targetName ?? "your persona"}.`);
          }
        },
      },
    );
  };

  return (
    <Stack gap="field" data-slot="persona-chat-scope">
      <Text className="truncate" voice="kicker">
        In {roomLabel(chat)}
      </Text>
      {/* The card pin lands on one of YOUR rows when it is yours; a member's persona has no row here, so the room
          line says it (and the host's re-pin) instead. */}
      {chat.anchorPersonaId !== null && !personas.some((p) => p.id === chat.anchorPersonaId) ? <ChatAnchorRow chat={chat} personas={personas} /> : null}
      <Row gap="row" align="center" className="justify-between">
        <Text voice="label">Applies to</Text>
        <Select<SwitchScope>
          aria-label="Where the next switch applies"
          items={SCOPE_ITEMS}
          layout="inline"
          onValueChange={(picked): void => onScopeChange(picked ?? "everywhere")}
          value={scope}
        />
      </Row>
      <Button disabled={targetId === null || reattribute.isPending} intent="ghost" size="sm" className="justify-start" onClick={onReattribute}>
        <Icon icon={History} size="xs" />
        Re-attribute your messages here{targetName === null ? "" : ` → ${targetName}`}
      </Button>
    </Stack>
  );
}

/** The one door out to the full list — Config → Personas (frequency law: management is not a switch). */
function ManageDoor({ presentation }: { readonly presentation: ChromePresentation }): ReactElement {
  const door = (
    <Button
      className="justify-start"
      intent="ghost"
      size="sm"
      onClick={(): void => {
        openConfigTo("personas");
        // The sheet lens rides the You MODAL — a section navigation under it must also dismiss it (the
        // you-sheet's own door pattern). The bar lens closes via the wrapping PopoverClose.
        if (presentation === "sheet") {
          closeModal();
        }
      }}
    >
      <Icon icon={SlidersHorizontal} size="sm" />
      Manage personas in Settings
    </Button>
  );
  return presentation === "bar" ? <PopoverClose render={door} /> : door;
}
