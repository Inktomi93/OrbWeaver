// The live-themed greeting bubble. `greetings[0]` (or the active alternate) renders through
// `@orb/ui/markdown` inside a `<ThemeScope>` painted with this character's own `themeOverride`. Alternates
// are in-bubble pill-tabs. "Edit" swaps the read-only preview for a `MacroTextarea` on the same field.
// The spoiler-blur eye toggle CSS-blurs the preview only — never the edit textarea.

import type { ThemeOverride } from "@orb/contracts/theme";
import type { CharacterId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Icon, Pencil, Plus, Trash2, WandSparkles } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { MacroTextarea } from "@orb/ui/macro-textarea";
import { Markdown } from "@orb/ui/markdown";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import { ThemeScope } from "@orb/ui/theme-scope";
import type { ReactElement } from "react";
import { useState } from "react";
import { GreetingStudio } from "#components";
import { useColorQuotedSpeech } from "#data";
import type { AppFormInstance } from "#forms";
import { cn } from "#lib";
import type { CharacterCardFormValues } from "../lib/character-card-form-model";
import { CHARACTER_CARD_MACROS } from "../lib/character-card-macros";

type CardForm = AppFormInstance<CharacterCardFormValues>;

export interface CharacterGreetingPreviewProps {
  readonly characterId: CharacterId;
  readonly form: CardForm;
  /** THIS character's raw theme override (immediate-commit — server truth) painting the preview scope;
   *  `null` ⇒ inherit the ambient theme. */
  readonly themeOverride: ThemeOverride | null;
  /** The resolved render-trust for this character's own content (§6.1 preview): `trustHtml === true`. */
  readonly trusted: boolean;
  /** §6.1 spoiler eye — blurs the preview text (never the edit textarea). */
  readonly spoilerBlur: boolean;
  /** The greeting the hero is previewing (drives the §6.5 total token count — lifted to the body). */
  readonly activeIndex: number;
  readonly onActiveIndexChange: (index: number) => void;
}

/** The greeting-TEXT field path for the active alternate — the array-element key the TanStack Field binds. */
function greetingName(index: number): `greetings[${number}].text` {
  return `greetings[${index}].text`;
}

/** The per-greeting group-only flag field path (the group-chat-only toggle binds it). */
function greetingGroupOnlyName(index: number): `greetings[${number}].groupOnly` {
  return `greetings[${index}].groupOnly`;
}

export function CharacterGreetingPreview(props: CharacterGreetingPreviewProps): ReactElement {
  const { form, activeIndex, onActiveIndexChange } = props;
  const [editing, setEditing] = useState(false);

  return (
    <form.Subscribe selector={(s): CharacterCardFormValues["greetings"] => s.values.greetings}>
      {(greetings): ReactElement => {
        // Clamp a stale active index (an alternate was just removed) — a render derivation, never an effect.
        const index = Math.min(activeIndex, Math.max(0, greetings.length - 1));
        return (
          <Stack gap="row" data-slot="character-greeting">
            <GreetingPills count={greetings.length} activeIndex={index} onSelect={onActiveIndexChange} />
            <GreetingBody {...props} index={index} editing={editing} />
            <GreetingActions
              characterId={props.characterId}
              form={form}
              index={index}
              greetingCount={greetings.length}
              editing={editing}
              baseGreeting={greetings[index]?.text ?? ""}
              trusted={props.trusted}
              onActiveIndexChange={onActiveIndexChange}
              onToggleEdit={(): void => setEditing((e) => !e)}
              onStartAlternate={(nextIndex): void => {
                onActiveIndexChange(nextIndex);
                setEditing(true);
              }}
            />
          </Stack>
        );
      }}
    </form.Subscribe>
  );
}

/** The "Opening 1 / 2 / …" in-bubble pill-tabs (rendered only for a multi-greeting card). */
function GreetingPills({
  count,
  activeIndex,
  onSelect,
}: {
  readonly count: number;
  readonly activeIndex: number;
  readonly onSelect: (index: number) => void;
}): ReactElement | null {
  if (count <= 1) {
    return null;
  }
  return (
    <Row gap="field" align="center" className="flex-wrap">
      {Array.from({ length: count }, (_, i) => (
        <Button
          // biome-ignore lint/suspicious/noArrayIndexKey: greetings are positional alternates with no stable id (an ST card array) — the index IS the identity (§6.1 "Opening N").
          key={i}
          type="button"
          size="sm"
          intent={i === activeIndex ? "secondary" : "ghost"}
          onClick={(): void => onSelect(i)}
        >
          Opening {i + 1}
        </Button>
      ))}
    </Row>
  );
}

/** The preview (themed Markdown, spoiler-aware) OR the raw edit textarea + token counter for one greeting. */
function GreetingBody({
  form,
  themeOverride,
  trusted,
  spoilerBlur,
  index,
  editing,
}: CharacterGreetingPreviewProps & {
  readonly index: number;
  readonly editing: boolean;
}): ReactElement {
  // QUOTE-1: the preview bubble is the greeting AS THE CHAT WILL SHOW IT — same `--color-dialogue` tint
  // (the character's own `dialogueColor` override wins through the `ThemeScope` below, as in a chat row).
  const colorQuotes = useColorQuotedSpeech();
  if (editing) {
    return (
      <Stack gap="field">
        <form.Field name={greetingName(index)}>
          {(field): ReactElement => (
            <MacroTextarea
              aria-label={`Opening ${index + 1}`}
              value={field.state.value}
              onChange={(next): void => field.handleChange(next)}
              onBlur={field.handleBlur}
              suggestions={CHARACTER_CARD_MACROS}
              rows={5}
              placeholder="The character's first message…"
            />
          )}
        </form.Field>
      </Stack>
    );
  }
  return (
    <form.Subscribe selector={(s): string => s.values.greetings[index]?.text ?? ""}>
      {(active): ReactElement => (
        <ThemeScope tokens={themeOverride ?? {}}>
          <Stack gap="row" className={cn("rounded-card bg-ai-bubble p-block", spoilerBlur && "select-none blur-md")} data-slot="character-greeting-bubble">
            {active.trim() === "" ? (
              <Text tone="muted">No first message yet.</Text>
            ) : (
              <Markdown trust={trusted ? "trusted" : "untrusted"} mode="static" colorQuotes={colorQuotes}>
                {active}
              </Markdown>
            )}
          </Stack>
        </ThemeScope>
      )}
    </form.Subscribe>
  );
}

/** Add-opening / remove-alternate / edit-toggle row + the greeting studio (audit §3) toggled inline. */
function GreetingActions({
  characterId,
  form,
  index,
  greetingCount,
  editing,
  baseGreeting,
  trusted,
  onActiveIndexChange,
  onToggleEdit,
  onStartAlternate,
}: {
  readonly characterId: CharacterId;
  readonly form: CardForm;
  readonly index: number;
  readonly greetingCount: number;
  readonly editing: boolean;
  readonly baseGreeting: string;
  readonly trusted: boolean;
  readonly onActiveIndexChange: (index: number) => void;
  readonly onToggleEdit: () => void;
  readonly onStartAlternate: (nextIndex: number) => void;
}): ReactElement {
  const [studioOpen, setStudioOpen] = useState(false);
  return (
    // The group-only toggle (or its Opening-1 absence note) rides its OWN row above the action cluster —
    // it's an ATTRIBUTE of the greeting, not an action. Keeping it out of the `justify-end` button Row is
    // also what fixes the phone-width blowout: an `mr-auto` child inside a no-wrap `justify-end` row is
    // pushed to negative x when the four children overflow a ~320-414px width (side-eye V3 P0).
    <Stack gap="field" data-slot="character-greeting-actions">
      <GreetingAttributeRow form={form} index={index} greetingCount={greetingCount} />
      <Row gap="field" align="center" className="flex-wrap justify-end">
        {editing && index > 0 ? (
          <Button
            type="button"
            size="sm"
            intent="ghost"
            onClick={(): void => {
              // The D78 store-subscription driver persists structural array ops (removeFieldValue routes
              // through setFieldValue) — no call-site flush (autosave-form-doctrine.md §3, G-A).
              void form.removeFieldValue("greetings", index);
              onActiveIndexChange(Math.max(0, index - 1));
              // This Remove button unmounts when the new active greeting is the solo first message, dropping
              // focus to <body> (no SR announcement on a destructive act — side-eye #6). Move focus to the
              // always-present Add button next tick, after React commits the shrunk array.
              requestAnimationFrame(() => document.getElementById(ADD_OPENING_ID)?.focus());
            }}
          >
            <Icon icon={Trash2} size="sm" />
            Remove opening
          </Button>
        ) : null}
        <Button
          id={ADD_OPENING_ID}
          type="button"
          size="sm"
          intent="ghost"
          onClick={(): void => {
            // The D78 store-subscription driver persists the structural push (pushFieldValue routes through
            // setFieldValue) — no call-site flush (autosave-form-doctrine.md §3, G-A). The new slot then
            // autosaves its content on the first keystroke.
            form.pushFieldValue("greetings", { text: "" });
            onStartAlternate(greetingCount);
          }}
        >
          <Icon icon={Plus} size="sm" />
          Add opening
        </Button>
        <Button type="button" size="sm" intent={editing ? "secondary" : "ghost"} aria-pressed={editing} onClick={onToggleEdit}>
          <Icon icon={Pencil} size="sm" />
          {editing ? "Done" : "Edit"}
        </Button>
        <Button type="button" size="sm" intent={studioOpen ? "secondary" : "ghost"} aria-pressed={studioOpen} onClick={(): void => setStudioOpen((o) => !o)}>
          <Icon icon={WandSparkles} size="sm" />
          Studio
        </Button>
      </Row>
      {studioOpen ? (
        // The greeting studio (audit §3): accept appends the result as a NEW alternate (the original is
        // preserved — the source's swipe semantics, but durable on the card). The push routes through the
        // D78 store-subscription driver (autosaves through character.update), then jumps to the new opening.
        // The one-line explainer mirrors the draft-row dialog's description (the mount owns its copy) —
        // side-eye cold-read finding: without it, Rewrite-vs-Make-new is opaque in the primary home.
        <Stack gap="row">
          <Text size="label" tone="muted">
            Rewrite this greeting or make a new one — the result is saved to the character card.
          </Text>
          <GreetingStudio
            characterId={characterId}
            baseGreeting={baseGreeting}
            trusted={trusted}
            onAccept={(text): void => {
              form.pushFieldValue("greetings", { text });
              onStartAlternate(greetingCount);
              setStudioOpen(false);
            }}
          />
        </Stack>
      ) : null}
    </Stack>
  );
}

// The one Add-opening button carries a stable DOM id (a single GreetingActions instance mounts per editor)
// so the remove handler can restore focus to it without threading a ref through the button primitive.
const ADD_OPENING_ID = "greeting-add-opening";

/** The greeting's own "attribute" line above the action cluster: the group-only toggle on an alternate, or —
 *  when other openings exist — a one-liner explaining why the flag is absent on the always-shown first
 *  message (side-eye #4). A single first-message card shows nothing here. */
function GreetingAttributeRow({
  form,
  index,
  greetingCount,
}: {
  readonly form: CardForm;
  readonly index: number;
  readonly greetingCount: number;
}): ReactElement | null {
  if (index > 0) {
    return <GreetingGroupOnlyToggle form={form} index={index} />;
  }
  if (greetingCount > 1) {
    return (
      <Text size="micro" tone="muted">
        The first opening is always shown; mark alternates group-chats-only.
      </Text>
    );
  }
  return null;
}

/** The per-alternate "group chats only" flag (folded ST `group_only_greetings`). A labeled Switch bound to
 *  `greetings[i].groupOnly`; the autosave driver persists the flag like any other field. Rides its OWN row
 *  (not a `justify-end` action) so it reads as an attribute OF this greeting AND can't be pushed off-canvas
 *  at phone widths. `aria-labelledby` names the switch (statically, for AT + the linter); the label's
 *  `htmlFor` adds mouse/touch click-through onto the switch button (a labelable element). The Switch already
 *  carries the ≥44px `TOUCH_TARGET_PSEUDO` hit area. */
function GreetingGroupOnlyToggle({ form, index }: { readonly form: CardForm; readonly index: number }): ReactElement {
  const labelId = `greeting-group-only-${index}`;
  const switchId = `greeting-group-only-switch-${index}`;
  return (
    <form.Field name={greetingGroupOnlyName(index)}>
      {(field): ReactElement => (
        <Row gap="field" align="center">
          <label htmlFor={switchId}>
            <Text id={labelId} as="span" size="label" tone="muted">
              Group chats only
            </Text>
          </label>
          <Switch id={switchId} aria-labelledby={labelId} checked={field.state.value === true} onCheckedChange={(on): void => field.handleChange(on)} />
        </Row>
      )}
    </form.Field>
  );
}
