// createRegistryContext — the ONE mint for a registry React context (client-architecture-lockdown.md
// §5–§8, derive-modernization-audit.md §W3). The four registries (section/modal/settings-pane/chrome)
// share a byte-identical context+read-hook+provider trio over a `Registry`/`ContributorRegistry` value;
// this mint IS that trio, so a new registry is a one-line call instead of a hand-rolled trio that drifts.
// Sealed by G26 `registry-context-via-mint`: a `createContext` typed over a `*Registry` OUTSIDE this file
// is RED (the raw-path door D72 closes in the same wave). This is the SANCTIONED registry-context factory
// home — biome.json exempts it from `noComponentHookFactories` (the hook + Provider are minted here on
// purpose, the create-gated-store precedent for a footgun's single blessed home).

import type { Context, ReactElement, ReactNode } from "react";
import { createContext, useContext } from "react";

/** The trio a `createRegistryContext` call yields: the raw Context (assembled at main.tsx, G8), the read
 *  hook (throws when no Provider is mounted), and the Provider that delivers the registry down. */
export interface RegistryContext<R> {
  readonly Context: Context<R | null>;
  readonly useRegistry: () => R;
  readonly Provider: (props: { readonly value: R; readonly children: ReactNode }) => ReactElement;
}

/** Mint a registry context trio. `name` names the registry in the no-Provider error only; `R` is the
 *  registry view type (`Registry<Id, Def>` or `ContributorRegistry<Def>`). */
export function createRegistryContext<R>(name: string): RegistryContext<R> {
  const RegistryCtx = createContext<R | null>(null);
  function useRegistry(): R {
    const registry = useContext(RegistryCtx);
    if (registry === null) {
      throw new Error(`${name}: no Provider mounted (assemble the registry in main.tsx)`);
    }
    return registry;
  }
  function Provider({ value, children }: { readonly value: R; readonly children: ReactNode }): ReactElement {
    return <RegistryCtx value={value}>{children}</RegistryCtx>;
  }
  return { Context: RegistryCtx, useRegistry, Provider };
}
