// The Connections pane's pure model (inference program §5.3a): the grouped provider picker (Hosted (key) · Your
// own server (URL) · Subscription · Built-in — never twelve options flat) and the connection row's role
// readouts. Labels come from the registry rows (`ProviderDef.label`), never a hand table; the Model-roles row
// model is `lib/connection-roles.ts`.

import type { ProviderAuth, ProviderAvailability, ProviderDef, RoutableTask, Task } from "@orb/contracts/inference";
import { bindingTaskOf, canFund, providerDisplayLabel } from "@orb/contracts/inference";
import type { SelectItems, SelectOptionGroup } from "@orb/ui/select";
// Direct, not through `#lib`: this module stays barrel-free because node-side CT specs import it.
import { ROLE_ROWS_ORDERED } from "../../../lib/connection-roles.ts";

/** The user-facing Model-role labels a connection may serve. Non-routable tasks fold through their
 *  binding (`agent` → Chat, `structured` → Utility model), so schema task names never leak into copy. */
export function connectionRoleLabels(tasks: readonly Task[]): readonly string[] {
  const roles = new Set(tasks.map(bindingTaskOf));
  return ROLE_ROWS_ORDERED.filter((row) => roles.has(row.task)).map((row) => row.label);
}

/** The four picker groups, keyed on the provider row's `auth` (§5.3a) — the group label is the user's word. */
const AUTH_GROUP_LABELS: Record<ProviderAuth, string> = {
  apiKey: "Hosted (key)",
  endpoint: "Your own server (URL)",
  oauthToken: "Subscription",
  none: "Built-in",
};
const AUTH_GROUP_ORDER: readonly ProviderAuth[] = ["apiKey", "endpoint", "oauthToken", "none"];

/** `providers.available` → grouped Select items. An unavailable row (`runtime-missing` / `unavailable`)
 *  renders DISABLED with its reason as the gloss, never hidden (§5.3a: "`runtime-missing` is a cause, not a
 *  sentence a person can act on" — the reason IS the sentence). A plugin row names its plugin, so a manifest
 *  label can never pass as a built-in provider. */
export function providerPickerItems(available: readonly ProviderAvailability[]): SelectItems<string> {
  const groups: SelectOptionGroup<string>[] = [];
  for (const auth of AUTH_GROUP_ORDER) {
    const rows = available.filter((row) => row.provider.auth === auth);
    if (rows.length === 0) {
      continue;
    }
    groups.push({
      label: AUTH_GROUP_LABELS[auth],
      items: rows.map((row) => ({
        label: providerDisplayLabel(row.provider),
        value: row.provider.id,
        ...(row.available ? {} : { disabled: true, description: unavailableProviderCopy(row) }),
      })),
    });
  }
  return groups;
}

function unavailableProviderCopy(row: ProviderAvailability): string {
  return row.cause === "runtime-missing" ? "The Claude runtime isn't installed on this server." : "Not built on this server.";
}

/** The `api` control renders ONLY when the provider lists more than one (§5.3a — a one-option combobox can
 *  only be gotten wrong). */
export function showsApiControl(provider: ProviderDef | undefined): boolean {
  return provider !== undefined && provider.apis.length > 1;
}

const CHAT_API_LABEL_PAIRS = [
  ["chat-completions", "Chat Completions"],
  ["agent-sdk", "Agent SDK (Claude subscription)"],
  ["anthropic-messages", "Anthropic Messages"],
] as const;

/** The api-picker labels (the protocol axis), keyed on `CHAT_APIS` so a new member is a `tsc` error. */
export const CHAT_API_LABELS: Record<ProviderDef["apis"][number], string> = Object.fromEntries(CHAT_API_LABEL_PAIRS) as Record<
  ProviderDef["apis"][number],
  string
>;

/** The Model-role NAMES "Use this connection for everything it can serve" would write — the menu item's
 *  gloss, so the sweep's consequence is knowable BEFORE the click (there is no default to fall back to).
 *  Mirrors the verb's own filter: every routable task the row can serve AND fund. */
export function sweepRoleLabels(connection: { readonly allowBackground: boolean; readonly tasks: readonly Task[] }): readonly string[] {
  return ROLE_ROWS_ORDERED.filter((row) => connection.tasks.includes(row.task) && canFund(connection, row.task)).map((row) => row.label);
}

/** The Model-role names a connection's REMOVAL would unset — the confirm's count and list (§5.3a/side-eye:
 *  the shipped description is correct and unquantified, and a user cannot decide without knowing whether
 *  they are breaking one role or five). Reads the persisted BINDINGS, not the row's capability. */
export function boundRoleLabels(
  connectionId: string,
  views: readonly { readonly task: RoutableTask; readonly binding: { readonly connectionId: string | null } | null }[],
): readonly string[] {
  const bound = new Set(views.filter((view) => view.binding?.connectionId === connectionId).map((view) => view.task));
  return ROLE_ROWS_ORDERED.filter((row) => bound.has(row.task)).map((row) => row.label);
}

/** "Chat, Utility model and Image generation" — an English list, so a count sentence reads as one. */
export function joinRoleLabels(labels: readonly string[]): string {
  if (labels.length <= 1) {
    return labels[0] ?? "";
  }
  return `${labels.slice(0, -1).join(", ")} and ${labels.at(-1) ?? ""}`;
}
