// Isolated client mounts reuse production runtime, assembly and providers; variants name their isolated subject.

import { useSettingsViewerView } from "@orb/client/data";
import { AppToaster, contextToggleChrome } from "@orb/client/features/app-shell";
import { makeCharactersSection } from "@orb/client/features/character";
import { ChatsWithCharacterPane, makeChatsSection } from "@orb/client/features/chat";
import { makeConfigSection } from "@orb/client/features/config";
import type {
  CharacterDetailContribution,
  ChatContextState,
  ChatSurfaceContribution,
  ContextRegionDef,
  ContextTabDef,
  ContributorRegistry,
  ListPaneHeaderView,
} from "@orb/client/lib";
import { createToastNotify, defineContextTabs, leaseNotify } from "@orb/client/lib";
import type { ChromeEntry, ConfigGroupId, ConfigSectionContribution, ModalSlotId, SectionDefinition, SectionId, SectionSelection } from "@orb/client/state";
import { assembleChrome, ConfigSectionRegistryProvider, resolveConfigSections } from "@orb/client/state";
import { Container, Stack } from "@orb/ui/layout";
import { createToastManager, ToastProvider } from "@orb/ui/toast";
import type { ReactElement, ReactNode } from "react";
import { createContext, Fragment, use, useLayoutEffect, useState } from "react";
import { placeholderConfigGroups } from "./ct-config-groups.ts";
import {
  AppDataProviders,
  AuthedProviders,
  chatSettingsSections,
  chatSurfaceContributors,
  configSections,
  createAuthedComposition,
  toolRenderers,
} from "./ct-door.ts";
import { isolationRegistry } from "./ct-isolation.ts";
import type { CtRuntimeOptions } from "./ct-runtime.ts";
import { CtRuntimeContext, useCtRuntime } from "./ct-runtime.ts";

const CtCompositionContext = createContext<ReturnType<typeof createAuthedComposition> | null>(null);

/** Query timing overrides stay at the external mount boundary; production caches, error handling and transport remain real. */
export function CtDataProviders({ children, refetchOnWindowFocus = true, ...options }: CtRuntimeOptions & { readonly children: ReactNode }): ReactElement {
  const runtime = useCtRuntime({ ...options, refetchOnWindowFocus });
  return (
    <CtRuntimeContext value={runtime}>
      <AppDataProviders runtime={runtime}>{children}</AppDataProviders>
    </CtRuntimeContext>
  );
}

/** Mount the unmodified production data defaults for error recovery and notification subjects. */
export function CtAppDataProviders({ children, ...options }: CtRuntimeOptions & { readonly children: ReactNode }): ReactElement {
  const runtime = useCtRuntime(options);
  return (
    <CtRuntimeContext value={runtime}>
      <AppDataProviders runtime={runtime}>{children}</AppDataProviders>
    </CtRuntimeContext>
  );
}

function useCtComposition(): { readonly runtime: ReturnType<typeof useCtRuntime>; readonly composition: ReturnType<typeof createAuthedComposition> } {
  const runtime = useCtRuntime();
  const inherited = use(CtCompositionContext);
  const [composition] = useState(() => inherited ?? createAuthedComposition(runtime));
  return { runtime, composition };
}

function CompositionProviders({
  runtime,
  composition,
  children,
}: {
  readonly runtime: ReturnType<typeof useCtComposition>["runtime"];
  readonly composition: ReturnType<typeof createAuthedComposition>;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <CtRuntimeContext value={runtime}>
      <AppDataProviders runtime={runtime}>
        <CtCompositionContext value={composition}>
          <AuthedProviders composition={composition}>{children}</AuthedProviders>
        </CtCompositionContext>
      </AppDataProviders>
    </CtRuntimeContext>
  );
}

/** Deliver every authenticated registry through the same provider stack the lazy production route uses. */
export function CtRealSectionRegistry({ children }: { readonly children: ReactNode }): ReactElement {
  const { runtime, composition } = useCtComposition();
  return (
    <CompositionProviders runtime={runtime} composition={composition}>
      {children}
    </CompositionProviders>
  );
}

function NoticeBinding({ children }: { readonly children: ReactNode }): ReactElement {
  const [manager] = useState(() => createToastManager());
  const [notice] = useState(() => createToastNotify(manager));
  useLayoutEffect(() => leaseNotify(notice)[Symbol.dispose], [notice]);
  return <ToastProvider toastManager={manager}>{children}</ToastProvider>;
}

/** The maintained client mount door retains production defaults and registries, with only external wires controlled by the caller. */
export function CtClientProviders({ children, ...options }: CtRuntimeOptions & { readonly children: ReactNode }): ReactElement {
  return (
    <CtAppDataProviders {...options}>
      <NoticeBinding>
        <CtRealSectionRegistry>{children}</CtRealSectionRegistry>
        <AppToaster />
      </NoticeBinding>
    </CtAppDataProviders>
  );
}

/** Isolate the configuration host's section context without replacing its contributed production roster. */
export function CtRealConfigSectionRegistry({ children }: { readonly children: ReactNode }): ReactElement {
  return <ConfigSectionRegistryProvider value={configSections}>{children}</ConfigSectionRegistryProvider>;
}

/** Isolate a group's contributed section bodies; the complete configuration host owns its fold and navigation. */
export function CtConfigGroupBody({
  anchor,
  sections,
}: {
  readonly anchor: ConfigGroupId;
  readonly sections: ContributorRegistry<ConfigSectionContribution>;
}): ReactElement {
  const viewer = useSettingsViewerView();
  // The canonical CONTENT sequence (`ConfigSectionPartition`): plain sections, then the advanced-fold
  // cohort. The story has no fold chrome of its own, so it renders the flattened order — which is exactly
  // what a foldless host group paints.
  const { primary, advanced } = resolveConfigSections(sections, anchor, viewer);
  const resolved = [...primary, ...advanced];
  return (
    <ConfigSectionRegistryProvider value={sections}>
      {/* The host's CONTENT root is a `Container` (a `@container` root, config-content-surface.tsx), so every
          section's container queries (a plugin row's `@max-md` stacking, a role row's clusters) resolve
          against the pane — the same root here, or a narrow story measures a layout that does not exist. */}
      <Container className="h-full min-h-0">
        <Stack gap="section">
          {resolved.map((section) => (
            <Fragment key={section.id}>{section.node}</Fragment>
          ))}
        </Stack>
      </Container>
    </ConfigSectionRegistryProvider>
  );
}

const railStandInPersona: ChromeEntry = {
  id: "persona-identity",
  label: "Account",
  zone: "rail.end",
  order: 50,
  mobile: "sheet",
  behavior: { kind: "widget", body: (): ReactElement => <button type="button">Account</button> },
};
const railStandInNotifications: ChromeEntry = {
  id: "notifications-bell",
  label: "Notifications",
  zone: "topbar.trail",
  mobile: "sheet",
  useBadge: (): number => 0,
  behavior: { kind: "widget", body: (): ReactElement => <button type="button">Notifications</button> },
};

/** Isolate rail anatomy from data-backed chrome widgets while retaining real section and modal identity. */
export function CtStandInChromeRegistry({ children }: { readonly children: ReactNode }): ReactElement {
  const { runtime, composition: base } = useCtComposition();
  const chrome = isolationRegistry(
    "chrome",
    "isolates rail geometry from data backed widgets",
    assembleChrome({
      sections: base.sections.list(),
      modals: base.modals.list(),
      widgets: [railStandInNotifications, contextToggleChrome, railStandInPersona],
    }),
  );
  return (
    <CompositionProviders runtime={runtime} composition={{ ...base, chrome }}>
      {children}
    </CompositionProviders>
  );
}

/** Isolate the configuration host's declared placeholder branch over canonical group identity. */
export function CtPlaceholderGroupRegistry({ children }: { readonly children: ReactNode }): ReactElement {
  const { runtime, composition: base } = useCtComposition();
  const sections = isolationRegistry(
    "sections",
    "isolates the config host placeholder branch",
    base.sections.list().map((section) => (section.id === "config" ? makeConfigSection(placeholderConfigGroups) : section)),
  );
  return (
    <CompositionProviders runtime={runtime} composition={{ ...base, sections }}>
      {children}
    </CompositionProviders>
  );
}

/** A named section-context isolation consumes the caller's registry rather than assembling another roster. */
export function CtConfigSectionRegistry({
  sections,
  children,
}: {
  readonly sections: ContributorRegistry<ConfigSectionContribution>;
  readonly children: ReactNode;
}): ReactElement {
  return <ConfigSectionRegistryProvider value={sections}>{children}</ConfigSectionRegistryProvider>;
}

/** Isolate contributed chat bodies through the real chat section factory, retaining every other production section. */
export function CtChatContributorSectionRegistry({
  contextContributors,
  contextRegions,
  surfaceContributors,
  children,
}: {
  readonly contextContributors?: ContributorRegistry<ContextTabDef<ChatContextState>>;
  readonly contextRegions?: ContributorRegistry<ContextRegionDef<ChatContextState>>;
  readonly surfaceContributors?: ContributorRegistry<ChatSurfaceContribution>;
  readonly children: ReactNode;
}): ReactElement {
  const { runtime, composition: base } = useCtComposition();
  const chats = makeChatsSection({
    contextTabs: contextContributors ?? base.chatContextContributors,
    contextRegions: contextRegions ?? base.chatContextRegions,
    surfaces: surfaceContributors ?? chatSurfaceContributors,
    toolRenderers,
    settingsSections: chatSettingsSections,
  });
  const sections = isolationRegistry(
    "sections",
    "isolates the chat contributor integration subject",
    base.sections.list().map((section) => (section.id === "chats" ? chats : section)),
  );
  return (
    <CompositionProviders runtime={runtime} composition={{ ...base, sections }}>
      {children}
    </CompositionProviders>
  );
}

/** Isolate character contributors through the real feature factory without copying the section table. */
export function CtCharacterContributorSectionRegistry({
  detailContributors,
  children,
}: {
  readonly detailContributors: ContributorRegistry<CharacterDetailContribution>;
  readonly children: ReactNode;
}): ReactElement {
  const { runtime, composition: base } = useCtComposition();
  const characters = makeCharactersSection(detailContributors, (view) => <ChatsWithCharacterPane {...view} />);
  const sections = isolationRegistry(
    "sections",
    "isolates the character detail contribution subject",
    base.sections.list().map((section) => (section.id === "characters" ? characters : section)),
  );
  return (
    <CompositionProviders runtime={runtime} composition={{ ...base, sections }}>
      {children}
    </CompositionProviders>
  );
}

/** Isolate modal body geometry while preserving the real modal triggers and presentation. */
export function CtFakeModalRegistry({ body, children }: { readonly body: (id: ModalSlotId) => ReactElement; readonly children: ReactNode }): ReactElement {
  const { runtime, composition: base } = useCtComposition();
  const modals = isolationRegistry(
    "modals",
    "isolates modal body geometry from feature data",
    base.modals.list().map((modal) => ({ ...modal, body: (): ReactElement => body(modal.id) })),
  );
  return (
    <CompositionProviders runtime={runtime} composition={{ ...base, modals }}>
      {children}
    </CompositionProviders>
  );
}

export interface CtFakeSection {
  readonly withoutList?: boolean;
  readonly list?: ReactNode;
  readonly content?: ReactNode;
  readonly context?: ReactNode;
  /** The section's SELECTION seam for the story (`SectionSelection` — the mobile ONE-SHELL rule's input).
   *  Absent ⇒ the section's REAL seam when it has one, else a never-selected stand-in: a story that injects
   *  a `list` still has to answer "is anything open?", because the shell's rule is not optional. */
  readonly selection?: SectionSelection;
  /** The section-owned TOPBAR header cluster (`SectionDefinition.header`) — production's chats section
   *  supplies avatars + name + a member chip here, and it is what fills the topbar's LEAD. A story that
   *  measures the row needs it, or the lead is one control wide and the defect cannot appear. */
  readonly header?: ReactNode;
  /** The section-owned LIST chrome band (`SectionDefinition.useListHeader`). A story needs it whenever the
   *  assertion is about the band itself — since #493 the LIST landmark is NAMED BY the band's heading
   *  (`LIST_PANE_TITLE_ID`). A story without custom view data uses the section's structural identity. */
  readonly listHeader?: ListPaneHeaderView;
  /** The section's `useSelectionTitle` for the story — absent ⇒ the REAL one when the section has it, else
   *  a `null` stand-in (the shell falls back to the section label). */
  readonly selectionTitle?: () => string | null;
}

/** The stand-in seam for a story-injected list over a section that owns no real selection store: nothing is
 *  ever selected, so the LIST is the mobile screen and there is no back affordance. Module-scope (a fresh
 *  object per render would re-subscribe every commit). */
const CT_NEVER_SELECTED: SectionSelection = {
  subscribe: () => (): void => undefined,
  hasSelection: () => false,
  clear: (): void => undefined,
};

// A shell-only placeholder list has no member to select; its explicit content landing preserves the
// shell fixture's pane-toggle tests without pretending that a member is open.
const CT_CONTENT_LANDING: SectionSelection = {
  subscribe: CT_NEVER_SELECTED.subscribe,
  hasSelection: CT_NEVER_SELECTED.hasSelection,
  clear: CT_NEVER_SELECTED.clear,
  phoneLanding: () => "content",
};

function fakeSection(real: SectionDefinition, slot: CtFakeSection | undefined): SectionDefinition {
  const id = real.id;
  const fallbackContext =
    real.context.kind === "none" ? real.context : defineContextTabs<void>({ useContextState: () => null, tabs: [], header: () => real.rail.label });
  const base = {
    id,
    rail: real.rail,
    // The section's declared PANEL CAPABILITY is shell anatomy, not story content — carry it through so a
    // shell CT sees the real "this section has no LIST pane" arm (home).
    panelDefaults: real.panelDefaults,
    contentInset: real.contentInset,
    placeholder: real.placeholder,
    content: (): ReactNode => slot?.content ?? null,
    context:
      slot?.context !== undefined
        ? { kind: "single" as const, body: (): ReactNode => slot.context, header: (): ReactNode => real.rail.label }
        : fallbackContext,
    useSelectionTitle: slot?.selectionTitle ?? real.useSelectionTitle,
    ...(slot?.header === undefined ? {} : { header: (): ReactNode => slot.header }),
  };
  if (slot?.withoutList === true || (real.list === undefined && slot?.list === undefined)) {
    return base;
  }
  // `list` and `selection` are ONE arm of the definition union (section-registry.ts) — the fake honours that
  // instead of casting around it, so a story exercises the same shell rule production does.
  // `list` + `selection` + `useSelectionTitle` are ONE arm of the definition union (section-registry.ts) —
  // the fake honours all three instead of casting around them, so a story exercises the same shell rule
  // production does. A story-injected list over a section with no real seam gets the never-selected
  // stand-in, whose title is `null` (the shell then prints the section label).
  return {
    ...base,
    list: (): ReactNode => slot?.list ?? null,
    selection: slot?.selection ?? (slot?.list === undefined ? CT_CONTENT_LANDING : (real.selection ?? CT_NEVER_SELECTED)),
    useListHeader: (): ListPaneHeaderView => slot?.listHeader ?? { title: real.rail.label },
    listSearch: { planned: "Isolated shell stories replace roster content." },
  };
}

/** Isolate shell pane anatomy while deriving all section identities and capabilities from production. */
export function CtFakeSectionRegistry({
  sections: slots,
  children,
}: {
  readonly sections?: Partial<Record<SectionId, CtFakeSection>>;
  readonly children: ReactNode;
}): ReactElement {
  const { runtime, composition: base } = useCtComposition();
  const sections = isolationRegistry(
    "sections",
    "isolates shell pane anatomy from feature content",
    base.sections.list().map((section) => fakeSection(section, slots?.[section.id])),
  );
  return (
    <CompositionProviders runtime={runtime} composition={{ ...base, sections }}>
      {children}
    </CompositionProviders>
  );
}
