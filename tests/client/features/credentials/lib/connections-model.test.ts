// Unit: the CONNECTIONS pane's pure model (features/credentials/lib/connections-model). No DOM — the
// node lane. Guards the W10 load-bearing logic: the embedding-dimension mismatch advisory (both slots
// feed one 1024-dim shared space), the routing project ⇄ patch round-trip (EVERY leaf written
// explicitly — an emptied field as `null`, never an omitted key, because the server merge treats an
// omitted key as a no-op and a "cleared" role would keep routing turns to the old model), the
// LIVE-vs-DRAFT drift model the pane discloses per row, and the per-role source constraints matching the
// settings schema (a stricter/looser list than the server would hide or mis-offer a legal choice).

import { ROUTABLE_TASKS } from "@orb/contracts/inference";
import type { CredentialProvider } from "@orb/contracts/credentials";
import { CRED_PROVIDERS } from "@orb/contracts/credentials";
import { DEFAULT_USER_SETTINGS, USER_SETTINGS_SCHEMA_VERSION, userSettingsConfig } from "@orb/contracts/settings";
import type { RoutingForm } from "../../../../../packages/client/src/features/credentials/lib/connections-model.ts";
import {
  CHAT_API_LABELS,
  chatApiForSourceChange,
  chatApisForSource,
  embedDimensionWarning,
  groupCredentialsByProvider,
  isConfigured,
  PROVIDER_LABELS,
  persistedRoleLabel,
  projectRoutingForm,
  ROLE_SLOTS,
  ROLE_SLOTS_ORDERED,
  roleRowDrifted,
  routingFormDrifted,
  SOURCE_LABELS,
  toRoutingSection,
} from "../../../../../packages/client/src/features/credentials/lib/connections-model.ts";
import { expect, test } from "../../../../support/fixtures.ts";

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

// The patch shape for one fully-unset role: both leaves explicitly cleared (never omitted).
const CLEARED_ROLE = { source: null, model: null };

test("an all-empty form CLEARS every role leaf explicitly (an omitted key is a merge no-op, not a clear)", () => {
  const empty = projectRoutingForm({ roleDefaults: {} });
  expect(toRoutingSection(empty)).toEqual({
    roleDefaults: {
      chat: { ...CLEARED_ROLE, api: null },
      embed: CLEARED_ROLE,
      rerank: CLEARED_ROLE,
      imageEmbed: CLEARED_ROLE,
      summarize: CLEARED_ROLE,
      generateImage: CLEARED_ROLE,
    },
  });
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
  // Back to the written section — the chat config carries every set field.
  expect(toRoutingSection(form).roleDefaults["chat"]).toEqual({
    source: "openrouter",
    model: "anthropic/claude-opus-4-8",
    api: "chat-completions",
  });
});

test("a blank model on a LIVE slot emits an explicit null clear (deepMergePlain null=clear), not an omitted key", () => {
  const form = projectRoutingForm({ roleDefaults: {} });
  const withBlank = { ...form, embed: { source: "vllm", model: "   " } };
  // source set but model blank ⇒ the config keeps the source AND sends `model: null` so the server merge
  // drops any stale model id (an omitted key would be a no-op merge — the mis-route bug).
  expect(toRoutingSection(withBlank).roleDefaults["embed"]).toEqual({ source: "vllm", model: null });
});

test("switching provider (source changes ⇒ model reset) emits a null-clear for the stale model — chat + non-chat", () => {
  // Start configured on OpenRouter, then the provider Select resets the model to "" (role-slot-row).
  const configured = projectRoutingForm({
    roleDefaults: {
      chat: { source: "openrouter", model: "anthropic/claude-opus-4-8", api: "chat-completions" },
      rerank: { source: "openrouter", model: "rerank-v3.5" },
    },
  });
  const switched = {
    ...configured,
    chat: { ...configured.chat, source: "vllm", api: "", model: "" },
    rerank: { source: "vllm", model: "" },
  };
  // Every switched slot carries `model: null` — the explicit clear deepMergePlain honours (absent = no-op).
  const { roleDefaults } = toRoutingSection(switched);
  expect(roleDefaults["chat"]).toEqual({ source: "vllm", model: null, api: null });
  expect(roleDefaults["rerank"]).toEqual({ source: "vllm", model: null });
});

test("clearing a previously-set slot writes the clear — the reason Clear used to be a silent no-op", () => {
  const configured = projectRoutingForm({
    roleDefaults: { rerank: { source: "openrouter", model: "rerank-v3.5" } },
  });
  expect(configured.rerank.source).toBe("openrouter");
  // The user clears both fields. The patch must NAME both leaves as null: the write path is
  // deepMergePlain(stored, patch), so the previous omitted-key shape left `rerank` exactly as it was —
  // the row rendered empty while turns kept resolving openrouter/rerank-v3.5.
  const cleared = { ...configured, rerank: { source: "", model: "" } };
  expect(toRoutingSection(cleared).roleDefaults["rerank"]).toEqual(CLEARED_ROLE);
});

// --- the SERVER leg: patch → the settings parse → back to the form ------------------------------
// The projection above only proves the CLIENT half. The pane's drift compare puts a form value beside a
// projection of the SERVER's stored row, so "empty" has to be ONE value across the whole loop: the form
// spells it `""`, the patch spells it `null` (the explicit clear), and the stored blob keeps that `null`
// through the lenient parse. If any leg disagreed, an untouched row would read as a PERPETUAL draft and
// the "Not applied yet — a turn still uses …" disclosure would never retire. Runs the REAL contract
// parser (the same `userSettingsConfig` the write seam re-validates through), not a stand-in.

/** The form as the server hands it back: the patch through the whole-blob parse, re-projected. The patch
 *  is TOTAL over the form's roles, so the server's deep-merge with the previous section is a no-op here. */
function reprojected(form: RoutingForm): RoutingForm {
  const stored = userSettingsConfig.parse({ ...DEFAULT_USER_SETTINGS, routing: toRoutingSection(form) }, USER_SETTINGS_SCHEMA_VERSION);
  return projectRoutingForm(stored.routing);
}

const EMPTY_FORM: RoutingForm = projectRoutingForm({ roleDefaults: {} });

test("an untouched all-default pane round-trips through the server parse — nothing reads as a draft", () => {
  expect(reprojected(EMPTY_FORM)).toEqual(EMPTY_FORM);
});

test("a vllm chat row with NO model round-trips — the form's '' and the stored null are the same empty", () => {
  // The owner's live state on 2026-08-02: `{"api":"chat-completions","source":"vllm","model":null}`, where
  // the model cell is a read-only server-config display and the form value is therefore "".
  const form = { ...EMPTY_FORM, chat: { source: "vllm", model: "", api: "chat-completions" } };
  expect(reprojected(form)).toEqual(form);
});

test("every source/model/protocol arm the pickers can produce round-trips through the server parse", () => {
  const arms: readonly RoutingForm[] = [
    // Protocol "Auto" — an ABSENT api, the third representation of empty on the chat row.
    { ...EMPTY_FORM, chat: { source: "vllm", model: "", api: "" } },
    // A cleared row beside a live one (Clear empties both leaves).
    { ...EMPTY_FORM, embed: { source: "vllm", model: "" }, rerank: { source: "openrouter", model: "rerank-v3.5" } },
    // custom_openai's free-text model id (the picker commits it trimmed).
    { ...EMPTY_FORM, chat: { source: "custom_openai", model: "my-local-model", api: "chat-completions" } },
    // Every role configured, each on a source its own schema arm permits. The two CONFIG-DERIVED rows
    // (vllm/local-light) carry NO model — their cell is a read-only server-config display, and the
    // projection drops a model on those sources anyway (the server rejects such a pin).
    {
      chat: { source: "openrouter", model: "anthropic/claude-sonnet-5", api: "agent-sdk" },
      embed: { source: "vllm", model: "" },
      rerank: { source: "local-light", model: "" },
      imageEmbed: { source: "openrouter", model: "clip-vit-large" },
      summarize: { source: "vllm", model: "" },
      generateImage: { source: "openrouter", model: "black-forest-labs/flux-1.1-pro" },
    },
  ];
  const diverged = arms.filter((form) => JSON.stringify(reprojected(form)) !== JSON.stringify(form));
  expect(diverged).toEqual([]);
});

// The pane's mirror of the server's write-boundary rule (settings/substrate/routing-coherence.ts): vllm and
// local-light serve the model they were LAUNCHED with, so no model is persisted for them. Without this, a
// legacy row (`{source:"vllm", model:"anthropic/claude-sonnet-5"}` — the live 404) would be re-submitted
// verbatim on the next autosave and bounce off the server's `incoherent_role_model` refusal, blocking every
// unrelated edit in the pane.
test("a CONFIG-DERIVED source persists NO model — a legacy pin is cleared by the next save", () => {
  const form: RoutingForm = { ...EMPTY_FORM, chat: { source: "vllm", model: "anthropic/claude-sonnet-5", api: "chat-completions" } };
  const section = toRoutingSection(form);
  expect(section.roleDefaults["chat"]).toEqual({ source: "vllm", model: null, api: "chat-completions" });
  // A CATALOG source is untouched — its model IS the user's selection.
  const orForm: RoutingForm = { ...EMPTY_FORM, chat: { source: "openrouter", model: "anthropic/claude-sonnet-5", api: "chat-completions" } };
  expect(toRoutingSection(orForm).roleDefaults["chat"]).toEqual({
    source: "openrouter",
    model: "anthropic/claude-sonnet-5",
    api: "chat-completions",
  });
});

// --- LIVE vs DRAFT (the 2026-08-01 phantom: a never-saved pane read as configured) --------------

test("a row that matches the persisted projection is LIVE; any leaf differing is a DRAFT", () => {
  const persisted = projectRoutingForm({
    roleDefaults: { chat: { source: "openrouter", model: "anthropic/claude-sonnet-5", api: "chat-completions" } },
  });
  expect(roleRowDrifted(persisted, persisted, "chat")).toBe(false);
  expect(routingFormDrifted(persisted, persisted)).toBe(false);

  const modelEdited = { ...persisted, chat: { ...persisted.chat, model: "openai/gpt-5" } };
  expect(roleRowDrifted(modelEdited, persisted, "chat")).toBe(true);
  expect(routingFormDrifted(modelEdited, persisted)).toBe(true);

  // The chat row's protocol knob is part of ITS row — an api-only edit drifts too (and only chat's does).
  const apiEdited = { ...persisted, chat: { ...persisted.chat, api: "responses" } };
  expect(roleRowDrifted(apiEdited, persisted, "chat")).toBe(true);
  expect(roleRowDrifted(apiEdited, persisted, "embed")).toBe(false);
});

test("a NEVER-SAVED pane reads as unconfigured, and one edited row does not smear onto its siblings", () => {
  // roleDefaults NULL server-side = every row unset. Touching ONE row must drift ONLY that row.
  const persisted = projectRoutingForm({ roleDefaults: {} });
  const draft = { ...persisted, summarize: { source: "vllm", model: "" } };
  expect(roleRowDrifted(draft, persisted, "summarize")).toBe(true);
  const otherRolesDrifted = ROUTING_ROLE_KEYS.filter((role) => role !== "summarize" && roleRowDrifted(draft, persisted, role));
  expect(otherRolesDrifted).toEqual([]);
});

// (The save-phase → chip dispatch lives in role-slot-row.tsx, beside `AutosaveSaveState`; its arms are
// driven end-to-end by connections-settings-surface.ct.tsx. This lane keeps the pure drift model.)

test("the disclosure names what a turn ACTUALLY resolves — the app default when nothing is persisted", () => {
  const unset = projectRoutingForm({ roleDefaults: {} });
  expect(persistedRoleLabel(unset, "chat")).toBe("the app default");

  const sourceOnly = projectRoutingForm({ roleDefaults: { rerank: { source: "vllm" } } });
  expect(persistedRoleLabel(sourceOnly, "rerank")).toBe(`${SOURCE_LABELS.vllm} · its default model`);

  const full = projectRoutingForm({ roleDefaults: { chat: { source: "openrouter", model: "anthropic/claude-sonnet-5" } } });
  expect(persistedRoleLabel(full, "chat")).toBe(`${SOURCE_LABELS.openrouter} · anthropic/claude-sonnet-5`);
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
    expect(ROLE_SLOTS[role].sources.toSorted()).toEqual(inferenceTiers.toSorted());
  }
});

test("summarize offers the two chat engines only (no metered sub); generateImage is openrouter-only", () => {
  expect(ROLE_SLOTS.summarize.sources.toSorted()).toEqual(["openrouter", "vllm"].sort());
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

test("chatApisForSource: an UNSET source offers NO pinned protocol (api + source fall back independently)", () => {
  // resolve-role.ts ROLE_SELECTORS.chat resolves `api` and `source` from separate fallbacks, so a pinned
  // protocol over an unpinned source meets whatever default the server picks — for the owner `max-pro-sub`,
  // which assertCoherent rejects for everything but agent-sdk. Auto is the only coherent option.
  expect(chatApisForSource("")).toEqual([]);
});

// --- chatApiForSourceChange — the pair stays coherent across a source switch ---

test("a source switch KEEPS a protocol the new source can take", () => {
  expect(chatApiForSourceChange("agent-sdk", "max-pro-sub")).toBe("agent-sdk");
  expect(chatApiForSourceChange("chat-completions", "vllm")).toBe("chat-completions");
  expect(chatApiForSourceChange("responses", "custom_openai")).toBe("responses");
});

test("a source switch CLEARS a protocol the new source cannot take (the turn-breaking pair)", () => {
  // The exact incident: OpenRouter × agent-sdk, then the source flips to vLLM. Leaving `api` behind
  // persisted {api:"agent-sdk", source:"vllm"} — rejected by assertCoherent at turn time.
  expect(chatApiForSourceChange("agent-sdk", "vllm")).toBe("");
  expect(chatApiForSourceChange("agent-sdk", "local-light")).toBe("");
  expect(chatApiForSourceChange("chat-completions", "max-pro-sub")).toBe("");
  // Back to the app default: nothing pinned survives, since the server picks the source.
  expect(chatApiForSourceChange("responses", "")).toBe("");
});

test("every (offered protocol → every source) switch lands on a pair the resolver accepts", () => {
  const sources = ["", "max-pro-sub", "openrouter", "vllm", "local-light", "custom_openai"];
  const incoherent: string[] = [];
  for (const from of sources) {
    for (const api of [...chatApisForSource(from), ""]) {
      for (const to of sources) {
        const next = chatApiForSourceChange(api, to);
        const legal = next === "" || (chatApisForSource(to) as readonly string[]).includes(next);
        if (!legal) {
          incoherent.push(`${api}@${from} → ${next}@${to}`);
        }
      }
    }
  }
  expect(incoherent).toEqual([]);
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
