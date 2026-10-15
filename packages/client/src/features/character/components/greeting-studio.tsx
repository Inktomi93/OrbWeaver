// Character greeting generation returns preview text without writing or invalidating cached data.
// Accept hands persistence to the editor; transform kinds resolve against the caller's preset server-side.

import type { GreetingTransformAxis, GreetingTransformId } from "@orb/contracts/preset";
import { GREETING_TRANSFORM_AXES, GREETING_TRANSFORMS } from "@orb/contracts/preset";
import type { CharacterId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Card } from "@orb/ui/card";
import { Check, Icon, Sparkles, WandSparkles, X } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Markdown } from "@orb/ui/markdown";
import { WebSpinner } from "@orb/ui/spinner";
import { Text } from "@orb/ui/text";
import { Textarea } from "@orb/ui/textarea";
import { Toggle } from "@orb/ui/toggle";
import { ToggleGroup } from "@orb/ui/toggle-group";
import type { inferInput, inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useId, useState } from "react";
import type { Trpc } from "#data";
import { createEntityMutation, useColorQuotedSpeech, useInvalidation, useTRPC } from "#data";
import { viewerTimeZone } from "#lib";

/** The rewrite generation — returns the revised greeting text (no cache/bus effect; the result is previewed). */
const useRewriteGreetingMutation = createEntityMutation<inferInput<Trpc["character"]["rewriteGreeting"]>, inferOutput<Trpc["character"]["rewriteGreeting"]>>({
  options: (trpc) => trpc.character.rewriteGreeting.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't rewrite the greeting.",
});

/** The new-greeting generation — returns a fresh greeting text (no cache/bus effect; the result is previewed). */
const useGenerateGreetingMutation = createEntityMutation<inferInput<Trpc["character"]["generateGreeting"]>, inferOutput<Trpc["character"]["generateGreeting"]>>(
  {
    options: (trpc) => trpc.character.generateGreeting.mutationOptions(),
    busDriven: true,
    errorToast: "Couldn't generate the greeting.",
  },
);

export interface GreetingStudioProps {
  readonly characterId: CharacterId;
  /** The existing greeting text (the rewrite base). Empty ⇒ Rewrite is unavailable (nothing to rewrite);
   *  Make-new is always available. */
  readonly baseGreeting: string;
  /** Accept the previewed text — the character editor appends it to the autosaved form. */
  readonly onAccept: (text: string) => void;
  /** Whether this character's own greeting content is render-trusted (§6.1) — drives the preview Markdown. */
  readonly trusted?: boolean;
  /** Whether the preview may load off-origin media: this character's resolved external-media verdict. Off
   *  when omitted, matching the markdown seal. */
  readonly allowExternalMedia?: boolean;
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

export function GreetingStudio({ characterId, baseGreeting, onAccept, trusted = true, allowExternalMedia = false }: GreetingStudioProps): ReactElement {
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
      { characterId, greeting: baseGreeting, steer: instruction, transforms: pickedTransforms(), timeZone: viewerTimeZone() },
      { onSuccess: (result): void => setPreview(result.text) },
    );
  };
  const onGenerate = (): void => {
    generate.mutate(
      { characterId, steer: instruction, transforms: pickedTransforms(), timeZone: viewerTimeZone() },
      { onSuccess: (result): void => setPreview(result.text) },
    );
  };

  if (preview !== null) {
    return (
      <Stack gap="row" data-slot="greeting-studio-preview">
        <Text size="label" tone="muted">
          Preview
        </Text>
        <Card tone="bubble">
          <Stack gap="row">
            <Markdown trust={trusted ? "trusted" : "untrusted"} mode="static" colorQuotes={colorQuotes} allowExternalMedia={allowExternalMedia}>
              {preview}
            </Markdown>
          </Stack>
        </Card>
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
