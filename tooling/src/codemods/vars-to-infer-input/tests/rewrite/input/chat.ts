import type { inferInput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";

type StarVars = inferInput<Trpc["chat"]["star"]>;

export const useStar = createEntityMutation<StarVars, unknown>({
  options: (trpc) => trpc.chat.star.mutationOptions(),
  busDriven: true,
});

interface RenameVars {
  readonly chatId: string;
  readonly title: string;
}

export const useRename = createEntityMutation<RenameVars, unknown>({
  options: (trpc) => trpc.chat.rename.mutationOptions(),
  busDriven: true,
});

// A comment above a declaration keeps it for a hand call, even when only the factory read it.
type ReadVars0 = inferInput<Trpc["chat"]["read0"]>;

export const useRead0 = createEntityMutation<ReadVars0, unknown>({
  options: (trpc) => trpc.chat.read0.mutationOptions(),
});

// Still read below, so the alias stays.
type ReadVars = inferInput<Trpc["chat"]["read"]>;

export const useRead = createEntityMutation<ReadVars, unknown>({
  options: (trpc) => trpc.chat.read.mutationOptions(),
  busDriven: true,
});

export function readArgs(vars: ReadVars): ReadVars {
  return vars;
}

// Not a plan site, and not a direct `trpc.a.b.mutationOptions()` options call: both stay.
type RuleActionVars = { readonly ruleId: string; readonly chatId: string | null };

export const useDelete = createEntityMutation<RuleActionVars, unknown>({
  options: (trpc) => withProcedureInput(trpc.chat.delete.mutationOptions(), (vars: RuleActionVars) => ({ ruleId: vars.ruleId })),
});

type OtherVars = { readonly id: string };

export const useOther = createEntityMutation<OtherVars, unknown>({
  options: (trpc) => trpc.chat.other.mutationOptions(),
});

export type KeepVars = inferInput<Trpc["chat"]["keep"]>;

export const useKeep = createEntityMutation<KeepVars, unknown>({
  options: (trpc) => trpc.chat.keep.mutationOptions(),
});
