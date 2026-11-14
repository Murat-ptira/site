import "server-only";

import type { ConversationDTO, ConversationDetailDTO } from "@/lib/types";
import { releaseStaleReservations } from "@/server/billing/credits";
import { prisma } from "@/server/db";

import { messageSelect, toConversationDTO, toTurns } from "./dto";

/**
 * Conversation reads and writes. Every query is scoped by `userId`, so a
 * conversation id that belongs to someone else behaves exactly like one that
 * does not exist.
 */

const conversationSelect = {
  id: true,
  title: true,
  mode: true,
  updatedAt: true,
} as const;

export async function listConversations(userId: string): Promise<ConversationDTO[]> {
  const rows = await prisma.conversation.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take: 200,
    select: conversationSelect,
  });
  return rows.map(toConversationDTO);
}

export async function getConversationDetail(
  userId: string,
  conversationId: string,
): Promise<ConversationDetailDTO | null> {
  // Replies whose request died mid-stream should read as interrupted, not as
  // still generating.
  await prisma.$transaction((tx) => releaseStaleReservations(tx, userId));

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, userId },
    select: {
      ...conversationSelect,
      messages: { where: { userId }, select: messageSelect },
    },
  });
  if (!conversation) return null;
  return {
    ...toConversationDTO(conversation),
    turns: toTurns(conversation.messages),
  };
}

export async function renameConversation(
  userId: string,
  conversationId: string,
  title: string,
): Promise<ConversationDTO | null> {
  const existing = await prisma.conversation.findFirst({
    where: { id: conversationId, userId },
    select: { updatedAt: true },
  });
  if (!existing) return null;
  const updated = await prisma.conversation.update({
    where: { id: conversationId },
    // Renaming is not activity: keep the conversation where it is in the list.
    data: { title, updatedAt: existing.updatedAt },
    select: conversationSelect,
  });
  return toConversationDTO(updated);
}

export async function deleteConversation(
  userId: string,
  conversationId: string,
): Promise<boolean> {
  const deleted = await prisma.conversation.deleteMany({
    where: { id: conversationId, userId },
  });
  return deleted.count === 1;
}
