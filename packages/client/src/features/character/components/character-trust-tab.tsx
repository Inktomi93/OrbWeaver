// The CONTEXT **Trust** tab — how this card's messages are allowed to RENDER: `forbidExternalMedia` and the
// HTML-trust ladder, both tri-state, both immediate-commit on `character.update` (no save bar, no dirty
// pill). `trustHtml` resolves `override ?? global`; `forbidExternalMedia` is TIGHTEN-ONLY over the
// deployment ceiling, so while the deployment blocks external media the control renders locked.
//
// IT IS ITS OWN DOOR SINCE #841/#860 (owner 2026-08-30). It used to be the third of four concerns inside a
// tab called "Options" — a three-paragraph security essay under a twelve-field colour editor, in a pane
// measured at `clientHeight 693 · scrollHeight 2253` (31% visible). A security posture is not a subsection
// of an appearance editor, and the ruling that merged them (a signed THREE-tab strip) is the thing that
// died: the context-panel program re-rules the strip as a six-slot meta rail. What is PRESERVED is the
// mechanism — immediate-commit, its own heading, nothing re-implemented; the split is a re-home.
//
// HTML rendering is ONE LADDER control, not two switches (owner ruling 2026-08-16, #111): Untrusted <
// Render HTML < Interactive, plus Inherit for "no override". It writes the `trust_html` +
// `interactive_html` pair through the contracts helper, so the incoherent "interactive but untrusted" pair
// is unwritable here and unrepresentable in the resolved policy. The top step runs card-authored scripts, and
// "Inherit default" lands on the install's "Default for characters" step, which is Interactive by default (owner
// ruling) and is also the script ceiling (D294). So this surface reads that step, says which step the character
// resolves to, and names the lower steps as the per-character disable. It does NOT lock the control the way the
// external-media row does: there EVERY value is inert under the ceiling, here only one of four.

import { HTML_TRUST_STEPS, renderPolicyOverrideForStep, stepFromRenderPolicyOverride } from "@orb/contracts/chat";
import { Row, Section, Stack } from "@orb/ui/layout";
import type { SelectItems } from "@orb/ui/select";
import { Select } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useId } from "react";
import { ContextTabBody, QueryBoundary } from "#components";
import { QueryErrorState, SkeletonRows, useExternalMediaBlocked, useInteractiveCardsAllowed, useInvalidation, useSuspenseQuery, useTRPC } from "#data";
import { DEFAULT_HTML_STEP_SETTING_LABEL, HTML_TRUST_STEP_LABELS } from "#lib";
import { useUpdateCharacter } from "../hooks/use-character-mutations.ts";
import { usePreviewRenderPolicy } from "../hooks/use-preview-render-policy.ts";
import { CHARACTER_HTML_TRUST_LABEL } from "../lib/character-names.ts";
import type { CharacterAppearanceTabProps } from "./character-appearance-tab.tsx";

/** inherit / on / off ⇄ null / true / false (the tri-state wire encoding, shared by both Trust controls). */
function tristateValue(flag: boolean | null): string {
  if (flag === null) {
    return "inherit";
  }
  return flag ? "on" : "off";
}

function tristateFlag(value: string): boolean | null {
  if (value === "inherit") {
    return null;
  }
  return value === "on";
}

/** The HTML-trust LADDER as one control (#111). `inherit` is the absence of an override, not a rung — it is
 *  spelled with the same sentinel the sibling tri-state uses, and it clears BOTH stored columns. The rungs
 *  are ordered weakest-first, matching `HTML_TRUST_STEPS`, so the menu reads as the ladder it is. */
const INHERIT_STEP = "inherit";
const HTML_TRUST_ITEMS: SelectItems = [
  { value: INHERIT_STEP, label: "Inherit default" },
  ...HTML_TRUST_STEPS.map((step) => ({ value: step, label: HTML_TRUST_STEP_LABELS[step] })),
];

/** One picked rung → the column pair to persist. `inherit` clears both; every other value goes through the
 *  contracts helper, which is the ONE home for "what does this step mean in storage" — so Interactive can
 *  never be written without the render trust it implies. */
function htmlTrustEdit(value: string): { trustHtml: boolean | null; interactiveHtml: boolean | null } {
  // Narrowed by MEMBERSHIP, never cast: the Select hands back a string, and anything that is not a rung
  // (including the inherit sentinel) is the clear.
  const step = HTML_TRUST_STEPS.find((candidate): boolean => candidate === value);
  return step === undefined ? { trustHtml: null, interactiveHtml: null } : renderPolicyOverrideForStep(step);
}

/** The CONTEXT **Trust** tab — how this card's messages are allowed to RENDER. A security concern, and it
 *  reads as one: its own door since #841, where it is not three paragraphs at the bottom of a colour editor. */
export function CharacterTrustTab({ characterId }: CharacterAppearanceTabProps): ReactElement {
  return (
    // RESERVED (#1098) — the Trust tab settles into the render-policy rows; its sibling Look tab is keyed
    // for the same reason, and two tabs in one panel that resize differently is the worse half of it.
    <ContextTabBody>
      <QueryBoundary
        resetKeys={[characterId]}
        fallback={<SkeletonRows count={4} />}
        renderError={(_error, retry): ReactElement => <QueryErrorState label="trust" onRetry={retry} />}
        reserveKey="character.context.trust"
      >
        <TrustTabBody characterId={characterId} />
      </QueryBoundary>
    </ContextTabBody>
  );
}

function TrustTabBody({ characterId }: CharacterAppearanceTabProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data } = useSuspenseQuery(trpc.character.get.queryOptions({ characterId }));
  const update = useUpdateCharacter({ trpc, invalidation });
  // The deployment ceiling (`/api/auth/config.forbidExternalMedia`) — the value the document CSP was built
  // from. While it is on, EVERY value of this control resolves to blocked, so the control is inert: render
  // it disabled + explained rather than as a dead switch (D107).
  const externalMediaBlocked = useExternalMediaBlocked();
  // The install's script ceiling. Unlike external media this does NOT lock the control — only ONE of the four values
  // is inert below it, and disabling the whole select would take away three working choices. The step stays
  // pickable and the note below says what it will do.
  const interactiveCardsAllowed = useInteractiveCardsAllowed();
  // What the stored pair actually RESOLVES to on this deployment — the same resolver compose runs. The
  // select shows the stored answer, and "Inherit default" alone does not say which rung that is.
  const resolvedStep = usePreviewRenderPolicy(data).htmlTrust;
  const externalMediaLockId = useId();
  const interactiveLockId = useId();

  const commit = (input: { forbidExternalMedia?: boolean | null; trustHtml?: boolean | null; interactiveHtml?: boolean | null }): void => {
    update.mutate({ characterId, input });
  };

  return (
    <Stack gap="section">
      {/* The external-media row can only TIGHTEN: the deployment-wide setting is the ABSOLUTE ceiling —
          enforced twice, by the tighten-only render-policy resolver (@orb/contracts/chat) and by the page's
          Content-Security-Policy — and no per-character value can widen it. While the deployment blocks,
          the control is LOCKED rather than offering an "Allow" that nothing honours. */}
      <Section heading="Trust">
        <Row gap="field" wrap={true}>
          {/* No control-has-associated-label suppression here (unlike its sibling): the conditional
              aria-describedby SPREAD makes the rule bail on this element, so a directive would be an
              unused-disable error. The `label` prop still renders the visible, associated label. */}
          <Select
            label="External media"
            items={[
              { value: "inherit", label: "Inherit default" },
              { value: "off", label: "Allow" },
              { value: "on", label: "Forbid" },
            ]}
            value={tristateValue(data.forbidExternalMedia)}
            onValueChange={(value): void => commit({ forbidExternalMedia: tristateFlag(String(value)) })}
            disabled={externalMediaBlocked}
            {...(externalMediaBlocked ? { "aria-describedby": externalMediaLockId } : {})}
          />
          {/* ONE LADDER, not a second checkbox (owner ruling 2026-08-16, #111): Untrusted < Render HTML <
              Interactive, in that order, with Inherit as the absence of an override rather than a rung.
              The write direction is the contracts helper, so this control cannot store the incoherent
              "interactive but untrusted" pair — the resolver would not be able to represent it either. */}
          <Select
            label={CHARACTER_HTML_TRUST_LABEL}
            items={HTML_TRUST_ITEMS}
            value={stepFromRenderPolicyOverride(data) ?? INHERIT_STEP}
            onValueChange={(value): void => commit(htmlTrustEdit(String(value)))}
            aria-describedby={interactiveLockId}
          />
        </Row>
        {externalMediaBlocked ? (
          <Text id={externalMediaLockId} voice="reading">
            External media: blocked for everyone by your admin.
          </Text>
        ) : null}
        <Stack gap="field" id={interactiveLockId}>
          <Text voice="reading">Plain text: no styling. In a game with immersive cards on, its cards still draw in the sandbox, without scripts.</Text>
          <Text voice="reading">Rich HTML: styled messages, no scripts.</Text>
          <Text voice="reading">
            Interactive: cards can run scripts in a sealed frame. A script can still tell its author that you viewed it, and your IP address.
          </Text>
        </Stack>
        <Text voice="reading" data-slot="trust-resolved-step">
          This character's messages render as {HTML_TRUST_STEP_LABELS[resolvedStep]} right now.
        </Text>
        {interactiveCardsAllowed ? null : (
          <Text voice="reading">Interactive needs the server's {DEFAULT_HTML_STEP_SETTING_LABEL} at Interactive, so it works like Rich HTML here.</Text>
        )}
        <Text voice="reading">Changes apply right away.</Text>
      </Section>
    </Stack>
  );
}
