// Staging Environment - Shared infrastructure for pull request previews.
// Uses stable resource names so the frontend URL never changes (avoids
// per-PR redirect URI registration in Entra ID). Each PR deploy updates
// the container images; cleanup scales to zero and stops Postgres.

targetScope = 'resourceGroup'

@description('PR number for tagging (tracks which PR is currently deployed)')
param prNumber string

@description('Location for all resources')
param location string = resourceGroup().location

@description('PostgreSQL administrator password (stored as GitHub environment secret)')
@secure()
param postgresPassword string

@description('Container image tag (typically git SHA)')
param imageTag string = 'latest'

@description('Existing Container Registry name (from production)')
param acrName string

@description('Existing Container Registry resource group')
param acrResourceGroup string = 'rg-teamskills-prod'

@description('Entra ID client ID for authentication (optional)')
param azureAdClientId string = ''

@description('Entra ID tenant ID for authentication (optional)')
param azureAdTenantId string = ''

@secure()
@description('Entra ID Client Secret for Easy Auth (optional)')
param azureAdClientSecret string = ''

var tags = { 
  'pr-staging': 'true'
  'pr-number': prNumber
}

// Reference existing ACR from production (to avoid duplicate registry costs)
resource containerRegistry 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: acrName
  scope: resourceGroup(acrResourceGroup)
}

// Shared Log Analytics Workspace (stable across all PRs)
resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: 'log-staging'
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

// Shared Container Apps Environment (stable URL suffix across all PRs)
resource containerAppsEnvironment 'Microsoft.App/managedEnvironments@2023-05-01' = {
  name: 'cae-staging'
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

// Shared PostgreSQL Server (stopped between PRs to save costs)
resource postgresServer 'Microsoft.DBforPostgreSQL/flexibleServers@2023-06-01-preview' = {
  name: 'psql-teamskills-staging'
  location: location
  tags: tags
  sku: {
    name: 'Standard_B1ms'
    tier: 'Burstable'
  }
  properties: {
    administratorLogin: 'pgadmin'
    administratorLoginPassword: postgresPassword
    storage: {
      storageSizeGB: 32
    }
    version: '16'
    highAvailability: {
      mode: 'Disabled'
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
  }
}

// Allow Azure services to connect to PostgreSQL
resource postgresFirewall 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2023-06-01-preview' = {
  parent: postgresServer
  name: 'AllowAllAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

// Database
resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-06-01-preview' = {
  parent: postgresServer
  name: 'teamskills'
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

// Backend Container App (stable name, image updated per PR)
resource backend 'Microsoft.App/containerApps@2023-05-01' = {
  name: 'ca-backend-staging'
  location: location
  tags: tags
  properties: {
    managedEnvironmentId: containerAppsEnvironment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 3001
        transport: 'http'
        corsPolicy: {
          allowedOrigins: ['https://ca-frontend-staging.${containerAppsEnvironment.properties.defaultDomain}']
          allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
          allowedHeaders: ['Content-Type', 'Authorization']
        }
      }
      registries: [
        {
          server: containerRegistry.properties.loginServer
          username: containerRegistry.listCredentials().username
          passwordSecretRef: 'registry-password'
        }
      ]
      secrets: [
        {
          name: 'registry-password'
          value: containerRegistry.listCredentials().passwords[0].value
        }
        {
          name: 'postgres-password'
          value: postgresPassword
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'backend'
          image: '${containerRegistry.properties.loginServer}/backend:${imageTag}'
          env: [
            { name: 'NODE_ENV', value: 'production' }
            { name: 'PORT', value: '3001' }
            { name: 'FRONTEND_URL', value: 'https://ca-frontend-staging.${containerAppsEnvironment.properties.defaultDomain}' }
            { name: 'PGHOST', value: postgresServer.properties.fullyQualifiedDomainName }
            { name: 'PGPORT', value: '5432' }
            { name: 'PGUSER', value: 'pgadmin' }
            { name: 'PGPASSWORD', secretRef: 'postgres-password' }
            { name: 'PGDATABASE', value: 'teamskills' }
            { name: 'PGSSLMODE', value: 'require' }
            { name: 'INIT_SECRET', value: 'staging-init-secret' }
            { name: 'AZURE_AD_CLIENT_ID', value: azureAdClientId }
            { name: 'AZURE_AD_TENANT_ID', value: azureAdTenantId }
          ]
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 1
      }
    }
  }
  dependsOn: [database]
}

// Frontend Container App (stable name, image updated per PR)
resource frontend 'Microsoft.App/containerApps@2023-05-01' = {
  name: 'ca-frontend-staging'
  location: location
  tags: tags
  properties: {
    managedEnvironmentId: containerAppsEnvironment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 80
        transport: 'http'
      }
      registries: [
        {
          server: containerRegistry.properties.loginServer
          username: containerRegistry.listCredentials().username
          passwordSecretRef: 'registry-password'
        }
      ]
      secrets: concat([
        {
          name: 'registry-password'
          value: containerRegistry.listCredentials().passwords[0].value
        }
      ], !empty(azureAdClientSecret) ? [
        {
          name: 'azure-ad-client-secret'
          value: azureAdClientSecret
        }
      ] : [])
    }
    template: {
      containers: [
        {
          name: 'frontend'
          image: '${containerRegistry.properties.loginServer}/frontend:${imageTag}'
          env: [
            { name: 'VITE_API_URL', value: 'https://ca-backend-staging.${containerAppsEnvironment.properties.defaultDomain}' }
            { name: 'VITE_AZURE_AD_CLIENT_ID', value: azureAdClientId }
            { name: 'VITE_AZURE_AD_TENANT_ID', value: azureAdTenantId }
          ]
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 1
      }
    }
  }
}

// Outputs for GitHub Actions
output frontendUrl string = 'https://${frontend.properties.configuration.ingress.fqdn}'
output backendUrl string = 'https://${backend.properties.configuration.ingress.fqdn}'
output initSecret string = 'staging-init-secret'

// NOTE: Easy Auth explicitly disabled on backend — Express middleware handles JWT validation directly.
// This is the standard pattern for SPA + API: MSAL sends Bearer tokens, Express validates via JWKS.
// We must keep this resource to ensure Easy Auth stays disabled (removing it doesn't delete the config).
resource backendAuth 'Microsoft.App/containerApps/authConfigs@2023-05-01' = {
  parent: backend
  name: 'current'
  properties: {
    platform: {
      enabled: false
    }
    globalValidation: {
      unauthenticatedClientAction: 'AllowAnonymous'
    }
  }
}


