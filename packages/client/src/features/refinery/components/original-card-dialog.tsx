// The immutable refinement anchor, never the live card or a macro-expanded chat projection.
// Opaque vendor records are not refinement targets; authored text and greeting/depth metadata stay literal.

import type { CharacterCard } from "@orb/contracts/character";
import { REFINABLE_FIELDS } from "@orb/contracts/refinery";
import { Stack } from "@orb/ui/layout";
import { Heading, Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { ViewerDialog } from "#components";
import { scopeChipLabelOf } from "../lib/render-plan.ts";

export function OriginalCardDialog({ card, onOpenChange }: { readonly card: CharacterCard; readonly onOpenChange: (open: boolean) => void }): ReactElement {
  return (
    <ViewerDialog onOpenChange={onOpenChange} open={true} title="Original card — pinned at session start">
      <Heading level={2}>{card.name}</Heading>
      <Text className="max-inline-(--reading-measure-prose)" voice="gloss">
        Read-only authored fields pinned when this session started. Macros are shown as written.
      </Text>
      {REFINABLE_FIELDS.map((field) => {
        if (field === "greetings") {
          return <OriginalGreetings greetings={card.greetings} key={field} />;
        }
        const text = field === "depthPrompt" ? card.depthPrompt?.prompt : card[field];
        if (text === null || text === undefined) {
          return null;
        }
        const content = text.length === 0 ? "Empty field" : text;
        return (
          <Stack gap="tight" key={field}>
            <Heading level={3}>{scopeChipLabelOf(field, undefined)}</Heading>
            {field === "depthPrompt" && card.depthPrompt !== null ? (
              <Text voice="gloss">
                Depth {card.depthPrompt.depth} · {card.depthPrompt.role ?? "role not specified"}
              </Text>
            ) : null}
            <Text className="wrap-anywhere whitespace-pre-wrap max-inline-(--reading-measure-prose)" prose={true}>
              {content}
            </Text>
          </Stack>
        );
      })}
    </ViewerDialog>
  );
}

function OriginalGreetings({ greetings }: { readonly greetings: CharacterCard["greetings"] }): ReactElement {
  return (
    <Stack gap="row">
      <Heading level={3}>{scopeChipLabelOf("greetings", undefined)}</Heading>
      {greetings.map((greeting, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: greeting positions belong to the immutable session-start snapshot.
        <Stack gap="tight" key={index}>
          <Text voice="kicker">
            Greeting {index + 1}
            {greeting.groupOnly === true ? " · group only" : ""}
          </Text>
          <Text className="wrap-anywhere whitespace-pre-wrap max-inline-(--reading-measure-prose)" prose={true}>
            {greeting.text.length === 0 ? "Empty greeting" : greeting.text}
          </Text>
        </Stack>
      ))}
      {greetings.length === 0 ? <Text voice="gloss">No greetings pinned.</Text> : null}
    </Stack>
  );
}
