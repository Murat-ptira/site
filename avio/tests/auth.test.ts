import { beforeEach, describe, expect, it } from "vitest";

import { GET as getAccount } from "@/app/api/account/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { POST as signup } from "@/app/api/auth/signup/route";
import { POST as chat } from "@/app/api/chat/route";
import { GET as listConversations } from "@/app/api/conversations/route";
import { GET as listModels } from "@/app/api/models/route";
import { UNITS_PER_CREDIT } from "@/lib/credits";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { prisma } from "@/server/db";

import {
  createInvite,
  createUser,
  errorCode,
  request,
  resetDatabase,
  setEnv,
} from "./support/helpers";

const PASSWORD = "correct horse battery";

function signupRequest(overrides: Record<string, unknown> = {}) {
  return request("POST", "/api/auth/signup", {
    body: { name: "Ada Lovelace", email: "ada@example.com", password: PASSWORD, ...overrides },
  });
}

function loginRequest(email: string, password: string) {
  return request("POST", "/api/auth/login", { body: { email, password } });
}

/** The `name=value` part of a Set-Cookie header, ready to send back. */
function cookieFrom(response: Response): string {
  return (response.headers.get("set-cookie") ?? "").split(";")[0];
}

beforeEach(async () => {
  await resetDatabase();
  setEnv({ REGISTRATION_MODE: "invite", INITIAL_CREDITS: "100" });
});

describe("password hashing", () => {
  it("stores a salted hash that only the right password verifies", async () => {
    const first = await hashPassword(PASSWORD);
    const second = await hashPassword(PASSWORD);

    expect(first).not.toContain(PASSWORD);
    expect(first.startsWith("scrypt$")).toBe(true);
    expect(first).not.toBe(second);
    expect(await verifyPassword(PASSWORD, first)).toBe(true);
    expect(await verifyPassword("wrong password", first)).toBe(false);
  });

  it("treats a malformed stored hash as a failed check", async () => {
    expect(await verifyPassword(PASSWORD, "not-a-real-hash")).toBe(false);
    expect(await verifyPassword(PASSWORD, "scrypt$0$0$0$$")).toBe(false);
  });
});

describe("sign up", () => {
  it("requires a valid invite code", async () => {
    const missing = await signup(signupRequest(), undefined);
    expect(missing.status).toBe(403);
    expect(await errorCode(missing)).toBe("invalid_invite");

    const unknown = await signup(signupRequest({ inviteCode: "AVIO-0000-0000-0000" }), undefined);
    expect(unknown.status).toBe(403);
    expect(await prisma.user.count()).toBe(0);
  });

  it("creates the account, signs the user in and grants welcome credits", async () => {
    const inviteCode = await createInvite();
    const response = await signup(signupRequest({ inviteCode, email: "  Ada@Example.com " }), undefined);
    expect(response.status).toBe(201);

    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("avio_session=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");

    const user = await prisma.user.findUniqueOrThrow({
      where: { email: "ada@example.com" },
      include: { creditTransactions: true, sessions: true },
    });
    expect(user.passwordHash.startsWith("scrypt$")).toBe(true);
    expect(user.passwordHash).not.toContain(PASSWORD);
    expect(user.creditBalance).toBe(100 * UNITS_PER_CREDIT);
    expect(user.creditTransactions).toMatchObject([
      { type: "SIGNUP_GRANT", amount: 100 * UNITS_PER_CREDIT, balanceAfter: 100 * UNITS_PER_CREDIT },
    ]);
    // The session token itself is never stored.
    const token = cookieFrom(response).split("=")[1];
    expect(user.sessions).toHaveLength(1);
    expect(user.sessions[0].tokenHash).not.toBe(token);

    const account = await getAccount(request("GET", "/api/account", { cookie: cookieFrom(response) }), undefined);
    expect(account.status).toBe(200);
  });

  it("lets an invite code be used only as often as it allows", async () => {
    const inviteCode = await createInvite(1);
    expect((await signup(signupRequest({ inviteCode }), undefined)).status).toBe(201);

    const again = await signup(signupRequest({ inviteCode, email: "grace@example.com" }), undefined);
    expect(again.status).toBe(403);
    expect(await prisma.user.count()).toBe(1);
  });

  it("rejects a duplicate email without consuming the invite", async () => {
    expect((await signup(signupRequest({ inviteCode: await createInvite() }), undefined)).status).toBe(201);

    const secondInvite = await createInvite();
    const duplicate = await signup(signupRequest({ inviteCode: secondInvite }), undefined);
    expect(duplicate.status).toBe(409);
    expect(await errorCode(duplicate)).toBe("email_taken");

    const invite = await prisma.inviteCode.findUniqueOrThrow({ where: { code: secondInvite } });
    expect(invite.useCount).toBe(0);
  });

  it("rejects weak passwords and invalid emails before touching the invite", async () => {
    const inviteCode = await createInvite();
    const weak = await signup(signupRequest({ inviteCode, password: "short" }), undefined);
    expect(weak.status).toBe(400);
    const body = (await weak.json()) as { error: { fields: Record<string, string> } };
    expect(body.error.fields.password).toBeTruthy();

    const badEmail = await signup(signupRequest({ inviteCode, email: "not-an-email" }), undefined);
    expect(badEmail.status).toBe(400);
    expect((await prisma.inviteCode.findUniqueOrThrow({ where: { code: inviteCode } })).useCount).toBe(0);
  });

  it("follows the registration mode", async () => {
    setEnv({ REGISTRATION_MODE: "closed" });
    const closed = await signup(signupRequest({ inviteCode: await createInvite() }), undefined);
    expect(closed.status).toBe(403);
    expect(await errorCode(closed)).toBe("registration_closed");

    setEnv({ REGISTRATION_MODE: "open" });
    expect((await signup(signupRequest(), undefined)).status).toBe(201);
  });
});

describe("log in and sessions", () => {
  beforeEach(async () => {
    setEnv({ REGISTRATION_MODE: "open" });
    await signup(signupRequest(), undefined);
  });

  it("signs in with the right password", async () => {
    const response = await login(loginRequest("ADA@example.com", PASSWORD), undefined);
    expect(response.status).toBe(200);

    const account = await getAccount(request("GET", "/api/account", { cookie: cookieFrom(response) }), undefined);
    expect(account.status).toBe(200);
    const body = (await account.json()) as { user: Record<string, unknown> };
    expect(body.user.email).toBe("ada@example.com");
    expect(body.user).not.toHaveProperty("passwordHash");
  });

  it("gives the same answer for a wrong password and an unknown email", async () => {
    const wrongPassword = await login(loginRequest("ada@example.com", "not the password"), undefined);
    const unknownEmail = await login(loginRequest("nobody@example.com", PASSWORD), undefined);

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(await wrongPassword.json()).toEqual(await unknownEmail.json());
    expect(wrongPassword.headers.get("set-cookie")).toBeNull();
  });

  it("rejects requests without a valid session", async () => {
    const anonymous = [
      await getAccount(request("GET", "/api/account"), undefined),
      await listConversations(request("GET", "/api/conversations"), undefined),
      await listModels(request("GET", "/api/models"), undefined),
      await chat(request("POST", "/api/chat", { body: {} }), undefined),
      await getAccount(request("GET", "/api/account", { cookie: "avio_session=forged-token" }), undefined),
    ];
    for (const response of anonymous) {
      expect(response.status).toBe(401);
    }
  });

  it("rejects an expired session", async () => {
    const user = await createUser();
    await prisma.session.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const response = await getAccount(request("GET", "/api/account", { cookie: user.cookie }), undefined);
    expect(response.status).toBe(401);
  });

  it("logging out invalidates the session on the server", async () => {
    const user = await createUser();
    const response = await logout(request("POST", "/api/auth/logout", { cookie: user.cookie }), undefined);
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");

    // The old cookie no longer works, even if someone kept a copy.
    const after = await getAccount(request("GET", "/api/account", { cookie: user.cookie }), undefined);
    expect(after.status).toBe(401);
  });

  it("blocks state-changing requests from another origin", async () => {
    const user = await createUser();
    const forged = await logout(
      request("POST", "/api/auth/logout", { cookie: user.cookie, origin: "https://evil.example" }),
      undefined,
    );
    expect(forged.status).toBe(403);

    const still = await getAccount(request("GET", "/api/account", { cookie: user.cookie }), undefined);
    expect(still.status).toBe(200);
  });

  it("slows down password guessing against one account", async () => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await login(loginRequest("victim@example.com", "guess"), undefined);
      expect(response.status).toBe(401);
    }
    const limited = await login(loginRequest("victim@example.com", "guess"), undefined);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBeTruthy();
  });

  it("rejects oversized and non-JSON bodies", async () => {
    const huge = await login(
      request("POST", "/api/auth/login", {
        body: { email: "ada@example.com", password: "x".repeat(20_000) },
      }),
      undefined,
    );
    expect(huge.status).toBe(413);

    const form = await login(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", origin: "http://localhost" },
        body: "email=ada@example.com&password=x",
      }),
      undefined,
    );
    expect(form.status).toBe(415);
  });
});
