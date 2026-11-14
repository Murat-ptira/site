// Runs in every test worker before the suite is loaded: point the app at the
// test database and give it a known configuration.
try {
  process.loadEnvFile();
} catch {
  // No .env file; rely on the environment.
}

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error("Set TEST_DATABASE_URL to run the tests. See .env.example.");
}

Object.assign(process.env, {
  DATABASE_URL: testDatabaseUrl,
  APP_URL: "http://localhost",
  REGISTRATION_MODE: "invite",
  INITIAL_CREDITS: "100",
  AI_RATE_LIMIT_PER_MINUTE: "100",
  OPENAI_API_KEY: "",
  ANTHROPIC_API_KEY: "",
  GEMINI_API_KEY: "",
  OPENAI_BASE_URL: "",
  ANTHROPIC_BASE_URL: "",
  GEMINI_BASE_URL: "",
});
