import "server-only";

import OpenAI, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
} from "openai";

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

const PROVIDER = "openai" as const;

function client(): OpenAI {
  const apiKey = env().OPENAI_API_KEY;
  if (!apiKey) throw new ProviderError("provider_auth", PROVIDER);
  return new OpenAI({
    apiKey,
    baseURL: env().OPENAI_BASE_URL,
    maxRetries: 1,
    timeout: 60_000,
  });
}

function toProviderError(error: unknown): ProviderError {
  if (error instanceof ProviderError) return error;
  // Our abort signal only fires on the generation deadline.
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
    const detail = `${error.code ?? ""} ${error.type ?? ""} ${error.message}`;
    return new ProviderError(codeForFailure(error.status, detail), PROVIDER, {
      status: error.status,
      cause: error,
    });
  }
  return new ProviderError("internal", PROVIDER, { cause: error });
}

/** Maps the error object carried by a failed streamed response. */
function failureFromStream(code: string | null | undefined, message: string) {
  const detail = `${code ?? ""} ${message}`;
  if (/rate_limit/.test(detail)) return new ProviderError("provider_rate_limited", PROVIDER);
  if (/server_error|overloaded/.test(detail)) {
    return new ProviderError("provider_unavailable", PROVIDER);
  }
  const refined = codeForFailure(undefined, detail);
  return new ProviderError(
    refined === "internal" ? "provider_unavailable" : refined,
    PROVIDER,
  );
}

/** OpenAI through the Responses API. */
export const openaiAdapter: ProviderAdapter = {
  id: PROVIDER,

  isConfigured() {
    return Boolean(env().OPENAI_API_KEY);
  },

  async listModelIds(signal) {
    try {
      const ids: string[] = [];
      for await (const model of client().models.list({ signal })) {
        ids.push(model.id);
      }
      return ids;
    } catch (error) {
      throw toProviderError(error);
    }
  },

  async *streamChat(params: StreamChatParams): AsyncIterable<ProviderStreamEvent> {
    try {
      const stream = await client().responses.create(
        {
          model: params.model,
          instructions: params.system,
          input: params.messages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
          max_output_tokens: params.maxOutputTokens,
          ...(params.reasoningEffort
            ? { reasoning: { effort: params.reasoningEffort } }
            : {}),
          // Conversations live in our database; do not keep a copy at OpenAI.
          store: false,
          stream: true,
        },
        { signal: params.signal },
      );

      for await (const event of stream) {
        switch (event.type) {
          case "response.output_text.delta":
            yield { type: "text", text: event.delta };
            break;
          case "response.completed":
          case "response.incomplete": {
            const usage = event.response.usage;
            if (usage) {
              yield {
                type: "usage",
                inputTokens: usage.input_tokens,
                outputTokens: usage.output_tokens,
              };
            }
            if (
              event.type === "response.incomplete" &&
              event.response.incomplete_details?.reason === "content_filter"
            ) {
              throw new ProviderError("content_filtered", PROVIDER);
            }
            break;
          }
          case "response.failed":
            throw failureFromStream(
              event.response.error?.code,
              event.response.error?.message ?? "",
            );
          case "error":
            throw failureFromStream(event.code, event.message);
          default:
            break;
        }
      }
    } catch (error) {
      throw toProviderError(error);
    }
  },
};
