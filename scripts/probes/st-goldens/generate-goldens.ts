/// <reference lib="dom" />
/**
 * generate-goldens.ts
 *
 * Boots SillyTavern headless, writes character/chat fixtures to disk, intercepts
 * the outbound LLM call via page.route() (no separate mock server process), and
 * captures the exact request payload ST sends into scripts/probes/st-goldens/output/<id>.json.
 *
 * SCOPE: Chat completion ONLY. We never test text completion — Orbweaver doesn't do it.
 *
 * Usage:
 *   node scripts/probes/st-goldens/generate-goldens.ts [fixture_id]
 *
 * Fixtures: scripts/probes/st-goldens/fixtures/<id>.json
 * Output:   scripts/probes/st-goldens/output/<id>.json
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import process from "node:process";
import { chromium } from "@playwright/test";

const ST_LOG_REGEX = /listen|error|Error|EADD/i;

// ST's settings.json model key per chat_completion_source value.
// These are the keys ST reads to pick the model name for each provider.
// Source: ST openai.js oai_settings defaults + per-source model selectors.
function providerModelKey(source: string): string {
  const map: Record<string, string> = {
    openai: "openai_model",
    claude: "claude_model",
    makersuite: "google_model",
    vertexai: "vertexai_model",
    mistralai: "mistralai_model",
    deepseek: "deepseek_model",
    xai: "xai_model",
    custom: "custom_model",
    openrouter: "openrouter_model",
    groq: "groq_model",
    cohere: "cohere_model",
  };
  return map[source] ?? "openai_model";
}

// ST secrets.json key per chat_completion_source.
// We inject a fake key so ST's key-presence check passes.
function providerSecretKey(source: string): string {
  const map: Record<string, string> = {
    openai: "api_key_openai",
    claude: "api_key_claude",
    makersuite: "api_key_makersuite",
    vertexai: "api_key_makersuite", // Vertex uses same key slot
    mistralai: "api_key_mistralai",
    deepseek: "api_key_deepseek",
    xai: "api_key_xai",
    openrouter: "api_key_openrouter",
    groq: "api_key_groq",
    cohere: "api_key_cohere",
  };
  // Fallback: openai key works for CUSTOM and any unknown source
  return map[source] ?? "api_key_openai";
}

// Murmurhash2 — exact port of ST's getStringHash (utils.js:522, seed=0).
// Used to compute the Proxy_SkipConfirm_<hash> localStorage key so we can
// pre-seed it via addInitScript and never see the proxy confirmation dialog.
function stStringHash(str: string, seed = 0): number {
  // biome-ignore lint/suspicious/noBitwiseOperators: ST uses bitwise hashing
  let h1 = 0xde_ad_be_ef ^ seed;
  // biome-ignore lint/suspicious/noBitwiseOperators: ST uses bitwise hashing
  let h2 = 0x41_c6_ce_57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    // biome-ignore lint/suspicious/noBitwiseOperators: ST uses bitwise hashing
    h1 = Math.imul(h1 ^ ch, 2_654_435_761);
    // biome-ignore lint/suspicious/noBitwiseOperators: ST uses bitwise hashing
    h2 = Math.imul(h2 ^ ch, 1_597_334_677);
  }
  // biome-ignore lint/suspicious/noBitwiseOperators: ST uses bitwise hashing
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2_246_822_507) ^ Math.imul(h2 ^ (h2 >>> 13), 3_266_489_909);
  // biome-ignore lint/suspicious/noBitwiseOperators: ST uses bitwise hashing
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2_246_822_507) ^ Math.imul(h1 ^ (h1 >>> 13), 3_266_489_909);
  // biome-ignore lint/suspicious/noBitwiseOperators: ST uses bitwise hashing
  return 4_294_967_296 * (2_097_151 & h2) + (h1 >>> 0);
}

const GOLDEN_DIR = path.resolve(import.meta.dirname);
const ST_PORT = 8001;

async function main(): Promise<void> {
  const fixtureId = process.argv[2] ?? "basic_turn";
  const stPath = path.resolve(GOLDEN_DIR, "sillytavern-runtime");
  const fixturePath = path.resolve(GOLDEN_DIR, `fixtures/${fixtureId}.json`);

  if (!fs.existsSync(fixturePath)) {
    console.error(`[Golden] Fixture not found: ${fixturePath}`);
    process.exit(1);
  }

  // biome-ignore lint/suspicious/noExplicitAny: Mock data structures
  const fixture: any = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
  const charName = fixture.character.name;

  // ── 1. Patch ST settings ─────────────────────────────────────────────────
  // ARCHITECTURE NOTE:
  //   main_api = 'openai'     -- always, for ANY chat completion provider
  //                              (ST uses 'openai' as the umbrella API type)
  //   chat_completion_source  -- the ACTUAL provider discriminator
  //                              (e.g. 'openai', 'claude', 'makersuite', 'custom')
  //   reverse_proxy           -- shared across ALL proxySupportedSources:
  //                              CLAUDE, OPENAI, MISTRALAI, MAKERSUITE, VERTEXAI,
  //                              DEEPSEEK, XAI, ZAI, MOONSHOT
  //
  // We NEVER use text completion. Only chat completion.
  const provider = fixture.provider ?? "openai";
  const mockProxy = "http://127.0.0.1:19999";
  const settingsPath = path.join(stPath, "data", "default-user", "settings.json");
  // biome-ignore lint/suspicious/noExplicitAny: Mock data structures
  const settings: any = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));

  settings.main_api = "openai";
  settings.username = fixture.user?.name ?? "User";
  settings.max_context = 200_000;
  settings.max_context_unlocked = true;
  settings.oai_settings = settings.oai_settings ?? {};
  settings.oai_settings.chat_completion_source = provider;
  settings.oai_settings.openai_max_context = 200_000;
  settings.oai_settings.max_context_unlocked = true;
  if (fixture.tools && fixture.tools.length > 0) {
    settings.function_calling = true;
    settings.oai_settings.function_calling = true;
    settings.extension_settings = settings.extension_settings ?? {};
    settings.extension_settings.tool_calling = settings.extension_settings.tool_calling ?? {};
    settings.extension_settings.tool_calling.function_calling = true;
  }

  // Apply name behavior settings if present
  if (fixture.settings && "always_force_name2" in fixture.settings) {
    if (!settings.power_user) {
      settings.power_user = {};
    }
    settings.power_user.always_force_name2 = fixture.settings.always_force_name2;
  }

  // Edit OpenAI Settings/Default.json
  const openaiSettingsPath = path.join(stPath, "data", "default-user", "OpenAI Settings", "Default.json");
  if (fs.existsSync(openaiSettingsPath)) {
    // biome-ignore lint/suspicious/noExplicitAny: Mock data structures
    const openaiSettings: any = JSON.parse(fs.readFileSync(openaiSettingsPath, "utf-8"));
    if (fixture.settings && "names_behavior" in fixture.settings) {
      openaiSettings.names_behavior = fixture.settings.names_behavior;
      fs.writeFileSync(openaiSettingsPath, JSON.stringify(openaiSettings, null, 2));
    }
  }

  // Apply any overrides from fixture (e.g. squash_system_messages, prompt_post_processing)
  if (fixture.settings) {
    Object.assign(settings.oai_settings, fixture.settings);
  }

  // reverse_proxy routes ALL outbound requests through our interceptor.
  settings.oai_settings.reverse_proxy = mockProxy;
  // ST's frontend proxy manager overwrites reverse_proxy on boot with selected_proxy.url!
  // We MUST provide a fake password, otherwise ST's backend sees an empty proxy_password
  // and fails the `if (!apiKey)` check when reverse_proxy is enabled.
  settings.selected_proxy = { name: "GoldenMock", url: mockProxy, password: "mock-proxy-pass" };

  // Make sure it doesn't try to connect to the actual API on boot
  settings.oai_settings.bypass_status_check = true;

  // ST shows a "Proxy Confirm" dialog if the reverse proxy URL is unrecognized.
  // It uses murmurhash2(URL) as the key: Proxy_SkipConfirm_<hash> = 'true' in accountStorage.
  const proxyConfirmKey = `Proxy_SkipConfirm_${stStringHash(mockProxy)}`;
  settings.accountStorage = settings.accountStorage ?? {};
  settings.accountStorage[proxyConfirmKey] = "true";

  const modelKey = providerModelKey(provider);
  settings.oai_settings[modelKey] = fixture.model ?? "mock-model";
  settings.active_character = "";
  settings.active_group = null;
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

  // Ensure ST has an API key for this provider (fake — intercepted before hitting any real server)
  const secretsPath = path.join(stPath, "data", "default-user", "secrets.json");
  // biome-ignore lint/suspicious/noExplicitAny: Mock data structures
  const secrets: any = fs.existsSync(secretsPath) ? JSON.parse(fs.readFileSync(secretsPath, "utf-8")) : {};
  secrets[providerSecretKey(provider)] = "sk-mock-golden-key";
  secrets.api_key_openai ??= "sk-mock-golden-key";
  fs.writeFileSync(secretsPath, JSON.stringify(secrets, null, 2));

  // ST explicitly excludes OpenRouter from its reverse_proxy flow. We patch it in-memory
  // before boot so we can intercept OpenRouter traffic on our mock server.
  const openaiJsPath = path.join(stPath, "public", "scripts", "openai.js");
  let openaiJs = fs.readFileSync(openaiJsPath, "utf-8");
  if (!openaiJs.includes("chat_completion_sources.OPENROUTER, // patched for goldens")) {
    openaiJs = openaiJs.replace(
      "const proxySupportedSources = [",
      "const proxySupportedSources = [\n    chat_completion_sources.OPENROUTER, // patched for goldens",
    );
    fs.writeFileSync(openaiJsPath, openaiJs);
  }

  // ── 3.5. Force active chat in file system ──────────────────────────────
  if (fixture.chatFile && charName) {
    const chatsDir = path.join(stPath, "data", "default-user", "chats", charName.replace(/[/\\?%*:|"<>]/g, "-"));
    if (fs.existsSync(chatsDir)) {
      // Find all jsonl files in the dir
      const chatFiles = fs.readdirSync(chatsDir).filter((f) => f.endsWith(".jsonl"));

      // If we found the target fixture chat, touch it to make it newest and rename it to ST's active chat name
      const targetBase = fixture.chatFile.endsWith(".jsonl") ? fixture.chatFile : `${fixture.chatFile}.jsonl`;
      if (chatFiles.includes(targetBase)) {
        // Delete all other chats so ST has no choice
        for (const file of chatFiles) {
          if (file !== targetBase) {
            fs.unlinkSync(path.join(chatsDir, file));
          }
        }

        // Touch the file so its modification time is now
        const targetPath = path.join(chatsDir, targetBase);
        const time = new Date();
        fs.utimesSync(targetPath, time, time);
      }
    }
  }

  // ── 4. Boot ST ──────────────────────────────────────────────────────────
  console.log(`[Golden] Fixture: ${fixtureId} | Character: ${charName}`);
  console.log(`[Golden] Booting ST at ${stPath}`);

  let mockServer: http.Server | undefined;
  let st: ReturnType<typeof spawn>;
  st = spawn("node", ["server.js"], {
    cwd: stPath,
    stdio: "pipe",
    // biome-ignore lint/style/noProcessEnv: Needed for passing PORT to child process
    // biome-ignore lint/style/useNamingConvention: Needed for passing PORT to child process.
    env: { ...process.env, PORT: String(ST_PORT) },
  });
  // Only log interesting ST lines, not all the chatter
  st.stdout?.on("data", (d: Buffer) => {
    const line = d.toString();
    if (ST_LOG_REGEX.test(line)) {
      process.stdout.write(`[ST] ${line}`);
    }
  });
  st.stderr?.on("data", (d: Buffer) => process.stderr.write(`[ST ERR] ${d}`));

  try {
    await waitForPort(ST_PORT, 20_000);

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      // serviceWorkers: 'block' is critical when intercepting requests —
      // an active SW can intercept the fetch BEFORE our route handler sees it,
      // causing our context.route() handler to never fire.
      serviceWorkers: "block",
    });

    const page = await context.newPage();

    // ── 5. Start Mock Server to intercept ST's backend requests ──────────
    // Playwright's context.route only intercepts browser requests.
    // ST's turn shaping and payload building happens in its Node.js backend.
    // The backend makes the actual request to our reverse_proxy.
    let capturedPayload: unknown = null;
    let capturedHeaders: Record<string, string> = {};

    mockServer = http.createServer((req, res) => {
      // CORS headers
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Headers", "*");
      if (req.method === "OPTIONS") {
        res.writeHead(200);
        res.end();
        return;
      }

      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        try {
          if (body) {
            capturedPayload = JSON.parse(body);
            capturedHeaders = req.headers as Record<string, string>;
            console.log(`[Golden] Mock server intercepted ${req.method} ${req.url}`);
          }
        } catch {
          capturedPayload = body;
        }

        if (req.url?.includes("/models")) {
          res.writeHead(200, { "Content-Type": "application/json" });
          const modelId = fixture.model ?? "mock-model";
          res.end(
            JSON.stringify({
              data: [
                {
                  id: modelId,
                  object: "model",
                  created: 1_686_935_002,
                  // biome-ignore lint/style/useNamingConvention: External API format
                  owned_by: "mock",
                  tools: true,
                  // biome-ignore lint/style/useNamingConvention: External API format
                  supports_tools: true,
                  // biome-ignore lint/style/useNamingConvention: External API format
                  max_context_length: 200_000,
                },
              ],
            }),
          );
        } else {
          // Chat completions or messages
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              id: "chatcmpl-golden",
              object: "chat.completion",
              created: 1_754_000_000,
              model: "mock-model",
              choices: [
                {
                  index: 0,
                  message: { role: "assistant", content: "Mock golden response." },
                  // biome-ignore lint/style/useNamingConvention: External API format
                  finish_reason: "stop",
                },
              ],
              usage: {
                // biome-ignore lint/style/useNamingConvention: External API format
                prompt_tokens: 10,
                // biome-ignore lint/style/useNamingConvention: External API format
                completion_tokens: 5,
                // biome-ignore lint/style/useNamingConvention: External API format
                total_tokens: 15,
              },
            }),
          );
        }
      });
    });

    mockServer.listen(19_999);
    console.log("[Golden] Mock server listening on port 19999");

    page.on("pageerror", (err) => console.error(`[PAGE ERROR] ${err}`));
    page.on("console", (msg) => {
      if (msg.text().includes("[Golden]") || msg.text().includes("[ToolManager]") || msg.text().includes("DEBUG")) {
        console.log(`[ST Browser] ${msg.text()}`);
      }
    });

    console.log("[Golden] Navigating to ST...");
    // biome-ignore lint/nursery/noPlaywrightNetworkidle: Needed for initial ST load
    await page.goto(`http://127.0.0.1:${ST_PORT}`, { waitUntil: "networkidle", timeout: 30_000 });
    // biome-ignore lint/nursery/noPlaywrightWaitForSelector: ST relies on dynamic DOM
    await page.waitForSelector("#chat", { timeout: 15_000 });

    // Let extensions finish activating
    await new Promise((r) => setTimeout(r, 1500));

    // ── 6. Click character card to activate it ───────────────────────────
    // ST's character list uses `.character_select` divs with `data-chid` (numeric index).
    // The click handler reads `$(this).attr('data-chid')` and calls `selectCharacterById(id)`.
    // We find the right card by matching `.ch_name` text content.
    //
    // CRITICAL: use raw el.click() (snap.ts --jsclick pattern). These divs are
    // absolutely-positioned virtualized rows — Playwright actionability checks
    // (isVisible, isIntersecting) fail on them. Never use locator.click().
    console.log(`[Golden] Activating character: ${charName}`);
    const chid = await page.evaluate((name: string) => {
      const cards = document.querySelectorAll<HTMLElement>(".character_select");
      for (const card of cards) {
        const nameEl = card.querySelector(".ch_name");
        if (nameEl?.textContent?.trim() === name) {
          card.click();
          return card.getAttribute("data-chid");
        }
      }
      return null;
    }, charName);

    if (chid === null) {
      console.warn(`[Golden] ⚠ No .character_select .ch_name matched "${charName}"`);
      // Dump what characters are available for debugging
      const available = await page.evaluate(() =>
        [...document.querySelectorAll(".character_select .ch_name")].map((el) => el.textContent?.trim()).filter(Boolean),
      );
      console.warn(`[Golden] Available characters: ${JSON.stringify(available)}`);
    } else {
      console.log(`[Golden] Clicked character (chid=${chid})`);
    }

    // Wait for at least one message to appear (chat loaded)
    // biome-ignore lint/nursery/noPlaywrightWaitForSelector: ST relies on dynamic DOM
    await page.waitForSelector(".mes", { timeout: 10_000 }).catch(() => {
      console.warn("[Golden] No .mes elements visible — chat may be empty, proceeding");
    });
    await new Promise((r) => setTimeout(r, 800));

    // ── 6.5. Connect to API ──────────────────────────────────────────────
    console.log("[Golden] Connecting to API...");
    await page.evaluate(() => {
      document.getElementById("api_button_openai")?.click();
    });
    // Wait for the textarea to become enabled (ST enables it when connected)
    await page
      .waitForFunction(
        () => {
          const ta = document.getElementById("send_textarea") as HTMLTextAreaElement;
          return ta && !ta.disabled && !ta.placeholder.includes("Not connected");
        },
        { timeout: 15_000 },
      )
      .catch(() => {
        console.warn("[Golden] ⚠ Textarea did not enable, connection might have failed.");
      });

    // ── 7. Send the user message ─────────────────────────────────────────
    // Optionally select a specific chat file if one is provided
    if (fixture.chatFile) {
      console.log(`[Golden] Selecting past chat: ${fixture.chatFile}`);
      // 1. Click the "Past Chats" button in the options menu
      // In ST, this button might be hidden, so we use evaluate to click it directly
      await page.evaluate(() => {
        const btn = document.getElementById("option_select_chat");
        if (btn) {
          btn.click();
        }
      });

      // 2. Wait for the past chats list to appear
      // biome-ignore lint/nursery/noPlaywrightWaitForSelector: ST relies on dynamic DOM
      await page.waitForSelector(".select_chat_block", { state: "visible", timeout: 10_000 });

      // 3. Find and click the chat item matching our fixture
      await page.evaluate((chatName) => {
        const items = Array.from(document.querySelectorAll(".select_chat_block"));
        const target = items.find((el) => {
          const title = el.querySelector(".select_chat_block_filename")?.textContent || el.textContent;
          return title?.includes(chatName);
        });
        if (target) {
          (target as HTMLElement).click();
        } else {
          console.warn(`[Golden] Could not find past chat matching ${chatName}`);
        }
      }, fixture.chatFile);

      // Wait for chat to load
      // biome-ignore lint/nursery/noPlaywrightWaitForTimeout: ST needs time to settle
      await page.waitForTimeout(2000);
    }

    if (fixture.tools && fixture.tools.length > 0) {
      console.log(`[Golden] Injecting ${fixture.tools.length} test tools via ToolManager...`);
      await page.evaluate(
        async (args: {
          fixture: { model?: string };
          tools: Array<{
            name: string;
            description: string;
            parameters: unknown;
          }>;
        }) => {
          // @ts-expect-error: Virtual import in browser context
          const { model_list } = await import("./scripts/openai.js");
          const modelId = args.fixture.model ?? "claude-3-5-sonnet-20240620";
          // biome-ignore lint/suspicious/noExplicitAny: Untyped script object
          const existing = model_list.find((m: any) => m.id === modelId);
          if (existing) {
            existing.tools = true;
            existing.supports_tools = true;
            existing.max_context_length = 200_000;
          } else {
            // biome-ignore lint/style/useNamingConvention: Needed for ST's model_list format
            model_list.push({ id: modelId, tools: true, supports_tools: true, max_context_length: 200_000 });
          }

          // @ts-expect-error: Virtual import in browser context
          const { extension_settings } = await import("./scripts/extensions.js");
          extension_settings.tool_calling = extension_settings.tool_calling || {};
          extension_settings.tool_calling.function_calling = true;

          // @ts-expect-error: Virtual import in browser context
          const { ToolManager } = await import("./scripts/tool-calling.js");
          // biome-ignore lint/suspicious/noExplicitAny: Untyped script object
          for (const t of args.tools as any[]) {
            ToolManager.registerFunctionTool({
              name: t.name,
              displayName: t.name,
              description: t.description,
              parameters: t.parameters,
              action: () => "mock_tool_result",
              shouldRegister: () => true,
            });
          }
        },
        { tools: fixture.tools, fixture },
      );
      // Wait for it to settle
      // biome-ignore lint/nursery/noPlaywrightWaitForTimeout: ST needs time to settle
      await page.waitForTimeout(500);
    }

    if (fixture.commands && fixture.commands.length > 0) {
      console.log(`[Golden] Executing ${fixture.commands.length} setup commands...`);
      for (const cmd of fixture.commands) {
        await page.fill("#send_textarea", cmd);
        await page.click("#send_but");
        // biome-ignore lint/nursery/noPlaywrightWaitForTimeout: Wait for command
        await page.waitForTimeout(1000);
      }
    }

    if (fixture.messages && fixture.messages.length > 0) {
      console.log("[Golden] Typing user message...");
      const text = fixture.messages.at(-1)?.content ?? "";
      await page.fill("#send_textarea", text);
      await page.click("#send_but");
    } else {
      console.log("[Golden] Triggering generation directly...");
      await page.evaluate(() => {
        const sendBtn = document.getElementById("send_but");
        if (sendBtn) {
          sendBtn.click();
        }
      });
    }

    console.log("[Golden] Taking screenshot for debug...");
    await page.screenshot({ path: path.join(stPath, "..", "debug-st.png"), fullPage: true });

    // ── 8. Wait for intercept to fire ────────────────────────────────────
    const deadline = Date.now() + 15_000;
    while (capturedPayload === null && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 200));
    }

    await browser.close();

    // ── 9. Write output ──────────────────────────────────────────────────
    const outDir = path.resolve(GOLDEN_DIR, "output");
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, `${fixtureId}.json`);

    if (capturedPayload === null) {
      console.error("[Golden] ✗ No LLM request was intercepted. Generate() may not have found a character, or the proxy URL was not used.");
      process.exitCode = 1;
    } else {
      const output = {
        // biome-ignore lint/style/useNamingConvention: Schema output
        golden_id: fixtureId,
        provider: fixture.provider ?? "openai",
        // biome-ignore lint/style/useNamingConvention: Schema output
        chat_completion_source: provider,
        model: fixture.model ?? "mock-model",
        // biome-ignore lint/style/useNamingConvention: Schema output
        captured_at: new Date().toISOString(),
        // request_headers: sync headers() call — lowercase keys, excludes security/cookie headers
        // (use allHeaders() async if you need cookies/auth)
        // biome-ignore lint/style/useNamingConvention: Schema output
        request_headers: capturedHeaders,
        payload: capturedPayload,
      };
      fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
      // biome-ignore lint/suspicious/noExplicitAny: Quick prop check
      const msgCount = (capturedPayload as any)?.messages?.length ?? "?";
      console.log(`[Golden] ✓ Captured payload: ${msgCount} messages → ${outPath}`);
    }
  } finally {
    st.kill();
    mockServer?.close();
  }
}

async function waitForPort(port: number, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 500);
      await fetch(`http://127.0.0.1:${port}/`, { signal: ctrl.signal });
      clearTimeout(timer);
      console.log(`[Golden] ST ready on port ${port}`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(`Port ${port} never became available within ${timeoutMs}ms`);
}

main().catch((err) => {
  console.error("[Golden] Fatal:", err);
  process.exit(1);
});
