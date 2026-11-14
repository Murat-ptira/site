import "server-only";

import { after } from "next/server";
import { z } from "zod";

import { PROVIDERS, type CatalogModel } from "@/config/catalog";
import { LIMITS } from "@/config/limits";
import { formatCredits } from "@/lib/credits";
import { describeResponseError } from "@/lib/errors";
import type {
  ChatStreamEvent,
  ConversationDTO,
  ResponseDTO,
  TurnDTO,
} from "@/lib/types";
import { requireAvailableModel } from "@/server/ai/availability";
import { ProviderError } from "@/server/ai/errors";
import { getAdapter } from "@/server/ai/registry";
import type { ChatMessage } from "@/server/ai/types";
import type { AuthUser } from "@/server/auth/session";
import {
  releaseStaleReservations,
  reserveCredits,
  settleUsageFailure,
  settleUsageSuccess,
} from "@/server/billing/credits";
import {
  estimateInputTokens,
  estimateTokens,
  worstCaseCost,
  type TokenUsage,
} from "@/server/billing/pricing";
import { isUniqueViolation, prisma } from "@/server/db";
import { HttpError, notFound } from "@/server/http/errors";

import { buildContext, systemPrompt } from "./context";
import { byThreadOrder, messageSelect, toConversationDTO } from "./dto";

/**
 * A "turn" is one user prompt answered by one model (chat) or two (compare).
 * Each answer runs in its own lane with its own reservation, usage record and
 * error handling, so one provider failing never affects the other.
 */

export const chatRequestSchema = z
  .object({
    conversationId: z.string().min(1).max(64).optional(),
    requestId: z.uuid("Invalid request id."),
    content: z
      .string()
      .trim()
      .min(1, "Type a message first.")
      .max(
        LIMITS.maxMessageChars,
        `Messages can be up to ${LIMITS.maxMessageChars.toLocaleString("en-US")} characters.`,
      ),
    models: z
      .array(z.string().min(1).max(100))
      .min(1, "Choose a model.")
      .max(2, "Compare supports two models."),
  })
  .refine((value) => new Set(value.models).size === value.models.length, {
    message: "Choose two different models to compare.",
    path: ["models"],
  });

export type ChatRequest = z.infer<typeof chatRequestSchema>;

interface Lane {
  index: number;
  model: CatalogModel;
  messageId: string;
  usageRecordId: string;
  system: string;
  context: ChatMessage[];
}

export interface PreparedTurn {
  conversation: ConversationDTO;
  turn: TurnDTO;
  lanes: Lane[];
}

function titleFrom(content: string): string {
  const flat = content.replace(/\s+/g, " ").trim();
  return flat.length > LIMITS.maxTitleChars
    ? `${flat.slice(0, LIMITS.maxTitleChars - 1).trimEnd()}…`
    : flat;
}

function pendingResponse(lane: Lane): ResponseDTO {
  return {
    id: lane.messageId,
    lane: lane.index,
    provider: lane.model.provider,
    model: lane.model.id,
    modelLabel: lane.model.label,
    content: "",
    status: "pending",
  };
}

/**
 * Validates the request against the user's data and balance, then records
 * everything the turn needs in one transaction: the prompt, a placeholder for
 * each reply, and a credit hold for each model. Nothing is sent to a provider
 * unless this commits.
 */
export async function startTurn(
  user: AuthUser,
  input: ChatRequest,
): Promise<PreparedTurn> {
  const models = await Promise.all(input.models.map(requireAvailableModel));
  const mode = models.length === 2 ? "COMPARE" : "CHAT";

  try {
    return await prisma.$transaction(async (tx) => {
      await releaseStaleReservations(tx, user.id);

      let conversation;
      if (input.conversationId) {
        conversation = await tx.conversation.findFirst({
          where: { id: input.conversationId, userId: user.id },
        });
        if (!conversation) throw notFound("Conversation");
        if (conversation.mode !== mode) {
          throw new HttpError(
            409,
            "mode_mismatch",
            conversation.mode === "COMPARE"
              ? "This comparison needs two models."
              : "This chat takes one model. Start a comparison to use two.",
          );
        }
      } else {
        conversation = await tx.conversation.create({
          data: { userId: user.id, title: titleFrom(input.content), mode },
        });
      }

      const recent = input.conversationId
        ? await tx.message.findMany({
            where: { conversationId: conversation.id, userId: user.id },
            orderBy: { createdAt: "desc" },
            // A compare turn stores three rows: the prompt and two replies.
            take: LIMITS.maxContextMessages * 3,
            select: messageSelect,
          })
        : [];
      const history = recent.sort(byThreadOrder);

      const prompt = await tx.message.create({
        data: {
          conversationId: conversation.id,
          userId: user.id,
          role: "USER",
          content: input.content,
          requestId: input.requestId,
        },
      });

      const planned = models.map((model, index) => {
        const system = systemPrompt(model.label);
        const context = buildContext(history, index, input.content);
        const inputTokens = estimateInputTokens([
          system,
          ...context.map((message) => message.content),
        ]);
        return { index, model, system, context, hold: worstCaseCost(model, inputTokens).units };
      });

      // One atomic hold for the whole turn: either every lane is covered or
      // the request is refused before anything is sent.
      const totalHold = planned.reduce((sum, lane) => sum + lane.hold, 0);
      if (!(await reserveCredits(tx, user.id, totalHold))) {
        throw new HttpError(
          402,
          "insufficient_credits",
          `Not enough credits. This request needs up to ${formatCredits(totalHold)} credits available.`,
        );
      }

      const lanes: Lane[] = [];
      for (const lane of planned) {
        const reply = await tx.message.create({
          data: {
            conversationId: conversation.id,
            userId: user.id,
            role: "ASSISTANT",
            content: "",
            status: "PENDING",
            parentId: prompt.id,
            lane: lane.index,
            providerId: lane.model.provider,
            model: lane.model.id,
          },
        });
        const usage = await tx.usageRecord.create({
          data: {
            userId: user.id,
            conversationId: conversation.id,
            messageId: reply.id,
            providerId: lane.model.provider,
            model: lane.model.id,
            creditsReserved: lane.hold,
          },
        });
        lanes.push({
          index: lane.index,
          model: lane.model,
          messageId: reply.id,
          usageRecordId: usage.id,
          system: lane.system,
          context: lane.context,
        });
      }

      const touched = await tx.conversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() },
      });

      return {
        conversation: toConversationDTO(touched),
        turn: {
          id: prompt.id,
          prompt: prompt.content,
          createdAt: prompt.createdAt.toISOString(),
          responses: lanes.map(pendingResponse),
        },
        lanes,
      };
    });
  } catch (error) {
    // The only unique key a client can collide with here is its own requestId.
    if (isUniqueViolation(error)) {
      throw new HttpError(
        409,
        "duplicate_request",
        "This message was already sent.",
      );
    }
    throw error;
  }
}

type Send = (event: ChatStreamEvent) => void;

/** Runs one model's reply from first token to settled credits. Never throws. */
async function runLane(lane: Lane, send: Send): Promise<void> {
  const startedAt = Date.now();
  const provider = lane.model.provider;
  const base = pendingResponse(lane);
  let text = "";
  let usage: TokenUsage | undefined;

  try {
    const events = getAdapter(provider).streamChat({
      model: lane.model.id,
      system: lane.system,
      messages: lane.context,
      maxOutputTokens: lane.model.maxOutputTokens,
      reasoningEffort: lane.model.reasoningEffort,
      signal: AbortSignal.timeout(LIMITS.generationTimeoutMs),
    });
    for await (const event of events) {
      if (event.type === "text") {
        text += event.text;
        send({ type: "delta", lane: lane.index, text: event.text });
      } else {
        usage = { inputTokens: event.inputTokens, outputTokens: event.outputTokens };
      }
    }
    if (!text.trim()) throw new ProviderError("empty_response", provider);

    // Providers report usage on every completed reply. Should one ever omit
    // it, bill on an estimate instead of giving the request away.
    usage ??= {
      inputTokens: estimateInputTokens([
        lane.system,
        ...lane.context.map((message) => message.content),
      ]),
      outputTokens: estimateTokens(text),
    };

    const settlement = await settleUsageSuccess({
      usageRecordId: lane.usageRecordId,
      usage,
      pricing: lane.model.pricing,
      content: text,
      latencyMs: Date.now() - startedAt,
    });
    if (!settlement) throw new ProviderError("interrupted", provider);

    send({
      type: "done",
      lane: lane.index,
      balance: settlement.balance,
      response: {
        ...base,
        content: text,
        status: "complete",
        credits: settlement.charged,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
      },
    });
  } catch (error) {
    const code = error instanceof ProviderError ? error.code : "internal";
    if (!(error instanceof ProviderError)) {
      const name = error instanceof Error ? error.name : "UnknownError";
      console.error(`[chat] reply failed unexpectedly: ${name}`);
    }
    try {
      await settleUsageFailure({
        usageRecordId: lane.usageRecordId,
        errorCode: code,
        partialContent: text,
        latencyMs: Date.now() - startedAt,
      });
    } catch {
      // The hold stays until releaseStaleReservations sweeps it.
      console.error("[chat] could not release a credit reservation");
    }
    send({
      type: "error",
      lane: lane.index,
      response: {
        ...base,
        content: text,
        status: "error",
        error: {
          code,
          message: describeResponseError(code, PROVIDERS[provider].name),
        },
      },
    });
  }
}

/**
 * Streams a prepared turn as newline-delimited JSON.
 *
 * Generation is deliberately not tied to the connection: if the browser goes
 * away, each lane still runs to completion, saves its reply and settles its
 * credits. Otherwise a client could read an answer and disconnect just before
 * the end to avoid being charged.
 */
export function streamTurn(prepared: PreparedTurn): {
  body: ReadableStream<Uint8Array>;
  finished: Promise<void>;
} {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let open = true;

  const body = new ReadableStream<Uint8Array>({
    start(streamController) {
      controller = streamController;
    },
    cancel() {
      open = false;
    },
  });

  const send: Send = (event) => {
    if (!open) return;
    try {
      controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
    } catch {
      open = false;
    }
  };

  const finished = (async () => {
    send({ type: "start", conversation: prepared.conversation, turn: prepared.turn });
    await Promise.all(prepared.lanes.map((lane) => runLane(lane, send)));
    if (open) {
      open = false;
      try {
        controller.close();
      } catch {
        // Already closed by the runtime.
      }
    }
  })();

  return { body, finished };
}

/**
 * Asks the platform to keep the invocation alive until `work` settles, even
 * after the response has ended.
 */
export function keepAlive(work: Promise<unknown>): void {
  try {
    after(() => work);
  } catch {
    // Not inside a Next.js request (unit tests): nothing to extend.
  }
}
