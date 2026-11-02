import type { RegexAttachScope, RegexScriptRow } from "@orb/contracts/regex";
import type { RegexScriptId } from "@orb/kit/ids";
import type { QueryKey } from "@tanstack/react-query";
import type { inferInput, inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";

export const useAttachCharacter = createEntityMutation<inferInput<Trpc["regex"]["attachToCharacter"]>, void>({
  options: (trpc) => trpc.regex.attachToCharacter.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't attach that script to this character.",
});

export const useDetachCharacter = createEntityMutation<inferInput<Trpc["regex"]["detachFromCharacter"]>, { readonly detached: boolean }>({
  options: (trpc) => trpc.regex.detachFromCharacter.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't detach that script from this character.",
});

export const useAttachPreset = createEntityMutation<inferInput<Trpc["regex"]["attachToPreset"]>, void>({
  options: (trpc) => trpc.regex.attachToPreset.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't attach that script to this preset.",
});

export const useDetachPreset = createEntityMutation<inferInput<Trpc["regex"]["detachFromPreset"]>, { readonly detached: boolean }>({
  options: (trpc) => trpc.regex.detachFromPreset.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't detach that script from this preset.",
});

export const useAttachChat = createEntityMutation<inferInput<Trpc["regex"]["attachToChat"]>, void>({
  options: (trpc) => trpc.regex.attachToChat.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't attach that script to this chat.",
});

export const useDetachChat = createEntityMutation<inferInput<Trpc["regex"]["detachFromChat"]>, { readonly detached: boolean }>({
  options: (trpc) => trpc.regex.detachFromChat.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't detach that script from this chat.",
});

/** WHICH read the rewrite is authoritative for — one key per scope arm, exhaustive so a fifth scope is a
 *  compile error rather than a reorder that silently paints stale. */
function scopeReadKey(trpc: Trpc, scope: RegexAttachScope): QueryKey {
  switch (scope.kind) {
    case "global":
      return trpc.regex.listGlobal.queryKey();
    case "character":
      return trpc.regex.listForCharacter.queryKey({ characterId: scope.characterId });
    case "preset":
      return trpc.regex.listForPreset.queryKey({ presetId: scope.presetId });
    case "chat":
      return trpc.regex.listForChat.queryKey({ chatId: scope.chatId });
    default:
      return assertNeverScope(scope);
  }
}

function assertNeverScope(scope: never): never {
  throw new Error(`unhandled regex attach scope: ${JSON.stringify(scope)}`);
}

/** The cached list re-sorted by the order being written. Ids the read doesn't carry are dropped and rows
 *  the write doesn't name keep their relative tail — the verb's own posture (`apply-scope-order.ts`), so
 *  the optimistic paint and the server's answer agree. */
function applyOrder(rows: readonly RegexScriptRow[], orderedIds: readonly RegexScriptId[]): RegexScriptRow[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const named = new Set(orderedIds);
  const moved = orderedIds.flatMap((id) => {
    const row = byId.get(id);
    return row === undefined ? [] : [row];
  });
  return [...moved, ...rows.filter((row) => !named.has(row.id))];
}

// TVars is spelled from the CONTRACT union, not `inferInput`: the router validates `scope` through
// `typeIdSchema`, whose transform-backed arms infer as `unknown`-fielded — so the inferred input would
// erase exactly the branding that makes `scopeReadKey` exhaustive and type-safe. The stricter shape stays
// assignable to the proc's own input, so nothing is cast.
interface ApplyRegexScopeOrderVars {
  readonly scope: RegexAttachScope;
  readonly orderedScriptIds: RegexScriptId[];
}

export const useApplyRegexScopeOrder = createEntityMutation<ApplyRegexScopeOrderVars, inferOutput<Trpc["regex"]["applyScopeOrder"]>, RegexScriptRow[]>({
  options: (trpc) => trpc.regex.applyScopeOrder.mutationOptions(),
  busDriven: true, // applyScopeOrder emits regexChanged → the invalidation map covers regex.pathFilter().
  optimistic: {
    readKey: (trpc, vars) => scopeReadKey(trpc, vars.scope),
    update: (old, vars) => (old === undefined ? old : applyOrder(old, vars.orderedScriptIds)),
  },
  errorToast: "Couldn't save that run order.",
});
