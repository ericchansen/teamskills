# Deployment Guide

## Overview

The Team Skills Tracker uses a three-tier deployment architecture:

| Environment | Purpose | Trigger | Infrastructure | Cleanup |
|------------|---------|---------|----------------|---------|
| **Local** | Development | Manual | Docker Compose | Manual |
| **Staging** | Per-PR preview | PR opened/updated | Azure Bicep (per-PR) | PR close (automatic) |
| **Production** | Live app | Push to `master` | Azure CLI (brownfield) | Manual |

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Developer                                │
└───────────────┬─────────────────────────────────────────────────┘
                │
                │ git push
                ▼
┌─────────────────────────────────────────────────────────────────┐
│                          GitHub                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  PR opened   │  │ Push master  │  │ Cron 10min   │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
└─────────┼──────────────────┼──────────────────┼──────────────────┘
          │                  │                  │
          │ pr-staging.yml   │ ci-cd.yml        │ keep-alive.yml
          ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                      GitHub Actions                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Bicep deploy │  │  Lint + Test │  │  HTTP ping   │          │
│  │ Docker build │  │  ACR build   │  │  (DB wakeup) │          │
│  │ Smoke test   │  │  az update   │  └──────────────┘          │
│  └──────┬───────┘  └──────┬───────┘                             │
└─────────┼──────────────────┼──────────────────────────────────────┘
          │                  │
          │ Bicep+ARM        │ Azure CLI
          ▼                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Azure Container Apps                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Frontend   │  │   Backend    │  │    Agent     │          │
│  │ (React SPA)  │  │  (Node/API)  │  │ (Node/API)   │          │
│  └──────┬───────┘  └──────┬───────┘  └──────────────┘          │
└─────────┼──────────────────┼──────────────────────────────────────┘
          │                  │
          │                  ▼
          │         ┌──────────────┐
          │         │  PostgreSQL  │
          │         │  Flex Server │
          │         └──────────────┘
          ▼
      ┌──────────────┐
      │  MSAL.js     │
      │  Auth Flow   │
      └──────────────┘
```

---

## 1. Local Development

Docker Compose provides a complete environment with no cloud dependencies.

### Quick Start

```bash
docker-compose up --build
```

This starts:
- PostgreSQL 16 database (port 5432)
- Backend API (port 3001)
- Frontend dev server (port 3000)

### Demo Mode Authentication

When Entra ID is not configured (`AZURE_AD_CLIENT_ID` not set), the app runs in **demo mode**:
- Pre-seeded users (no password required)
- Select any user from the dropdown on the login page
- Bypasses Microsoft authentication

### Full Details

See [DOCKER.md](../DOCKER.md) for:
- Environment variables
- Database management
- Troubleshooting

---

## 2. Staging (Per-PR Preview)

### Trigger

PR opened/synchronized/reopened against `master`

**File:** `.github/workflows/pr-staging.yml`

### What Happens Step-by-Step

1. **Skip Dependabot PRs** — `if: github.actor != 'dependabot[bot]'`

2. **Concurrency Control** — Only one deployment per PR runs at a time:
   ```yaml
   concurrency:
     group: pr-staging-${{ github.event.pull_request.number }}
     cancel-in-progress: true
   ```

3. **Build Container Images**
   - Backend: `docker build -f Dockerfile.backend`
   - Frontend: `docker build -f Dockerfile.frontend`
   - Push to production ACR (reuses existing registry to save cost)
   - Tag: `<git-sha>`

4. **Wake PostgreSQL** (if stopped)
   - Azure Flex Servers auto-pause after inactivity
   - `az postgres flexible-server start`

5. **Deploy with Bicep** (`infra/staging/main.bicep`)
   - Creates per-PR resources with `pr${PR_NUMBER}` naming
   - Creates Entra ID app registration via Microsoft Graph provider
   - Deploys Container Apps environment
   - Creates PostgreSQL Flex Server (if first deploy) or reuses existing
   - Configures ingress, secrets, environment variables

6. **Initialize Database**
   - Connects to PostgreSQL
   - Runs `database/schema.sql`, `database/seed-categories.sql`, `database/seed-users.sql`, `database/seed-demo-skills.sql`

7. **Smoke Tests**
   - Backend health check: `GET /health` → `{"status":"ok"}`
   - Auth config: `GET /api/auth/config` → has `clientId` and `tenantId`
   - Frontend config: `GET /config.js` → runtime config injected

8. **PR Comment** — Posts staging URL to the PR

### Cleanup on PR Close

**File:** `.github/workflows/pr-cleanup.yml`

Synchronously deletes (in order):
1. Entra ID app registration (`az ad app delete`)
2. Container apps (backend, frontend)
3. Container Apps environment
4. PostgreSQL Flex Server
5. Log Analytics workspace
6. Verifies all resources deleted (fails workflow if orphans remain)

### Full Details

See [docs/staging-environment.md](staging-environment.md) for:
- Entra ID bootstrap (one-time admin setup)
- Bicep parameters
- Database lifecycle
- Troubleshooting

---

## 3. Production Deployment

### Trigger

Push to `master` or `main`

**File:** `.github/workflows/ci-cd.yml`

### Pipeline Stages

```
Lint → Test → Deploy (on master only)
```

#### Lint Job

```bash
npm run lint           # Backend
npm run lint           # Frontend (working-directory: frontend)
```

Fails the pipeline if linting errors exist.

#### Test Job

Runs with PostgreSQL service container:

```bash
npm run test:backend   # Backend unit tests
npm run test           # Frontend tests (working-directory: frontend)
```

Fails the pipeline if tests fail.

#### Deploy Job

**Runs only on `master`/`main` branch**

Uses `environment: production` (requires approval if configured)

### Deploy Method: Direct Azure CLI (NOT azd)

**Why NOT azd?**

Production infrastructure is **brownfield** — resources were created incrementally, not by Azure Developer CLI. When `azd provision` runs, it generates a `resourceToken` from `AZURE_ENV_NAME` (e.g., `prod` → token `ywmkgjccarkve`), which creates NEW resources instead of updating existing ones:

- Existing: `ca-backend-gvojq4dgzbtk4`
- azd tries to create: `ca-backend-ywmkgjccarkve`

This also causes permission errors on role assignments and ACR pull chicken-and-egg problems.

**Solution:** Use Azure CLI directly, targeting exact existing resource names.

**Decision:** See `.squad/decisions/inbox/mcmanus-cicd-direct-cli.md`

### Deployment Steps

#### Step 1: Azure Login

```yaml
- uses: azure/login@v2
  with:
    creds: '{"clientId":"...","clientSecret":"...","subscriptionId":"...","tenantId":"..."}'
```

Uses service principal credentials from GitHub secrets/vars.

#### Step 2: Build Container Images (Azure ACR)

All images are built in Azure Container Registry using `az acr build`:

**Backend:**
```bash
az acr build \
  --registry crgvojq4dgzbtk4 \
  --image backend:${{ github.sha }} \
  --image backend:latest \
  --file Dockerfile.backend \
  .
```

**Agent:**
```bash
az acr build \
  --registry crgvojq4dgzbtk4 \
  --image agent:${{ github.sha }} \
  --image agent:latest \
  --file Dockerfile.agent \
  .
```

**Frontend:**
```bash
# Discover backend/agent URLs dynamically
BACKEND_URL="https://$(az containerapp show \
  --name ca-backend-gvojq4dgzbtk4 \
  --resource-group rg-teamskills-prod \
  --query 'properties.configuration.ingress.fqdn' -o tsv)"

AGENT_URL="https://$(az containerapp show \
  --name ca-agent-gvojq4dgzbtk4 \
  --resource-group rg-teamskills-prod \
  --query 'properties.configuration.ingress.fqdn' -o tsv)"

az acr build \
  --registry crgvojq4dgzbtk4 \
  --image frontend:${{ github.sha }} \
  --image frontend:latest \
  --file Dockerfile.frontend \
  --build-arg VITE_API_URL=$BACKEND_URL \
  --build-arg VITE_AZURE_AD_CLIENT_ID=${{ vars.AZURE_AD_CLIENT_ID }} \
  --build-arg VITE_AZURE_AD_TENANT_ID=${{ vars.AZURE_AD_TENANT_ID }} \
  --build-arg VITE_AGENT_URL=$AGENT_URL \
  .
```

**Image Tagging Strategy:**
- `<service>:<git-sha>` — immutable, commit-specific
- `<service>:latest` — always points to most recent deploy

#### Step 3: Deploy Backend

```bash
az containerapp update \
  --name ca-backend-gvojq4dgzbtk4 \
  --resource-group rg-teamskills-prod \
  --image crgvojq4dgzbtk4.azurecr.io/backend:${{ github.sha }} \
  --set-env-vars \
    AZURE_AD_CLIENT_ID=${{ vars.AZURE_AD_CLIENT_ID }} \
    AZURE_AD_TENANT_ID=${{ vars.AZURE_AD_TENANT_ID }} \
    NODE_ENV=production \
    INIT_SECRET=secretref:init-secret \
  --set-secrets init-secret=${{ secrets.INIT_SECRET }}
```

**Note:** INIT_SECRET handling is conditional — only sets if GitHub secret exists.

#### Step 4: Deploy Agent

```bash
az containerapp update \
  --name ca-agent-gvojq4dgzbtk4 \
  --resource-group rg-teamskills-prod \
  --image crgvojq4dgzbtk4.azurecr.io/agent:${{ github.sha }}
```

#### Step 5: Deploy Frontend

```bash
# Discover agent URL (may have changed)
AGENT_URL="https://$(az containerapp show \
  --name ca-agent-gvojq4dgzbtk4 \
  --resource-group rg-teamskills-prod \
  --query 'properties.configuration.ingress.fqdn' -o tsv)"

az containerapp update \
  --name ca-frontend-teamskills \
  --resource-group rg-teamskills-prod \
  --image crgvojq4dgzbtk4.azurecr.io/frontend:${{ github.sha }} \
  --set-env-vars \
    VITE_AGENT_URL=$AGENT_URL
```

#### Step 6: Wait for New Revisions to Provision

Polls backend and agent health endpoints with exponential backoff:

**Backend:**
```bash
for i in $(seq 1 30); do
  if curl -sf "${BACKEND_URL}/health" | grep -q '"ok"'; then
    echo "✅ Backend is ready!"
    break
  fi
  echo "Attempt $i/30: Backend not ready yet, waiting 10s..."
  sleep 10
done
```

**Agent:**
```bash
for i in $(seq 1 15); do
  if curl -sf "${AGENT_URL}/health" | grep -q '"healthy"'; then
    echo "✅ Agent is ready!"
    break
  fi
  echo "Attempt $i/15: Agent not ready yet, waiting 10s..."
  sleep 10
done
```

**Timeouts:**
- Backend: 5 minutes (30 attempts × 10s)
- Agent: 2.5 minutes (15 attempts × 10s)

#### Step 7: Smoke Tests

1. **Backend Health Check**
   ```bash
   curl -sf "${BACKEND_URL}/health" || echo '{"status":"unreachable"}'
   ```
   Expects: `{"status":"ok"}`

2. **Auth Config**
   ```bash
   curl -sf "${BACKEND_URL}/api/auth/config"
   ```
   Expects: JSON with `clientId` and `tenantId`

3. **Frontend Config**
   ```bash
   curl -sf "${FRONTEND_URL}/config.js"
   ```
   Expects: `window.__CONFIG__ = {...}` with runtime config

4. **Agent Health**
   ```bash
   curl -sf "${AGENT_URL}/health" || echo '{"status":"unreachable"}'
   ```
   Expects: `{"status":"healthy"}`

Fails pipeline if any check fails.

### Concurrency

**NONE** — Production deployments do NOT have concurrency control.

**Implication:** Two simultaneous pushes to `master` will trigger parallel deploys, potentially causing race conditions during `az containerapp update`.

**Staging has concurrency control** via:
```yaml
concurrency:
  group: pr-staging-${{ github.event.pull_request.number }}
  cancel-in-progress: true
```

Consider adding similar for production:
```yaml
concurrency:
  group: production-deploy
  cancel-in-progress: false  # Let first deploy complete
```

---

## 4. Staging vs Production Comparison

| Aspect | Staging | Production |
|--------|---------|------------|
| **Infra Method** | Bicep + `arm-deploy` action | Direct Azure CLI (`az acr build`, `az containerapp update`) |
| **Auth Tenant** | Managed env `9c74def4-40b4-4c76-be03-235975db1351` | Microsoft corp `72f988bf-4a3c-4ad2-97fc-2d7430d1fbb5` |
| **App Registration** | Per-PR (auto-created/deleted via Bicep) | Shared (`69c41897-2a3c-4956-b78d-56670cdb5750`) |
| **Database Lifecycle** | Created on first PR deploy, reused for subsequent pushes, deleted on PR close | Persistent (manual creation/deletion) |
| **Image Build** | `docker build` + `docker push` (GitHub runner) | `az acr build` (in Azure) |
| **Frontend Config** | Runtime injection only (`docker-entrypoint.sh` generates `/config.js` from env vars) | Build-time (`--build-arg VITE_*`) + runtime injection |
| **Concurrency** | ✅ `cancel-in-progress: true` | ❌ None |
| **Scale Settings** | Min 0, max 1 (cost savings, cold starts) | Min 1, max 10 (always warm) |
| **GitHub Environment** | `staging` | `production` |
| **Resource Group** | `rg-teamskills-staging` | `rg-teamskills-prod` |

---

## 5. Environment Variables & Secrets

### GitHub Repository Variables

Set at: `Settings` → `Secrets and variables` → `Actions` → `Variables`

| Variable | Description | Example |
|----------|-------------|---------|
| `AZURE_CLIENT_ID` | Service principal client ID (for Azure login) | `9d8d893b-c810-407e-98bb-5e3b83dc056d` |
| `AZURE_TENANT_ID` | Service principal tenant ID | `9c74def4-40b4-4c76-be03-235975db1351` |
| `AZURE_SUBSCRIPTION_ID` | Target Azure subscription | `f7e88075-a19a-46e1-8b67-0b0edbe12345` |
| `ACR_NAME` | Azure Container Registry name | `crgvojq4dgzbtk4` |
| `BACKEND_APP` | Backend container app name | `ca-backend-gvojq4dgzbtk4` |
| `FRONTEND_APP` | Frontend container app name | `ca-frontend-teamskills` |
| `AGENT_APP` | Agent container app name | `ca-agent-gvojq4dgzbtk4` |
| `RESOURCE_GROUP` | Production resource group | `rg-teamskills-prod` |
| `AZURE_AD_CLIENT_ID` | Entra ID app registration client ID (for user auth) | `69c41897-2a3c-4956-b78d-56670cdb5750` |
| `AZURE_AD_TENANT_ID` | Entra ID tenant ID (for user auth) | `72f988bf-4a3c-4ad2-97fc-2d7430d1fbb5` |

### GitHub Environment Secrets

Set at: `Settings` → `Environments` → `[production/staging]` → `Secrets`

| Secret | Environment | Description |
|--------|-------------|-------------|
| `AZURE_CLIENT_SECRET` | `staging`, `production` | Service principal secret (for Azure login) |
| `INIT_SECRET` | `production` | Admin API secret (for backend `/api/admin/init`) |

**Note:** `AZURE_AD_CLIENT_SECRET` was previously used for OBO flow but is NOT currently set in production.

### Container Environment Variables

Set via `--set-env-vars` in `az containerapp update` or Bicep `env:` blocks.

#### Backend

| Variable | Source | Description |
|----------|--------|-------------|
| `NODE_ENV` | Deploy command | `production` (prod) or `staging` (staging) |
| `AZURE_AD_CLIENT_ID` | GitHub var | Entra ID app client ID |
| `AZURE_AD_TENANT_ID` | GitHub var | Entra ID tenant ID |
| `INIT_SECRET` | Secretref | Admin secret (prod only) |
| `PGHOST` | Bicep/manual | PostgreSQL host |
| `PGPORT` | Bicep/manual | `5432` |
| `PGUSER` | Bicep/manual | `postgres` |
| `PGPASSWORD` | Secretref | PostgreSQL password |
| `PGDATABASE` | Bicep/manual | `teamskills` |
| `AZURE_AD_CLIENT_SECRET` | Secretref (optional) | Client secret for OBO flow (SharePoint sync) |

#### Frontend

| Variable | Source | Description |
|----------|--------|-------------|
| `VITE_AGENT_URL` | Deploy command | Agent container app URL (runtime) |
| `VITE_API_URL` | Build arg (prod only) | Backend URL (baked into image at build time) |
| `VITE_AZURE_AD_CLIENT_ID` | Build arg (prod only) | Entra ID client ID (baked into image at build time) |
| `VITE_AZURE_AD_TENANT_ID` | Build arg (prod only) | Entra ID tenant ID (baked into image at build time) |

**Staging difference:** Staging does NOT use build args — all config is runtime-injected by `docker-entrypoint.sh`.

#### Agent

No environment variables currently required.

---

## 6. Frontend Configuration Injection

The frontend uses a **two-phase configuration strategy**:

### Build-Time (Production Only)

```bash
az acr build \
  --build-arg VITE_API_URL=$BACKEND_URL \
  --build-arg VITE_AZURE_AD_CLIENT_ID=$CLIENT_ID \
  --build-arg VITE_AZURE_AD_TENANT_ID=$TENANT_ID \
  --build-arg VITE_AGENT_URL=$AGENT_URL
```

Vite bakes `import.meta.env.VITE_*` into the JavaScript bundle at build time.

### Runtime (Both Staging and Production)

**`frontend/docker-entrypoint.sh`** generates `config.js` from environment variables at container startup:
```bash
#!/bin/sh
cat > /usr/share/nginx/html/config.js << EOF
window.__CONFIG__ = {
  VITE_API_URL: "${VITE_API_URL:-}",
  VITE_AZURE_AD_CLIENT_ID: "${VITE_AZURE_AD_CLIENT_ID:-}",
  VITE_AZURE_AD_TENANT_ID: "${VITE_AZURE_AD_TENANT_ID:-}",
  VITE_AGENT_URL: "${VITE_AGENT_URL:-}",
  VITE_WAKE_FUNCTION_URL: "${VITE_WAKE_FUNCTION_URL:-}"
};
EOF
```

This script is placed at `/docker-entrypoint.d/40-runtime-config.sh` so nginx:alpine runs it automatically before starting.

**Frontend `getConfig(key)` function** (`frontend/src/config.js`):
```javascript
export function getConfig(key) {
  // Runtime config takes priority (set by Docker entrypoint)
  const runtime = window.__CONFIG__?.[key];
  if (runtime) return runtime;

  // Fallback to Vite build-time env vars (local dev)
  return import.meta.env[key] || '';
}
```

**Usage:** `getConfig('VITE_API_URL')` — flat key lookup, not nested objects.

**Precedence:** `window.__CONFIG__[key]` (runtime) overrides `import.meta.env[key]` (build-time).

**Staging behavior:** Relies entirely on runtime injection (no build args).

**Production behavior:** Uses both (build-time as default, runtime as override).

---

## 7. Azure Resource Names

### Default Resource Names

| Resource Type | Name | Override Variable |
|---------------|------|-------------------|
| **Resource Group (Prod)** | `rg-teamskills-prod` | `vars.RESOURCE_GROUP` |
| **Resource Group (Staging)** | `rg-teamskills-staging` | N/A (hardcoded) |
| **Container Registry** | `crgvojq4dgzbtk4` | `vars.ACR_NAME` |
| **Backend Container App** | `ca-backend-gvojq4dgzbtk4` | `vars.BACKEND_APP` |
| **Frontend Container App** | `ca-frontend-teamskills` | `vars.FRONTEND_APP` |
| **Agent Container App** | `ca-agent-gvojq4dgzbtk4` | `vars.AGENT_APP` |
| **PostgreSQL (Prod)** | Manual setup (not in CI/CD) | N/A |
| **PostgreSQL (Staging)** | `psql-staging-pr{PR_NUMBER}` | N/A |

### Overriding Resource Names

Set GitHub repository variables to target different resources:

```yaml
vars.ACR_NAME = "myregistry"
vars.BACKEND_APP = "my-backend"
vars.RESOURCE_GROUP = "my-resource-group"
```

Workflow uses fallback pattern:
```yaml
${{ vars.ACR_NAME || 'crgvojq4dgzbtk4' }}
```

---

## 8. Keep-Alive Mechanism

**File:** `.github/workflows/keep-alive.yml`

### Why It Exists

Azure Container Apps scale to zero after inactivity. PostgreSQL Flexible Servers auto-pause after inactivity, causing 15-60s cold-start delays on first request.

### How It Works

GitHub Actions cron job runs every 10 minutes:

```yaml
on:
  schedule:
    - cron: '*/10 * * * *'  # Every 10 minutes
```

Pings backend health endpoint:

```bash
curl -sf https://ca-backend-gvojq4dgzbtk4.greenwater-c5983efd.centralus.azurecontainerapps.io/health
```

Health endpoint queries the database (`SELECT 1`), keeping PostgreSQL awake.

### Cost

Zero cost — GitHub Actions free tier covers scheduled workflows.

### Container Apps Scale-to-Zero

Production backend is configured with `minReplicas: 1` to prevent cold starts. Staging uses `minReplicas: 0` for cost savings.

---

## 9. Troubleshooting

### Backend "unreachable" After Deploy

**Symptom:** CI/CD smoke test fails with `{"status":"unreachable"}`. Wait loop exhausts all 30 attempts (5 minutes).

**Recent Occurrence:** CI/CD runs 22681175346 and 22686579591 — backend never became healthy after merge of SharePoint OBO PR (`628ed55`) and Node 22 fix (PR #44).

**Root Cause (Resolved March 2026):**
Two issues combined to cause the failure:

1. **Node version mismatch** — `@azure/msal-node@5.0.6` requires `node >= 20`, but `Dockerfile.backend` used `node:18-alpine`. CI tests passed because GitHub Actions used Node 22 (`actions/setup-node`), masking the Docker image incompatibility. **Fix:** PR #44 upgraded to `node:22-alpine`.

2. **PostgreSQL server stopped** — The Azure Flexible Server was in "Stopped" state, causing every health check to return "Connection terminated due to connection timeout." The Node.js server started fine but the `/health` endpoint queries the database and returned 503. **Fix:** `az postgres flexible-server start --name psql-gvojq4dgzbtk4 --resource-group rg-teamskills-prod`.

**Investigation Steps (in order of likelihood):**

#### 1. Database Stopped/Unreachable (Most Common)

PostgreSQL Flexible Server may be stopped, paused, or unreachable.

**Check database state:**
```bash
az postgres flexible-server show \
  --name psql-gvojq4dgzbtk4 \
  --resource-group rg-teamskills-prod \
  --query "state" -o tsv
```

**Fix if stopped:**
```bash
az postgres flexible-server start \
  --name psql-gvojq4dgzbtk4 \
  --resource-group rg-teamskills-prod
```

> **Note:** The keep-alive cron job (every 10 min) pings the backend health endpoint, but if the database is stopped, the keep-alive itself fails silently. Check keep-alive workflow runs for recent failures as an early warning.

#### 2. Container Crash Loop

New dependencies might cause crashes. Check container logs:

**Check logs:**
```bash
az containerapp logs show \
  --name ca-backend-gvojq4dgzbtk4 \
  --resource-group rg-teamskills-prod \
  --type console \
  --tail 50 --follow false
```

Look for:
- `Error: Cannot find module ...`
- `engines.node` version mismatches (e.g., `@azure/msal-node` requires `node >= 20`)
- Uncaught exceptions during startup

**Pro tip:** If the server logs `running on port 3001` but health checks fail, the issue is database connectivity, not a crash.

#### 3. Missing Environment Variables

New code paths may require env vars that weren't set during deploy.

**Example:** OBO client initialization in `oboClient.js`:
```javascript
if (!clientId || !clientSecret || !tenantId) {
  throw new Error('OBO flow requires AZURE_AD_CLIENT_ID, AZURE_AD_CLIENT_SECRET, and AZURE_AD_TENANT_ID');
}
```

**Check:** Does the code call `getConfidentialClient()` at module load time (before routes are hit)? If yes, the app will crash if `AZURE_AD_CLIENT_SECRET` is missing.

**Fix:** Ensure lazy initialization — don't instantiate clients until they're actually used.

#### 4. New Route Initialization Error

If `require('./routes/sharepoint')` fails (e.g., import error), server crashes before health endpoint is registered.

**Check logs for:**
```
Error loading route: ...
```

**Resolution Steps:**

1. **Check database state first** (most common cause):
   ```bash
   az postgres flexible-server show \
     --name psql-gvojq4dgzbtk4 \
     --resource-group rg-teamskills-prod \
     --query "state" -o tsv
   ```

2. **Check container logs:**
   ```bash
   az containerapp logs show \
     --name ca-backend-gvojq4dgzbtk4 \
     --resource-group rg-teamskills-prod \
     --type console \
     --tail 50 --follow false
   ```

3. **Check revision health state:**
   ```bash
   az containerapp revision list \
     --name ca-backend-gvojq4dgzbtk4 \
     --resource-group rg-teamskills-prod \
     --query "[].{name:name, state:properties.runningState, health:properties.healthState}" -o table
   ```

3. **Inspect current environment variables:**
   ```bash
   az containerapp show \
     --name ca-backend-gvojq4dgzbtk4 \
     --resource-group rg-teamskills-prod \
     --query "properties.template.containers[0].env"
   ```

4. **Check current image tag:**
   ```bash
   az containerapp show \
     --name ca-backend-gvojq4dgzbtk4 \
     --resource-group rg-teamskills-prod \
     --query "properties.template.containers[0].image" -o tsv
   ```

5. **Rollback to previous working image:**
   ```bash
   az containerapp update \
     --name ca-backend-gvojq4dgzbtk4 \
     --resource-group rg-teamskills-prod \
     --image crgvojq4dgzbtk4.azurecr.io/backend:0a8482b  # Previous commit SHA
   ```

6. **Test locally with Docker:**
   ```bash
   docker build -f Dockerfile.backend -t backend-debug .
   docker run --rm -e NODE_ENV=production backend-debug
   ```

---

### Health Check Timeout Patterns

**Symptom:** Health check succeeds locally but times out in Azure.

**Common Causes:**

1. **Database connection string wrong** — Check `PGHOST`, `PGUSER`, `PGPASSWORD` env vars
2. **PostgreSQL firewall rules** — Ensure Container Apps subnet is allowed
3. **Container startup slow** — Increase health check timeout in Bicep:
   ```bicep
   probes: [
     {
       type: 'startup'
       httpGet: { path: '/health', port: 3001 }
       periodSeconds: 10
       failureThreshold: 30  // 5 minutes total
     }
   ]
   ```

---

### Frontend `config.js` Empty or Missing Variables

**Symptom:** Frontend loads but auth fails, or `getConfig()` returns undefined values.

**Check:**
```bash
curl https://ca-frontend-teamskills.greenwater-c5983efd.centralus.azurecontainerapps.io/config.js
```

**Expected output:**
```javascript
window.__CONFIG__ = {
  VITE_API_URL: "https://ca-backend-gvojq4dgzbtk4.greenwater-c5983efd.centralus.azurecontainerapps.io",
  VITE_AZURE_AD_CLIENT_ID: "69c41897-2a3c-4956-b78d-56670cdb5750",
  VITE_AZURE_AD_TENANT_ID: "72f988bf-4a3c-4ad2-97fc-2d7430d1fbb5",
  VITE_AGENT_URL: "https://ca-agent-gvojq4dgzbtk4.greenwater-c5983efd.centralus.azurecontainerapps.io",
  VITE_WAKE_FUNCTION_URL: ""
};
```

**If empty or has `undefined` values:**

1. **Check frontend env vars:**
   ```bash
   az containerapp show \
     --name ca-frontend-teamskills \
     --resource-group rg-teamskills-prod \
     --query "properties.template.containers[0].env"
   ```

2. **Ensure `docker-entrypoint.sh` runs:** Check Dockerfile.frontend has:
   ```dockerfile
   COPY frontend/docker-entrypoint.sh /docker-entrypoint.d/40-runtime-config.sh
   RUN chmod +x /docker-entrypoint.d/40-runtime-config.sh
   ```

3. **Check nginx logs:**
   ```bash
   az containerapp logs show \
     --name ca-frontend-teamskills \
     --resource-group rg-teamskills-prod \
     --type console
   ```

---

### Auth Config Missing clientId/tenantId

**Symptom:** Smoke test fails: "Auth config missing clientId!"

**Check backend env vars:**
```bash
az containerapp show \
  --name ca-backend-gvojq4dgzbtk4 \
  --resource-group rg-teamskills-prod \
  --query "properties.template.containers[0].env" | \
  grep -E "AZURE_AD_CLIENT_ID|AZURE_AD_TENANT_ID"
```

**Fix:** Redeploy with correct env vars:
```bash
az containerapp update \
  --name ca-backend-gvojq4dgzbtk4 \
  --resource-group rg-teamskills-prod \
  --set-env-vars \
    AZURE_AD_CLIENT_ID=69c41897-2a3c-4956-b78d-56670cdb5750 \
    AZURE_AD_TENANT_ID=72f988bf-4a3c-4ad2-97fc-2d7430d1fbb5
```

---

### Staging App Registration Permission Errors

**Symptom:** Staging Bicep deploy fails with:
```
Insufficient privileges to complete the operation.
```

**Cause:** CI/CD service principal lacks `Application.ReadWrite.OwnedBy` Graph permission.

**Fix:** One-time admin setup (requires admin in tenant `9c74def4-40b4-4c76-be03-235975db1351`):

```bash
az login --tenant 9c74def4-40b4-4c76-be03-235975db1351

az ad app permission add \
  --id 9d8d893b-c810-407e-98bb-5e3b83dc056d \
  --api 00000003-0000-0000-c000-000000000000 \
  --api-permissions 18a4783c-866b-4cc7-a460-3d5e5662c884=Role

az ad app permission admin-consent --id 9d8d893b-c810-407e-98bb-5e3b83dc056d
```

See [docs/staging-environment.md](staging-environment.md) for full details.

---

### Container Crash Loops

**Symptom:** Container restarts repeatedly. Health checks never succeed.

**Diagnose:**

1. **Check restart count:**
   ```bash
   az containerapp revision show \
     --name ca-backend-gvojq4dgzbtk4 \
     --resource-group rg-teamskills-prod \
     --revision <revision-name> \
     --query "properties.template.containers[0].restartCount"
   ```

2. **Stream logs in real-time:**
   ```bash
   az containerapp logs show \
     --name ca-backend-gvojq4dgzbtk4 \
     --resource-group rg-teamskills-prod \
     --type console \
     --follow
   ```

3. **Check system events:**
   ```bash
   az containerapp logs show \
     --name ca-backend-gvojq4dgzbtk4 \
     --resource-group rg-teamskills-prod \
     --type system \
     | grep -i "error\|restart\|crash"
   ```

**Common Causes:**
- Missing environment variables causing startup errors
- Database connection failures
- Port conflicts (app listening on wrong port vs `expose` in Bicep)
- Memory limits too low (OOM kills)
- Native module compilation issues (use Alpine-compatible dependencies)

---

### Race Conditions in Concurrent Deploys

**Symptom (Staging):** ARM deployment fails with `DeploymentActive` error.

**Fix:** Already implemented via concurrency control:
```yaml
concurrency:
  group: pr-staging-${{ github.event.pull_request.number }}
  cancel-in-progress: true
```

**Symptom (Production):** Two simultaneous `master` pushes trigger parallel deploys, causing undefined behavior.

**Recommended Fix:** Add concurrency to production deploy job:
```yaml
jobs:
  deploy:
    concurrency:
      group: production-deploy
      cancel-in-progress: false  # Don't cancel mid-deploy
```

---

## 10. Related Documentation

- **[Authentication Setup](authentication.md)** — Entra ID app registration, API permissions, SPA redirect URIs
- **[Staging Environment](staging-environment.md)** — Entra bootstrap, Bicep parameters, database lifecycle
- **[Docker Development](../DOCKER.md)** — Local setup, demo mode, troubleshooting
- **[Testing Guide](../TESTING.md)** — E2E tests, unit tests, CI/CD test requirements
- **[Azure Developer CLI](../azure.yaml)** — azd configuration (for local infra experimentation, NOT used in production CI/CD)

---

## Summary

| Question | Answer |
|----------|--------|
| **How do I test changes locally?** | `docker-compose up --build` |
| **How do I deploy to staging?** | Open a PR against `master` |
| **How do I deploy to production?** | Merge to `master` (triggers CI/CD automatically) |
| **How do I rollback production?** | Redeploy with previous commit SHA (see troubleshooting) |
| **Why did my deploy fail?** | Check smoke test output in CI/CD logs, then see troubleshooting section |
| **How do I check production logs?** | `az containerapp logs show --name <app> --resource-group rg-teamskills-prod --type console --follow` |
