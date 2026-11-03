# Copilot setup

Copilot is an optional AI assistant for PagerWho. It answers questions about
project resources and on-call routing, inspects configuration gaps, explains
notification delivery records, prepares settings changes for human approval,
and generates advisory incident summaries.

Copilot is **disabled by default**. When no model provider is configured, the
Copilot button and the AI incident summary stay visible, but opening them shows
a "Copilot setup required" notice instead of sending requests, and the API
rejects Copilot requests with `503 copilot_not_configured`. Everything else in
PagerWho works without it.

## Requirements

- An OpenAI-compatible API endpoint, either the Responses API
  (`POST {base}/responses`) or Chat Completions (`POST {base}/chat/completions`).
- A model that supports function (tool) calling with JSON Schema parameters and
  forced tool choice.
- The API server must be able to reach the endpoint. Only the API server calls
  the provider; the browser never sees the key.

## Configuration

Set these on the **API** server (`apps/api/.env` locally, or the deployment env
file). Copilot turns on only when the key, base URL and model are all set.

| Variable | Required | Description |
| --- | --- | --- |
| `COPILOT_API_KEY` | yes | Provider API key, sent as `Authorization: Bearer`. Local servers that ignore auth still need a non-empty placeholder. |
| `COPILOT_BASE_URL` | yes | Base URL without the trailing `/responses` or `/chat/completions`. HTTPS is required by default. |
| `COPILOT_MODEL` | yes | Provider model ID. |
| `COPILOT_API_FORMAT` | no | `responses` (default) or `chat-completions`. |
| `COPILOT_EXTRA_BODY` | no | JSON object merged into every request body for provider-specific options. It cannot override the model, messages, tools, tool choice, token limit or storage fields. |
| `COPILOT_ALLOW_INSECURE_HTTP` | no | `true` allows an `http://` base URL. Use only for a trusted local or private-network model server. |

Shared usage limits apply to every provider and are enforced with PostgreSQL
counters, so all API replicas share them. Defaults apply when unset:

| Variable | Default |
| --- | --- |
| `COPILOT_USER_REQUESTS_PER_MINUTE` | 6 |
| `COPILOT_WORKSPACE_DAILY_REQUESTS` | 200 |
| `COPILOT_WORKSPACE_DAILY_TOKENS` | 500000 |
| `COPILOT_GLOBAL_DAILY_TOKENS` | 5000000 |

Set the global token cap to the daily spend you can afford. If a provider does
not report token usage, Copilot charges a conservative estimate.

On startup the API logs whether Copilot is enabled. If the configuration is
incomplete or invalid, it logs the names of the problem variables (never their
values) and keeps Copilot disabled. Restart the API after changing these
variables. `GET /api/v1/copilot/status` reports `available`, `api_format` and
`model`; it does not call the provider.

## Provider examples

Copilot's prompts and validation were evaluated with Qwen Cloud
`qwen3.7-flash`. The other examples below are protocol-compatible but have not
been evaluated by the project, and answer quality varies by model. Model output
is always schema-validated, and settings changes always require explicit human
approval, so a weaker model degrades answers rather than bypassing safeguards.

Qwen Cloud (Model Studio):

```dotenv
COPILOT_API_FORMAT=responses
COPILOT_API_KEY=<key>
COPILOT_BASE_URL=https://ap-southeast-1.maas.qwencloudapi.com/compatible-mode/v1
COPILOT_MODEL=qwen3.7-flash
COPILOT_EXTRA_BODY={"enable_thinking":false}
```

OpenAI or Azure OpenAI (Responses API):

```dotenv
COPILOT_API_FORMAT=responses
COPILOT_API_KEY=<key>
COPILOT_BASE_URL=https://api.openai.com/v1
COPILOT_MODEL=<model id>
```

OpenRouter, Google Gemini (OpenAI compatibility), Groq, DeepSeek and other
Chat Completions providers:

```dotenv
COPILOT_API_FORMAT=chat-completions
COPILOT_API_KEY=<key>
COPILOT_BASE_URL=<provider OpenAI-compatible base URL, e.g. https://openrouter.ai/api/v1>
COPILOT_MODEL=<model id>
```

Local model server (Ollama, vLLM, LM Studio) reachable from the API container:

```dotenv
COPILOT_API_FORMAT=chat-completions
COPILOT_API_KEY=local
COPILOT_BASE_URL=http://ollama:11434/v1
COPILOT_MODEL=<model with tool calling>
COPILOT_ALLOW_INSECURE_HTTP=true
```

## Data sent to the provider

Copilot sends only what a request needs: the user's question and recent
conversation, a limited project context (resource names, IDs and routing, never
contact addresses, secrets or provider credentials), tool results, and for
incident summaries a bounded incident excerpt. Pasted webhook payloads are
validated on the server and are not forwarded. Review your provider's data
retention terms before enabling Copilot. With the Responses format Copilot
requests `store: false`.

## Testing a provider

Unit tests never call a real provider. To check connectivity with synthetic data:

```sh
pnpm --filter @im/api copilot:smoke
```

Opt-in live evaluations call the configured provider and incur usage:

```sh
COPILOT_LIVE_TESTS=true pnpm --filter @im/api test:copilot:live
```
