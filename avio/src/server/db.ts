import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";

import { Prisma, PrismaClient } from "@/generated/prisma/client";

export type Tx = Prisma.TransactionClient;
/** Either the shared client or a transaction handle. */
export type Db = PrismaClient | Tx;

const globalForPrisma = globalThis as unknown as { avioPrisma?: PrismaClient };

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. See .env.example.");
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

function getClient(): PrismaClient {
  // Cached on globalThis so dev-mode hot reloads reuse one connection pool.
  return (globalForPrisma.avioPrisma ??= createClient());
}

/**
 * The shared Prisma client. It connects on first use, not on import, so that
 * building the app does not require a database.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getClient();
    const value = Reflect.get(client, property, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}
