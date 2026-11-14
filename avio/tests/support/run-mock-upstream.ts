import { startMockUpstream } from "./mock-upstream";

/**
 * Runs the mock provider upstream on its own, for local development without
 * provider accounts:
 *
 *   npm run mock:providers
 *
 * then point the app at it in .env (any non-empty key works):
 *
 *   OPENAI_API_KEY="mock"     OPENAI_BASE_URL="http://127.0.0.1:4010/openai/v1"
 *   ANTHROPIC_API_KEY="mock"  ANTHROPIC_BASE_URL="http://127.0.0.1:4010/anthropic"
 *   GEMINI_API_KEY="mock"     GEMINI_BASE_URL="http://127.0.0.1:4010/google"
 *
 * Replies are clearly labelled as simulated. Remove these settings before
 * using real provider keys.
 */
async function main(): Promise<void> {
  const port = Number(process.env.MOCK_PROVIDERS_PORT ?? 4010);
  const upstream = await startMockUpstream({ port, chunkDelayMs: 25 });
  console.log(`Mock provider upstream listening on ${upstream.url}`);
  for (const [provider, url] of Object.entries(upstream.baseUrls)) {
    console.log(`  ${provider.padEnd(10)} ${url}`);
  }
}

void main();
