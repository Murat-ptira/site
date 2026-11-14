# AVIO AI

**One platform. Every AI. Your choice.**

AVIO is an invite-only AI workspace. Signed-in users chat with models from
OpenAI, Anthropic and Google Gemini, switch models mid-conversation, compare two
models side by side, and pay for what they use from a credit balance.

Built with Next.js (App Router), TypeScript, Tailwind CSS, PostgreSQL and Prisma.

## Requirements

- Node.js 22.12 or newer
- PostgreSQL (developed against 16)
- An API key for at least one of OpenAI, Anthropic or Google Gemini

## Setup

```bash
npm install
cp .env.example .env     # set DATABASE_URL and at least one provider key
npm run db:migrate       # create the tables
npm run invite:create    # prints an invite code and a sign-up link
npm run dev              # http://localhost:3000
```

For production: `npm run build`, `npm run db:migrate`, then `npm start`. The app
needs a Node.js server and a PostgreSQL database; it cannot be exported as a
static site.

## Configuration

Everything is set through environment variables (see `.env.example`).

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | required | PostgreSQL connection string. |
| `TEST_DATABASE_URL` | none | Used only by `npm test`. The database name must end in `_test`; the suite wipes every table in it. |
| `APP_URL` | empty | Public origin of the deployment. When set, state-changing API requests must come from exactly this origin. Set it in production. |
| `REGISTRATION_MODE` | `invite` | `invite` needs a valid invite code, `open` lets anyone sign up, `closed` disables sign-up. |
| `INITIAL_CREDITS` | `5000` | Credits granted to every new account. |
| `AI_RATE_LIMIT_PER_MINUTE` | `20` | AI requests each user may start per minute. A comparison counts as two. |
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` | empty | Provider keys. They are read on the server only and never sent to the browser. |
| `OPENAI_BASE_URL`, `ANTHROPIC_BASE_URL`, `GEMINI_BASE_URL` | empty | Optional: route a provider through a gateway or proxy. |

## Providers and models

A model is offered to users only when all of these hold:

- its provider is enabled in the `AIProvider` table (`isEnabled`),
- the provider's API key is set, and
- the provider itself lists the model for that key.

Anything else is hidden rather than left to fail mid-conversation. With no
working provider the workspace lists the keys that are missing and keeps the
message box disabled; it never makes up a reply. Restart the server after
changing a key.

Every model, its price and the credit policy live in `src/config/catalog.ts`.
That file is the one place to edit when a provider changes a price or ships a
model.

## Credits

One credit covers $0.001 of provider cost (1,000 credits per dollar) with no
markup; both numbers are `CREDIT_POLICY` in `src/config/catalog.ts`.

Before a request is sent, its worst-case cost is held from the balance, so
concurrent requests cannot overspend. When the reply ends, the hold is released
and the real cost, from the provider's token counts, is charged. A reply that
fails is not charged. Every change to a balance is a `CreditTransaction` row and
every reply has a `UsageRecord`; users see both under Settings.

There is no payment flow yet. To top up an account:

```bash
npm run credits:grant -- --email ada@example.com --credits 1000 --note "Top-up"
```

## Invites

```bash
npm run invite:create
npm run invite:create -- --uses 5 --days 30 --note "Design team"
```

## Tests

```bash
npm test          # needs TEST_DATABASE_URL
npm run typecheck
npm run lint
```

The suite covers sign-up, sign-in and sessions, per-user authorization, pricing,
the credit ledger, model availability, provider failures, streaming, comparison,
rate limiting and dropped connections. It runs against a local stand-in for the
three provider APIs, so it needs no keys and makes no outside requests.

## Trying it without provider accounts

The same stand-in can back a local server:

```bash
npm run mock:providers
```

Then point the app at it in `.env` (any non-empty key works):

```bash
OPENAI_API_KEY="mock"     OPENAI_BASE_URL="http://127.0.0.1:4010/openai/v1"
ANTHROPIC_API_KEY="mock"  ANTHROPIC_BASE_URL="http://127.0.0.1:4010/anthropic"
GEMINI_API_KEY="mock"     GEMINI_BASE_URL="http://127.0.0.1:4010/google"
```

Its replies say that they are simulated. Remove these settings before using
real keys.

## How it is put together

```
prisma/schema.prisma     User, Session, InviteCode, Conversation, Message,
                         AIProvider, UsageRecord, CreditTransaction, RateLimit
src/app/                 Pages and API routes
src/components/          Interface: workspace, settings, sign-in, landing page
src/config/              Model catalog, prices, limits
src/server/ai/           One adapter per provider, model availability
src/server/auth/         Passwords, sessions, invites
src/server/billing/      Pricing, credit ledger, usage
src/server/chat/         Conversations and the request lifecycle
scripts/                 Operator commands (invites, credits)
tests/                   Test suites and the provider stand-in
```

API routes, all under `/api` and all scoped to the signed-in user:

| Route | Methods |
| --- | --- |
| `auth/signup`, `auth/login`, `auth/logout` | `POST` |
| `account` | `GET`, `PATCH` |
| `models` | `GET` |
| `conversations` | `GET` |
| `conversations/[id]` | `GET`, `PATCH`, `DELETE` |
| `chat` | `POST`, answers with a stream of newline-delimited JSON |

## Security notes

- Passwords are hashed with scrypt. Sign-in is throttled per account.
- Sessions are random tokens in an `HttpOnly`, `SameSite=Lax` cookie; only a
  hash of the token is stored.
- Pages and API routes each check the session against the database, and every
  query is limited to the signed-in user's own rows.
- A reply that is still being written when the browser disconnects is finished,
  saved and charged on the server, and shown when the user returns.
