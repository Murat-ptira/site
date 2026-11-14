/** Hard limits applied on the server. The client mirrors a few of them for UX. */
export const LIMITS = {
  /** Longest single message a user can send. */
  maxMessageChars: 16_000,
  /** Largest accepted /api/chat body. Sized for a full message of 4-byte characters. */
  chatBodyBytes: 80 * 1024,
  /** Largest accepted body for every other JSON endpoint. */
  smallBodyBytes: 8 * 1024,
  /** Conversation history sent to a provider is trimmed to this many characters. */
  maxContextChars: 48_000,
  /** ...and to this many most recent messages. */
  maxContextMessages: 40,
  maxTitleChars: 80,
  /** A single generation is abandoned after this long. */
  generationTimeoutMs: 5 * 60 * 1000,
  /**
   * A reservation older than this belongs to a request that died without
   * settling (for example a crashed process). Must exceed generationTimeoutMs.
   */
  reservationTtlMs: 10 * 60 * 1000,
} as const;

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 200;
