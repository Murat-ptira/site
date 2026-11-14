import "server-only";

import Anthropic, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
} from "@anthropic-ai/sdk";

import { env } from "@/server/env";

import {
  ProviderError,
  codeForFailure,
  isAbortError,
  isNetworkError,
} from "../errors";
import type {
  ProviderAdapter,
  ProviderStreamEvent,
  StreamChatParams,
} from "../types";

const PROVIDER = "anthropic" as const;

function client(): Anthropic {
  const apiKey = env().ANTHROPIC_API_KEY;
  if (!apiKey) throw new ProviderError("provider_auth", PROVIDER);
  return new Anthropic({
    apiKey,
    baseURL: env().ANTHROPIC_BASE_URL,
    maxRetries: 1,
    timeout: 60_000,
  });
}

function toProviderError(error: unknown): ProviderError {
  if (error instanceof ProviderError) return error;
  if (error instanceof APIUserAbortError || isAbortError(error)) {
    return new ProviderError("provider_timeout", PROVIDER, { cause: error });
  }
  if (error instanceof APIConnectionTimeoutError) {
    return new ProviderError("provider_timeout", PROVIDER, { cause: error });
  }
  if (error instanceof APIConnectionError || isNetworkError(error)) {
    return new ProviderError("provider_network", PROVIDER, { cause: error });
  }
  if (error instanceof APIError) {
    // Errors raised mid-stream carry no HTTP status, only a typed body.
    const detail = error.message;
    const code =
      error.status === undefined && /overloaded|api_error/.test(detail)
        ? "provider_unavailable"
        : error.status === undefined && /rate_limit/.test(detail)
          ? "provider_rate_limited"
          : codeForFailure(error.status, detail);
    return new ProviderError(code, PROVIDER, { status: error.status, cause: error });
  }
  return new ProviderError("internal", PROVIDER, { cause: error });
}

/** Anthropic through the Messages API. */
export const anthropicAdapter: ProviderAdapter = {
  id: PROVIDER,

  isConfigured() {
    return Boolean(env().ANTHROPIC_API_KEY);
  },

  async listModelIds(signal) {
    try {
      const ids: string[] = [];
      for await (const model of client().models.list({ limit: 1000 }, { signal })) {
        ids.push(model.id);
      }
      return ids;
    } catch (error) {
      throw toProviderError(error);
    }
  },

  async *streamChat(params: StreamChatParams): AsyncIterable<ProviderStreamEvent> {
    try {
      const stream = await client().messages.create(
        {
          model: params.model,
          max_tokens: params.maxOutputTokens,
          system: params.system,
          messages: params.messages,
          stream: true,
        },
        { signal: params.signal },
      );

      let inputTokens = 0;
      let outputTokens = 0;
      let stopReason: string | null = null;

      for await (const event of stream) {
        if (event.type === "message_start") {
          inputTokens = event.message.usage.input_tokens;
          outputTokens = event.message.usage.output_tokens;
        } else if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          yield { type: "text", text: event.delta.text };
        } else if (event.type === "message_delta") {
          // Cumulative counts; the final message_delta has the billed totals.
          outputTokens = event.usage.output_tokens;
          if (event.usage.input_tokens != null) inputTokens = event.usage.input_tokens;
          stopReason = event.delta.stop_reason;
        }
      }

      if (stopReason === "refusal") {
        throw new ProviderError("content_filtered", PROVIDER);
      }
      if (stopReason === "model_context_window_exceeded") {
        throw new ProviderError("context_too_long", PROVIDER);
      }
      yield { type: "usage", inputTokens, outputTokens };
    } catch (error) {
      throw toProviderError(error);
    }
  },
};
