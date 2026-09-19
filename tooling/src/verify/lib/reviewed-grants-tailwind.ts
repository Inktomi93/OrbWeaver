// Reviewed grants: no-banned-tw-utility — the `tailwind-class-token` family's reviewed-grant half.
// Split from reviewed-grants.ts — see that file for the central home comment. It is its OWN section rather
// than two more rows in `reviewed-grants-no-to-factory.ts` because that file was already at 450 lines,
// which is `tooling-size`'s hard cap; a section file per concern is the shape this table was split into.
import type { ReviewedGateGrant } from "../contract/gate-authority.ts";

export const REVIEWED_GRANTS_TAILWIND: readonly ReviewedGateGrant[] = [
  {
    id: "no-banned-tw-utility:message-bubble-class",
    policyId: "no-banned-tw-utility",
    subject: "packages/client/src/lib/message-bubble-class.ts",
    operation: "banned-tw-utility:max-w-prose",
    why: "TRANSCRIPT GEOMETRY, refused in place at `message-bubble-class.ts:25` (#1145/#1175): a chat bubble is not teaching prose, and no house reading measure was ever ruled for it — the bubble shrinks to fit and this caps the long-form line length. Re-pointing it at `--reading-measure-prose` would apply a paragraph measure to a shrink-to-fit box.",
    endsWhen: "a transcript bubble cap is ruled and gets its own token, at which point this row is consumed zero times and reds.",
  },
  {
    id: "no-banned-tw-utility:message-row-variants",
    policyId: "no-banned-tw-utility",
    subject: "packages/client/src/features/chat/lib/message-row-variants.ts",
    operation: "banned-tw-utility:max-w-prose",
    why: 'the SAME transcript-geometry ruling one file over, refused in place at `message-row-variants.ts:363` ("DELIBERATE RESIDUE here (#1175, refused with a receipt): this is transcript geometry") — the photo-reading-plate inner box, which is the bubble\'s own measure under a different skin.',
    endsWhen: "a transcript bubble cap is ruled, the same condition as the sibling row — both die together or neither does.",
  },
];
