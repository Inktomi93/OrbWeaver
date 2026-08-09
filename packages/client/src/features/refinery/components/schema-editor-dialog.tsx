// The custom-schema EDITOR (R3/SF — the NL design §4.7): the describe-in-English door. One dialog, four
// coupled panes: the NL panel (describe → Generate → Refine-instruction → iterate), the schema itself
// (raw JSON — the secondary door; the lift refusal surfaces VERBATIM with construct + path), the LIVE
// RENDER PREVIEW (the SAME `buildRenderPlan`+`PayloadView` every run renders through — a custom schema
// that previews poorly is a renderer defect, which is exactly the honesty loop the owner asked for), and
// the test drill (pick an owned card → `testSchema` → the real model payload through the same preview).
//
// The generator's `failed` arm renders the RAW reply into the JSON pane for hand-fixing (the
// show-the-partial policy — errors-as-data, never a toast that eats the draft).

import type { RefineryForgeArm, RefinerySchemaStage } from "@orb/contracts/refinery";
import { REFINERY_FORGE_ARM_DEFAULT, REFINERY_FORGE_ARMS } from "@orb/contracts/refinery";
import type { CharacterId, RefinerySchemaId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Card } from "@orb/ui/card";
import { Field } from "@orb/ui/field";
import { Row, Stack } from "@orb/ui/layout";
import type { SelectItems } from "@orb/ui/select";
import { Select } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import { Textarea } from "@orb/ui/textarea";
import type { ReactElement, RefObject } from "react";
import { useRef, useState } from "react";
import { FormDialog } from "#components";
import { useInvalidation, useTRPC } from "#data";
import { testId } from "#lib";
import {
  useCreateRefinerySchema,
  useGenerateRefinerySchema,
  useRefineRefinerySchema,
  useTestRefinerySchema,
  useUpdateRefinerySchema,
} from "../hooks/use-refinery-schemas.ts";
import { buildRenderPlan } from "../lib/render-plan.ts";
import { CharacterDoor } from "./character-door.tsx";
import { PayloadView } from "./payload-view.tsx";
import { RefineryChip } from "./refinery-chip.tsx";

export interface SchemaEditorDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly stage: RefinerySchemaStage;
  /** Editing an existing row, or null = authoring a new one. */
  readonly editing: { readonly id: RefinerySchemaId; readonly name: string; readonly description: string; readonly schema: Record<string, unknown> } | null;
  /** Fired with the saved row's id so the caller can point the session at it. */
  readonly onSaved: (schemaId: RefinerySchemaId) => void;
}

const STAGE_WORD: Record<RefinerySchemaStage, string> = { score: "score", analyze: "analyze" };

/** The authoring ARMS, as the author reads them (task #36 — the owner's "we should have options"). Labels
 *  DERIVE from the contract tuple so a new arm cannot ship without a word for it (the admin-items
 *  precedent). Owner-facing wording says what the arm COSTS and what it buys, never the mechanism. */
const FORGE_ARM_LABELS: Record<RefineryForgeArm, string> = {
  single: "One pass — fastest",
  guided: "Field by field — best for big schemas",
  "two-stage": "Shape first, then styling",
};
const FORGE_ARM_ITEMS: SelectItems<string> = REFINERY_FORGE_ARMS.map((value) => ({ value, label: FORGE_ARM_LABELS[value] }));
/** The arm picker's ONE label string — rendered visibly by `Field` AND as the control's `aria-label`
 *  (see the call site's note: two spellings would be a WCAG 2.5.3 mismatch waiting to happen). */
const FORGE_ARM_QUESTION = "How to build it";

function dialogTitleOf(editing: SchemaEditorDialogProps["editing"], stage: RefinerySchemaStage): string {
  return editing === null ? `New ${STAGE_WORD[stage]} schema` : `Edit "${editing.name}"`;
}

/** The no-preview arm's copy: an empty pane invites, a broken one teaches. */
function previewEmptyTextOf(schemaText: string): string {
  return schemaText.trim().length === 0 ? "Generate a draft, or paste a schema to preview it." : "That JSON doesn't parse yet — fix it to preview.";
}

function parseDraft(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** A save refusal, verbatim (the lift belt's construct + path text IS the teaching surface). */
function RefusalNote({ error }: { error: unknown }): ReactElement | null {
  if (error === null || error === undefined) {
    return null;
  }
  return (
    <Text data-testid={testId("refinerySchemaRefusal")} voice="gloss">
      {String((error as { message?: string }).message ?? "That schema was refused.")}
    </Text>
  );
}

/** The live render preview + the test drill — remounted per draft (`key={schemaText}` at the caller),
 *  so a fresh draft always opens with an empty test payload. */
function PreviewCard({
  plan,
  schema,
  stage,
  outerBusy,
}: {
  plan: ReturnType<typeof buildRenderPlan>;
  schema: Record<string, unknown>;
  stage: RefinerySchemaStage;
  outerBusy: boolean;
}): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const testSchema = useTestRefinerySchema({ trpc, invalidation });
  const [testCharacter, setTestCharacter] = useState<{ readonly id: CharacterId; readonly name: string } | null>(null);
  const [testPayload, setTestPayload] = useState<Record<string, unknown> | null>(null);
  const testCharacterId = testCharacter?.id ?? null;
  return (
    <Card>
      <Stack gap="row" padding="block">
        <Row align="center" gap="field">
          <Text voice="kicker">Render preview</Text>
          <RefineryChip tone="info">the same renderer every run uses</RefineryChip>
        </Row>
        {/* The test drill's own loading arm (P1-10: "no loading affordance on any model call"). A
            `testSchema` turn is a real model round-trip; while it runs, the preview keeps painting the
            LAST settled payload under a shimmer rather than blanking — the same "never goes blank
            between stages" law the content surface holds itself to. */}
        <PayloadView payload={testPayload ?? {}} plan={plan} pending={testSchema.isPending} />
        <Row align="center" gap="field">
          <CharacterDoor
            chosenName={testCharacter?.name ?? null}
            disabled={outerBusy || testSchema.isPending}
            label="Test the schema on a card"
            onSelect={(id, name): void => setTestCharacter({ id, name })}
            placeholder="Pick a card to test on"
          />
          <Button
            aria-busy={testSchema.isPending}
            disabled={outerBusy || testSchema.isPending || testCharacterId === null}
            intent="secondary"
            onClick={(): void => {
              if (testCharacterId !== null) {
                testSchema.mutate({ schema, stage, characterId: testCharacterId }, { onSuccess: (payload): void => setTestPayload(payload) });
              }
            }}
            size="sm"
          >
            {testSchema.isPending ? "Running…" : "Test on this card"}
          </Button>
        </Row>
      </Stack>
    </Card>
  );
}

interface SaveDeps {
  readonly editing: SchemaEditorDialogProps["editing"];
  readonly description: string;
  readonly stage: RefinerySchemaStage;
  readonly create: ReturnType<typeof useCreateRefinerySchema>;
  readonly update: ReturnType<typeof useUpdateRefinerySchema>;
  readonly onSaved: (schemaId: RefinerySchemaId) => void;
  readonly onOpenChange: (open: boolean) => void;
}

/** The save press: create-or-update against the library, closing on success (the refusal renders
 *  in-dialog via `RefusalNote` — errors-as-data, never a lost draft). */
function saveDraft(name: string, schema: Record<string, unknown> | null, deps: SaveDeps): void {
  const { editing, description, stage, create, update, onSaved, onOpenChange } = deps;
  if (schema === null || name.length === 0) {
    return;
  }
  const onSuccess = (row: { id: RefinerySchemaId }): void => {
    onSaved(row.id);
    onOpenChange(false);
  };
  if (editing === null) {
    create.mutate({ name, description, stage, schema }, { onSuccess });
    return;
  }
  update.mutate({ schemaId: editing.id, patch: { name, description, schema } }, { onSuccess });
}

type ForgeResult =
  | { kind: "draft"; name: string; schema: Record<string, unknown>; dropped: readonly string[] }
  | { kind: "needs-raw"; message: string; skeleton: Record<string, unknown> }
  | { kind: "failed"; message: string; raw: string | null };

interface DraftSetters {
  readonly nameRef: RefObject<HTMLTextAreaElement | null>;
  readonly setNameFilled: (filled: boolean) => void;
  readonly setSchemaText: (text: string) => void;
  readonly setForgeNote: (note: string | null) => void;
}

/** Land a forge turn's result. A draft fills the panes (and a still-blank name), itemizing any design row
 *  the transpile could not place. `needs-raw` is the HONEST REFUSAL — the ask needed a construct the guided
 *  designer cannot express, so the starter skeleton lands in the JSON pane (which takes the FULL vocabulary)
 *  with the reason stated, instead of a flattened approximation of the author's idea. A failure renders the
 *  raw reply for hand-fixing (show-the-partial — never a toast that eats the draft). Runs at EVENT time only
 *  (mutation onSuccess), so the ref read is legal. */
function applyForgeResult(result: ForgeResult, { nameRef, setNameFilled, setSchemaText, setForgeNote }: DraftSetters): void {
  if (result.kind === "draft") {
    if (nameRef.current !== null && nameRef.current.value.trim().length === 0) {
      nameRef.current.value = result.name;
      setNameFilled(true);
    }
    setSchemaText(JSON.stringify(result.schema, null, 2));
    setForgeNote(result.dropped.length === 0 ? null : `Some rows didn't fit and were left out: ${result.dropped.join(" · ")}`);
    return;
  }
  if (result.kind === "needs-raw") {
    setSchemaText(JSON.stringify(result.skeleton, null, 2));
    setForgeNote(`${result.message} The JSON below is a starting point — edit it directly; the raw editor accepts the whole schema vocabulary.`);
    return;
  }
  setForgeNote(result.message);
  if (result.raw !== null) {
    setSchemaText(result.raw);
  }
}

/** The GENERATE row — the arm picker + the Generate press (task #36). Its own component, beside `RefineRow`
 *  for the same reason: the dialog is not a form (its two text panes are a description and a raw JSON door,
 *  not fields of one record), and keeping each control cluster in its own component is what keeps it from
 *  drifting into one. */
function GenerateRow({
  arm,
  busy,
  description,
  stage,
  generate,
  onArmChange,
  onLand,
}: {
  arm: RefineryForgeArm;
  busy: boolean;
  description: string;
  stage: RefinerySchemaStage;
  generate: ReturnType<typeof useGenerateRefinerySchema>;
  onArmChange: (arm: RefineryForgeArm) => void;
  onLand: (result: ForgeResult) => void;
}): ReactElement {
  return (
    <>
      {/* VISIBLY LABELLED (P2: "arm picker unlabeled visibly"). `aria-label` alone told a screen reader
          what this control is and told a sighted user nothing — three sentence-shaped options with no
          question above them. The Field label IS the question. `max-w-sm` caps the P1-3 squeeze at the
          source: an unbounded Select sized itself to its longest option label. */}
      <Field className="min-w-0 max-w-sm flex-1" label={FORGE_ARM_QUESTION}>
        <Select
          // The `aria-label` is the SAME STRING as the visible label, from one constant. It is kept
          // because `Field` associates through Base UI context at runtime, which the static a11y lint
          // cannot follow — and because a divergent aria-label would break WCAG 2.5.3 (the accessible
          // name must contain the visible one). One constant makes divergence impossible.
          aria-label={FORGE_ARM_QUESTION}
          items={FORGE_ARM_ITEMS}
          onValueChange={(value): void => {
            const next = REFINERY_FORGE_ARMS.find((a) => a === value);
            if (next !== undefined) {
              onArmChange(next);
            }
          }}
          value={arm}
        />
      </Field>
      <Button
        aria-busy={busy}
        disabled={busy || description.trim().length === 0}
        onClick={(): void => {
          generate.mutate({ description, stage, arm }, { onSuccess: onLand });
        }}
        size="sm"
      >
        {busy ? "Generating…" : "Generate"}
      </Button>
    </>
  );
}

/** The conversational-iteration row (§4.5 loop) — instruction in, `refineSchema` turn out. Only rendered
 *  once a parseable draft exists. */
function RefineRow({
  schema,
  stage,
  arm,
  busy,
  instructionRef,
  refine,
  onLand,
}: {
  schema: Record<string, unknown>;
  stage: RefinerySchemaStage;
  arm: RefineryForgeArm;
  busy: boolean;
  instructionRef: RefObject<HTMLTextAreaElement | null>;
  refine: ReturnType<typeof useRefineRefinerySchema>;
  onLand: (result: ForgeResult) => void;
}): ReactElement {
  return (
    <>
      <Field className="min-w-0 flex-1" label="Refine the draft">
        <Textarea defaultValue="" placeholder='e.g. "add a per-issue severity enum"' ref={instructionRef} rows={1} />
      </Field>
      <Button
        disabled={busy}
        intent="secondary"
        onClick={(): void => {
          const instruction = instructionRef.current?.value.trim() ?? "";
          if (instruction.length > 0) {
            refine.mutate({ schema, instruction, stage, arm }, { onSuccess: onLand });
          }
        }}
        size="sm"
      >
        Refine
      </Button>
    </>
  );
}

export function SchemaEditorDialog({ open, onOpenChange, stage, editing, onSaved }: SchemaEditorDialogProps): ReactElement {
  const nameRef = useRef<HTMLTextAreaElement>(null);
  const instructionRef = useRef<HTMLTextAreaElement>(null);
  const [nameFilled, setNameFilled] = useState(editing !== null && editing.name.length > 0);
  const [description, setDescription] = useState(editing === null ? "" : editing.description);
  const [schemaText, setSchemaText] = useState(editing === null ? "" : JSON.stringify(editing.schema, null, 2));
  const [forgeNote, setForgeNote] = useState<string | null>(null);
  const [arm, setArm] = useState<RefineryForgeArm>(REFINERY_FORGE_ARM_DEFAULT);

  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const deps = { trpc, invalidation };
  const generate = useGenerateRefinerySchema(deps);
  const refine = useRefineRefinerySchema(deps);
  const create = useCreateRefinerySchema(deps);
  const update = useUpdateRefinerySchema(deps);

  const schema = parseDraft(schemaText);
  // The live preview: the SAME plan derivation every run renders through, over an EMPTY payload (the
  // designed empty arms show the anatomy — hero gauge, chips, prose slots — before any model ran).
  const previewPlan = schema === null ? null : buildRenderPlan(schema);
  // A function declaration, not a render-time factory call: the ref is only READ inside the event-time
  // body (the react-hooks refs-during-render ban).
  function landDraft(result: ForgeResult): void {
    applyForgeResult(result, { nameRef, setNameFilled, setSchemaText, setForgeNote });
  }
  const busy = generate.isPending || refine.isPending;

  return (
    <FormDialog onOpenChange={onOpenChange} open={open} size="lg" title={dialogTitleOf(editing, stage)}>
      <Stack gap="row">
        <Text voice="gloss">
          Two ways in, both first-class. Describe what you want in plain English and the designer builds it — the model answers into a fixed grammar, so it
          cannot invent a shape this app can't render. Or write the schema yourself in the JSON pane below, which takes the full vocabulary: unions, mixed
          lists, deeper nesting. If a description needs something the designer can't express, it says so and hands you a starting point instead of guessing.
        </Text>
        <Field label="Describe the structure">
          <Textarea
            onChange={(e): void => setDescription(e.target.value)}
            placeholder='e.g. "rating 1-10, a mood enum, list of issues, one-paragraph summary"'
            rows={2}
            value={description}
          />
        </Field>
        {/* TWO ROWS, NOT ONE (side-eye 2026-08-09 P1-3 — the worse twin of P1-2). The arm Select, the
            Generate press, the "Refine the draft" Field and the Refine press all shared one Row; the
            Select alone took ~580px of 670, so the Field collapsed to **26px** and its placeholder
            wrapped one character per line, driving the dialog's scrollHeight to 1989px against a 734px
            viewport. Splitting them AND capping the Select is the fix: the two rows are also two
            different verbs (author a draft / iterate on the draft), so the split is honest, not cosmetic. */}
        <Row align="center" gap="field">
          <GenerateRow arm={arm} busy={busy} description={description} generate={generate} onArmChange={setArm} onLand={landDraft} stage={stage} />
        </Row>
        {schema !== null ? (
          <Row align="end" gap="field">
            <RefineRow arm={arm} busy={busy} instructionRef={instructionRef} onLand={landDraft} refine={refine} schema={schema} stage={stage} />
          </Row>
        ) : null}
        {forgeNote !== null ? (
          <Text data-testid={testId("refineryForgeNote")} voice="gloss">
            {forgeNote}
          </Text>
        ) : null}
        <Field label="Schema (JSON — the full vocabulary)">
          <Textarea onChange={(e): void => setSchemaText(e.target.value)} rows={8} value={schemaText} />
        </Field>
        <RefusalNote error={editing === null ? create.error : update.error} />
        {previewPlan !== null && schema !== null ? (
          <PreviewCard key={schemaText} outerBusy={busy} plan={previewPlan} schema={schema} stage={stage} />
        ) : (
          <Text voice="gloss">{previewEmptyTextOf(schemaText)}</Text>
        )}
        <Row gap="row" justify="end">
          <Field label="Name">
            <Textarea
              defaultValue={editing === null ? "" : editing.name}
              onInput={(e): void => setNameFilled(e.currentTarget.value.trim().length > 0)}
              ref={nameRef}
              rows={1}
            />
          </Field>
          <Button
            disabled={busy || schema === null || !nameFilled}
            onClick={(): void => saveDraft(nameRef.current?.value.trim() ?? "", schema, { editing, description, stage, create, update, onSaved, onOpenChange })}
            size="sm"
          >
            {editing === null ? "Save schema" : "Save changes"}
          </Button>
        </Row>
      </Stack>
    </FormDialog>
  );
}
