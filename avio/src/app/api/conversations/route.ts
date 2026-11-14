import { requireRequestUser } from "@/server/auth/request";
import { listConversations } from "@/server/chat/conversations";
import { json, route } from "@/server/http/respond";

export const GET = route(async (request) => {
  const user = await requireRequestUser(request);
  return json({ conversations: await listConversations(user.id) });
});
