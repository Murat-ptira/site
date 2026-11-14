import { defineConfig } from "prisma/config";

// Prisma 7 does not read .env by itself. Load it when it exists; on hosted
// platforms the variables come from the environment instead.
try {
  process.loadEnvFile();
} catch {
  // No .env file.
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Read directly so `prisma generate` still works before a database exists.
    url: process.env.DATABASE_URL,
  },
});
