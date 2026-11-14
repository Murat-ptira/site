import "server-only";

import { ApiError, FinishReason, GoogleGenAI, ThinkingLevel } from "@google/genai";

import type { ReasoningEffort } from "@/config/catalog";
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

const PROVIDER = "google" as const;

function client(): GoogleGenAI {
  const apiKey = env().GEMINI_API_KEY;
  if (!apiKey) throw new ProviderError("provider_auth", PROVIDER);
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      baseUrl: env().GEMINI_BASE_URL,
      timeout: 60_000,
      retryOptions: { attempts: 2 },
    },
  });
}

function toProviderError(error: unknown): ProviderError {
  if (error instanceof ProviderError) return error;
  if (isAbortError(error)) {
    return new ProviderError("provider_timeout", PROVIDER, { cause: error });
  }
  if (error instanceof ApiError) {
    return new ProviderError(codeForFailure(error.status, error.message), PROVIDER, {
      status: error.status,
      cause: error,
    });
  }
  if (isNetworkError(error)) {
    return new ProviderError("provider_network", PROVIDER, { cause: error });
  }
  return new ProviderError("internal", PROVIDER, { cause: error });
}

const THINKING_LEVEL: Record<ReasoningEffort, ThinkingLevel> = {
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
};

const BLOCKED_REASONS = new Set<FinishReason>([
  FinishReason.SAFETY,
  FinishReason.RECITATION,
  FinishReason.BLOCKLIST,
  FinishReason.PROHIBITED_CONTENT,
  FinishReason.SPII,
]);

/** Google Gemini through the Gemini Developer API. */
export const googleAdapter: ProviderAdapter = {
  id: PROVIDER,

  isConfigured() {
    return Boolean(env().GEMINI_API_KEY);
  },

  async listModelIds(signal) {
    try {
      const ids: string[] = [];
      const pager = await client().models.list({
        config: { pageSize: 200, abortSignal: signal },
      });
      for await (const model of pager) {
        // Names arrive as "models/gemini-...".
        if (model.name) ids.push(model.name.replace(/^models\//, ""));
      }
      return ids;
    } catch (error) {
      throw toProviderError(error);
    }
  },

  async *streamChat(params: StreamChatParams): AsyncIterable<ProviderStreamEvent> {
    try {
      const stream = await client().models.generateContentStream({
        model: params.model,
        contents: params.messages.map((message) => ({
          role: message.role === "assistant" ? "model" : "user",
          parts: [{ text: message.content }],
        })),
        config: {
          systemInstruction: params.system,
          maxOutputTokens: params.maxOutputTokens,
          abortSignal: params.signal,
          ...(params.reasoningEffort
            ? { thinkingConfig: { thinkingLevel: THINKING_LEVEL[params.reasoningEffort] } }
            : {}),
        },
      });

      let inputTokens = 0;
      let outputTokens = 0;
      let sawUsage = false;
      let blocked = false;

      for await (const chunk of stream) {
        if (chunk.promptFeedback?.blockReason) blocked = true;
        const candidate = chunk.candidates?.[0];
        if (candidate?.finishReason && BLOCKED_REASONS.has(candidate.finishReason)) {
          blocked = true;
        }
        const text = (candidate?.content?.parts ?? [])
          .filter((part) => typeof part.text === "string" && !part.thought)
          .map((part) => part.text)
          .join("");
        if (text) yield { type: "text", text };

        const usage = chunk.usageMetadata;
        if (usage) {
          sawUsage = true;
          inputTokens = usage.promptTokenCount ?? inputTokens;
          // Thinking tokens are billed as output.
          outputTokens =
            (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0);
        }
      }

      if (blocked) throw new ProviderError("content_filtered", PROVIDER);
      if (sawUsage) yield { type: "usage", inputTokens, outputTokens };
    } catch (error) {
      throw toProviderError(error);
    }
  },
};
