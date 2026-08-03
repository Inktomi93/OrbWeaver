// The "Add document" dialog — all three ingestion paths in ONE FormDialog, with a local mode toggle
// (Upload · Paste · Link) swapping the body through a `Record<AddMode, ReactElement>` dispatch so a new mode
// fails tsc (§5.5). Carried in SHAPE from `legacy-main:components/add-document-dialog.tsx`
// (databank-surface-spec §2.1 — "the three-mode toggle + the conditional caption-language field is right"),
// with the two named corrections the spec files against it:
//
//  · THE UPLOAD CAP IS DERIVED, NEVER A LITERAL (§2.2). Legacy spelled `MAX_UPLOAD_BYTES = 20_971_520`,
//    which was defensible then (`@orb/contracts/uploads` did not exist on legacy-main) and is wrong now:
//    the caps catalog is served on `/api/auth/config` and an admin override may TIGHTEN it below the route
//    ceiling. `useUploadCaps().databankUpload` is the live read.
//  · `outcome:'duplicate'` IS SURFACED, NEVER SWALLOWED (§4). The server dedups on `(ownerId, importHash)`
//    and returns the EXISTING document with `ingest:'skipped'`; legacy opened it as if freshly created, so
//    re-adding a file you already had looked like a successful import that silently made no new row. Same
//    for `warning:'empty-extraction'` (a scanned image-only PDF): the row's derived `Empty` chip alone
//    reads as a bug, so the moment of creation says it in words.
//
// The dialog owns its overlay (a component, not a surface — surface-purity), and every arm reports the
// created document to its caller, which opens it in CONTENT and closes the dialog.

import type { ScraperKind } from "@orb/contracts/databank";
import type { DocumentId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { DialogClose } from "@orb/ui/dialog";
import { Field } from "@orb/ui/field";
import type { FileDropzoneResult } from "@orb/ui/file-dropzone";
import { FileDropzone } from "@orb/ui/file-dropzone";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { Textarea } from "@orb/ui/textarea";
import { useToastManager } from "@orb/ui/toast";
import type { ReactElement } from "react";
import { useState } from "react";
import { FormDialog, FormSubmitButton } from "#components";
import { uploadDocument, useInvalidation, useTRPC, useUploadCaps } from "#data";
import { useCreateDocumentFromText, useScrapeWeb, useScrapeWiki, useScrapeYoutube } from "../hooks/use-databank-mutations";
import { useScrapeForm } from "../hooks/use-scrape-form";
import type { ScrapeFormValues } from "../lib/scrape-form-model";
import { DEFAULT_CAPTION_LANG, SCRAPER_OPTIONS } from "../lib/scrape-form-model";

/** What `infra/extraction` handles — the picker filter, mirroring the server's extractor table. */
const UPLOAD_ACCEPT = ".txt,.md,.markdown,.pdf,.html,.htm,text/plain,text/markdown,application/pdf,text/html";

/** The dialog's ingestion modes (ONE importable union from a tuple — §5.5). */
const ADD_MODES = ["upload", "paste", "link"] as const;
type AddMode = (typeof ADD_MODES)[number];

const MODE_LABELS: Record<AddMode, string> = { upload: "Upload a file", paste: "Paste text", link: "From a link" };

export interface AddDocumentDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Fires with the landed document — the caller opens it in CONTENT. Present on the DUPLICATE path too:
   *  the honest answer to "add this again" is to show you the one you already have. */
  readonly onCreated?: (id: DocumentId) => void;
}

/** The add-document dialog: a three-mode toggle over upload · paste · scrape. */
export function AddDocumentDialog({ open, onOpenChange, onCreated }: AddDocumentDialogProps): ReactElement {
  const [mode, setMode] = useState<AddMode>("upload");
  const toast = useToastManager();

  const landed = (id: DocumentId, outcome: "created" | "duplicate", warning?: "empty-extraction"): void => {
    if (outcome === "duplicate") {
      toast.add({ title: "Already in your bank — opened it." });
    } else if (warning === "empty-extraction") {
      toast.add({ title: "Nothing to index in that file", description: "No text could be extracted — a scanned image PDF, most likely." });
    }
    onCreated?.(id);
    onOpenChange(false);
  };

  const bodies: Record<AddMode, ReactElement> = {
    upload: <UploadBody onLanded={landed} />,
    paste: <PasteBody onLanded={landed} />,
    link: <LinkBody onLanded={landed} />,
  };

  return (
    <FormDialog
      description="Upload a file, paste text, or pull in a page — its contents get indexed so the most relevant passages feed into your chats as they happen."
      onOpenChange={onOpenChange}
      open={open}
      title="Add a document"
    >
      <Stack gap="block">
        {/* Three pressable modes, not a tablist: each swaps the body in place with no panel to own or
            label, and `aria-pressed` is the honest name for "this is the one you are on". */}
        <Row gap="field">
          {ADD_MODES.map((id) => (
            <Button aria-pressed={mode === id} intent={mode === id ? "primary" : "ghost"} key={id} onClick={(): void => setMode(id)} size="sm" type="button">
              {MODE_LABELS[id]}
            </Button>
          ))}
        </Row>
        {bodies[mode]}
      </Stack>
    </FormDialog>
  );
}

/** What every arm reports back: the landed document + how it landed. */
type OnLanded = (id: DocumentId, outcome: "created" | "duplicate", warning?: "empty-extraction") => void;

function UploadBody({ onLanded }: { readonly onLanded: OnLanded }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const caps = useUploadCaps();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFilesSelected = ({ accepted }: FileDropzoneResult): void => {
    const file = accepted[0];
    if (file === undefined) {
      return;
    }
    setLoading(true);
    setError(null);
    void (async (): Promise<void> => {
      try {
        const result = await uploadDocument(file);
        // The raw multipart seam has no `createEntityMutation` to hang `invalidates` on — refresh the list
        // through the SAME sanctioned seam by hand (never a bare `invalidateQueries`).
        invalidation.invalidateFilters([trpc.databank.list.pathFilter()]);
        setSuccess(true);
        onLanded(result.document.id, result.outcome, result.warning);
      } catch {
        setError("Upload failed — check the file type and size, then try again.");
      } finally {
        setLoading(false);
      }
    })();
  };

  return (
    <Stack gap="block">
      <Field error={error} label="File">
        {/* The cap is the DEPLOYMENT's, read live (§2.2) — the dropzone also prints it as its own hint. */}
        <FileDropzone accept={UPLOAD_ACCEPT} loading={loading} maxSizeBytes={caps.databankUpload} onFilesSelected={onFilesSelected} success={success} />
      </Field>
      {/* CANCEL, EVEN THOUGH THIS ARM HAS NO SUBMIT (side-eye sweep 2026-08-03). Each arm draws its own
          footer because each has its own submit verb, and this one — where picking the file IS the submit —
          shipped with no footer at all: the dialog had ZERO buttons besides the three mode toggles, so its
          only exit was Esc or the backdrop, while both sibling arms offered a labelled way out. A dismiss is
          not part of the submit; it is owed by every arm. */}
      <Row gap="field" justify="end">
        <DialogClose render={<Button intent="ghost">Cancel</Button>} />
      </Row>
    </Stack>
  );
}

function PasteBody({ onLanded }: { readonly onLanded: OnLanded }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const create = useCreateDocumentFromText({ trpc, invalidation });
  const [name, setName] = useState("");
  const [text, setText] = useState("");

  const trimmedName = name.trim();
  const trimmedText = text.trim();
  const canCreate = trimmedName !== "" && trimmedText !== "" && !create.isPending;

  const onSubmit = (): void => {
    if (!canCreate) {
      return;
    }
    void create.mutateAsync({ name: trimmedName, text: trimmedText }).then((result) => {
      onLanded(result.document.id, result.outcome, result.warning);
    });
  };

  return (
    <Stack gap="block">
      <Field label="Name">
        <Input onValueChange={setName} placeholder="e.g. House Valeroth — bloodlines" value={name} />
      </Field>
      <Field label="Text">
        <Textarea onChange={(event): void => setText(event.target.value)} placeholder="Paste or write the content to index…" rows={8} value={text} />
      </Field>
      <Row gap="field" justify="end">
        <DialogClose render={<Button intent="ghost">Cancel</Button>} />
        <Button disabled={!canCreate} intent="primary" loading={create.isPending} onClick={onSubmit} type="button">
          Add
        </Button>
      </Row>
    </Stack>
  );
}

/** Three fields (source · link · the revealed caption language), so it rides the editor FACTORY rather than
 *  three hand-rolled `useState`s (D54 §13.4 / the `form-factory-for-multifield` gate): seed, key-remount,
 *  post-submit reset and the reseed guard are the factory's, not this dialog's to re-derive. */
function LinkBody({ onLanded }: { readonly onLanded: OnLanded }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const scrapeWeb = useScrapeWeb({ trpc, invalidation });
  const scrapeYoutube = useScrapeYoutube({ trpc, invalidation });
  const scrapeWiki = useScrapeWiki({ trpc, invalidation });

  const pending = scrapeWeb.isPending || scrapeYoutube.isPending || scrapeWiki.isPending;
  const failed = scrapeWeb.error !== null || scrapeYoutube.error !== null || scrapeWiki.error !== null;

  const save = async (values: ScrapeFormValues): Promise<ScrapeFormValues> => {
    const url = values.url.trim();
    const lang = values.lang.trim() === "" ? DEFAULT_CAPTION_LANG : values.lang.trim();
    // A Record over the scraper axis — a new `ScraperKind` fails tsc rather than silently having no runner.
    const runners: Record<ScraperKind, () => Promise<{ readonly document: { readonly id: DocumentId }; readonly outcome: "created" | "duplicate" }>> = {
      web: () => scrapeWeb.mutateAsync({ url }),
      youtube: () => scrapeYoutube.mutateAsync({ url, lang }),
      wiki: () => scrapeWiki.mutateAsync({ url }),
    };
    const result = await runners[values.source]();
    onLanded(result.document.id, result.outcome);
    return values;
  };

  const { form } = useScrapeForm({ entityId: "databank-scrape", serverValues: undefined, save });

  return (
    <Stack gap="block">
      <form.AppField name="source">{(field): ReactElement => <field.SelectField items={SCRAPER_OPTIONS} label="Source" />}</form.AppField>
      <form.AppField name="url">{(field): ReactElement => <field.TextField label="Link" placeholder="https://…" />}</form.AppField>
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
      {failed ? (
        <Text className="text-destructive" voice="gloss">
          Couldn't fetch that link. Check the address (and the caption language for YouTube), then try again.
        </Text>
      ) : null}
      <Row gap="field" justify="end">
        <DialogClose render={<Button intent="ghost">Cancel</Button>} />
        <form.Subscribe selector={(state): boolean => state.values.url.trim() === ""}>
          {(urlEmpty): ReactElement => (
            <FormSubmitButton
              disabled={urlEmpty || pending}
              label={pending ? "Fetching…" : "Fetch and add"}
              onSubmit={(): void => {
                void form.handleSubmit();
              }}
              testKey="databankScrapeSubmit"
            />
          )}
        </form.Subscribe>
      </Row>
    </Stack>
  );
}
