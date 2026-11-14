import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { POST as chatRoute } from "@/app/api/chat/route";
import { GET as modelsRoute } from "@/app/api/models/route";
import { UNITS_PER_CREDIT } from "@/lib/credits";
import type { ChatStreamEvent, ModelsDTO } from "@/lib/types";
import { prisma } from "@/server/db";

import {
  balanceOf,
  createUser,
  errorCode,
  request,
  resetDatabase,
  setEnv,
  type TestUser,
} from "./support/helpers";
import { INVALID_KEY, startMockUpstream, type MockUpstream } from "./support/mock-upstream";

/**
 * End-to-end through the real route handler and the real provider adapters.
 * Only the provider itself is replaced, by a local server that speaks each
 * provider's wire format.
 */

const OPENAI = "gpt-6-luna";
const ANTHROPIC = "claude-haiku-5-5";
const GOOGLE = "gemini-3.5-flash-lite";
const START_BALANCE = 1000 * UNITS_PER_CREDIT;

let upstream: MockUpstream;
let user: TestUser;

beforeAll(async () => {
  upstream = await startMockUpstream();
});

afterAll(async () => {
  await upstream.close();
});

beforeEach(async () => {
  await resetDatabase();
  upstream.chunkDelayMs = 0;
  upstream.calls.openai = upstream.calls.anthropic = upstream.calls.google = 0;
  setEnv({
    AI_RATE_LIMIT_PER_MINUTE: "100",
    OPENAI_API_KEY: "test-key",
    OPENAI_BASE_URL: upstream.baseUrls.openai,
    ANTHROPIC_API_KEY: "test-key",
    ANTHROPIC_BASE_URL: upstream.baseUrls.anthropic,
    GEMINI_API_KEY: "test-key",
    GEMINI_BASE_URL: upstream.baseUrls.google,
  });
  user = await createUser({ credits: START_BALANCE });
});

interface SendOptions {
  content: string;
  models: string[];
  conversationId?: string;
  requestId?: string;
}

async function send(from: TestUser, options: SendOptions) {
  const response = await chatRoute(
    request("POST", "/api/chat", {
      cookie: from.cookie,
      body: { requestId: randomUUID(), ...options },
    }),
    undefined,
  );
  const text = await response.text();
  const events = response.ok
    ? text.trim().split("\n").map((line) => JSON.parse(line) as ChatStreamEvent)
    : [];
  const of = <T extends ChatStreamEvent["type"]>(type: T) =>
    events.filter((event): event is Extract<ChatStreamEvent, { type: T }> => event.type === type);
  return { response, events, text, of };
}

const totalCalls = () => upstream.calls.openai + upstream.calls.anthropic + upstream.calls.google;

describe("model availability", () => {
  async function models(): Promise<ModelsDTO> {
    const response = await modelsRoute(request("GET", "/api/models", { cookie: user.cookie }), undefined);
    return (await response.json()) as ModelsDTO;
  }
  const statusOf = (dto: ModelsDTO, id: string) => dto.providers.find((provider) => provider.id === id)?.status;

  it("offers models from every provider that is configured and reachable", async () => {
    const dto = await models();
    expect(new Set(dto.models.map((model) => model.provider))).toEqual(new Set(["openai", "anthropic", "google"]));
    expect(dto.providers.every((provider) => provider.status === "ready")).toBe(true);
  });

  it("hides providers without a key or with a key the provider rejects", async () => {
    setEnv({ ANTHROPIC_API_KEY: "", GEMINI_API_KEY: INVALID_KEY });
    const dto = await models();

    expect(new Set(dto.models.map((model) => model.provider))).toEqual(new Set(["openai"]));
    expect(statusOf(dto, "openai")).toBe("ready");
    expect(statusOf(dto, "anthropic")).toBe("not_configured");
    expect(statusOf(dto, "google")).toBe("auth_failed");
    // Keys never appear in what the browser receives.
    expect(JSON.stringify(dto)).not.toContain("test-key");
  });

  it("offers nothing when no provider is configured", async () => {
    setEnv({ OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "", GEMINI_API_KEY: "" });
    const dto = await models();
    expect(dto.models).toEqual([]);

    const attempt = await send(user, { content: "Hello", models: [OPENAI] });
    expect(attempt.response.status).toBe(422);
    expect(totalCalls()).toBe(0);
  });

  it("respects a provider switched off in the database", async () => {
    await models();
    await prisma.aIProvider.update({ where: { id: "openai" }, data: { isEnabled: false } });
    const dto = await models();
    expect(statusOf(dto, "openai")).toBe("disabled");
    expect(dto.models.some((model) => model.provider === "openai")).toBe(false);
  });
});

describe("chat", () => {
  it("streams a reply, saves it and charges for it", async () => {
    const { response, of } = await send(user, { content: "Explain averages", models: [OPENAI] });
    expect(response.status).toBe(200);

    const [start] = of("start");
    const [done] = of("done");
    const streamed = of("delta").map((event) => event.text).join("");
    expect(start.conversation.title).toBe("Explain averages");
    expect(streamed).toContain("Simulated reply");
    expect(done.response).toMatchObject({ status: "complete", content: streamed, model: OPENAI });
    expect(done.response.credits).toBeGreaterThan(0);

    const reply = await prisma.message.findUniqueOrThrow({
      where: { id: done.response.id },
      include: { usageRecord: true },
    });
    expect(reply).toMatchObject({ role: "ASSISTANT", status: "COMPLETE", content: streamed, userId: user.id });
    expect(reply.usageRecord).toMatchObject({
      status: "SUCCEEDED",
      providerId: "openai",
      model: OPENAI,
      creditsCharged: done.response.credits,
    });
    expect(reply.usageRecord!.inputTokens).toBeGreaterThan(0);
    expect(reply.usageRecord!.outputTokens).toBeGreaterThan(0);
    expect(reply.usageRecord!.costMicroUsd).toBeGreaterThan(0);

    expect(await balanceOf(user.id)).toEqual({
      creditBalance: START_BALANCE - done.response.credits!,
      reservedCredits: 0,
    });
    expect(done.balance).toBe(START_BALANCE - done.response.credits!);
  });

  it.each([
    ["Anthropic", ANTHROPIC, "anthropic"],
    ["Google Gemini", GOOGLE, "google"],
  ] as const)("works through the %s adapter", async (_name, model, provider) => {
    const { of } = await send(user, { content: "Hello there", models: [model] });
    const [done] = of("done");
    expect(done.response).toMatchObject({ status: "complete", provider, model });
    expect(done.response.content).toContain(model);
    expect(done.response.inputTokens).toBeGreaterThan(0);
    expect(done.response.outputTokens).toBeGreaterThan(0);
    expect((await balanceOf(user.id)).creditBalance).toBe(START_BALANCE - done.response.credits!);
  });

  it("sends earlier turns as context on a follow-up", async () => {
    const first = await send(user, { content: "First question", models: [OPENAI] });
    const conversationId = first.of("start")[0].conversation.id;
    await send(user, { content: "Second question", models: [OPENAI], conversationId });

    const body = upstream.lastBody.openai as { input: { role: string; content: string }[] };
    expect(body.input.map((message) => message.role)).toEqual(["user", "assistant", "user"]);
    expect(body.input[0].content).toBe("First question");
    expect(body.input[2].content).toBe("Second question");
    expect(await prisma.conversation.count({ where: { userId: user.id } })).toBe(1);
  });

  it("rejects empty and oversized messages before calling a provider", async () => {
    const empty = await send(user, { content: "   ", models: [OPENAI] });
    expect(empty.response.status).toBe(400);

    const long = await send(user, { content: "x".repeat(16_001), models: [OPENAI] });
    expect(long.response.status).toBe(400);

    expect(totalCalls()).toBe(0);
    expect(await prisma.message.count()).toBe(0);
  });

  it("rejects a model that is not on offer", async () => {
    const response = await send(user, { content: "Hello", models: ["gpt-does-not-exist"] });
    expect(response.response.status).toBe(422);
    expect(JSON.parse(response.text).error.code).toBe("model_unavailable");
  });

  it("refuses a request the balance cannot cover and records nothing", async () => {
    const poor = await createUser({ credits: 1 });
    const { response, text } = await send(poor, { content: "Hello", models: [OPENAI] });

    expect(response.status).toBe(402);
    expect(JSON.parse(text).error.code).toBe("insufficient_credits");
    expect(totalCalls()).toBe(0);
    expect(await prisma.conversation.count({ where: { userId: poor.id } })).toBe(0);
    expect(await prisma.usageRecord.count({ where: { userId: poor.id } })).toBe(0);
    expect(await balanceOf(poor.id)).toEqual({ creditBalance: 1, reservedCredits: 0 });
  });

  it("processes a repeated send of the same request only once", async () => {
    const requestId = randomUUID();
    const first = await send(user, { content: "Hello", models: [OPENAI], requestId });
    const repeat = await send(user, { content: "Hello", models: [OPENAI], requestId });

    expect(first.response.status).toBe(200);
    expect(repeat.response.status).toBe(409);
    expect(upstream.calls.openai).toBe(1);
    expect(await prisma.creditTransaction.count({ where: { userId: user.id, type: "USAGE" } })).toBe(1);
  });

  it("cannot post into another user's conversation", async () => {
    const first = await send(user, { content: "Mine", models: [OPENAI] });
    const conversationId = first.of("start")[0].conversation.id;
    const callsBefore = upstream.calls.openai;

    const intruder = await createUser({ credits: START_BALANCE });
    const attempt = await send(intruder, { content: "Let me in", models: [OPENAI], conversationId });

    expect(attempt.response.status).toBe(404);
    expect(upstream.calls.openai).toBe(callsBefore);
    expect(await prisma.message.count({ where: { conversationId } })).toBe(2);
    expect(await balanceOf(intruder.id)).toEqual({ creditBalance: START_BALANCE, reservedCredits: 0 });
  });
});

describe("provider failures", () => {
  async function expectNotCharged() {
    expect(await balanceOf(user.id)).toEqual({ creditBalance: START_BALANCE, reservedCredits: 0 });
    expect(await prisma.creditTransaction.count({ where: { userId: user.id, type: "USAGE" } })).toBe(0);
  }

  it("reports an outage and does not charge", async () => {
    const { response, of } = await send(user, { content: "Hello [[fail:openai]]", models: [OPENAI] });
    expect(response.status).toBe(200);
    expect(of("done")).toHaveLength(0);

    const [failure] = of("error");
    expect(failure.response).toMatchObject({ status: "error", error: { code: "provider_unavailable" } });
    expect(failure.response.error!.message).toContain("OpenAI");

    const reply = await prisma.message.findUniqueOrThrow({
      where: { id: failure.response.id },
      include: { usageRecord: true },
    });
    expect(reply).toMatchObject({ status: "ERROR", errorCode: "provider_unavailable" });
    expect(reply.usageRecord).toMatchObject({ status: "FAILED", creditsCharged: 0 });
    await expectNotCharged();
  });

  it("reports provider rate limiting", async () => {
    const { of } = await send(user, { content: "Hello [[ratelimit:anthropic]]", models: [ANTHROPIC] });
    expect(of("error")[0].response.error?.code).toBe("provider_rate_limited");
    await expectNotCharged();
  });

  it("reports a rejected API key", async () => {
    // The key passes the availability check, then is revoked.
    await send(user, { content: "warm up", models: [GOOGLE] });
    const charged = (await balanceOf(user.id)).creditBalance;
    process.env.GEMINI_API_KEY = INVALID_KEY;
    const { resetEnvCache } = await import("@/server/env");
    resetEnvCache();

    const { of } = await send(user, { content: "Hello", models: [GOOGLE] });
    expect(of("error")[0].response.error?.code).toBe("provider_auth");
    expect((await balanceOf(user.id)).creditBalance).toBe(charged);
  });

  it.each([
    ["openai", OPENAI],
    ["anthropic", ANTHROPIC],
    ["google", GOOGLE],
  ] as const)("keeps the partial text of a broken %s stream without charging", async (provider, model) => {
    const { of } = await send(user, { content: `Hello [[cut:${provider}]]`, models: [model] });
    const [failure] = of("error");

    expect(failure.response.status).toBe("error");
    expect(failure.response.content.length).toBeGreaterThan(0);
    const saved = await prisma.message.findUniqueOrThrow({ where: { id: failure.response.id } });
    expect(saved).toMatchObject({ status: "ERROR", content: failure.response.content });
    await expectNotCharged();
  });

  it("treats an empty completion as an error rather than a blank answer", async () => {
    const { of } = await send(user, { content: "Hello [[empty:google]]", models: [GOOGLE] });
    expect(of("error")[0].response.error?.code).toBe("empty_response");
    await expectNotCharged();
  });
});

describe("compare mode", () => {
  it("answers with both models and charges each separately", async () => {
    const { of } = await send(user, { content: "Compare this", models: [OPENAI, ANTHROPIC] });
    const [start] = of("start");
    const done = of("done").sort((a, b) => a.lane - b.lane);

    expect(start.conversation.mode).toBe("compare");
    expect(start.turn.responses.map((response) => response.model)).toEqual([OPENAI, ANTHROPIC]);
    expect(done.map((event) => event.response.model)).toEqual([OPENAI, ANTHROPIC]);

    const charged = done.reduce((sum, event) => sum + event.response.credits!, 0);
    expect(await balanceOf(user.id)).toEqual({ creditBalance: START_BALANCE - charged, reservedCredits: 0 });
    expect(await prisma.creditTransaction.count({ where: { userId: user.id, type: "USAGE" } })).toBe(2);
  });

  it("keeps one side working when the other provider fails", async () => {
    const { response, of } = await send(user, {
      content: "Compare this [[fail:anthropic]]",
      models: [OPENAI, ANTHROPIC],
    });
    expect(response.status).toBe(200);

    const [done] = of("done");
    const [failure] = of("error");
    expect(done).toMatchObject({ lane: 0, response: { status: "complete", model: OPENAI } });
    expect(failure).toMatchObject({
      lane: 1,
      response: { status: "error", model: ANTHROPIC, error: { code: "provider_unavailable" } },
    });

    // Only the side that answered is paid for.
    expect(await balanceOf(user.id)).toEqual({
      creditBalance: START_BALANCE - done.response.credits!,
      reservedCredits: 0,
    });
    const records = await prisma.usageRecord.findMany({ orderBy: { providerId: "asc" } });
    expect(records).toMatchObject([
      { providerId: "anthropic", status: "FAILED", creditsCharged: 0 },
      { providerId: "openai", status: "SUCCEEDED" },
    ]);
  });

  it("gives each model only its own earlier answers as context", async () => {
    const first = await send(user, { content: "Round one", models: [OPENAI, ANTHROPIC] });
    const conversationId = first.of("start")[0].conversation.id;
    await send(user, { content: "Round two", models: [OPENAI, ANTHROPIC], conversationId });

    const openaiBody = JSON.stringify(upstream.lastBody.openai);
    const anthropicBody = JSON.stringify(upstream.lastBody.anthropic);
    expect(openaiBody).toContain("Simulated reply from `" + OPENAI + "`");
    expect(openaiBody).not.toContain(ANTHROPIC);
    expect(anthropicBody).toContain("Simulated reply from `" + ANTHROPIC + "`");
    expect(anthropicBody).not.toContain(OPENAI);
  });

  it("needs two different models, and matches the conversation's mode", async () => {
    const same = await send(user, { content: "Hello", models: [OPENAI, OPENAI] });
    expect(same.response.status).toBe(400);

    const chat = await send(user, { content: "Hello", models: [OPENAI] });
    const conversationId = chat.of("start")[0].conversation.id;
    const mixed = await send(user, { content: "Hello", models: [OPENAI, ANTHROPIC], conversationId });
    expect(mixed.response.status).toBe(409);
    expect(JSON.parse(mixed.text).error.code).toBe("mode_mismatch");
  });
});

describe("limits", () => {
  it("rate limits AI requests per user, counting a comparison twice", async () => {
    setEnv({ AI_RATE_LIMIT_PER_MINUTE: "3" });

    expect((await send(user, { content: "one", models: [OPENAI, ANTHROPIC] })).response.status).toBe(200);
    expect((await send(user, { content: "two", models: [OPENAI] })).response.status).toBe(200);
    const callsBefore = totalCalls();

    const limited = await send(user, { content: "three", models: [OPENAI] });
    expect(limited.response.status).toBe(429);
    expect(limited.response.headers.get("retry-after")).toBeTruthy();
    expect(totalCalls()).toBe(callsBefore);

    // The limit is per user.
    const other = await createUser({ credits: START_BALANCE });
    expect((await send(other, { content: "hello", models: [OPENAI] })).response.status).toBe(200);
  });
});

describe("client disconnects", () => {
  it("still finishes, saves and bills the reply", async () => {
    upstream.chunkDelayMs = 5;
    const response = await chatRoute(
      request("POST", "/api/chat", {
        cookie: user.cookie,
        body: { requestId: randomUUID(), content: "Do not wait for me", models: [OPENAI] },
      }),
      undefined,
    );
    // Read the first event, then walk away mid-stream.
    const reader = response.body!.getReader();
    await reader.read();
    await reader.cancel();

    const settled = async () => {
      const record = await prisma.usageRecord.findFirstOrThrow({ where: { userId: user.id } });
      return record.status === "PENDING" ? null : record;
    };
    let record = await settled();
    for (let attempt = 0; !record && attempt < 100; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      record = await settled();
    }

    expect(record).toMatchObject({ status: "SUCCEEDED" });
    expect(record!.creditsCharged).toBeGreaterThan(0);
    const reply = await prisma.message.findUniqueOrThrow({ where: { id: record!.messageId! } });
    expect(reply.status).toBe("COMPLETE");
    expect(reply.content).toContain("Stream | complete");
    expect(await balanceOf(user.id)).toEqual({
      creditBalance: START_BALANCE - record!.creditsCharged,
      reservedCredits: 0,
    });
  });
});

describe("request guards", () => {
  it("rejects chat requests from another origin", async () => {
    const response = await chatRoute(
      request("POST", "/api/chat", {
        cookie: user.cookie,
        origin: "https://evil.example",
        body: { requestId: randomUUID(), content: "Hello", models: [OPENAI] },
      }),
      undefined,
    );
    expect(response.status).toBe(403);
    expect(await errorCode(response)).toBe("bad_origin");
    expect(totalCalls()).toBe(0);
  });
});
