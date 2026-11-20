// The CONTEXT **Trust** tab — how this card's messages are allowed to RENDER, as ONE Character trust block (owner
// ruling: everything that decides whether a character's content loads, internet media included, is character trust):
// the HTML-trust ladder and the load-internet-media switch, both immediate-commit on `character.update` (no save bar, no
// dirty pill). The stored axes stay two, what content may do and what it may fetch. `forbidExternalMedia` is
// TIGHTEN-ONLY over the deployment ceiling (`resolveRenderPolicy` in @orb/contracts/chat), so a stored `false`
// resolves exactly like no override: the switch's on writes the clear, and while the deployment blocks internet media
// the switch cannot apply, so it is not shown and a line says why.
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
// ruling). Every explicit step wins over that default, Interactive included (D294), so this surface says which step
// the character resolves to and names the lower steps as the per-character disable. Only the media switch can be
// overruled, because there the install's setting is a ceiling.

import { HTML_TRUST_STEPS, renderPolicyOverrideForStep, stepFromRenderPolicyOverride } from "@orb/contracts/chat";
import { Row, Section, Stack } from "@orb/ui/layout";
import type { SelectItems } from "@orb/ui/select";
import { Select } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useEffect, useId, useRef } from "react";
import { ContextTabBody, QueryBoundary, SettingSwitchRow } from "#components";
import { QueryErrorState, SkeletonRows, useExternalMediaBlocked, useInvalidation, useSuspenseQuery, useTRPC } from "#data";
import { CHARACTER_TRUST_BLOCK_LABEL, HTML_TRUST_STEP_LABELS, LOAD_INTERNET_MEDIA_LABEL } from "#lib";
import { clearRequestedCharacterTrust, useRequestedCharacterTrust } from "#state";
import { useUpdateCharacter } from "../hooks/use-character-mutations.ts";
import { usePreviewRenderPolicy } from "../hooks/use-preview-render-policy.ts";
import { CHARACTER_HTML_TRUST_LABEL } from "../lib/character-names.ts";
import type { CharacterAppearanceTabProps } from "./character-appearance-tab.tsx";

/** The HTML-trust LADDER as one control (#111). `inherit` is the absence of an override, not a rung, and it
 *  clears BOTH stored columns. The rungs
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
  // from. While it is on, this character is blocked whatever it stores, so the switch cannot apply and is not shown.
  const externalMediaBlocked = useExternalMediaBlocked();
  // What the stored pair actually RESOLVES to on this deployment — the same resolver compose runs. The
  // select shows the stored answer, and "Inherit default" alone does not say which rung that is.
  const resolvedStep = usePreviewRenderPolicy(data).htmlTrust;
  const interactiveLockId = useId();
  // A door that named this tab (the row notice's Trust settings control) lands on the control it means: the ladder.
  const arrivedHere = useRequestedCharacterTrust() === characterId;
  const ladderRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (arrivedHere) {
      ladderRef.current?.focus();
      clearRequestedCharacterTrust();
    }
  }, [arrivedHere]);

  const commit = (input: { forbidExternalMedia?: boolean | null; trustHtml?: boolean | null; interactiveHtml?: boolean | null }): void => {
    update.mutate({ characterId, input });
  };

  return (
    <Stack gap="section">
      <Section heading={CHARACTER_TRUST_BLOCK_LABEL}>
        <Row gap="field" wrap={true}>
          {/* ONE LADDER, not a second checkbox (owner ruling 2026-08-16, #111): Untrusted <
              Render HTML < Interactive, in that order, with Inherit as the absence of an override rather than a rung.
              The write direction is the contracts helper, so this control cannot store the incoherent
              "interactive but untrusted" pair — the resolver would not be able to represent it either. */}
          <Select
            label={CHARACTER_HTML_TRUST_LABEL}
            items={HTML_TRUST_ITEMS}
            value={stepFromRenderPolicyOverride(data) ?? INHERIT_STEP}
            onValueChange={(value): void => commit(htmlTrustEdit(String(value)))}
            aria-describedby={interactiveLockId}
            triggerRef={ladderRef}
          />
        </Row>
        <Stack gap="field" id={interactiveLockId}>
          <Text voice="gloss">Plain text: no styling. In a game with immersive cards on, its cards still draw in the sandbox, without scripts.</Text>
          <Text voice="gloss">Rich HTML: styled messages, no scripts.</Text>
          <Text voice="gloss">
            Interactive: cards can run scripts in a sealed frame. A script can still tell its author that you viewed it, and your IP address.
          </Text>
        </Stack>
        <Text voice="reading" data-slot="trust-resolved-step">
          This character's messages render as {HTML_TRUST_STEP_LABELS[resolvedStep]} right now.
        </Text>
        {/* The media switch can only TIGHTEN: the deployment-wide setting is the ABSOLUTE ceiling, enforced by the
            tighten-only render-policy resolver (@orb/contracts/chat) and by the page's Content-Security-Policy. So the
            switch has two honest states, load as the install allows or block; on writes the clear, never a stored
            `false`. */}
        {externalMediaBlocked ? (
          <Text voice="reading" data-slot="trust-media-blocked">
            Internet media is blocked for everyone on this server, so this character's content loads none. This changes when this page reloads.
          </Text>
        ) : (
          <SettingSwitchRow
            label={LOAD_INTERNET_MEDIA_LABEL}
            description="Images and media from the internet can show who viewed them."
            checked={data.forbidExternalMedia !== true}
            onChange={(next): void => commit({ forbidExternalMedia: next ? null : true })}
          />
        )}
      </Section>
    </Stack>
  );
}
