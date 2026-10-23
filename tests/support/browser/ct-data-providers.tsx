// Isolated client mounts reuse production runtime, assembly and providers; variants name their isolated subject.

import { useSettingsViewerView } from "@orb/client/data";
import { AppToaster } from "@orb/client/features/app-shell";
import type { ContributorRegistry } from "@orb/client/lib";
import { createToastNotify, leaseNotify } from "@orb/client/lib";
import type { ConfigGroupId, ConfigSectionContribution } from "@orb/client/state";
import { ConfigSectionRegistryProvider, resolveConfigSections } from "@orb/client/state";
import { Container, Stack } from "@orb/ui/layout";
import { createToastManager, ToastProvider } from "@orb/ui/toast";
import type { ReactElement, ReactNode } from "react";
import { createContext, Fragment, use, useLayoutEffect, useState } from "react";
import { AppDataProviders, AuthedProviders, createAuthedComposition } from "./ct-door.ts";
import type { CtRuntimeOptions } from "./ct-runtime.ts";
import { CtRuntimeContext, useCtRuntime } from "./ct-runtime.ts";

const CtCompositionContext = createContext<ReturnType<typeof createAuthedComposition> | null>(null);

/** Query timing overrides stay at the external mount boundary; production caches, error handling and transport remain real. */
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
function CtRealSectionRegistry({ children }: { readonly children: ReactNode }): ReactElement {
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

/** Isolate rail anatomy from data-backed chrome widgets while retaining real section and modal identity. */
/** A named section-context isolation consumes the caller's registry rather than assembling another roster. */
/** Isolate character contributors through the real feature factory without copying the section table. */

/** The stand-in seam for a story-injected list over a section that owns no real selection store: nothing is
 *  ever selected, so the LIST is the mobile screen and there is no back affordance. Module-scope (a fresh
 *  object per render would re-subscribe every commit). */
// A shell-only placeholder list has no member to select; its explicit content landing preserves the
// shell fixture's pane-toggle tests without pretending that a member is open.
/** Isolate shell pane anatomy while deriving all section identities and capabilities from production. */
