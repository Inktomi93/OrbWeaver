// Greeting studio (audit §3) — the guided-action machinery pointed at a BASE greeting text, homed on the
// card. A tier-2 `components/` composite (domain-aware, no single feature owner — the CharacterPicker
// precedent): it is mounted by TWO features (the character editor's greetings section + the chat draft
// greeting row), so it CANNOT live in either feature (`client-features-no-cross`). ONE component serving
// both mounts: the character editor's greetings section (inline, primary home) and the draft greeting row's
// action cluster (in a dialog). Renders the `GREETING_TRANSFORMS` catalog as
// chips (BLIND from the contract data — grouped by axis), a free-text instruction field, and Rewrite /
// Make-new actions, then previews the generated text with Accept / Discard.
//
// The two studio verbs (`character.rewriteGreeting`/`character.generateGreeting`) RETURN text and NEVER
// write — on Accept the component calls `onAccept(text)`, and the MOUNT owns persistence: the editor appends
// via `form.pushFieldValue("greetings", …)` (autosaves through character.update), the draft row appends via
// the character.update mutation.
//
// Both generations are `busDriven` (the verbs emit no bus event and touch no cache — the returned text is
// displayed, not cached), so no invalidation is wired.
//
// FORK NOTE (ARM B, owner 2026-08-09): the steer is no longer composed here. The chips' fragment bytes are
// `preset.greetingTransform.*` prose slots a host can edit in the preset Templates tab, so the studio sends
// the picked KINDS + the free text and the greeting verbs resolve+join them against the caller's preset.
// This component therefore never needs a preset blob — which is exactly why arm B beat arm A.

import type { GreetingTransformAxis, GreetingTransformId } from "@orb/contracts/preset";
import { GREETING_TRANSFORM_AXES, GREETING_TRANSFORMS } from "@orb/contracts/preset";
import type { CharacterId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Check, Icon, Sparkles, WandSparkles, X } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Markdown } from "@orb/ui/markdown";
import { WebSpinner } from "@orb/ui/spinner";
import { Text } from "@orb/ui/text";
import { Textarea } from "@orb/ui/textarea";
import { Toggle } from "@orb/ui/toggle";
import { ToggleGroup } from "@orb/ui/toggle-group";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useId, useState } from "react";
import type { Trpc } from "#data";
import { createEntityMutation, useColorQuotedSpeech, useInvalidation, useTRPC } from "#data";

/** The rewrite generation — returns the revised greeting text (no cache/bus effect; the result is previewed). */
const useRewriteGreetingMutation = createEntityMutation<
  { characterId: CharacterId; greeting: string; steer: string; transforms?: GreetingTransformId[] | undefined },
  inferOutput<Trpc["character"]["rewriteGreeting"]>
>({
  options: (trpc) => trpc.character.rewriteGreeting.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't rewrite the greeting.",
});

/** The new-greeting generation — returns a fresh greeting text (no cache/bus effect; the result is previewed). */
const useGenerateGreetingMutation = createEntityMutation<
  { characterId: CharacterId; steer: string; transforms?: GreetingTransformId[] | undefined },
  inferOutput<Trpc["character"]["generateGreeting"]>
>({
  options: (trpc) => trpc.character.generateGreeting.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't generate the greeting.",
});

export interface GreetingStudioProps {
  readonly characterId: CharacterId;
  /** The existing greeting text (the rewrite base). Empty ⇒ Rewrite is unavailable (nothing to rewrite);
   *  Make-new is always available. */
  readonly baseGreeting: string;
  /** Accept the previewed text — the mount persists it (editor: form append; draft row: character.update). */
  readonly onAccept: (text: string) => void;
  /** Whether this character's own greeting content is render-trusted (§6.1) — drives the preview Markdown. */
  readonly trusted?: boolean;
}

/** The transform ids grouped by axis, derived BLIND from the contract catalog (no hardcoded lists). */
function transformsByAxis(axis: GreetingTransformAxis): readonly (typeof GREETING_TRANSFORMS)[number][] {
  return GREETING_TRANSFORMS.filter((t) => t.axis === axis);
}

/** Human axis labels (the axis id is a stable vocabulary token; the display copy lives here). */
const AXIS_LABEL: Record<GreetingTransformAxis, string> = {
  perspective: "Perspective",
  tense: "Tense",
  style: "Style",
  gender: "Pronouns",
};

export function GreetingStudio({ characterId, baseGreeting, onAccept, trusted = true }: GreetingStudioProps): ReactElement {
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [instruction, setInstruction] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  // The visible axis label IS the group's accessible name (aria-labelledby, not a duplicate
  // aria-label) — side-eye finding: two identical unlinked strings double-announce on readers.
  const labelIdBase = useId();
  // The preview is the same authored prose a transcript row shows, so it obeys the same quoted-speech pref.
  const colorQuotes = useColorQuotedSpeech();

  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const rewrite = useRewriteGreetingMutation({ trpc, invalidation });
  const generate = useGenerateGreetingMutation({ trpc, invalidation });
  const isPending = rewrite.isPending || generate.isPending;

  // The picked transform KINDS in CATALOG ORDER (filter preserves it) — the server resolves each one's
  // prose slot and joins the sentences with the free text (ARM B); no fragment bytes are composed here.
  const pickedTransforms = (): GreetingTransformId[] => GREETING_TRANSFORMS.filter((t) => selected.includes(t.id)).map((t) => t.id);

  const canRewrite = baseGreeting.trim().length > 0;

  const onRewrite = (): void => {
    rewrite.mutate(
      { characterId, greeting: baseGreeting, steer: instruction, transforms: pickedTransforms() },
      { onSuccess: (result): void => setPreview(result.text) },
    );
  };
  const onGenerate = (): void => {
    generate.mutate({ characterId, steer: instruction, transforms: pickedTransforms() }, { onSuccess: (result): void => setPreview(result.text) });
  };

  if (preview !== null) {
    return (
      <Stack gap="row" data-slot="greeting-studio-preview">
        <Text size="label" tone="muted">
          Preview
        </Text>
        <Stack gap="row" className="rounded-base bg-ai-bubble p-block">
          <Markdown trust={trusted ? "trusted" : "untrusted"} mode="static" colorQuotes={colorQuotes}>
            {preview}
          </Markdown>
        </Stack>
        <Row gap="field" align="center" justify="end">
          <Button intent="ghost" size="sm" onClick={(): void => setPreview(null)}>
            <Icon icon={X} size="sm" />
            Discard
          </Button>
          <Button
            intent="primary"
            size="sm"
            onClick={(): void => {
              onAccept(preview);
              setPreview(null);
            }}
          >
            <Icon icon={Check} size="sm" />
            Accept
          </Button>
        </Row>
      </Stack>
    );
  }

  return (
    <Stack gap="block" data-slot="greeting-studio">
      {GREETING_TRANSFORM_AXES.map((axis) => (
        <Stack key={axis} gap="field">
          <Text size="micro" tone="muted" id={`${labelIdBase}-${axis}`}>
            {AXIS_LABEL[axis]}
          </Text>
          <ToggleGroup
            multiple={true}
            value={[...selected]}
            onValueChange={(next): void => setSelected(next)}
            aria-labelledby={`${labelIdBase}-${axis}`}
            className="flex-wrap"
          >
            {transformsByAxis(axis).map((t) => (
              <Toggle key={t.id} value={t.id} size="sm">
                {t.label}
              </Toggle>
            ))}
          </ToggleGroup>
        </Stack>
      ))}

      <Textarea
        rows={2}
        value={instruction}
        onChange={(event): void => setInstruction(event.target.value)}
        placeholder="Any extra instructions (optional)…"
        aria-label="Greeting instructions"
      />

      <Row gap="field" align="center" justify="end">
        {isPending ? <WebSpinner size="sm" label="Generating…" /> : null}
        <Button intent="secondary" size="sm" disabled={isPending} onClick={onGenerate}>
          <Icon icon={Sparkles} size="sm" />
          Make new
        </Button>
        <Button intent="primary" size="sm" disabled={isPending || !canRewrite} onClick={onRewrite}>
          <Icon icon={WandSparkles} size="sm" />
          Rewrite
        </Button>
      </Row>
    </Stack>
  );
}
