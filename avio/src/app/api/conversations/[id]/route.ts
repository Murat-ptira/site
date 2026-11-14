import { z } from "zod";

import { LIMITS } from "@/config/limits";
import { requireRequestUser } from "@/server/auth/request";
import {
  deleteConversation,
  getConversationDetail,
  renameConversation,
} from "@/server/chat/conversations";
import { readJson } from "@/server/http/body";
import { notFound } from "@/server/http/errors";
import { assertSameOrigin } from "@/server/http/request";
import { json, route } from "@/server/http/respond";

interface Context {
  params: Promise<{ id: string }>;
}

const renameSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Enter a title.")
    .max(LIMITS.maxTitleChars, `Use ${LIMITS.maxTitleChars} characters or fewer.`),
});

// A conversation owned by someone else is reported as missing, so ids cannot
// be probed.

export const GET = route<Context>(async (request, { params }) => {
  const user = await requireRequestUser(request);
  const { id } = await params;
  const conversation = await getConversationDetail(user.id, id);
  if (!conversation) throw notFound("Conversation");
  return json({ conversation });
});

export const PATCH = route<Context>(async (request, { params }) => {
  assertSameOrigin(request);
  const user = await requireRequestUser(request);
  const { id } = await params;
  const { title } = await readJson(request, renameSchema, LIMITS.smallBodyBytes);
  const conversation = await renameConversation(user.id, id, title);
  if (!conversation) throw notFound("Conversation");
  return json({ conversation });
});

export const DELETE = route<Context>(async (request, { params }) => {
  assertSameOrigin(request);
  const user = await requireRequestUser(request);
  const { id } = await params;
  if (!(await deleteConversation(user.id, id))) throw notFound("Conversation");
  return json({ ok: true });
});
