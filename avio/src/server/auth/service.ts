import "server-only";

import { z } from "zod";

import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/config/limits";
import { creditsToUnits } from "@/lib/credits";
import { grantCredits } from "@/server/billing/credits";
import { isUniqueViolation, prisma } from "@/server/db";
import { env } from "@/server/env";
import { HttpError } from "@/server/http/errors";

import { redeemInviteCode } from "./invite";
import { burnPasswordCheck, hashPassword, verifyPassword } from "./password";
import {
  authUserSelect,
  createSession,
  toAuthUser,
  type AuthUser,
  type NewSession,
} from "./session";

const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "Enter a valid email address.")
  .pipe(z.email("Enter a valid email address."));

export const signupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter your name.")
    .max(80, "Use 80 characters or fewer."),
  email,
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters.`)
    .max(PASSWORD_MAX_LENGTH, `Use ${PASSWORD_MAX_LENGTH} characters or fewer.`),
  inviteCode: z.string().trim().max(64).optional(),
});

export const loginSchema = z.object({
  email,
  // No length rules here: a wrong password should fail as "invalid
  // credentials", not as a validation hint. The cap only bounds hashing work.
  password: z.string().min(1, "Enter your password.").max(PASSWORD_MAX_LENGTH),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

export interface AuthResult {
  user: AuthUser;
  session: NewSession;
}

export async function signUp(input: SignupInput): Promise<AuthResult> {
  const mode = env().REGISTRATION_MODE;
  if (mode === "closed") {
    throw new HttpError(
      403,
      "registration_closed",
      "Registration is currently closed.",
    );
  }

  // Hashing is deliberately slow, so do it before opening the transaction.
  const passwordHash = await hashPassword(input.password);
  const welcomeCredits = creditsToUnits(env().INITIAL_CREDITS);

  try {
    return await prisma.$transaction(async (tx) => {
      // Checked first: without a valid invite, nothing about the email leaks.
      const inviteCodeId =
        mode === "invite" ? await redeemInviteCode(tx, input.inviteCode) : null;

      const user = await tx.user.create({
        data: { email: input.email, name: input.name, passwordHash, inviteCodeId },
        select: authUserSelect,
      });
      if (welcomeCredits > 0) {
        await grantCredits(tx, {
          userId: user.id,
          amount: welcomeCredits,
          type: "SIGNUP_GRANT",
          description: "Welcome credits",
        });
      }
      const session = await createSession(tx, user.id);
      return { user: toAuthUser(user), session };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new HttpError(
        409,
        "email_taken",
        "An account with this email already exists.",
        { fields: { email: "An account with this email already exists." } },
      );
    }
    throw error;
  }
}

export async function logIn(input: LoginInput): Promise<AuthResult> {
  const invalid = new HttpError(
    401,
    "invalid_credentials",
    "Incorrect email or password.",
  );
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: { ...authUserSelect, passwordHash: true },
  });
  if (!user) {
    await burnPasswordCheck(input.password);
    throw invalid;
  }
  if (!(await verifyPassword(input.password, user.passwordHash))) throw invalid;

  // Housekeeping: drop this user's expired sessions.
  await prisma.session.deleteMany({
    where: { userId: user.id, expiresAt: { lt: new Date() } },
  });
  const session = await createSession(prisma, user.id);
  return { user: toAuthUser(user), session };
}
