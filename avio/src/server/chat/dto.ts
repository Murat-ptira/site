import "server-only";

import { PROVIDERS, isProviderId, modelLabel } from "@/config/catalog";
import { describeResponseError } from "@/lib/errors";
import type {
  ConversationDTO,
  ConversationMode,
  ResponseDTO,
  ResponseStatus,
  TurnDTO,
  UserDTO,
} from "@/lib/types";
import type { AuthUser } from "@/server/auth/session";

/** Columns needed to render a message, including what it cost. */
export const messageSelect = {
  id: true,
  role: true,
  content: true,
  status: true,
  parentId: true,
  lane: true,
  providerId: true,
  model: true,
  errorCode: true,
  createdAt: true,
  usageRecord: {
    select: {
      status: true,
      creditsCharged: true,
      inputTokens: true,
      outputTokens: true,
    },
  },
} as const;

export interface MessageRow {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  status: "PENDING" | "COMPLETE" | "ERROR";
  parentId: string | null;
  lane: number | null;
  providerId: string | null;
  model: string | null;
  errorCode: string | null;
  createdAt: Date;
  usageRecord: {
    status: "PENDING" | "SUCCEEDED" | "FAILED";
    creditsCharged: number;
    inputTokens: number;
    outputTokens: number;
  } | null;
}

/**
 * Rows written in one transaction share a timestamp, so order a prompt before
 * its replies and replies by lane.
 */
export function byThreadOrder(a: MessageRow, b: MessageRow): number {
  return (
    a.createdAt.getTime() - b.createdAt.getTime() ||
    (a.role === b.role ? 0 : a.role === "USER" ? -1 : 1) ||
    (a.lane ?? 0) - (b.lane ?? 0) ||
    a.id.localeCompare(b.id)
  );
}

export function toUserDTO(user: AuthUser): UserDTO {
  return { id: user.id, name: user.name, email: user.email, theme: user.theme };
}

export function toConversationDTO(row: {
  id: string;
  title: string;
  mode: "CHAT" | "COMPARE";
  updatedAt: Date;
}): ConversationDTO {
  return {
    id: row.id,
    title: row.title,
    mode: row.mode.toLowerCase() as ConversationMode,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toResponseDTO(row: MessageRow): ResponseDTO | null {
  if (!row.providerId || !isProviderId(row.providerId) || !row.model) return null;
  const status = row.status.toLowerCase() as ResponseStatus;
  const settled = row.usageRecord?.status === "SUCCEEDED";
  return {
    id: row.id,
    lane: row.lane ?? 0,
    provider: row.providerId,
    model: row.model,
    modelLabel: modelLabel(row.model),
    content: row.content,
    status,
    ...(status === "error"
      ? {
          error: {
            code: row.errorCode ?? "internal",
            message: describeResponseError(
              row.errorCode ?? "internal",
              PROVIDERS[row.providerId].name,
            ),
          },
        }
      : {}),
    ...(settled && row.usageRecord
      ? {
          credits: row.usageRecord.creditsCharged,
          inputTokens: row.usageRecord.inputTokens,
          outputTokens: row.usageRecord.outputTokens,
        }
      : {}),
  };
}

/** Groups a conversation's messages into prompts with their answers. */
export function toTurns(rows: MessageRow[]): TurnDTO[] {
  const ordered = [...rows].sort(byThreadOrder);
  const turns = new Map<string, TurnDTO>();
  for (const row of ordered) {
    if (row.role === "USER") {
      turns.set(row.id, {
        id: row.id,
        prompt: row.content,
        createdAt: row.createdAt.toISOString(),
        responses: [],
      });
    }
  }
  for (const row of ordered) {
    if (row.role !== "ASSISTANT" || !row.parentId) continue;
    const response = toResponseDTO(row);
    if (response) turns.get(row.parentId)?.responses.push(response);
  }
  return [...turns.values()];
}
