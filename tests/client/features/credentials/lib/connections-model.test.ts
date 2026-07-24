// Unit: the CONNECTIONS pane's pure model (features/credentials/lib/connections-model). No DOM — the
// node lane. Guards the W10 load-bearing logic: the embedding-dimension mismatch advisory (both slots
// feed one 1024-dim shared space), the routing project ⇄ patch round-trip (unset ⇒ omitted "no
// preference", never a pinned empty), and the per-role source constraints matching the settings schema
// (a stricter/looser list than the server would hide or mis-offer a legal choice).

import { ROUTING_ROLE_KEYS } from "@orb/contracts/connection";
import type { CredentialProvider } from "@orb/contracts/credentials";
import { CRED_PROVIDERS } from "@orb/contracts/credentials";
import {
  CHAT_API_LABELS,
  chatApisForSource,
  embedDimensionWarning,
  groupCredentialsByProvider,
  isConfigured,
  PROVIDER_LABELS,
  projectRoutingForm,
  ROLE_SLOTS,
  ROLE_SLOTS_ORDERED,
  SOURCE_LABELS,
  toRoutingSection,
} from "../../../../../packages/client/src/features/credentials/lib/connections-model";
import { expect, test } from "../../../../support/fixtures";

// --- embedDimensionWarning ---------------------------------------------------

test("no embed warning when the image slot is empty (the captioned-text fallback)", () => {
  expect(embedDimensionWarning({ source: "openrouter", model: "text-embedding-3-large" }, undefined)).toBeNull();
  expect(embedDimensionWarning({ source: "openrouter", model: "text-embedding-3-large" }, { source: "vllm", model: "" })).toBeNull();
});

test("no embed warning when both embedders are the identical (source, model) pair", () => {
  const same = { source: "vllm" as const, model: "bge-m3" };
  expect(embedDimensionWarning(same, { ...same })).toBeNull();
});

test("WARNS when both slots are configured to DIFFERENT embedders (a plausible dimension mismatch)", () => {
  const warning = embedDimensionWarning({ source: "openrouter", model: "text-embedding-3-large" }, { source: "vllm", model: "clip-vit-large" });
  expect(warning).not.toBeNull();
  expect(warning).toContain("1024");
});

test("WARNS on same source but different model (a different-dim model on the same provider)", () => {
  const warning = embedDimensionWarning({ source: "vllm", model: "bge-m3" }, { source: "vllm", model: "clip-vit-large" });
  expect(warning).not.toBeNull();
});

// --- isConfigured ------------------------------------------------------------

test("isConfigured requires BOTH a source and a non-blank model", () => {
  expect(isConfigured(undefined)).toBe(false);
  expect(isConfigured({})).toBe(false);
  expect(isConfigured({ source: "openrouter" })).toBe(false);
  expect(isConfigured({ source: "openrouter", model: "   " })).toBe(false);
  expect(isConfigured({ model: "gpt-4" })).toBe(false);
  expect(isConfigured({ source: "openrouter", model: "gpt-4" })).toBe(true);
});

// --- projectRoutingForm ⇄ toRoutingSection round-trip ------------------------

test("an all-empty form projects to an empty roleDefaults (unset ⇒ omitted, never pinned empty)", () => {
  const empty = projectRoutingForm({ roleDefaults: {} });
  expect(toRoutingSection(empty)).toEqual({ roleDefaults: {} });
});

test("a configured chat slot round-trips through the projection with its api knob", () => {
  const section = {
    roleDefaults: {
      chat: {
        source: "openrouter" as const,
        model: "anthropic/claude-opus-4-8",
        api: "chat-completions" as const,
      },
    },
  };
  const form = projectRoutingForm(section);
  expect(form.chat.source).toBe("openrouter");
  expect(form.chat.model).toBe("anthropic/claude-opus-4-8");
  expect(form.chat.api).toBe("chat-completions");
  // Back to the sparse section — the chat config carries every set field.
  expect(toRoutingSection(form)).toEqual({
    roleDefaults: {
      chat: {
        source: "openrouter",
        model: "anthropic/claude-opus-4-8",
        api: "chat-completions",
      },
    },
  });
});

test("a whitespace model collapses to an omitted slot (no preference), not a pinned blank", () => {
  const form = projectRoutingForm({ roleDefaults: {} });
  const withBlank = { ...form, embed: { source: "vllm", model: "   " } };
  // source set but model blank ⇒ the sparse config keeps only the source (model omitted).
  expect(toRoutingSection(withBlank)).toEqual({ roleDefaults: { embed: { source: "vllm" } } });
});

test("clearing a previously-set slot releases it (the section replaces roleDefaults wholesale)", () => {
  const configured = projectRoutingForm({
    roleDefaults: { rerank: { source: "openrouter", model: "rerank-v3.5" } },
  });
  expect(configured.rerank.source).toBe("openrouter");
  // The user clears both fields → the slot is omitted from the next written section.
  const cleared = { ...configured, rerank: { source: "", model: "" } };
  expect(toRoutingSection(cleared)).toEqual({ roleDefaults: {} });
});

// --- role-slot source constraints (must match the settings schema) -----------

test("every routing role has a slot descriptor (a new role is caught here)", () => {
  for (const role of ROUTING_ROLE_KEYS) {
    expect(ROLE_SLOTS[role]).toBeDefined();
    expect(ROLE_SLOTS[role].role).toBe(role);
  }
  expect(ROLE_SLOTS_ORDERED).toHaveLength(ROUTING_ROLE_KEYS.length);
});

test("only the chat slot carries the chat knobs; only imageEmbed is optional", () => {
  expect(ROLE_SLOTS.chat.carriesChatKnobs).toBe(true);
  const nonChatCarriers = ROUTING_ROLE_KEYS.filter((role) => role !== "chat" && ROLE_SLOTS[role].carriesChatKnobs);
  expect(nonChatCarriers).toEqual([]);
  expect(ROLE_SLOTS.imageEmbed.optional).toBe(true);
  expect(ROLE_SLOTS.chat.optional).toBe(false);
});

test("the inference-derive roles offer exactly the three inference tiers (schema parity)", () => {
  const inferenceTiers = ["openrouter", "vllm", "local-light"];
  for (const role of ["embed", "rerank", "imageEmbed"] as const) {
    expect([...ROLE_SLOTS[role].sources].sort()).toEqual([...inferenceTiers].sort());
  }
});

test("summarize offers the two chat engines + the Claude sub; generateImage is openrouter-only", () => {
  expect([...ROLE_SLOTS.summarize.sources].sort()).toEqual(["max-pro-sub", "openrouter", "vllm"].sort());
  expect(ROLE_SLOTS.generateImage.sources).toEqual(["openrouter"]);
});

// --- label maps are total over their unions ----------------------------------

test("SOURCE_LABELS covers every source a role slot can offer", () => {
  for (const slot of ROLE_SLOTS_ORDERED) {
    for (const source of slot.sources) {
      expect(SOURCE_LABELS[source]).toBeTruthy();
    }
  }
});

test("PROVIDER_LABELS is total over the storable providers", () => {
  for (const provider of CRED_PROVIDERS) {
    expect(PROVIDER_LABELS[provider]).toBeTruthy();
  }
});

test("CHAT_API_LABELS is total over the protocol axis", () => {
  expect(CHAT_API_LABELS["agent-sdk"]).toBeTruthy();
  expect(CHAT_API_LABELS["chat-completions"]).toBeTruthy();
  expect(CHAT_API_LABELS.responses).toBeTruthy();
});

// --- chatApisForSource — the assertCoherent mirror (resolve-role.ts §148-166) ---

test("chatApisForSource: max-pro-sub → agent-sdk only; openrouter → all three", () => {
  expect(chatApisForSource("max-pro-sub")).toEqual(["agent-sdk"]);
  expect(chatApisForSource("openrouter")).toEqual(["agent-sdk", "chat-completions", "responses"]);
});

test("chatApisForSource: vllm / local-light / custom → chat-completions + responses", () => {
  for (const source of ["vllm", "local-light", "custom_openai"]) {
    expect(chatApisForSource(source)).toEqual(["chat-completions", "responses"]);
  }
});

test("chatApisForSource: every offered pair is legal under the resolver matrix", () => {
  // Collect every illegal (api, source) the map offers; assert the set is empty (no conditional expect).
  const illegal: string[] = [];
  for (const source of ["max-pro-sub", "openrouter", "vllm", "local-light", "custom_openai"]) {
    for (const api of chatApisForSource(source)) {
      const agentSdkOk = source === "max-pro-sub" || source === "openrouter";
      if (api === "agent-sdk" && !agentSdkOk) {
        illegal.push(`${api}/${source}`);
      }
    }
  }
  expect(illegal).toEqual([]);
});

// --- groupCredentialsByProvider (§5.1) ---------------------------------------

test("the key library buckets per present provider in the stable ordered set", () => {
  const row = (provider: CredentialProvider, id: string): { provider: CredentialProvider; id: string } => ({ provider, id });
  const groups = groupCredentialsByProvider([row("custom_openai", "c1"), row("openrouter", "o1"), row("openrouter", "o2")]);
  expect(groups.map(([provider]) => provider)).toEqual(["openrouter", "custom_openai"]);
  expect(groups[0]?.[1].map((r) => r.id)).toEqual(["o1", "o2"]);
  expect(groups[1]?.[1].map((r) => r.id)).toEqual(["c1"]);
  expect(groupCredentialsByProvider([])).toEqual([]);
});
