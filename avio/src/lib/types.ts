import type { ModelTier, ProviderId } from "@/config/catalog";

/**
 * Shapes shared by the API and the browser. Everything here is plain JSON;
 * credit amounts are integer units (see src/lib/credits.ts).
 */

export type ThemePreference = "dark" | "light" | "system";
export type ConversationMode = "chat" | "compare";
export type ResponseStatus = "pending" | "complete" | "error";

export interface UserDTO {
  id: string;
  name: string;
  email: string;
  theme: ThemePreference;
}

export interface CreditSummary {
  /** Current balance. */
  balance: number;
  /** Total ever granted to the account. Baseline for the usage meter. */
  granted: number;
}

export interface ConversationDTO {
  id: string;
  title: string;
  mode: ConversationMode;
  updatedAt: string;
}

export interface ResponseErrorDTO {
  code: string;
  message: string;
}

/** One model's answer to a prompt. */
export interface ResponseDTO {
  id: string;
  /** 0 for a normal chat; 0 and 1 for the two sides of a comparison. */
  lane: number;
  provider: ProviderId;
  model: string;
  modelLabel: string;
  content: string;
  status: ResponseStatus;
  error?: ResponseErrorDTO;
  /** Credits charged, once the response has settled. */
  credits?: number;
  inputTokens?: number;
  outputTokens?: number;
}

/** A user prompt together with the answer(s) to it. */
export interface TurnDTO {
  id: string;
  prompt: string;
  createdAt: string;
  responses: ResponseDTO[];
}

export interface ConversationDetailDTO extends ConversationDTO {
  turns: TurnDTO[];
}

export interface ModelDTO {
  id: string;
  provider: ProviderId;
  providerName: string;
  label: string;
  tier: ModelTier;
  description: string;
  /** Price hints, in credit units per 1,000 tokens. */
  inputUnitsPer1k: number;
  outputUnitsPer1k: number;
}

export type ProviderStatus =
  | "ready"
  | "not_configured"
  | "disabled"
  | "auth_failed"
  | "unreachable";

export interface ProviderStateDTO {
  id: ProviderId;
  name: string;
  status: ProviderStatus;
  /** Name of the environment variable that holds this provider's key. */
  apiKeyEnv: string;
  modelCount: number;
}

export interface ModelsDTO {
  models: ModelDTO[];
  providers: ProviderStateDTO[];
}

/** Events of the newline-delimited JSON stream returned by POST /api/chat. */
export type ChatStreamEvent =
  | { type: "start"; conversation: ConversationDTO; turn: TurnDTO }
  | { type: "delta"; lane: number; text: string }
  | { type: "done"; lane: number; response: ResponseDTO; balance: number }
  | { type: "error"; lane: number; response: ResponseDTO };

export interface ChatRequestBody {
  /** Omit to start a new conversation. */
  conversationId?: string;
  /** Client-generated idempotency key for this send. */
  requestId: string;
  content: string;
  /** One model id for a chat, two for a comparison. */
  models: string[];
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string>;
  };
}

export interface UsageByModelDTO {
  provider: ProviderId;
  model: string;
  modelLabel: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  credits: number;
}

export interface CreditTransactionDTO {
  id: string;
  type: "signup_grant" | "usage" | "adjustment" | "purchase" | "refund";
  amount: number;
  balanceAfter: number;
  description: string | null;
  createdAt: string;
}

export interface UsageOverviewDTO {
  credits: CreditSummary;
  totals: {
    requests: number;
    inputTokens: number;
    outputTokens: number;
    credits: number;
  };
  byModel: UsageByModelDTO[];
  transactions: CreditTransactionDTO[];
}
