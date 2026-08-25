// B2 — the "This chat" Rules SECTION (interaction-direction-spec §7 B2). The host-only surface that drives
// the automation rule lifecycle FOR ONE ROOM: the rule list, the "Add a rule" preset picker, and each rule's
// recent FIRE LOG (the "why didn't my rule fire" surface). It is a foreign feature grafting into chat's
// "This chat" tab — it imports NO chat module and chat imports none of it (client-features-no-cross); the
// tab's host-controls band renders it blind through the §6c SECTION seam (`lib/rules-settings-section.tsx`,
// #616).
//
// HOST-ONLY BY CONSTRUCTION: every `automation.*` rule verb is host-gated server-side, and this section is
// mounted only inside the tab's host-controls band. A member never reaches `listRules` (it collapses to a
// leak-free NOT_FOUND) and never sees this section.
//
// WHAT A ROW LOOKS LIKE IS NOT HERE (C5): `rule-row.tsx` owns it, shared with the owner-global Automation
// settings pane, so the two lists of the same thing cannot drift about what an affordance costs. What stays
// here is what is genuinely PER-ROOM — the room's rule read, the room's live feed, and the room's empty copy.
//
// LIVE FRESHNESS: rule CRUD/enable/Test/Run-now reconcile through each mutation's own `invalidates`. But a
// rule also fires from a REAL turn with no local mutation — so this section additionally subscribes to the
// chat's `automation` room and invalidates the rules list + the affected fire log off `ruleFired`/
// `ruleErrored`/`ruleAutoDisabled`/`rulesChanged` (the members `apply-automation-bus-event.ts` names as
// "B2's rules panel's" — the reducer folds only the pending-ask members). The room is a SECOND subscriber
// on the same multiplexed socket as the S4 card mount; the registry fans one room to a Set of subscribers.
// The owner-global pane has NO such feed — that bus is per-chat — and says so at its own file.

import type { StreamRoomRef } from "@orb/contracts/stream";
import type { ChatId } from "@orb/kit/ids";
import { Stack } from "@orb/ui/layout";
import { Separator } from "@orb/ui/separator";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import type { Trpc } from "#data";
import { useBusRoom, useInvalidation, useTRPC } from "#data";
import { RulePresetPicker } from "./rule-preset-picker.tsx";
import { RuleRow } from "./rule-row.tsx";

/** One row of the rule list — tRPC-inferred, so a wire reshape breaks here at compile time. Declared per
 *  consumer rather than exported from `rule-row.tsx`: a feature `components/` file is not a type home
 *  (`no-inline-types`), and the client feature tree has no `contract/` to move it to. The alias is one line
 *  off the SAME inferred source in both places, so the two cannot drift. */
type Rule = inferOutput<Trpc["automation"]["listRules"]>[number];

/** Subscribe to the chat's `automation` room and invalidate the rules list + affected fire log when a rule
 *  fires, errors, auto-disables, or the set changes from a REAL turn (no local mutation moved them). */
function useRuleFeedInvalidation(chatId: ChatId): void {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const ref: Extract<StreamRoomRef, { channel: "automation" }> = { channel: "automation", chatId };
  useBusRoom<"automation">(ref, {
    onEvent: (frame) => {
      const event = frame.event;
      if (event.type === "quickReplySurfaced" || event.type === "suggestionRaised") {
        return; // the S4 card mount's members; they move no rule state.
      }
      invalidation.invalidateFilters([trpc.automation.listRules.queryFilter({ chatId: event.chatId })]);
      if (event.type === "ruleFired" || event.type === "ruleErrored") {
        invalidation.invalidateFilters([trpc.automation.listFires.queryFilter({ ruleId: event.ruleId })]);
      }
    },
  });
}

export interface RulesSectionProps {
  readonly chatId: ChatId;
}

/** The Rules section body: the live rule list + the "Add a rule" picker. Suspends on `listRules` — wrap in
 *  the tab's own `QueryBoundary`. Host-only by construction (the whole section mounts only for a host). */
export function RulesSection({ chatId }: RulesSectionProps): ReactElement {
  const trpc = useTRPC();
  const { data: rules } = useSuspenseQuery(trpc.automation.listRules.queryOptions({ chatId }));
  useRuleFeedInvalidation(chatId);

  return (
    <Stack gap="section">
      {/* THE TEACHING COPY LIVES IN THE EMPTY STATE and retires once the surface can speak for itself
          (side-eye #621 P2-5) — a permanent three-line paragraph over a list that already says what each
          rule does is spent attention. The one-line gloss stays in both arms, because every sibling
          section in this pane opens with one. */}
      <Text voice="gloss">Rules watch this chat and act on their own.</Text>
      {rules.length === 0 ? (
        <Text voice="gloss">
          Nothing is watching this chat yet. Add a rule — post an image, nudge the pacing, offer chips — and it starts off until you enable it.
        </Text>
      ) : (
        <Stack gap="section">
          {rules.map((rule: Rule, index: number) => (
            <Stack key={rule.id} gap="section">
              {/* ONE hairline between rules (side-eye #621 P2-7): with two rules and no separation, each
                  "Recent activity" disclosure sat equidistant between its own title and the NEXT rule's. */}
              {index === 0 ? null : <Separator />}
              <RuleRow chatId={chatId} rule={rule} />
            </Stack>
          ))}
        </Stack>
      )}
      <RulePresetPicker chatId={chatId} />
    </Stack>
  );
}
