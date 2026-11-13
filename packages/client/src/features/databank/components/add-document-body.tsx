// The "Add document" dialog — all three ingestion paths in ONE shell modal body, with a local mode toggle
// (Upload · Paste · Link) swapping the body through a `Record<AddMode, ReactElement>` dispatch so a new mode
// fails tsc (§5.5). Two rules the spec files against it:
//
//  · THE UPLOAD CAP IS DERIVED, NEVER A LITERAL (§2.2). A literal byte cap is wrong:
//    the caps catalog is served on `/api/auth/config` and an admin override may TIGHTEN it below the route
//    ceiling. `useUploadCaps().databankUpload` is the live read.
//  · `outcome:'duplicate'` IS SURFACED, NEVER SWALLOWED (§4). The server dedups on `(ownerId, importHash)`
//    and returns the EXISTING document with `ingest:'skipped'`; opening it as if freshly created would make
//    re-adding a file you already had look like a successful import that silently made no new row. Same
//    for `warning:'empty-extraction'` (a scanned image-only PDF): the row's derived `Empty` chip alone
//    reads as a bug, so the moment of creation says it in words.
//
// IT IS A SHELL MODAL SLOT NOW, NOT A LOCALLY-HELD DIALOG (side-eye 2026-08-08 P1-2). It used to be
// `useState` in TWO components (the list band and the library pane) — which meant a THIRD caller could not
// open it at all: home's databank tile could only `setActiveSection("databank")`, so "Add your first
// document" landed the user on the library's own empty state, one more click away from the dialog it had
// just named. The dialog is now `addDocument` in `MODAL_SLOT_IDS`, so every caller — including one on
// another section — opens the ceremony itself with `openModal("addDocument")`. This file is the BODY the
// slot renders: ModalHost owns the overlay, the title and the close affordance, so there is no `open` prop
// and no `onOpenChange` to thread. Landing a document CLOSES the modal and opens that document in the
// Databank section, from wherever the ceremony was started.

import type { DocumentDestination, DocumentScopeSource, IngestOutcome, ScraperKind } from "@orb/contracts/databank";
import { DOCUMENT_SCOPE_SOURCES } from "@orb/contracts/databank";
import { DOC_UPLOAD_ACCEPT, docUploadMime } from "@orb/contracts/extraction";
import type { DocumentId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { DialogClose, DialogFooter } from "@orb/ui/dialog";
import { Field } from "@orb/ui/field";
import type { FileDropzoneResult } from "@orb/ui/file-dropzone";
import { FileDropzone } from "@orb/ui/file-dropzone";
import { Input } from "@orb/ui/input";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { Textarea } from "@orb/ui/textarea";
import { useToastManager } from "@orb/ui/toast";
import { Toggle } from "@orb/ui/toggle";
import { ToggleGroup } from "@orb/ui/toggle-group";
import type { ReactElement, ReactNode, Ref } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { CharacterPicker } from "#components";
import { DocumentUploadRefusedError, uploadDocument, useGatedQuery, useInvalidation, useTRPC, useUploadCaps } from "#data";
import { focusFirstInvalidFieldIn } from "#forms/editor";
import { DIALOG_VERBS, testId } from "#lib";
import { closeModal, selectDocumentFromList, setActiveSection, useActiveChatId } from "#state";
import { useCreateDocumentFromText, useScrapeWeb, useScrapeWiki, useScrapeYoutube } from "../hooks/use-databank-mutations.ts";
import { useScrapeForm } from "../hooks/use-scrape-form.ts";
import { DATABANK_INGEST_GLOSS } from "../lib/databank-copy.ts";
import { DOCUMENT_UPLOAD_FORMAT_HINT } from "../lib/databank-model.ts";
import {
  DATABANK_ADD_METHOD_NAME,
  DATABANK_ADD_NAME,
  DATABANK_ADD_NAME_FIELD_NAME,
  DATABANK_ADD_TEXT_FIELD_NAME,
  DATABANK_PASTE_TEXT_NAME,
} from "../lib/databank-names.ts";
import { documentUploadFailureLine } from "../lib/databank-upload-copy.ts";
import type { ScrapeFormValues } from "../lib/scrape-form-model.ts";
import { DEFAULT_CAPTION_LANG, SCRAPE_FAILURE, SCRAPER_OPTIONS } from "../lib/scrape-form-model.ts";

/** The dialog's ingestion modes (ONE importable union from a tuple — §5.5). */
const ADD_MODES = ["upload", "paste", "link"] as const;
type AddMode = (typeof ADD_MODES)[number];

const MODE_LABELS: Record<AddMode, string> = { upload: "Upload a file", paste: DATABANK_PASTE_TEXT_NAME, link: "From a link" };

// The Link field's form name, which is also the name its input carries in the arm's form.
const LINK_FIELD = "url" satisfies keyof ScrapeFormValues;

/** The add-document modal BODY: a three-mode toggle over upload · paste · scrape. */
export function AddDocumentBody(): ReactElement {
  const [mode, setMode] = useState<AddMode>("upload");
  const [scope, setScope] = useState<DocumentScopeSource>("global");
  const [character, setCharacter] = useState<Extract<DocumentDestination, { kind: "character" }> | null>(null);
  const trpc = useTRPC();
  const chatId = useActiveChatId();
  const chat = useGatedQuery(chatId, (id) => trpc.chat.getChat.queryOptions({ chatId: id }));
  const destinations: Record<DocumentScopeSource, DocumentDestination | null> = {
    global: { kind: "global" },
    character,
    chat: chatId !== null && chat.data?.viewerIsHost === true ? { kind: "chat", chatId } : null,
  };
  const destination = destinations[scope];
  const scopeCopy: Record<DocumentScopeSource, string> = {
    global: "Feeds every chat you are in. Switch off Use in every chat on the document to stop that; any other attachments remain.",
    character: "Feeds chats with the selected character. Existing attachments stay unchanged.",
    chat: destination === null ? "Open a chat you host before choosing This chat." : "Feeds only the current chat. Existing attachments stay unchanged.",
  };
  const toast = useToastManager();

  const landed: OnLanded = ({ id, outcome, ingest, warning }): void => {
    if (outcome === "duplicate") {
      toast.add({ title: "Already in your bank. Destination added.", description: "Its other attachments are unchanged." });
    } else if (ingest === "not-queued") {
      // The half-success, said plainly: the document IS saved (the old behaviour threw here and rendered
      // "Couldn't save the document." over a document that had in fact been saved), but nothing indexed it,
      // so it will not reach a chat until the user runs the repair the sentence names.
      toast.add({
        title: "Saved, but not indexed yet",
        description: "The indexer wouldn't take the job. The document is safe. Use Rebuild search index on it to try again.",
      });
    } else if (warning === "empty-extraction") {
      toast.add({ title: "Nothing to index in that file", description: "No text could be extracted. A scanned image PDF, most likely." });
    }
    // The ceremony's END, wherever it was started: close the slot, then open what just landed in its own
    // section. A caller on HOME therefore finishes on the new document rather than back where it began
    // with nothing to show for it. (`selectDocumentFromList` + `setActiveSection` are the same two module
    // actions any cross-section navigation uses.)
    selectDocumentFromList(id);
    setActiveSection("databank");
    closeModal();
  };

  const bodies: Record<AddMode, ReactElement> = {
    upload: <UploadBody destination={destination} onLanded={landed} />,
    paste: <PasteBody destination={destination} onLanded={landed} />,
    link: <LinkBody destination={destination} onLanded={landed} />,
  };

  return (
    // NO PADDING OF THE BODY'S OWN: the arms end in a sticky footer that rides the scroll region's bottom edge, and
    // a wrapper padding it keeps the footer that far above the edge and makes it jump when the scroll ends. The
    // popup's own inset already surrounds the region.
    <Stack gap="block">
      {/* ModalHost draws the title + the close; the teaching gloss is the body's, and it is the ONE
          spelling (databank-copy) every add/empty surface prints.

          `reading`, NOT `gloss` (side-eye 2026-08-19 P3). This is the sentence that teaches the whole
          mechanism to someone who has never added a document, and it was set at `gloss` — 10.5px, the
          footnote voice — running ~93 characters wide: the SMALLEST of its three homes (13px in the LIST
          empty, 15px in CONTENT) at the moment it matters most. `reading` is the voice minted for exactly
          this ("THE CONTENT ITSELF", text/variants.ts), and it is paired with the reading measure the
          voice's own doc requires, so the line does not run the width of the dialog. */}
      <Text cap="prose" voice="reading">
        {DATABANK_INGEST_GLOSS}
      </Text>
      <Stack gap="block">
        <Stack gap="field">
          <Text voice="label">Use this document in</Text>
          <ToggleGroup
            aria-label="Use this document in"
            onValueChange={(next): void => {
              const picked = DOCUMENT_SCOPE_SOURCES.find((kind) => kind === next[0]);
              if (picked !== undefined) {
                setScope(picked);
              }
            }}
            value={[scope]}
          >
            {DOCUMENT_SCOPE_SOURCES.map((kind) => (
              <Toggle variant="outline" key={kind} size="sm" value={kind}>
                {({ global: "Everywhere", character: "This character", chat: "This chat" } satisfies Record<DocumentScopeSource, string>)[kind]}
              </Toggle>
            ))}
          </ToggleGroup>
          {scope === "character" ? (
            <CharacterPicker
              emptyText="No characters match."
              isSelected={(id): boolean => character?.characterId === id}
              label="Choose a character"
              onSelect={(characterId): void => setCharacter({ kind: "character", characterId })}
              placeholder="Search characters…"
            />
          ) : null}
          <Text cap="prose" prose={true} voice="gloss">
            {scopeCopy[scope]}
          </Text>
        </Stack>
        {/* Three pressable modes, not a tablist: each swaps the body in place with no panel to own or
            label, and `aria-pressed` is the honest name for "this is the one you are on". */}
        <ToggleGroup
          aria-label={DATABANK_ADD_METHOD_NAME}
          onValueChange={(next): void => {
            const picked = ADD_MODES.find((id) => id === next[0]);
            if (picked !== undefined) {
              setMode(picked);
            }
          }}
          value={[mode]}
        >
          {ADD_MODES.map((id) => (
            <Toggle variant="outline" key={id} size="sm" value={id}>
              {MODE_LABELS[id]}
            </Toggle>
          ))}
        </ToggleGroup>
        {/* THE MODE STRIP HOLDS ONE Y (side-eye 2026-08-19 P2). The three arms are 405 / 543.75 / 375.75px
            tall and the shell's Dialog is vertically CENTRED, so switching mode moved the whole dialog
            70-84px — under the pointer, with the strip the user is aiming at as the thing that moved. The
            dialog's centring is the shell's and app-wide; what is local is the swapped region, so it
            reserves the tallest arm's height and the strip above it stops travelling. A floor, not a fixed
            height: an arm that grows (a validation line, a revealed field) still grows downward.

            AND THE FLOOR IS SPENT, NOT PADDED (side-eye 2026-08-19 N-2 — this pin's own regression). The
            reserved height landed BELOW each arm's in-body footer, so the two shorter arms drew 225px /
            254px of nothing under Cancel — 36-41% of a first-run dialog, which reads as a failed render.
            Each arm FILLS the reserved region (`flex-1`) and hangs its footer off the bottom (`mt-auto`),
            so the height is constant, the strip still holds one y, and the footer sits on the floor
            instead of floating above it. */}
        {bodies[mode]}
      </Stack>
    </Stack>
  );
}

/** What every arm reports back: the landed document + how it landed. `ingest` is the DERIVED layer's own
 *  outcome — `not-queued` means the canon was written but its index build was refused, which the user must
 *  hear about (the document is real, and searchable only after a Reindex). */
type OnLanded = (landing: {
  readonly id: DocumentId;
  readonly outcome: "created" | "duplicate";
  readonly ingest: IngestOutcome;
  readonly warning?: "empty-extraction";
}) => void;

/** One arm's reserved region, spent by its footer's `push="blockEnd"`. An arm with a submit is a `<form>`: the
 *  shell's modal slot is a flow dialog, which has no form of its own, so Enter submits only through the arm's.
 *  A blocked submit button only looks disabled, so the arm's handler guards as well. */
function ArmRegion({
  children,
  label,
  onSubmit,
  ref,
}: {
  readonly children: ReactNode;
  readonly label?: string;
  readonly onSubmit?: () => void;
  readonly ref?: Ref<HTMLFormElement>;
}): ReactElement {
  const region = (
    <Stack data-slot="add-document-arm" gap="block" minHeight="scrollLg">
      {children}
    </Stack>
  );
  if (onSubmit === undefined) {
    return region;
  }
  return (
    <form
      aria-label={label}
      noValidate={true}
      onSubmit={(event): void => {
        event.preventDefault();
        onSubmit();
      }}
      ref={ref}
    >
      {region}
    </form>
  );
}

function UploadBody({ onLanded, destination }: { readonly onLanded: OnLanded; readonly destination: DocumentDestination | null }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const caps = useUploadCaps();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fieldRef = useRef<HTMLDivElement | null>(null);
  // Counts the refusals, so each one hands focus back to the File control the line describes (the Link arm's pattern).
  const [refusals, setRefusals] = useState(0);
  useEffect(() => {
    if (refusals > 0) {
      focusFirstInvalidFieldIn(fieldRef.current);
    }
  }, [refusals]);

  const onFilesSelected = ({ accepted }: FileDropzoneResult): void => {
    // The newest pick owns the line: a refusal left from the last file would read as about this one, and the zone says its own
    // refusal of an unaccepted pick beside it.
    setError(null);
    const file = accepted[0];
    if (file === undefined || destination === null) {
      return;
    }
    setLoading(true);
    uploadDocument(file, undefined, destination).then(
      (result) => {
        // The raw multipart seam has no `createEntityMutation` to hang `invalidates` on — refresh the list
        // AND the bank census through the SAME sanctioned seam by hand (never a bare `invalidateQueries`).
        // Both, because an upload moves a row onto the list and a document onto the count: the producer
        // mutations in `use-databank-mutations` pair the two for the same reason.
        invalidation.invalidateFilters([trpc.databank.list.pathFilter(), trpc.databank.bankHealth.pathFilter()]);
        setSuccess(true);
        onLanded({
          id: result.document.id,
          outcome: result.outcome,
          ingest: result.ingest,
          ...(result.warning === undefined ? {} : { warning: result.warning }),
        });
        setLoading(false);
      },
      (failure: unknown) => {
        // The line is the server's code in the dialog's words; a rejection with no code (an over-size body, a network fault) gets the general line.
        setError(documentUploadFailureLine(failure instanceof DocumentUploadRefusedError ? failure.reason : null));
        setLoading(false);
        setRefusals((count) => count + 1);
      },
    );
  };

  return (
    <ArmRegion>
      {/* The refusal is the zone's own alert line (`error`), the one home for every refusal the zone says, and `invalid`
          marks the File control so the focus the Link arm's pattern returns to it has a control to find. */}
      <Field description={DOCUMENT_UPLOAD_FORMAT_HINT} invalid={error !== null} label="File" ref={fieldRef}>
        {/* The cap is the DEPLOYMENT's, read live (§2.2) — the dropzone also prints it as its own hint. */}
        <FileDropzone
          accept={DOC_UPLOAD_ACCEPT}
          disabled={destination === null}
          error={error ?? undefined}
          isFileAccepted={(file): boolean => docUploadMime(file.type, file.name) !== undefined}
          loading={loading}
          maxSizeBytes={caps.databankUpload}
          onFilesSelected={onFilesSelected}
          success={success}
        />
      </Field>
      {/* CANCEL, EVEN THOUGH THIS ARM HAS NO SUBMIT (side-eye sweep 2026-08-03). Each arm draws its own
          footer because each has its own submit verb, and this one — where picking the file IS the submit —
          shipped with no footer at all: the dialog had ZERO buttons besides the three mode toggles, so its
          only exit was Esc or the backdrop, while both sibling arms offered a labelled way out. A dismiss is
          not part of the submit; it is owed by every arm. */}
      <DialogFooter push="blockEnd">
        <DialogClose render={<Button variant="ghost">{DIALOG_VERBS.cancel}</Button>} />
      </DialogFooter>
    </ArmRegion>
  );
}

function PasteBody({ onLanded, destination }: { readonly onLanded: OnLanded; readonly destination: DocumentDestination | null }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const create = useCreateDocumentFromText({ trpc, invalidation });
  const [name, setName] = useState("");
  const [text, setText] = useState("");

  const trimmedName = name.trim();
  const trimmedText = text.trim();
  const canCreate = destination !== null && trimmedName !== "" && trimmedText !== "" && !create.isPending;

  const onSubmit = (): void => {
    if (!canCreate) {
      return;
    }
    create.mutate(
      { name: trimmedName, text: trimmedText, destination },
      {
        onSuccess: (result): void => {
          onLanded({
            id: result.document.id,
            outcome: result.outcome,
            ingest: result.ingest,
            ...(result.warning === undefined ? {} : { warning: result.warning }),
          });
        },
      },
    );
  };

  return (
    <ArmRegion label={DATABANK_PASTE_TEXT_NAME} onSubmit={onSubmit}>
      <Field label={DATABANK_ADD_NAME_FIELD_NAME}>
        <Input onValueChange={setName} placeholder="e.g. House Valeroth: bloodlines" value={name} />
      </Field>
      <Field label={DATABANK_ADD_TEXT_FIELD_NAME}>
        <Textarea onChange={(event): void => setText(event.target.value)} placeholder="Paste or write the content to index…" rows={8} value={text} />
      </Field>
      <DialogFooter push="blockEnd">
        <DialogClose render={<Button variant="ghost">{DIALOG_VERBS.cancel}</Button>} />
        <Button disabled={!canCreate} loading={create.isPending} type="submit">
          {DATABANK_ADD_NAME}
        </Button>
      </DialogFooter>
    </ArmRegion>
  );
}

/** Three fields (source · link · the revealed caption language), so it rides the editor FACTORY rather than
 *  three hand-rolled `useState`s (D54 §13.4): seed, key-remount,
 *  post-submit reset and the reseed guard are the factory's, not this dialog's to re-derive. */
function LinkBody({ onLanded, destination }: { readonly onLanded: OnLanded; readonly destination: DocumentDestination | null }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  // The form's own line below tells a failure while this body is mounted; one that lands after the person left it is toasted.
  const scrapeWeb = useScrapeWeb({ trpc, invalidation, failureShownInline: "the add-document form's fetch failure line" });
  const scrapeYoutube = useScrapeYoutube({ trpc, invalidation, failureShownInline: "the add-document form's fetch failure line" });
  const scrapeWiki = useScrapeWiki({ trpc, invalidation, failureShownInline: "the add-document form's fetch failure line" });

  const pending = scrapeWeb.isPending || scrapeYoutube.isPending || scrapeWiki.isPending;
  // THE FAILURE BELONGS TO A SOURCE, NOT TO THE DIALOG (#1502). A flat OR over all three runners made one
  // runner's error the whole form's error: fail a YouTube fetch, switch the Source select to Web, and the
  // red "Couldn't fetch that link" was still there — pointing at a source that had never been tried, and
  // naming the caption language, which Web does not have. A `Record` over the scraper axis rather than a
  // chain of `||`, for the same reason `save` below uses one: a new `ScraperKind` fails tsc here instead of
  // silently having no error surface.
  const runnerFailed: Record<ScraperKind, boolean> = {
    web: scrapeWeb.error !== null,
    youtube: scrapeYoutube.error !== null,
    wiki: scrapeWiki.error !== null,
  };

  const save = async (values: ScrapeFormValues): Promise<ScrapeFormValues> => {
    if (destination === null) {
      throw new Error("Choose a document destination.");
    }
    const url = values.url.trim();
    const lang = values.lang.trim() === "" ? DEFAULT_CAPTION_LANG : values.lang.trim();
    // A Record over the scraper axis — a new `ScraperKind` fails tsc rather than silently having no runner.
    const runners: Record<
      ScraperKind,
      () => Promise<{
        readonly document: { readonly id: DocumentId };
        readonly outcome: "created" | "duplicate";
        readonly ingest: IngestOutcome;
      }>
    > = {
      web: () => scrapeWeb.mutateAsync({ url, destination }),
      youtube: () => scrapeYoutube.mutateAsync({ url, lang, destination }),
      wiki: () => scrapeWiki.mutateAsync({ url, destination }),
    };
    const result = await runners[values.source]();
    onLanded({ id: result.document.id, outcome: result.outcome, ingest: result.ingest });
    return values;
  };

  const { form } = useScrapeForm({ entityId: "databank-scrape", serverValues: undefined, save });
  const failureId = useId();
  const formRef = useRef<HTMLFormElement | null>(null);
  // Counts the fetches that failed, so each one hands focus to the field the failure line describes.
  const [failedFetches, setFailedFetches] = useState(0);
  useEffect(() => {
    if (failedFetches > 0) {
      focusFirstInvalidFieldIn(formRef.current);
    }
  }, [failedFetches]);
  // This arm mounts only when the person chooses it, and in a short viewport its fields start below the mode strip they pressed.
  // `nearest` moves the scroll region only when the Link field is out of view, and the region's scroll padding keeps it above the footer.
  useEffect(() => {
    const link = formRef.current?.elements.namedItem(LINK_FIELD);
    if (link instanceof HTMLElement) {
      link.scrollIntoView({ block: "nearest" });
    }
  }, []);

  const onSubmit = (): void => {
    if (destination === null || pending || form.state.values.url.trim() === "") {
      return;
    }
    // A rejected submit is a failed runner, which `runnerFailed` already prints.
    form.handleSubmit().catch(() => setFailedFetches((count) => count + 1));
  };

  return (
    <ArmRegion label={MODE_LABELS.link} onSubmit={onSubmit} ref={formRef}>
      <form.AppField name="source">{(field): ReactElement => <field.SelectField items={SCRAPER_OPTIONS} label="Source" />}</form.AppField>
      <form.Subscribe selector={(state): ScraperKind => state.values.source}>
        {(source): ReactElement => (
          <form.AppField name={LINK_FIELD}>
            {(field): ReactElement => (
              <field.TextField {...(runnerFailed[source] ? { describedBy: failureId, invalid: true } : {})} label="Link" placeholder="https://…" />
            )}
          </form.AppField>
        )}
      </form.Subscribe>
      {/* The caption language is a REVEAL, not a required field: the server defaults it, and it means
          nothing for the other two sources. */}
      <form.Subscribe selector={(state): ScraperKind => state.values.source}>
        {(source): ReactElement | null =>
          source === "youtube" ? (
            <form.AppField name="lang">
              {(field): ReactElement => (
                <field.TextField
                  description="The caption track to pull, when the video has more than one."
                  label="Caption language"
                  placeholder={DEFAULT_CAPTION_LANG}
                />
              )}
            </form.AppField>
          ) : null
        }
      </form.Subscribe>
      <form.Subscribe selector={(state): ScraperKind => state.values.source}>
        {(source): ReactElement | null =>
          runnerFailed[source] ? (
            <Text id={failureId} role="alert" tone="destructive" voice="gloss">
              {`${SCRAPE_FAILURE[source]} ${source === "youtube" ? "Check the address and the caption language, then try again." : "Check the address, then try again."}`}
            </Text>
          ) : null
        }
      </form.Subscribe>
      <DialogFooter push="blockEnd">
        <DialogClose render={<Button variant="ghost">{DIALOG_VERBS.cancel}</Button>} />
        <form.Subscribe selector={(state): boolean => state.values.url.trim() === ""}>
          {(urlEmpty): ReactElement => (
            <Button data-testid={testId("databankScrapeSubmit")} disabled={destination === null || urlEmpty || pending} type="submit">
              {pending ? "Fetching…" : "Fetch and add"}
            </Button>
          )}
        </form.Subscribe>
      </DialogFooter>
    </ArmRegion>
  );
}
