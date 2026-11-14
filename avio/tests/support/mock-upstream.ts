import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import { MODELS, type ProviderId } from "../../src/config/catalog";

/**
 * A local stand-in for the three provider APIs, speaking each one's real wire
 * format (OpenAI Responses, Anthropic Messages, Gemini streamGenerateContent).
 *
 * It exists so tests and local development can exercise the real adapters,
 * streaming and billing without provider accounts. The application has no
 * code path that fabricates replies: it only ever talks HTTP to whatever the
 * provider base URLs point at.
 *
 * Behaviour is steered from the prompt, so it can also be driven from the UI:
 *   [[fail:openai]]       that provider answers 500
 *   [[ratelimit:google]]  that provider answers 429
 *   [[cut:anthropic]]     that provider errors after streaming part of a reply
 *   [[empty:openai]]      that provider completes without any text
 * An API key of "invalid-key" is rejected the way each provider rejects one.
 */

export const INVALID_KEY = "invalid-key";

export interface MockUpstream {
  url: string;
  baseUrls: Record<ProviderId, string>;
  /** Chat requests received per provider (retries included). */
  calls: Record<ProviderId, number>;
  /** Parsed body of the most recent chat request per provider. */
  lastBody: Partial<Record<ProviderId, unknown>>;
  /** Every request received, as "METHOD /path". */
  requests: string[];
  /** Delay between streamed chunks; can be changed while running. */
  chunkDelayMs: number;
  close(): Promise<void>;
}

export interface MockOptions {
  port?: number;
  /** Delay between streamed chunks. Zero for tests, a few ms to watch it stream. */
  chunkDelayMs?: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => (data += chunk));
    request.on("end", () => resolve(data));
    request.on("error", reject);
  });
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function startSse(response: ServerResponse): void {
  response.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
}

function sse(response: ServerResponse, data: unknown, event?: string): void {
  if (event) response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(data)}\n\n`);
}

function directive(prompt: string, name: string, provider: ProviderId): boolean {
  return prompt.includes(`[[${name}:${provider}]]`);
}

function replyFor(model: string, prompt: string): string {
  const quoted = prompt.replace(/\[\[[a-z]+:[a-z]+\]\]/g, "").trim().slice(0, 160);
  return [
    `**Simulated reply from \`${model}\`.** No real provider was called; this text comes from the local mock upstream.`,
    "",
    `You asked: "${quoted}"`,
    "",
    "A short example in TypeScript:",
    "",
    "```ts",
    "export function average(values: number[]): number {",
    "  if (values.length === 0) return 0;",
    "  return values.reduce((sum, value) => sum + value, 0) / values.length;",
    "}",
    "```",
    "",
    "Things this reply exercises:",
    "",
    "- streaming, one small chunk at a time",
    "- Markdown with `inline code`, lists and a table",
    "- token usage, which the server turns into credits",
    "",
    "| Check | Result |",
    "| --- | --- |",
    "| Adapter | reached |",
    "| Stream | complete |",
  ].join("\n");
}

function chunksOf(text: string): string[] {
  return text.match(/[\s\S]{1,14}/g) ?? [];
}

const tokens = (text: string) => Math.max(1, Math.ceil(text.length / 4));

export async function startMockUpstream(options: MockOptions = {}): Promise<MockUpstream> {
  const state = { chunkDelayMs: options.chunkDelayMs ?? 0 };
  const calls: Record<ProviderId, number> = { openai: 0, anthropic: 0, google: 0 };
  const lastBody: Partial<Record<ProviderId, unknown>> = {};
  const requests: string[] = [];
  const idsOf = (provider: ProviderId) =>
    MODELS.filter((model) => model.provider === provider).map((model) => model.id);

  // ---- OpenAI ---------------------------------------------------------------

  async function openai(request: IncomingMessage, response: ServerResponse, path: string) {
    if (request.headers.authorization === `Bearer ${INVALID_KEY}`) {
      return sendJson(response, 401, {
        error: { message: "Incorrect API key provided.", type: "invalid_request_error", code: "invalid_api_key" },
      });
    }
    if (request.method === "GET" && path === "/v1/models") {
      return sendJson(response, 200, {
        object: "list",
        data: idsOf("openai").map((id) => ({ id, object: "model", created: 0, owned_by: "mock" })),
      });
    }
    if (request.method === "POST" && path === "/v1/responses") {
      calls.openai += 1;
      const body = JSON.parse(await readBody(request)) as {
        model: string;
        input: { role: string; content: string }[];
      };
      lastBody.openai = body;
      const prompt = body.input.at(-1)?.content ?? "";
      if (directive(prompt, "fail", "openai")) {
        return sendJson(response, 500, { error: { message: "Mock server error.", type: "server_error", code: null } });
      }
      if (directive(prompt, "ratelimit", "openai")) {
        return sendJson(response, 429, {
          error: { message: "Rate limit reached.", type: "rate_limit_error", code: "rate_limit_exceeded" },
        });
      }
      const text = directive(prompt, "empty", "openai") ? "" : replyFor(body.model, prompt);
      const parts = chunksOf(text);
      const usage = {
        input_tokens: tokens(JSON.stringify(body.input)),
        input_tokens_details: { cached_tokens: 0 },
        output_tokens: tokens(text),
        output_tokens_details: { reasoning_tokens: 0 },
        total_tokens: tokens(JSON.stringify(body.input)) + tokens(text),
      };
      const shell = { id: "resp_mock", object: "response", model: body.model, output: [] };
      let sequence = 0;
      startSse(response);
      sse(response, { type: "response.created", sequence_number: sequence++, response: { ...shell, status: "in_progress" } }, "response.created");
      for (const [index, part] of parts.entries()) {
        if (directive(prompt, "cut", "openai") && index === Math.floor(parts.length / 2)) {
          sse(response, { type: "error", sequence_number: sequence++, code: "server_error", message: "Mock stream failure.", param: null }, "error");
          return response.end();
        }
        sse(
          response,
          { type: "response.output_text.delta", sequence_number: sequence++, item_id: "msg_mock", output_index: 0, content_index: 0, delta: part, logprobs: [] },
          "response.output_text.delta",
        );
        if (state.chunkDelayMs) await sleep(state.chunkDelayMs);
      }
      sse(response, { type: "response.completed", sequence_number: sequence++, response: { ...shell, status: "completed", usage } }, "response.completed");
      return response.end();
    }
    return sendJson(response, 404, { error: { message: "Not found.", type: "invalid_request_error", code: null } });
  }

  // ---- Anthropic ------------------------------------------------------------

  async function anthropic(request: IncomingMessage, response: ServerResponse, path: string) {
    if (request.headers["x-api-key"] === INVALID_KEY) {
      return sendJson(response, 401, { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } });
    }
    if (request.method === "GET" && path === "/v1/models") {
      const data = idsOf("anthropic").map((id) => ({ type: "model", id, display_name: id, created_at: "2026-01-01T00:00:00Z" }));
      return sendJson(response, 200, { data, has_more: false, first_id: data[0]?.id ?? null, last_id: data.at(-1)?.id ?? null });
    }
    if (request.method === "POST" && path === "/v1/messages") {
      calls.anthropic += 1;
      const body = JSON.parse(await readBody(request)) as {
        model: string;
        messages: { role: string; content: string }[];
      };
      lastBody.anthropic = body;
      const prompt = body.messages.at(-1)?.content ?? "";
      if (directive(prompt, "fail", "anthropic")) {
        return sendJson(response, 500, { type: "error", error: { type: "api_error", message: "Mock server error." } });
      }
      if (directive(prompt, "ratelimit", "anthropic")) {
        return sendJson(response, 429, { type: "error", error: { type: "rate_limit_error", message: "Rate limited." } });
      }
      const text = directive(prompt, "empty", "anthropic") ? "" : replyFor(body.model, prompt);
      const parts = chunksOf(text);
      startSse(response);
      sse(
        response,
        {
          type: "message_start",
          message: {
            id: "msg_mock", type: "message", role: "assistant", model: body.model, content: [],
            stop_reason: null, stop_sequence: null,
            usage: { input_tokens: tokens(JSON.stringify(body.messages)), output_tokens: 1 },
          },
        },
        "message_start",
      );
      sse(response, { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }, "content_block_start");
      for (const [index, part] of parts.entries()) {
        if (directive(prompt, "cut", "anthropic") && index === Math.floor(parts.length / 2)) {
          sse(response, { type: "error", error: { type: "overloaded_error", message: "Overloaded" } }, "error");
          return response.end();
        }
        sse(response, { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: part } }, "content_block_delta");
        if (state.chunkDelayMs) await sleep(state.chunkDelayMs);
      }
      sse(response, { type: "content_block_stop", index: 0 }, "content_block_stop");
      sse(
        response,
        { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: tokens(text) } },
        "message_delta",
      );
      sse(response, { type: "message_stop" }, "message_stop");
      return response.end();
    }
    return sendJson(response, 404, { type: "error", error: { type: "not_found_error", message: "Not found." } });
  }

  // ---- Google Gemini --------------------------------------------------------

  async function google(request: IncomingMessage, response: ServerResponse, path: string) {
    if (request.headers["x-goog-api-key"] === INVALID_KEY) {
      return sendJson(response, 400, {
        error: { code: 400, message: "API key not valid. Please pass a valid API key.", status: "INVALID_ARGUMENT" },
      });
    }
    // The SDK has used both API versions; accept either.
    if (request.method === "GET" && /^\/v1(beta)?\/models$/.test(path)) {
      return sendJson(response, 200, {
        models: idsOf("google").map((id) => ({
          name: `models/${id}`,
          displayName: id,
          supportedGenerationMethods: ["generateContent"],
        })),
      });
    }
    const match = /^\/v1(?:beta)?\/models\/([^:]+):streamGenerateContent$/.exec(path);
    if (request.method === "POST" && match) {
      calls.google += 1;
      const model = decodeURIComponent(match[1]);
      const body = JSON.parse(await readBody(request)) as {
        contents: { role: string; parts: { text: string }[] }[];
      };
      lastBody.google = body;
      const prompt = body.contents.at(-1)?.parts.map((part) => part.text).join("") ?? "";
      if (directive(prompt, "fail", "google")) {
        return sendJson(response, 503, { error: { code: 503, message: "The model is overloaded.", status: "UNAVAILABLE" } });
      }
      if (directive(prompt, "ratelimit", "google")) {
        return sendJson(response, 429, { error: { code: 429, message: "Resource has been exhausted.", status: "RESOURCE_EXHAUSTED" } });
      }
      const text = directive(prompt, "empty", "google") ? "" : replyFor(model, prompt);
      const parts = chunksOf(text);
      const usageMetadata = {
        promptTokenCount: tokens(JSON.stringify(body.contents)),
        candidatesTokenCount: tokens(text),
        thoughtsTokenCount: 0,
        totalTokenCount: tokens(JSON.stringify(body.contents)) + tokens(text),
      };
      startSse(response);
      for (const [index, part] of parts.entries()) {
        if (directive(prompt, "cut", "google") && index === Math.floor(parts.length / 2)) {
          // Gemini streams have no error frame; a failure is a dropped
          // connection. Let what was already written reach the client first.
          await sleep(25);
          return response.destroy();
        }
        sse(response, { candidates: [{ content: { role: "model", parts: [{ text: part }] }, index: 0 }] });
        if (state.chunkDelayMs) await sleep(state.chunkDelayMs);
      }
      sse(response, {
        candidates: [{ content: { role: "model", parts: [{ text: "" }] }, finishReason: "STOP", index: 0 }],
        usageMetadata,
      });
      return response.end();
    }
    return sendJson(response, 404, { error: { code: 404, message: "Not found.", status: "NOT_FOUND" } });
  }

  const handlers = { openai, anthropic, google };

  const server: Server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://mock");
    requests.push(`${request.method} ${url.pathname}`);
    const [, provider, ...rest] = url.pathname.split("/");
    const handler = handlers[provider as ProviderId];
    if (!handler) return sendJson(response, 404, { error: "unknown provider" });
    handler(request, response, `/${rest.join("/")}`).catch(() => {
      if (!response.headersSent) sendJson(response, 500, { error: "mock upstream crashed" });
      else response.destroy();
    });
  });

  await new Promise<void>((resolve) => server.listen(options.port ?? 0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${port}`;

  return {
    url,
    baseUrls: {
      openai: `${url}/openai/v1`,
      anthropic: `${url}/anthropic`,
      google: `${url}/google`,
    },
    calls,
    lastBody,
    requests,
    get chunkDelayMs() {
      return state.chunkDelayMs;
    },
    set chunkDelayMs(value: number) {
      state.chunkDelayMs = value;
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
