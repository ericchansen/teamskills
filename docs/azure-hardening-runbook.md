# Azure Hardening Runbook — One-Time Migration Steps

This runbook documents the manual Azure CLI steps needed to migrate `rg-teamskills-prod` to the hardened configuration defined in the updated Bicep IaC.

> **Why manual?** Several changes cannot be automated in-place via Bicep alone (e.g., VNet integration on an existing Container Apps Environment requires recreation). These steps bridge the brownfield production environment to the target architecture.

## Prerequisites

- Azure CLI ≥ 2.55 (`az --version`)
- Owner or Contributor role on subscription `f7858112-5c13-46e5-8341-3851a12164fa`
- Active login: `az login && az account set -s f7858112-5c13-46e5-8341-3851a12164fa`

## Variables

```bash
RG="rg-teamskills-prod"
PG_SERVER="psql-gvojq4dgzbtk4"
ACR="crgvojq4dgzbtk4"
LOCATION="eastus2"
VNET_NAME="vnet-teamskills-prod"
SNET_CA="snet-container-apps"
SNET_PE="snet-private-endpoints"
```

---

## Step 1: Tag PostgreSQL Server (Immediate)

Prevents MCAPS cost-control automation from stopping the server.

```bash
az postgres flexible-server update \
  --name $PG_SERVER \
  --resource-group $RG \
  --tags CostControl=Ignore
```

**Verify:**
```bash
az postgres flexible-server show \
  --name $PG_SERVER \
  --resource-group $RG \
  --query "tags.CostControl" -o tsv
# Expected: Ignore
```

---

## Step 2: Deploy Azure Policy Assignment (Tag Enforcement)

The Bicep at `infra/core/policy/cost-control-tag.bicep` creates a Modify-effect policy that re-applies the `CostControl=Ignore` tag if removed. Deploy at subscription scope:

```bash
az deployment sub create \
  --location centralus \
  --template-file infra/core/policy/cost-control-tag.bicep \
  --parameters namePrefix=gvojq4dgzbtk4 resourceGroupName=$RG location=centralus
```

Then trigger a remediation task to backfill existing resources:

```bash
ASSIGNMENT_ID=$(az policy assignment show \
  --name "gvojq4dgzbtk4-costcontrol-assign" \
  --scope "/subscriptions/f7858112-5c13-46e5-8341-3851a12164fa/resourceGroups/$RG" \
  --query id -o tsv)

az policy remediation create \
  --name "backfill-costcontrol-tag" \
  --policy-assignment "$ASSIGNMENT_ID" \
  --resource-group $RG
```

**Verify:** Wait ~5 min, then confirm tag persists after manual removal:
```bash
az postgres flexible-server update --name $PG_SERVER --resource-group $RG --tags CostControl=
# Wait for policy evaluation (~15 min)
az postgres flexible-server show --name $PG_SERVER --resource-group $RG --query "tags.CostControl" -o tsv
# Expected: Ignore (re-applied by policy)
```

---

## Step 3: Enable Microsoft Defender for Containers

Enables automatic vulnerability scanning for all images pushed to ACR.

```bash
az security pricing create --name Containers --tier Standard
```

**Verify:**
```bash
az security pricing show --name Containers --query pricingTier -o tsv
# Expected: Standard
```

Results appear in Defender for Cloud recommendations within ~30 minutes of next image push.

---

## Step 4: Create VNet and Subnets

```bash
az network vnet create \
  --resource-group $RG \
  --name $VNET_NAME \
  --location $LOCATION \
  --address-prefix 10.0.0.0/16

az network vnet subnet create \
  --resource-group $RG \
  --vnet-name $VNET_NAME \
  --name $SNET_CA \
  --address-prefix 10.0.0.0/23 \
  --delegations Microsoft.App/environments

az network vnet subnet create \
  --resource-group $RG \
  --vnet-name $VNET_NAME \
  --name $SNET_PE \
  --address-prefix 10.0.2.0/24 \
  --disable-private-endpoint-network-policies
```

---

## Step 5: Create New Container Apps Environment with VNet

> ⚠️ **You cannot add VNet integration to an existing Container Apps Environment.** A new environment must be created and apps migrated.

```bash
SNET_CA_ID=$(az network vnet subnet show \
  --resource-group $RG --vnet-name $VNET_NAME --name $SNET_CA \
  --query id -o tsv)

LOG_WORKSPACE=$(az monitor log-analytics workspace list \
  --resource-group $RG --query "[0].customerId" -o tsv)
LOG_KEY=$(az monitor log-analytics workspace get-shared-keys \
  --resource-group $RG \
  --workspace-name $(az monitor log-analytics workspace list --resource-group $RG --query "[0].name" -o tsv) \
  --query primarySharedKey -o tsv)

az containerapp env create \
  --name "cae-teamskills-prod-v2" \
  --resource-group $RG \
  --location $LOCATION \
  --infrastructure-subnet-resource-id "$SNET_CA_ID" \
  --logs-workspace-id "$LOG_WORKSPACE" \
  --logs-workspace-key "$LOG_KEY" \
  --internal-only false
```

---

## Step 6: Create Private Endpoint for PostgreSQL

```bash
SNET_PE_ID=$(az network vnet subnet show \
  --resource-group $RG --vnet-name $VNET_NAME --name $SNET_PE \
  --query id -o tsv)

PG_ID=$(az postgres flexible-server show \
  --name $PG_SERVER --resource-group $RG --query id -o tsv)

# Create private endpoint
az network private-endpoint create \
  --name "pep-psql-teamskills" \
  --resource-group $RG \
  --vnet-name $VNET_NAME \
  --subnet $SNET_PE \
  --private-connection-resource-id "$PG_ID" \
  --group-id postgresqlServer \
  --connection-name "psql-pe-connection"

# Create private DNS zone
az network private-dns zone create \
  --resource-group $RG \
  --name "privatelink.postgres.database.azure.com"

# Link DNS zone to VNet
az network private-dns link vnet create \
  --resource-group $RG \
  --name "pdnsz-link-teamskills" \
  --zone-name "privatelink.postgres.database.azure.com" \
  --virtual-network $VNET_NAME \
  --registration-enabled false

# Register DNS zone group for automatic A record
az network private-endpoint dns-zone-group create \
  --resource-group $RG \
  --endpoint-name "pep-psql-teamskills" \
  --name "psql-dns-group" \
  --private-dns-zone "privatelink.postgres.database.azure.com" \
  --zone-name "privatelink.postgres.database.azure.com"
```

**Verify:** The private FQDN should resolve from within the VNet:
```bash
az network private-endpoint show \
  --name "pep-psql-teamskills" --resource-group $RG \
  --query "customDnsConfigs[0].fqdn" -o tsv
# Expected: psql-gvojq4dgzbtk4.privatelink.postgres.database.azure.com
```

---

## Step 7: Migrate Container Apps to New Environment

For each app (backend, agent, frontend), export the current config and recreate in the new environment:

```bash
APPS=("ca-backend-gvojq4dgzbtk4" "ca-agent-gvojq4dgzbtk4" "ca-frontend-teamskills")

for APP in "${APPS[@]}"; do
  echo "Migrating $APP..."
  
  # Export current app YAML
  az containerapp show --name "$APP" --resource-group $RG -o yaml > "/tmp/${APP}.yaml"
  
  # Modify environment reference in the exported YAML
  # Then recreate (or use az containerapp update --yaml with the new env)
  echo "Manual: Update the environment reference in /tmp/${APP}.yaml to cae-teamskills-prod-v2"
  echo "Then: az containerapp create --resource-group $RG --yaml /tmp/${APP}.yaml"
done
```

> **Important:** Update GitHub Actions variables if app/environment names change:
> - `CONTAINER_APPS_ENVIRONMENT` → `cae-teamskills-prod-v2`

---

## Step 8: Disable Public Network Access on PostgreSQL

Only do this AFTER verifying apps connect successfully via private endpoint:

```bash
az postgres flexible-server update \
  --name $PG_SERVER \
  --resource-group $RG \
  --public-network-access Disabled
```

**Verify:** Attempt connection from outside VNet (should fail):
```bash
psql "host=${PG_SERVER}.postgres.database.azure.com port=5432 dbname=teamskills user=pgadmin sslmode=require"
# Expected: connection timeout / refused
```

---

## Step 9: Cleanup Old Resources

After confirming everything works on the new environment:

```bash
# Delete old Container Apps Environment (only after all apps are migrated and healthy)
OLD_ENV=$(az containerapp env list --resource-group $RG --query "[?!contains(name,'v2')].name" -o tsv)
if [ -n "$OLD_ENV" ]; then
  az containerapp env delete --name "$OLD_ENV" --resource-group $RG --yes
fi
```

---

## Verification Checklist

| Check | Command | Expected |
|-------|---------|----------|
| PG tagged | `az tag list --resource-id <pg-id>` | `CostControl=Ignore` |
| Policy assigned | `az policy assignment list --resource-group $RG` | Modify policy present |
| Defender active | `az security pricing show --name Containers` | `Standard` |
| Private endpoint | `az network private-endpoint list --resource-group $RG` | PE for PG exists |
| Public access off | `az postgres flexible-server show ... --query publicNetworkAccess` | `Disabled` |
| Apps healthy | `curl https://<backend-fqdn>/health/ready` | 200 OK |
| Scan results | Defender for Cloud → Recommendations → Container images | Scans completing |

---

## Rollback

If issues arise after disabling public access:

```bash
# Re-enable public access (emergency)
az postgres flexible-server update \
  --name $PG_SERVER --resource-group $RG \
  --public-network-access Enabled

# Re-add AllowAllAzureServices rule (emergency only)
az postgres flexible-server firewall-rule create \
  --name AllowAllAzureServices \
  --resource-group $RG \
  --server-name $PG_SERVER \
  --start-ip-address 0.0.0.0 \
  --end-ip-address 0.0.0.0
```
