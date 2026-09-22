// The custom-schema EDITOR (R3/SF — the NL design §4.7): the describe-in-English door. One dialog, four
// coupled panes: the NL panel (describe → Generate → Refine-instruction → iterate), the schema itself
// (raw JSON — the secondary door; the lift refusal surfaces VERBATIM with construct + path), the LIVE
// RENDER PREVIEW (the SAME `buildRenderPlan`+`PayloadView` every run renders through — a custom schema
// that previews poorly is a renderer defect, which is exactly the honesty loop the owner asked for), and
// the test drill (pick an owned card → `testSchema` → the real model payload through the same preview).
//
// The generator's `failed` arm renders the RAW reply into the JSON pane for hand-fixing (the
// show-the-partial policy — errors-as-data, never a toast that eats the draft).
//
// THE WAY OUT IS GUARDED (side-eye #81 P1). Nothing behind this surface persists a draft — no autosave, no
// EntityDraftStore, four panes of plain `useState`/refs — and it shipped with Save as its only footer
// control, so its only exits were Escape and the backdrop, both invisible and both silently destructive.
// There is now a real Cancel, and EVERY close request (press, Escape, backdrop) funnels through
// `requestClose`, which asks only when the panes actually differ from the row being edited. One predicate,
// one door: a guard reachable from one exit and missing from another is the same defect with a witness.
//
// THE RAW DOOR IS THREE-TIER (2026-08-09): a belt REFUSAL (`RefusalNote`, verbatim, blocks the save), a
// PREFLIGHT ADVISORY (`PreflightNote` — valid, saves, but here is what a hosted wire will do to it), and
// the accounting stats. The advisory tier derives every wire claim by running our own `scrubWireSchema`,
// so it re-implements no vendor law (the design's §1 "client-side re-implementation of provider schema
// law" ruling stays honoured — see the advisory module's header for the full fork statement).
//
// The two READ-ONLY panes (`PreflightNote` + `PreviewCard`) live in `schema-editor-panes.tsx` — the
// `component-size` split, on this file's own `render-hint-picker` precedent. This module keeps the four
// panes that AUTHOR, the save press, and the close guard.

import type { RefineryForgeArm, RefinerySchemaStage } from "@orb/contracts/refinery";
import { REFINERY_FORGE_ARM_DEFAULT, REFINERY_FORGE_ARMS } from "@orb/contracts/refinery";
import type { RefinerySchemaId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Field } from "@orb/ui/field";
import { Row, Stack } from "@orb/ui/layout";
import type { SelectItems } from "@orb/ui/select";
import { Select } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import { Textarea } from "@orb/ui/textarea";
import type { ReactElement, RefObject } from "react";
import { useRef, useState } from "react";
import { ConfirmDialog, FormDialog } from "#components";
import { useInvalidation, useTRPC } from "#data";
import { testId } from "#lib";
import { useCreateRefinerySchema, useGenerateRefinerySchema, useRefineRefinerySchema, useUpdateRefinerySchema } from "../hooks/use-refinery-schemas.ts";
import { buildRenderPlan } from "../lib/render-plan.ts";
import { RefusalNote } from "./refusal-note.tsx";
import { RenderHintPicker } from "./render-hint-picker.tsx";
import { DeleteSchemaAction } from "./schema-delete-action.tsx";
import { PreflightNote, PreviewCard } from "./schema-editor-panes.tsx";

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

/** The three panes' baseline — the saved row, or emptiness when authoring. The JSON pane's baseline is the
 *  same pretty-print the open seeds it with, so re-serialising cannot register as an edit. */
function baselineOf(editing: SchemaEditorDialogProps["editing"]): { readonly name: string; readonly description: string; readonly schemaText: string } {
  return editing === null
    ? { name: "", description: "", schemaText: "" }
    : { name: editing.name.trim(), description: editing.description, schemaText: JSON.stringify(editing.schema, null, 2) };
}

/** The guard's copy. Named because the DIALOG owns the words for a decision about ITS draft, and because
 *  "Discard draft" must never read as the generic "Confirm" a reader dismisses without looking. */
const DISCARD_TITLE = "Discard this schema draft?";
const DISCARD_BODY = "Your description, the JSON schema and the name go with it. Nothing here has been saved yet, and this can't be undone.";

/** The no-preview arm's copy: an empty pane invites, a broken one teaches. */
function previewEmptyTextOf(schemaText: string): string {
  return schemaText.trim().length === 0 ? "Generate a draft, or paste a schema to preview it." : "That JSON doesn't parse yet — fix it to preview.";
}

function parseDraft(text: string): Record<string, unknown> | null {
  // @orb-waive caught-failure-ownership(catch): null is the caller's own "not parsing yet"
  // signal (previewEmptyTextOf renders "That JSON doesn't parse yet — fix it to preview.") — a rendered
  // teaching state, not a swallow. Ends if the caller stops distinguishing null from a real parsed value.
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
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
      {/* SECONDARY, like its twin `Refine` one row down (#1242). Both rows are draft-AUTHORING verbs that
          feed the editor below; the dialog's one call to action is the footer's Save. It read as bare
          (= the recipe's `primary` default) while the ring keyed off the raw prop, so it painted primary
          and wore no ring — the moment the ring derives from the RESOLVED arm, leaving it bare would put a
          second CTA ring in this dialog. */}
      <Button
        aria-busy={busy}
        disabled={busy || description.trim().length === 0}
        intent="secondary"
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
  const schemaTextRef = useRef<HTMLTextAreaElement>(null);
  const [nameFilled, setNameFilled] = useState(editing !== null && editing.name.length > 0);
  const [description, setDescription] = useState(editing === null ? "" : editing.description);
  const [schemaText, setSchemaText] = useState(editing === null ? "" : JSON.stringify(editing.schema, null, 2));
  const [forgeNote, setForgeNote] = useState<string | null>(null);
  const [arm, setArm] = useState<RefineryForgeArm>(REFINERY_FORGE_ARM_DEFAULT);
  const [discardOpen, setDiscardOpen] = useState(false);

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

  // THE DIRTY PREDICATE, read at EVENT time only (the name pane is uncontrolled, so a ref read during
  // render is banned). Compared against the ROW being edited, never against emptiness: an editor opened
  // over saved content is already full of text nobody just authored, and asking on a no-op open is how a
  // confirm becomes something readers dismiss reflexively — which would cost a real draft later.
  function hasUnsavedDraft(): boolean {
    const baseline = baselineOf(editing);
    return (nameRef.current?.value.trim() ?? "") !== baseline.name || description !== baseline.description || schemaText !== baseline.schemaText;
  }

  // EVERY exit routes here — the Cancel press, Escape, and the backdrop all arrive as one close request, so
  // the guard cannot be reachable from one door and missing from another (#81 P1: the dialog had no Cancel
  // at all, and its ONLY exits destroyed every pane's state in silence — there is no draft store and no
  // autosave behind this surface, so an unguarded close is simply data loss).
  const requestClose = (): void => {
    if (hasUnsavedDraft()) {
      setDiscardOpen(true);
      return;
    }
    onOpenChange(false);
  };

  return (
    <FormDialog onOpenChange={(next): void => (next ? onOpenChange(true) : requestClose())} open={open} size="lg" title={dialogTitleOf(editing, stage)}>
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
          <Textarea onChange={(e): void => setSchemaText(e.target.value)} ref={schemaTextRef} rows={8} value={schemaText} />
        </Field>
        {/* THE RENDER-HINT ROLE PICKER (#73) — split out (`render-hint-picker.tsx`, component-size +
            form-factory-for-multifield gates): a typed source for the `x-orb-ui` role string, so an
            author elevates a node by PICKING a vocabulary member instead of hand-typing one of 8 magic
            strings (a typo silently heals to "no hint applied" — render-plan.ts's own header). Insert
            drops the hint object at the JSON pane's cursor; the author positions inside the node they
            want to elevate first. */}
        <RenderHintPicker schemaTextRef={schemaTextRef} setSchemaText={setSchemaText} />
        {schema === null ? null : <PreflightNote schema={schema} />}
        <RefusalNote error={editing === null ? create.error : update.error} />
        {previewPlan !== null && schema !== null ? (
          <PreviewCard key={schemaText} outerBusy={busy} plan={previewPlan} schema={schema} stage={stage} />
        ) : (
          <Text voice="gloss">{previewEmptyTextOf(schemaText)}</Text>
        )}
        <Row gap="row" justify="end">
          {editing === null ? null : <DeleteSchemaAction onDeleted={(): void => onOpenChange(false)} schema={editing} />}
          <Field label="Name">
            <Textarea
              defaultValue={editing === null ? "" : editing.name}
              onInput={(e): void => setNameFilled(e.currentTarget.value.trim().length > 0)}
              ref={nameRef}
              rows={1}
            />
          </Field>
          {/* THE VISIBLE WAY OUT (#81 P1). Escape and the backdrop were the only exits this dialog had, and
              both are invisible: a reader looking at the longest authoring surface in the app could not
              SEE how to leave it without saving. It rides `requestClose`, so Cancel and Escape are one
              behaviour rather than two that drift. */}
          <Button intent="ghost" onClick={requestClose} size="sm" type="button">
            Cancel
          </Button>
          <Button
            disabled={busy || schema === null || !nameFilled}
            onClick={(): void => saveDraft(nameRef.current?.value.trim() ?? "", schema, { editing, description, stage, create, update, onSaved, onOpenChange })}
            size="sm"
          >
            {editing === null ? "Save schema" : "Save changes"}
          </Button>
        </Row>
        {/* The guard. `forceRender` because it nests inside an open Dialog, which Base UI would otherwise
            let suppress this backdrop (the ConfirmDialog prop exists for exactly this). Both arms are named
            for what they DO — "Keep editing" / "Discard draft" — never Cancel/Confirm over a destructive
            default: the safe arm has to be the one a reader can pick without parsing the sentence. */}
        <ConfirmDialog
          cancelLabel="Keep editing"
          confirmLabel="Discard draft"
          description={DISCARD_BODY}
          forceRender={true}
          onConfirm={(): void => onOpenChange(false)}
          onOpenChange={setDiscardOpen}
          open={discardOpen}
          title={DISCARD_TITLE}
        />
      </Stack>
    </FormDialog>
  );
}
