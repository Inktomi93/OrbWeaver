// B2 — the "This chat" Rules SECTION. The host-only surface that drives
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
// here is what is genuinely PER-ROOM — the room's rule read, per-rule fire disclosures, and empty copy.
//
// LIVE FRESHNESS: rule CRUD/enable/Test/Run-now reconcile through each mutation's own `invalidates`. A real
// turn has no local mutation, so the always-mounted automation control source routes its room events through
// the central invalidation seam. That one subscription refreshes this section's rule/fire reads and the
// separate Activity tab without adding a rules-only room subscriber. The owner-global pane has no such feed
// — that bus is per-chat — and says so at its own file.

import type { ChatId } from "@orb/kit/ids";
import { Card } from "@orb/ui/card";
import { Row, Stack } from "@orb/ui/layout";
import { Skeleton } from "@orb/ui/skeleton";
import { Text } from "@orb/ui/text";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { QueryBoundary } from "#components";
import { QueryErrorState, useTRPC } from "#data";
import { RuleManager } from "./rule-manager.tsx";

/** The section's opening line — one gloss, painted in BOTH arms (settled and reserving) because it depends
 *  on no read. Every sibling section in this pane opens with one. */
const RULES_INTRO = "Rules watch this chat and act on their own.";

interface RulesSkeletonProps {
  /** How many rule rows to reserve — the cached `listRules` length where there is one. */
  readonly count: number;
}

/**
 * THE RULES SECTION'S RESERVED BOX (#821's second half). A `SkeletonRows count={3} shape="line"` reserved
 * 185px desktop / 233px mobile for a section that settles at 704px / 1296px with three rules — a 519px /
 * 1063px under-reserve that scored ~0 CLS only because the section sat at y≈2200, outside the viewport
 * (side-eye 2026-08-30 §5-P3-Rules). Collapsing the injection rows above it moves it ~800px UP, which is
 * precisely where that geometry accident stops protecting it — so the two land together.
 *
 * Shape-matched to `RuleRow` element for element — and re-derived at #886, when the row became a COLLAPSE
 * card: what it now reserves is the row's CLOSED face (a `!p-0` Card holding the name/gloss/last-run stack
 * beside the enable switch), not the fully-open anatomy. Everything the disclosure hides — Test, the
 * overflow menu, the B4 switch, the fire-log door — is behind a panel that is closed on arrival, so it costs
 * this box nothing, and its own skeleton mismatch is the term #815 fenced from the editing side.
 */
function RulesSkeleton({ count }: RulesSkeletonProps): ReactElement {
  const rows = Array.from({ length: Math.max(count, 1) }, (_row, index) => index);
  return (
    <Stack aria-busy={true} gap="section">
      <Text voice="gloss">{RULES_INTRO}</Text>
      <Stack gap="section">
        {rows.map((index) => (
          // Byte-for-byte the settled row's closed box: the same `!p-0` Card, the same `p-block` trigger pad
          // at the same `min-h-control-sm` pointer-conditional floor, the same three-line name column.
          <Card className="!p-0" key={index}>
            <Row align="center" className="min-h-control-sm p-block pr-block" gap="field">
              <Stack className="min-w-0 flex-1" gap="tight">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-1/2" />
              </Stack>
              <Skeleton className="h-4 w-1/6 shrink-0" />
            </Row>
          </Card>
        ))}
      </Stack>
      <Skeleton className="h-control-sm w-1/3" />
    </Stack>
  );
}

export interface RulesSectionBodyProps {
  readonly chatId: ChatId;
}

/** The "This chat" Rules section as the tab mounts it — the suspense boundary plus the reserved box, sized
 *  from a NON-suspending read of the same `listRules` key the body below suspends on (one fetch, two
 *  consumers — the `InjectionsSection` idiom). It lives here rather than in the §6c contribution because
 *  that module may export nothing but the contribution itself (`useComponentExportOnlyModules`), and
 *  because the box a fallback reserves is decided by the row's shape, which this file owns. */
export function RulesSectionBody({ chatId }: RulesSectionBodyProps): ReactElement {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.automation.listRules.queryOptions({ chatId }));
  return (
    // RESERVED (#1098) — the non-suspending `listRules` read above sizes the fallback, so it is a shape AND
    // count match; #886 re-derived the SHAPE against the row's new closed face. The read lives in THIS
    // component, outside the measured wrapper, so it cannot poison the remembered box.
    <QueryBoundary
      fallback={<RulesSkeleton count={data?.length ?? 1} />}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="this chat's rules" onRetry={retry} />}
      reserveKey="automation.thisChat.rules"
    >
      <RulesSection chatId={chatId} />
    </QueryBoundary>
  );
}

/** Module-local: `RulesSection` below is the only spelling, and it is mounted from this same file's
 *  boundary wrapper — nothing outside names the props type (#1847). */
interface RulesSectionProps {
  readonly chatId: ChatId;
}

/** The Rules section body: the live rule list + the "Add a rule" picker. Suspends on `listRules` — wrap in
 *  the tab's own `QueryBoundary`. Host-only by construction (the whole section mounts only for a host). */
export function RulesSection({ chatId }: RulesSectionProps): ReactElement {
  const trpc = useTRPC();
  const { data: rules } = useSuspenseQuery(trpc.automation.listRules.queryOptions({ chatId }));

  return (
    <Stack gap="section">
      {/* THE TEACHING COPY LIVES IN THE EMPTY STATE and retires once the surface can speak for itself
          (side-eye #621 P2-5) — a permanent three-line paragraph over a list that already says what each
          rule does is spent attention. The one-line gloss stays in both arms, because every sibling
          section in this pane opens with one. */}
      <Text voice="gloss">{RULES_INTRO}</Text>
      {rules.length === 0 ? (
        <Text voice="gloss">
          Nothing is watching this chat yet. Add a rule — post an image, nudge the pacing, offer chips — and it starts off until you enable it.
        </Text>
      ) : null}
      <RuleManager key={chatId} chatId={chatId} rules={rules} />
    </Stack>
  );
}
