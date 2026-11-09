// The Presets welcome's "New preset" act: a blank generation preset that opens on create, the same call the list band
// and the empty list make, with the name and kind from one home.

import type { PresetId } from "@orb/kit/ids";
import { useInvalidation, useTRPC } from "#data";
import { NEW_PRESET_KIND, NEW_PRESET_NAME } from "../lib/preset-names.ts";
import { useCreatePreset } from "./use-preset-mutations.ts";

export function useNewPreset(onCreated: (id: PresetId) => void): { readonly create: () => void; readonly pending: boolean } {
  const create = useCreatePreset({ trpc: useTRPC(), invalidation: useInvalidation() });
  return {
    create: (): void => {
      create.mutate({ name: NEW_PRESET_NAME, kind: NEW_PRESET_KIND }, { onSuccess: (created): void => onCreated(created.id) });
    },
    pending: create.isPending,
  };
}
