# Internal Lightweight Skill Hub

This fork is used as a lightweight internal Skill Hub.

The first version keeps the contract simple:

- A skill is a zip package.
- `SKILL.md` is the only required file.
- `SKILL.md` frontmatter provides `name`, `description`, and optional `version`.
- Optional folders can include `references/`, `examples/`, `templates/`, `scripts/`, and `assets/`.
- The Hub stores, searches, and serves versioned zip bundles.
- Agents search metadata first, then download only the selected zip.

## Local Development

Prerequisites:

- Java 21+
- Node.js 20+
- Docker and Docker Compose
- Make

Create your local env file:

```bash
cp .env.light.example .env.light
```

Edit `.env.light`, especially:

```bash
OAUTH2_FEISHU_CLIENT_ID
OAUTH2_FEISHU_CLIENT_SECRET
HERMES_SKILLHUB_JWT_SECRET
```

Start everything with the existing background dev runner:

```bash
scripts/dev-light-skillhub.sh all
```

For foreground logs, use three terminals.

Terminal 1:

```bash
scripts/dev-light-skillhub.sh deps
```

Terminal 2:

```bash
scripts/dev-light-skillhub.sh backend
```

Terminal 3:

```bash
scripts/dev-light-skillhub.sh frontend
```

Open:

- Web UI: `http://localhost:3000`
- Backend API: `http://localhost:8080`

Stop the stack:

```bash
scripts/dev-light-skillhub.sh down
```

## Minimal Skill Package

Use `skill-template/` as the starting point.

Required:

```text
SKILL.md
```

Optional:

```text
references/
examples/
templates/
scripts/
assets/
```

Package it as a zip:

```bash
cd skill-template
zip -r ../weekly-report.zip .
```

Upload the generated zip in the Web UI, or publish through the CLI.

## Agent API

The lightweight Agent API is available under:

```text
/api/agent/v1/skills
```

Agent requests must use a short-lived Hermes-signed JWT:

```text
Authorization: Bearer <jwt>
```

Required JWT claims:

```json
{
  "iss": "hermes-agent",
  "sub": "feishu:ou_xxx",
  "exp": 1920000000,
  "name": "Alice"
}
```

`sub` must use the same Feishu user id that Hermes Agent already uses for its Feishu token broker. In the current internal Feishu setup this is the Feishu `open_id`, so the SkillHub user id becomes `feishu:{open_id}`.

Configure the shared signing secret on the SkillHub server:

```bash
export HERMES_SKILLHUB_JWT_SECRET="replace-with-a-long-random-secret"
export HERMES_SKILLHUB_JWT_ISSUER="hermes-agent"
```

Example Python token generator:

```python
import base64
import hashlib
import hmac
import json
import time

secret = b"replace-with-a-long-random-secret"
header = {"alg": "HS256", "typ": "JWT"}
payload = {
    "iss": "hermes-agent",
    "sub": "feishu:ou_xxx",
    "exp": int(time.time()) + 300,
    "name": "Alice",
}

def b64url(data):
    return base64.urlsafe_b64encode(json.dumps(data, separators=(",", ":")).encode()).rstrip(b"=")

signing_input = b".".join([b64url(header), b64url(payload)])
signature = base64.urlsafe_b64encode(
    hmac.new(secret, signing_input, hashlib.sha256).digest()
).rstrip(b"=")
print((signing_input + b"." + signature).decode())
```

Or use the local helper:

```bash
set -a
source .env.light
set +a
export HERMES_SKILLHUB_JWT="$(
  scripts/make-agent-jwt.py --feishu-open-id ou_xxx --name Alice
)"
```

Search:

```bash
curl -H "Authorization: Bearer $HERMES_SKILLHUB_JWT" \
  "http://localhost:8080/api/agent/v1/skills/search?q=weekly&limit=10"
```

Detail:

```bash
curl -H "Authorization: Bearer $HERMES_SKILLHUB_JWT" \
  "http://localhost:8080/api/agent/v1/skills/global/weekly-report"
```

Download latest zip:

```bash
curl -L -o weekly-report.zip \
  -H "Authorization: Bearer $HERMES_SKILLHUB_JWT" \
  "http://localhost:8080/api/agent/v1/skills/global/weekly-report/download"
```

Download a specific version:

```bash
curl -L -o weekly-report-1.0.0.zip \
  -H "Authorization: Bearer $HERMES_SKILLHUB_JWT" \
  "http://localhost:8080/api/agent/v1/skills/global/weekly-report/versions/1.0.0/download"
```

## Web Feishu Login

SkillHub Web login only supports Feishu OAuth. Legacy GitHub/GitLab/Gitee, local password login, and direct-login APIs have been removed from this fork.

```bash
export OAUTH2_FEISHU_CLIENT_ID="cli_xxx"
export OAUTH2_FEISHU_CLIENT_SECRET="xxx"
export OAUTH2_FEISHU_SCOPE="contact:user.base:readonly"
export SKILLHUB_PUBLIC_BASE_URL="https://skillhub.your-company.com"
```

Feishu developer console checklist:

1. Open the same app whose `App ID` matches `OAUTH2_FEISHU_CLIENT_ID`.
2. Go to `开发配置` -> `安全设置` -> `重定向 URL`.
3. Add the callback URL exactly. Do not use the frontend port `3000`.
4. In `权限管理`, enable `contact:user.base:readonly` and publish the app version if required.

Feishu callback URL:

```text
https://skillhub.your-company.com/login/oauth2/code/feishu
```

For local testing, use the **frontend origin** so the browser session cookie is set on the same port as the Web UI:

```text
http://localhost:3000/login/oauth2/code/feishu
```

Also set:

```bash
export SKILLHUB_WEB_BASE_URL="http://localhost:3000"
```

After Feishu authorization, SkillHub exchanges the auth code through Feishu's JSON token API (`/authen/v2/oauth/token`) and then loads `open_id` from `/authen/v1/user_info`.

Verify the redirect URI SkillHub is sending:

```bash
curl -sI "http://localhost:8080/oauth2/authorization/feishu" | tr -d '\r' | grep -i location
```

The `redirect_uri=` query parameter in that URL must match the Feishu console entry byte-for-byte.

Common causes of `20029` / `重定向地址错误`:

- Redirect URL added to the wrong Feishu app.
- Redirect URL added under the wrong menu (must be `安全设置` -> `重定向 URL`).
- Using `http://localhost:3000/...` instead of port `8080`.
- Trailing slash mismatch, for example `.../feishu/` vs `.../feishu`.
- Using `127.0.0.1` in the console while SkillHub sends `localhost`, or the reverse.

## Agent Runtime Guidance

The Agent should:

1. Search the Hub.
2. Pick a skill from the returned metadata.
3. Download the zip into a mounted workspace cache.
4. Extract it inside the sandbox.
5. Read `SKILL.md` first.
6. Read optional folders only when the instructions require them.

Do not execute scripts automatically in the first version. If a skill contains `scripts/`, the Agent runtime should check sandbox policy, runtime availability, timeouts, and network permissions before running anything.
