import { beforeEach, describe, expect, it } from "vitest";

import { GET as getConversation, PATCH as renameConversation, DELETE as deleteConversation } from "@/app/api/conversations/[id]/route";
import { GET as listConversations } from "@/app/api/conversations/route";
import type { ConversationDTO, ConversationDetailDTO } from "@/lib/types";
import { grantCredits } from "@/server/billing/credits";
import { getUsageOverview } from "@/server/billing/usage";
import { prisma } from "@/server/db";

import { createUser, request, resetDatabase, withId, type TestUser } from "./support/helpers";

let alice: TestUser;
let mallory: TestUser;
let conversationId: string;

/** A finished one-turn conversation with a charged reply, owned by `userId`. */
async function seedConversation(userId: string, title: string): Promise<string> {
  const conversation = await prisma.conversation.create({ data: { userId, title } });
  const prompt = await prisma.message.create({
    data: { conversationId: conversation.id, userId, role: "USER", content: "A private question" },
  });
  const reply = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      userId,
      role: "ASSISTANT",
      content: "A private answer",
      parentId: prompt.id,
      lane: 0,
      providerId: "openai",
      model: "gpt-6-luna",
    },
  });
  await prisma.usageRecord.create({
    data: {
      userId,
      conversationId: conversation.id,
      messageId: reply.id,
      providerId: "openai",
      model: "gpt-6-luna",
      status: "SUCCEEDED",
      inputTokens: 120,
      outputTokens: 480,
      creditsReserved: 50,
      creditsCharged: 3,
    },
  });
  return conversation.id;
}

beforeEach(async () => {
  await resetDatabase();
  await prisma.aIProvider.create({ data: { id: "openai", name: "OpenAI" } });
  alice = await createUser({ credits: 1000, name: "Alice" });
  mallory = await createUser({ credits: 1000, name: "Mallory" });
  conversationId = await seedConversation(alice.id, "Alice's conversation");
});

describe("conversation access", () => {
  it("lets the owner read, rename and delete a conversation", async () => {
    const read = await getConversation(
      request("GET", `/api/conversations/${conversationId}`, { cookie: alice.cookie }),
      withId(conversationId),
    );
    expect(read.status).toBe(200);
    const { conversation } = (await read.json()) as { conversation: ConversationDetailDTO };
    expect(conversation.turns).toHaveLength(1);
    expect(conversation.turns[0].prompt).toBe("A private question");
    expect(conversation.turns[0].responses[0]).toMatchObject({
      content: "A private answer",
      status: "complete",
      credits: 3,
    });

    const renamed = await renameConversation(
      request("PATCH", `/api/conversations/${conversationId}`, {
        cookie: alice.cookie,
        body: { title: "  Renamed  " },
      }),
      withId(conversationId),
    );
    expect(renamed.status).toBe(200);
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } })).title).toBe("Renamed");

    const deleted = await deleteConversation(
      request("DELETE", `/api/conversations/${conversationId}`, { cookie: alice.cookie }),
      withId(conversationId),
    );
    expect(deleted.status).toBe(200);
    expect(await prisma.message.count({ where: { conversationId } })).toBe(0);
    // Usage history survives the conversation it belonged to.
    expect(await prisma.usageRecord.count({ where: { userId: alice.id } })).toBe(1);
  });

  it("hides another user's conversation as if it did not exist", async () => {
    const read = await getConversation(
      request("GET", `/api/conversations/${conversationId}`, { cookie: mallory.cookie }),
      withId(conversationId),
    );
    expect(read.status).toBe(404);
    expect(JSON.stringify(await read.json())).not.toContain("private");
  });

  it("refuses to rename another user's conversation", async () => {
    const response = await renameConversation(
      request("PATCH", `/api/conversations/${conversationId}`, {
        cookie: mallory.cookie,
        body: { title: "Hijacked" },
      }),
      withId(conversationId),
    );
    expect(response.status).toBe(404);
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } })).title).toBe(
      "Alice's conversation",
    );
  });

  it("refuses to delete another user's conversation", async () => {
    const response = await deleteConversation(
      request("DELETE", `/api/conversations/${conversationId}`, { cookie: mallory.cookie }),
      withId(conversationId),
    );
    expect(response.status).toBe(404);
    expect(await prisma.conversation.count({ where: { id: conversationId } })).toBe(1);
    expect(await prisma.message.count({ where: { conversationId } })).toBe(2);
  });

  it("lists only the caller's conversations", async () => {
    await seedConversation(mallory.id, "Mallory's conversation");

    const response = await listConversations(
      request("GET", "/api/conversations", { cookie: mallory.cookie }),
      undefined,
    );
    const { conversations } = (await response.json()) as { conversations: ConversationDTO[] };
    expect(conversations.map((conversation) => conversation.title)).toEqual([
      "Mallory's conversation",
    ]);
  });

  it("requires a session for every conversation operation", async () => {
    const path = `/api/conversations/${conversationId}`;
    const responses = [
      await getConversation(request("GET", path), withId(conversationId)),
      await renameConversation(request("PATCH", path, { body: { title: "x" } }), withId(conversationId)),
      await deleteConversation(request("DELETE", path), withId(conversationId)),
    ];
    for (const response of responses) expect(response.status).toBe(401);
    expect(await prisma.conversation.count({ where: { id: conversationId } })).toBe(1);
  });
});

describe("usage and credit records", () => {
  it("reports only the caller's own usage and transactions", async () => {
    await prisma.$transaction((tx) =>
      grantCredits(tx, { userId: alice.id, amount: 777, type: "ADJUSTMENT", description: "alice only" }),
    );

    const mine = await getUsageOverview(alice.id);
    expect(mine.totals).toMatchObject({ requests: 1, inputTokens: 120, outputTokens: 480, credits: 3 });
    expect(mine.byModel).toMatchObject([{ model: "gpt-6-luna", requests: 1, credits: 3 }]);
    expect(mine.transactions.map((transaction) => transaction.amount)).toContain(777);

    const theirs = await getUsageOverview(mallory.id);
    expect(theirs.totals).toMatchObject({ requests: 0, inputTokens: 0, outputTokens: 0, credits: 0 });
    expect(theirs.byModel).toEqual([]);
    expect(theirs.transactions.map((transaction) => transaction.description)).not.toContain("alice only");
    expect(theirs.credits.balance).toBe(1000);
  });
});
