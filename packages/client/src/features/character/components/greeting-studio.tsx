// Character greeting generation returns preview text without writing or invalidating cached data.
// Accept hands persistence to the editor; transform kinds resolve against the caller's preset server-side.

import type { GreetingTransformAxis, GreetingTransformId } from "@orb/contracts/preset";
import { GREETING_TRANSFORM_AXES, GREETING_TRANSFORMS } from "@orb/contracts/preset";
import type { CharacterId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Check, Icon, Sparkles, WandSparkles, X } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Markdown } from "@orb/ui/markdown";
import { MessageBubble } from "@orb/ui/message-bubble";
import { WebSpinner } from "@orb/ui/spinner";
import { Text } from "@orb/ui/text";
import { Textarea } from "@orb/ui/textarea";
import { Toggle } from "@orb/ui/toggle";
import { ToggleGroup } from "@orb/ui/toggle-group";
import type { ReactElement } from "react";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { useColorQuotedSpeech, useInvalidation, useTRPC } from "#data";
import { DIALOG_VERBS, viewerTimeZone } from "#lib";
import { useGenerateGreetingMutation, useRewriteGreetingMutation } from "../hooks/use-character-mutations.ts";
import { GREETING_MAKE_NEW_NAME } from "../lib/greeting-copy.ts";

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
  const rewriteRef = useRef<HTMLButtonElement>(null);
  const generateRef = useRef<HTMLButtonElement>(null);
  const lastGenerator = useRef(rewriteRef);
  const restoreGeneratorFocus = useRef(false);
  useLayoutEffect(() => {
    if (preview === null && restoreGeneratorFocus.current) {
      restoreGeneratorFocus.current = false;
      lastGenerator.current.current?.focus();
    }
  }, [preview]);
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
    lastGenerator.current = rewriteRef;
    rewrite.mutate(
      { characterId, greeting: baseGreeting, steer: instruction, transforms: pickedTransforms(), timeZone: viewerTimeZone() },
      { onSuccess: (result): void => setPreview(result.text) },
    );
  };
  const onGenerate = (): void => {
    lastGenerator.current = generateRef;
    generate.mutate(
      { characterId, steer: instruction, transforms: pickedTransforms(), timeZone: viewerTimeZone() },
      { onSuccess: (result): void => setPreview(result.text) },
    );
  };

  if (preview !== null) {
    return (
      <Stack gap="row" data-slot="greeting-studio-preview">
        <Text ink="muted" voice="label">
          Preview
        </Text>
        <MessageBubble messageRole="assistant">
          <Stack gap="row">
            <Markdown trust={trusted ? "trusted" : "untrusted"} mode="static" colorQuotes={colorQuotes} allowExternalMedia={allowExternalMedia}>
              {preview}
            </Markdown>
          </Stack>
        </MessageBubble>
        <Row gap="field" align="center" justify="end">
          <Button
            variant="ghost"
            size="sm"
            onClick={(): void => {
              restoreGeneratorFocus.current = true;
              setPreview(null);
            }}
          >
            <Icon icon={X} size="sm" />
            {DIALOG_VERBS.discard}
          </Button>
          <Button
            size="sm"
            onClick={(): void => {
              onAccept(preview);
              setPreview(null);
            }}
          >
            <Icon icon={Check} size="sm" />
            {DIALOG_VERBS.accept}
          </Button>
        </Row>
      </Stack>
    );
  }

  return (
    <Stack gap="block" data-slot="greeting-studio">
      {GREETING_TRANSFORM_AXES.map((axis) => (
        <Stack key={axis} gap="field">
          <Text ink="muted" id={`${labelIdBase}-${axis}`} voice="gloss">
            {AXIS_LABEL[axis]}
          </Text>
          <ToggleGroup multiple={true} value={[...selected]} onValueChange={(next): void => setSelected(next)} aria-labelledby={`${labelIdBase}-${axis}`}>
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

      <Row wrap={true} gap="field" align="center" justify="end">
        {isPending ? <WebSpinner size="sm" label="Generating…" /> : null}
        <Button ref={generateRef} variant="outline" size="sm" disabled={isPending} onClick={onGenerate}>
          <Icon icon={Sparkles} size="sm" />
          {GREETING_MAKE_NEW_NAME}
        </Button>
        <Button ref={rewriteRef} size="sm" disabled={isPending || !canRewrite} onClick={onRewrite}>
          <Icon icon={WandSparkles} size="sm" />
          Rewrite
        </Button>
      </Row>
    </Stack>
  );
}
