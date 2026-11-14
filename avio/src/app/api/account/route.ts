import { z } from "zod";

import { LIMITS } from "@/config/limits";
import { requireRequestUser } from "@/server/auth/request";
import { getCreditSummary } from "@/server/billing/credits";
import { toUserDTO } from "@/server/chat/dto";
import { prisma } from "@/server/db";
import { readJson } from "@/server/http/body";
import { assertSameOrigin } from "@/server/http/request";
import { json, route } from "@/server/http/respond";

const updateSchema = z.object({
  theme: z.enum(["dark", "light", "system"]),
});

export const GET = route(async (request) => {
  const user = await requireRequestUser(request);
  return json({ user: toUserDTO(user), credits: await getCreditSummary(user.id) });
});

export const PATCH = route(async (request) => {
  assertSameOrigin(request);
  const user = await requireRequestUser(request);
  const { theme } = await readJson(request, updateSchema, LIMITS.smallBodyBytes);
  await prisma.user.update({
    where: { id: user.id },
    data: { theme: theme.toUpperCase() as "DARK" | "LIGHT" | "SYSTEM" },
  });
  return json({ user: toUserDTO({ ...user, theme }) });
});
