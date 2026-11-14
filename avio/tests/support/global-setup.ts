import { execFileSync } from "node:child_process";

/**
 * Runs once before all suites: applies migrations to the test database.
 * Refuses to touch a database that is not clearly a test database, because the
 * suites truncate every table.
 */
export default function globalSetup(): void {
  try {
    process.loadEnvFile();
  } catch {
    // No .env file; rely on the environment.
  }
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error("Set TEST_DATABASE_URL to run the tests. See .env.example.");
  }
  const name = new URL(url).pathname.replace(/^\//, "");
  if (!name.endsWith("_test")) {
    throw new Error(
      `TEST_DATABASE_URL must point at a database whose name ends in "_test" (got "${name}").`,
    );
  }
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
}
