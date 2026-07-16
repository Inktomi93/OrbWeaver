// The CENTER drill-in for one selected section: a "back to rack" button, header, and body editor. Body
// branches per section kind: literal → MacroField; templated marker → Default/Custom/Silent tri-state
// mapping `template` to unset/string/""; world-info marker → the shared `formatStrings.wiFormat` wrapper;
// other plain marker → an explainer one-liner only.

import type { PromptConfig, PromptSection } from "@orb/contracts/preset";
import { DEFAULT_MARKER_TEMPLATES } from "@orb/contracts/preset";
import { Button } from "@orb/ui/button";
import { Field } from "@orb/ui/field";
import { ArrowLeft, Icon } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { MacroTextarea } from "@orb/ui/macro-textarea";
import { Text } from "@orb/ui/text";
import { Toggle } from "@orb/ui/toggle";
import { ToggleGroup } from "@orb/ui/toggle-group";
import type { ReactElement } from "react";
import { useState } from "react";
import type { AppFormInstance } from "#forms";
import { headerCopy, isTemplatedMarker, sectionGlyphIcon } from "../../lib/assembly-model";
import { PRESET_PROMPT_MACROS } from "../../lib/preset-prompt-macros";
import { MARKER_COPY } from "./marker-copy";

type AssemblyForm = AppFormInstance<PromptConfig>;

const BODY_ROWS = 16;
/** A min-height floor — the Textarea's `field-sizing: content` otherwise collapses `rows` to ~2 lines. */
const BODY_MIN_H = "min-h-80";

export interface SectionBodyEditorProps {
  readonly form: AssemblyForm;
  readonly section: PromptSection;
  readonly index: number;
  /** Back to the rack view (clears the CONTEXT/CENTER section selection). */
  readonly onBack: () => void;
}

export function SectionBodyEditor({ form, section, index, onBack }: SectionBodyEditorProps): ReactElement {
  const { label, oneLiner } = headerCopy(section);
  return (
    <Stack gap="section">
      <Row gap="row" align="center">
        <Button intent="ghost" size="sm" onClick={onBack}>
          <Icon icon={ArrowLeft} size="sm" />
          Back to rack
        </Button>
      </Row>

      <Stack gap="field">
        <Row gap="row" align="center">
          <Icon icon={sectionGlyphIcon(section)} size="sm" />
          <Text size="title" weight="semibold">
            {label}
          </Text>
        </Row>
        <Text size="micro" tone="muted">
          {oneLiner}
        </Text>
      </Stack>

      <SectionBody form={form} section={section} index={index} />
    </Stack>
  );
}

/** The body — literal MacroField · templated tri-state · shared WI wrapper · plain explainer. */
function SectionBody({ form, section, index }: Omit<SectionBodyEditorProps, "onBack">): ReactElement {
  if (section.type === "literal") {
    return (
      <form.AppField name={`sections[${index}].content`}>
        {(field): ReactElement => <field.MacroField label="Text" suggestions={PRESET_PROMPT_MACROS} rows={BODY_ROWS} className={BODY_MIN_H} />}
      </form.AppField>
    );
  }
  if (isTemplatedMarker(section.marker)) {
    return <TemplatedMarkerBody form={form} section={section} index={index} />;
  }
  if (section.marker === "world_info_before" || section.marker === "world_info_after") {
    return <WorldInfoBody form={form} section={section} />;
  }
  return (
    <Text size="micro" tone="muted">
      This section fills in automatically — there's nothing to write here.
    </Text>
  );
}

/** The tri-state (§3.5) a templated marker's `template` maps onto: unset · non-empty string · "". */
const TEMPLATE_MODES = ["default", "custom", "silent"] as const;
type TemplateMode = (typeof TEMPLATE_MODES)[number];

/** `template` → its tri-state: undefined ⇒ Default, "" ⇒ Silent (explicitly empty), else Custom. */
function deriveTemplateMode(template: string | undefined): TemplateMode {
  if (template === undefined) {
    return "default";
  }
  return template === "" ? "silent" : "custom";
}

/** Default / Custom / Silent tri-state for a templated marker. DEFAULT ghosts the built-in template (or,
 *  for the empty-default markers, shows the plain-language explainer instead of a bare ghost); CUSTOM
 *  reveals the MacroTextarea bound to `template`; SILENT records `template = ""` (render nothing). */
function TemplatedMarkerBody({ form, section, index }: Omit<SectionBodyEditorProps, "onBack">): ReactElement | null {
  const template = section.type === "marker" && "template" in section ? section.template : undefined;
  // Mode is LOCAL so Custom stays active with an as-yet-unwritten body (else an empty custom derives back).
  const [mode, setMode] = useState<TemplateMode>(() => deriveTemplateMode(template));
  if (section.type !== "marker" || !isTemplatedMarker(section.marker)) {
    return null;
  }
  const marker = section.marker;
  const factoryDefault = DEFAULT_MARKER_TEMPLATES[marker];
  const emptyDefault = factoryDefault === "";
  const name = `sections[${index}].template` as const;

  const pick = (next: TemplateMode): void => {
    setMode(next);
    if (next === "default") {
      form.setFieldValue(name, undefined);
    } else if (next === "silent") {
      form.setFieldValue(name, "");
    } else if (!emptyDefault && (template === undefined || template === "")) {
      // Custom on a marker with a real default: seed the editor from that default.
      form.setFieldValue(name, factoryDefault);
    }
  };

  return (
    <Stack gap="field">
      <ToggleGroup aria-label="Template mode" value={[mode]} onValueChange={(picked): void => pick((picked[0] ?? "default") as TemplateMode)}>
        <Toggle value="default" aria-label="Use the built-in default">
          Default
        </Toggle>
        <Toggle value="custom" aria-label="Write a custom template">
          Custom
        </Toggle>
        <Toggle value="silent" aria-label="Render nothing">
          Silent
        </Toggle>
      </ToggleGroup>
      <TemplateModeBody
        mode={mode}
        template={template}
        marker={marker}
        factoryDefault={factoryDefault}
        emptyDefault={emptyDefault}
        onChange={(next): void => form.setFieldValue(name, next)}
      />
    </Stack>
  );
}

interface TemplateModeBodyProps {
  readonly mode: TemplateMode;
  readonly template: string | undefined;
  readonly marker: keyof typeof DEFAULT_MARKER_TEMPLATES;
  readonly factoryDefault: string;
  readonly emptyDefault: boolean;
  readonly onChange: (next: string) => void;
}

/** The per-mode body: Custom editor · Silent note · empty-default explainer · ghosted built-in default. */
function TemplateModeBody({ mode, template, marker, factoryDefault, emptyDefault, onChange }: TemplateModeBodyProps): ReactElement {
  if (mode === "custom") {
    return (
      <Field label="Template">
        <MacroTextarea
          aria-label="Template"
          value={template ?? ""}
          onChange={onChange}
          suggestions={PRESET_PROMPT_MACROS}
          rows={BODY_ROWS}
          className={BODY_MIN_H}
        />
      </Field>
    );
  }
  if (mode === "silent") {
    return (
      <Text size="micro" tone="muted">
        Silent — this marker renders nothing.
      </Text>
    );
  }
  if (emptyDefault) {
    return (
      <Text size="micro" tone="muted">
        {MARKER_COPY[marker].oneLiner} There's no built-in text — switch to Custom to write your own.
      </Text>
    );
  }
  return (
    <Stack gap="field">
      <Text size="micro" tone="muted">
        Using the built-in default:
      </Text>
      <Text size="code" tone="muted">
        {factoryDefault}
      </Text>
    </Stack>
  );
}

/** The shared World-Info wrapper (§3.5): `formatStrings.wiFormat` (default `{{entry}}`) framing EACH
 *  lorebook entry — one wrapper, shared by both WI markers (hence the shared-scope hint). */
function WorldInfoBody({ form, section }: { readonly form: AssemblyForm; readonly section: PromptSection }): ReactElement {
  const oneLiner = section.type === "marker" ? MARKER_COPY[section.marker].oneLiner : "Lorebook entries.";
  return (
    <Stack gap="field">
      <Text size="micro" tone="muted">
        {oneLiner}
      </Text>
      <form.AppField name="formatStrings.wiFormat">
        {(field): ReactElement => (
          <field.MacroField
            label="Entry wrapper"
            description="Wraps each lorebook entry — {{entry}} is the entry text. Shared by both World Info markers; blank uses {{entry}}."
            suggestions={PRESET_PROMPT_MACROS}
            rows={3}
          />
        )}
      </form.AppField>
    </Stack>
  );
}
