// The ONE home of the `appearance.colorQuotedSpeech` → `Markdown colorQuotes` derivation for prose
// surfaces that render authored character content OUTSIDE a message row (QUOTE-1 follow-up: the greeting
// preview, the greeting studio's preview, the facet editor's example transcript). A message ROW gets the
// same pref through `resolveRowRenderPolicy`'s `colorQuotes` (lib/render-trust), which needs a role +
// participants those surfaces don't have — so without this hook the pref would be re-spelled (`!== false`)
// once per preview mount, in two tiers (features/character + the tier-2 `components/` studio), which is
// exactly the second-spelling this repo homes away.
//
// Shares the `getUserSettings` cache with the chat appearance hooks (a plain non-suspense query: a preview
// must paint before the settings read resolves — an unresolved read falls back to the contract default, ON).

import { DEFAULT_APPEARANCE_SETTINGS } from "@orb/contracts/settings";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "./trpc.ts";

/** ST quote-color parity for non-row prose: tint `"…"` runs with the scope's `--color-dialogue`. Default ON. */
export function useColorQuotedSpeech(): boolean {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.settings.getUserSettings.queryOptions());
  return (data?.config.appearance ?? DEFAULT_APPEARANCE_SETTINGS).colorQuotedSpeech !== false;
}
