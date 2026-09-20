// "Request & response shaping" (= `transport`) — the Diagnostics tier's ENDPOINT-ROW-ONLY block (inference
// program §5.3a · the step-3b mock `editor.html` Board C). For a server that does not speak plain OpenAI:
// headers that go out with the request, body fields that must not, and a dot-path map that reads a reply
// putting things in different places.
//
// THE SAMPLE-RESPONSE PREVIEW IS §5.3a's ONE NAMED AUTHORING AID, and it is here for a reason a reader can
// check: a dot-path expression is UNVERIFIABLE BY READING. The preview resolves each stated path against a
// pasted body and shows the value it produced, plus the NORMALIZED reading for the finish reason
// (`NORMALIZED_FINISH_REASONS`, §5.3c) — a map that resolves to a string we cannot normalize is the failure
// this catches, and it catches it at authoring time instead of on the fifth message.
//
// The two-up header/exclude pair goes ONE-UP below the container's `lg` step. The mock measured its
// `flex: 1 1 240px` crossover at 490px of content by sweeping 900→380px in 4px steps; the container's `lg`
// (512px) is the nearest ratified step above it, so 486 is comfortably one-up and 870 comfortably two-up.

import type { ConnectionTransportDoc } from "@orb/contracts/inference";
import { NORMALIZED_FINISH_REASONS } from "@orb/contracts/inference";
import { Badge } from "@orb/ui/badge";
import { Field } from "@orb/ui/field";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { Textarea } from "@orb/ui/textarea";
import type { ReactElement } from "react";
import { useState } from "react";

/** The `responseMap` paths, in the pane's reading order with their plain-word names. A `Record` over the
 *  schema's own keys, so a new path is a `tsc` error here rather than a field nothing can author. */
const RESPONSE_MAP_FIELDS: Record<keyof NonNullable<ConnectionTransportDoc["responseMap"]>, string> = {
  contentPath: "text",
  reasoningPath: "thinking",
  finishReasonPath: "finish reason",
  promptTokensPath: "prompt tokens",
  completionTokensPath: "reply tokens",
  errorMessagePath: "error message",
  errorCodePath: "error code",
  toolCallsPath: "tool calls",
};

const RESPONSE_MAP_ORDER: readonly (keyof NonNullable<ConnectionTransportDoc["responseMap"]>)[] = [
  "contentPath",
  "reasoningPath",
  "finishReasonPath",
  "toolCallsPath",
  "promptTokensPath",
  "completionTokensPath",
  "errorMessagePath",
  "errorCodePath",
];

export interface ConnectionTransportEditorProps {
  readonly transport: ConnectionTransportDoc | null;
  readonly busy: boolean;
  readonly onCommit: (transport: ConnectionTransportDoc | null) => void;
}

export function ConnectionTransportEditor({ transport, busy, onCommit }: ConnectionTransportEditorProps): ReactElement {
  const headers = transport?.headers ?? {};
  const map = transport?.responseMap ?? {};

  const commit = (next: ConnectionTransportDoc): void => {
    onCommit(Object.keys(next).length === 0 ? null : next);
  };

  return (
    <Stack gap="row">
      <Row align="start" className="@max-lg:flex-col @max-lg:items-stretch" gap="field">
        <Field className="min-w-0 grow" description="One per line, as `Name: value`." label="Extra headers">
          <Textarea
            defaultValue={Object.entries(headers)
              .map(([name, value]) => `${name}: ${value}`)
              .join("\n")}
            disabled={busy}
            maxRows={6}
            onBlur={(event): void => commit(withHeaders(transport, parseHeaders(event.target.value)))}
            rows={2}
          />
        </Field>
        <Field className="min-w-0 grow" description="Comma-separated. We drop them before the request goes out." label="Don't send these fields">
          <Input
            autoComplete="off"
            defaultValue={(transport?.excludeBody ?? []).join(", ")}
            disabled={busy}
            onBlur={(event): void => commit(withExcludeBody(transport, parseList(event.target.value)))}
          />
        </Field>
      </Row>

      <Stack gap="tight">
        <Text voice="label">Where the reply keeps its parts</Text>
        <Text voice="gloss">Dot paths into the server's reply body. Leave a row empty when the server puts nothing there.</Text>
        {RESPONSE_MAP_ORDER.map((key) => (
          <Field key={key} label={RESPONSE_MAP_FIELDS[key]}>
            <Input
              autoComplete="off"
              defaultValue={map[key] ?? ""}
              disabled={busy}
              onBlur={(event): void => commit(withMapPath(transport, key, event.target.value.trim()))}
              placeholder="result.output[0].text"
            />
          </Field>
        ))}
      </Stack>

      <SampleResponsePreview map={map} />
    </Stack>
  );
}

function SampleResponsePreview({ map }: { readonly map: NonNullable<ConnectionTransportDoc["responseMap"]> }): ReactElement {
  const [sample, setSample] = useState("");

  return (
    <Stack data-slot="connection-transport-preview" gap="tight">
      <Field description="Paste one reply from this server and every path above resolves against it, here." label="Paste a sample response">
        <Textarea
          maxRows={8}
          onValueChange={setSample}
          placeholder='{ "result": { "output": [ { "text": "Hello." } ], "stop": "stop" } }'
          rows={3}
          value={sample}
        />
      </Field>
      <PreviewResolution map={map} sample={sample} />
    </Stack>
  );
}

function PreviewResolution({
  map,
  sample,
}: {
  readonly map: NonNullable<ConnectionTransportDoc["responseMap"]>;
  readonly sample: string;
}): ReactElement | null {
  if (sample.trim() === "") {
    return null;
  }
  const parsed = parseJson(sample);
  if (!parsed.ok) {
    return (
      <Text className="text-warning" voice="gloss">
        That isn't JSON yet — paste the whole reply body.
      </Text>
    );
  }
  const stated = RESPONSE_MAP_ORDER.filter((key) => (map[key] ?? "") !== "");
  return (
    <Stack gap="tight">
      {stated.length === 0 ? <Text voice="gloss">No paths are set yet, so there is nothing to resolve.</Text> : null}
      {stated.map((key) => {
        const resolved = resolveDotPath(parsed.value, map[key] ?? "");
        return (
          <Row align="center" className="flex-wrap" data-resolved-path={key} gap="field" key={key}>
            <Text voice="label">{RESPONSE_MAP_FIELDS[key]}</Text>
            <Text voice="gloss">→</Text>
            <Text voice="datum">{resolved === undefined ? "nothing at that path" : JSON.stringify(resolved)}</Text>
            {key === "finishReasonPath" ? <FinishReasonReading value={resolved} /> : null}
          </Row>
        );
      })}
    </Stack>
  );
}

/** The finish reason's NORMALIZED reading — the one verdict the preview exists to catch. A path that
 *  resolves to a string outside `NORMALIZED_FINISH_REASONS` reads as `other` on every turn, which is exactly
 *  the silent failure the author cannot see from the path alone. */
function FinishReasonReading({ value }: { readonly value: unknown }): ReactElement {
  const known = typeof value === "string" && (NORMALIZED_FINISH_REASONS as readonly string[]).includes(value);
  return (
    <Badge intent={known ? "success" : "warning"} size="sm" tone="soft">
      {known ? `reads as ${String(value)}` : "we can't read that as a finish reason"}
    </Badge>
  );
}

type JsonParse = { readonly ok: true; readonly value: unknown } | { readonly ok: false };

function parseJson(raw: string): JsonParse {
  try {
    return { ok: true, value: JSON.parse(raw) as unknown };
  } catch {
    return { ok: false };
  }
}

/** `a.b[0].c` over a parsed body — the same dot-and-index spelling the transport's own map uses. */
function resolveDotPath(root: unknown, path: string): unknown {
  let cursor: unknown = root;
  for (const segment of path.replace(/\[(\d+)]/g, ".$1").split(".")) {
    if (segment === "") {
      continue;
    }
    if (typeof cursor !== "object" || cursor === null) {
      return;
    }
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}

function parseHeaders(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const at = line.indexOf(":");
    if (at > 0) {
      out[line.slice(0, at).trim()] = line.slice(at + 1).trim();
    }
  }
  return out;
}

function parseList(raw: string): readonly string[] {
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "");
}

function prune(doc: ConnectionTransportDoc): ConnectionTransportDoc {
  const out: Record<string, unknown> = { ...doc };
  for (const [key, value] of Object.entries(out)) {
    const empty =
      value === undefined || (Array.isArray(value) ? value.length === 0 : typeof value === "object" && value !== null && Object.keys(value).length === 0);
    if (empty) {
      delete out[key];
    }
  }
  return out as ConnectionTransportDoc;
}

function withHeaders(transport: ConnectionTransportDoc | null, headers: Record<string, string>): ConnectionTransportDoc {
  return prune({ ...transport, headers });
}

function withExcludeBody(transport: ConnectionTransportDoc | null, excludeBody: readonly string[]): ConnectionTransportDoc {
  return prune({ ...transport, excludeBody: [...excludeBody] });
}

function withMapPath(
  transport: ConnectionTransportDoc | null,
  key: keyof NonNullable<ConnectionTransportDoc["responseMap"]>,
  value: string,
): ConnectionTransportDoc {
  const responseMap: Record<string, string> = {};
  for (const [stated, path] of Object.entries(transport?.responseMap ?? {})) {
    if (path !== undefined) {
      responseMap[stated] = path;
    }
  }
  if (value === "") {
    delete responseMap[key];
  } else {
    responseMap[key] = value;
  }
  return prune({ ...transport, responseMap });
}
