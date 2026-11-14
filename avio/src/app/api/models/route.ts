import { getModelsDTO } from "@/server/ai/availability";
import { requireRequestUser } from "@/server/auth/request";
import { json, route } from "@/server/http/respond";

/** Models the signed-in user can pick right now, plus each provider's status. */
export const GET = route(async (request) => {
  await requireRequestUser(request);
  return json(await getModelsDTO());
});
