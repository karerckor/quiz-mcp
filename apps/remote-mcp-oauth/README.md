# @quiz-mcp/remote-mcp-oauth

Remote, OAuth-protected variant of the [quiz-mcp](../../README.md) server, deployed as a Cloudflare Worker. Each authenticated user gets an isolated quiz workspace (Durable Object + per-user KV namespace) and can be connected from any MCP client that supports remote MCP over Streamable HTTP with OAuth (Claude Desktop, Claude Code, MCP Inspector, …).

This app is built on top of Cloudflare's [`remote-mcp-authkit`](https://github.com/cloudflare/ai/tree/main/demos/remote-mcp-authkit) demo: it uses [`@cloudflare/workers-oauth-provider`](https://github.com/cloudflare/workers-oauth-provider) to act as an OAuth 2.1 authorization server for MCP clients, while delegating the actual user login to [WorkOS AuthKit](https://www.authkit.com/).

## Architecture

```
MCP client ──► /authorize /token /register   (workers-oauth-provider)
                       │
                       ▼
                /mcp (Streamable HTTP)
                       │
                       ▼
              QuizMCP Durable Object
                       │
                       ├── QUIZ_KV (per-user quiz state)
                       └── QUIZ_RUNNER_URL → browser UI for the human
```

- `OAuthProvider` exposes the OAuth discovery / authorization / token / dynamic-client-registration endpoints required by the MCP spec.
- `AuthkitHandler` (Hono) handles `/authorize`, redirects the user through WorkOS AuthKit, and stores short-lived state in `OAUTH_KV`.
- After authentication the user's `id`, `email`, `name` are stored as `Props` on the OAuth grant and passed to the `QuizMCP` Durable Object on every MCP call.
- The Worker also serves the `runner-ui` bundle (`packages/runner-ui/dist`) as static assets so the human-facing quiz UI does not need a separate origin.

## MCP tools exposed

In addition to the standard quiz tools (`start_quiz`, `get_answers`, `get_quiz_format`) the remote server adds:

- `get_quizzes` — list every quiz the authenticated user has ever started, with `finished` flag.
- `cleanup_quiz` — remove a finished quiz from KV after the model has read its answers.

`stop_runner` is intentionally **not** exposed: the runner is the Worker itself; nothing to stop.

## Required configuration

### 1. `wrangler.jsonc` placeholders

Three values in [`wrangler.jsonc`](./wrangler.jsonc) are stubbed as `<CHANGE_THIS_VALUE>` and **must** be replaced before `wrangler deploy`:

| Path | What to put there | How to obtain |
|---|---|---|
| `kv_namespaces[0].id` (binding `OAUTH_KV`) | KV namespace ID for OAuth state, registered clients, and the "this client is approved" cookie. | `wrangler kv namespace create OAUTH_KV` |
| `kv_namespaces[1].id` (binding `QUIZ_KV`) | KV namespace ID for per-user quiz storage. | `wrangler kv namespace create QUIZ_KV` |
| `vars.QUIZ_RUNNER_URL` | Public origin that serves the runner UI. In the default deploy this is the Worker's own URL — e.g. `https://quiz-mcp-oauth.<account>.workers.dev`. | After the first `wrangler deploy`, copy the Worker URL and put it back here, then redeploy. |

Other fields you may want to change:

- `name` — Worker name, also part of the default `*.workers.dev` URL.
- `vars.QUIZ_TTL_SECONDS` — TTL for stored quizzes in KV (default `3600` = 1 hour).
- `dev.port` — port for `wrangler dev` (default `8788`).

The `migrations` block creates the `QuizMCP` SQLite-backed Durable Object on first deploy. Leave it alone; if you ever rename the class, **append** a new migration rather than editing `v1`.

### 2. Environment variables (`vars` in `wrangler.jsonc`)

These are non-secret and committed to the repo:

| Name | Purpose | Default |
|---|---|---|
| `QUIZ_TTL_SECONDS` | Lifetime of each quiz record in `QUIZ_KV`. | `3600` |
| `QUIZ_RUNNER_URL` | Base URL given to the model so it can hand the human a link to fill in the quiz. The Worker appends `/${userId}` to it. Trailing slashes are trimmed. | — |

### 3. Secrets (`wrangler secret put …`)

These are **not** committed and must be set per environment:

| Name | Purpose | Where to get it |
|---|---|---|
| `WORKOS_CLIENT_ID` | WorkOS AuthKit client ID. | WorkOS dashboard → Applications → your app. |
| `WORKOS_CLIENT_SECRET` | WorkOS AuthKit client secret. | Same place; treat as a password. |
| `COOKIE_ENCRYPTION_KEY` | AES-GCM key used to sign the "client already approved" cookie so we can skip the consent screen on subsequent visits. | Any 32-byte high-entropy random string, e.g. `openssl rand -hex 32`. |

Set them with:

```bash
wrangler secret put WORKOS_CLIENT_ID
wrangler secret put WORKOS_CLIENT_SECRET
wrangler secret put COOKIE_ENCRYPTION_KEY
```

For local development with `wrangler dev`, put the same three keys into a `.dev.vars` file at the root of this app (gitignored):

```
WORKOS_CLIENT_ID=client_...
WORKOS_CLIENT_SECRET=sk_...
COOKIE_ENCRYPTION_KEY=...
```

### 4. WorkOS AuthKit setup

In the WorkOS dashboard, add the following redirect URI to your AuthKit application:

```
https://<your-worker-host>/callback
```

— and `http://localhost:8788/callback` for local dev. The Worker uses the `offline_access` scope by default; nothing else needs to be enabled.

## Local development

```bash
pnpm install
pnpm --filter @quiz-mcp/remote-mcp-oauth dev   # → http://localhost:8788
```

Point an MCP client at `http://localhost:8788/mcp`. The first call will trigger the OAuth dance through AuthKit.

## Deploy

```bash
pnpm --filter @quiz-mcp/remote-mcp-oauth deploy
```

After the first deploy, copy the resulting Worker URL into `vars.QUIZ_RUNNER_URL` and redeploy so the model hands users absolute links to the right host.

## Connecting an MCP client

Most clients accept a remote MCP server as `{ "type": "http", "url": "…/mcp" }` (or equivalent). Example for Claude Code:

```json
{
  "mcpServers": {
    "quiz-mcp-remote": {
      "type": "http",
      "url": "https://quiz-mcp-oauth.<account>.workers.dev/mcp"
    }
  }
}
```

The first tool call will open a browser for the OAuth flow; the resulting access token is cached by the client.

## Credits

The OAuth scaffolding (`workers-oauth-utils.ts`, `authkit-handler.ts`, `quiz-shell.tsx` consent screen) is adapted from Cloudflare's [`demos/remote-mcp-authkit`](https://github.com/cloudflare/ai/tree/main/demos/remote-mcp-authkit).
