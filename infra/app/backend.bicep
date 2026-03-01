@description('Name of the Container App')
param name string

@description('Location for the Container App')
param location string = resourceGroup().location

@description('Tags for the Container App')
param tags object = {}

@description('Name of the Container Apps Environment')
param containerAppsEnvironmentName string

@description('Name of the Container Registry')
param containerRegistryName string

@description('PostgreSQL server hostname')
param postgresHost string

@description('PostgreSQL password')
@secure()
param postgresPassword string

@description('Frontend URL for CORS')
param frontendUrl string = '*'

@description('Microsoft Entra ID Client ID (optional)')
param azureAdClientId string = ''

@description('Microsoft Entra ID Tenant ID (optional)')
param azureAdTenantId string = ''

resource containerAppsEnvironment 'Microsoft.App/managedEnvironments@2023-05-01' existing = {
  name: containerAppsEnvironmentName
}

resource containerRegistry 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: containerRegistryName
}

resource backend 'Microsoft.App/containerApps@2023-05-01' = {
  name: name
  location: location
  tags: tags
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    managedEnvironmentId: containerAppsEnvironment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 3001
        transport: 'http'
        corsPolicy: {
          allowedOrigins: [frontendUrl]
          allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
          allowedHeaders: ['Content-Type', 'Authorization']
        }
      }
      registries: [
        {
          server: containerRegistry.properties.loginServer
          identity: 'system'
        }
      ]
      secrets: [
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
          image: '${containerRegistry.properties.loginServer}/backend:latest'
          env: [
            {
              name: 'NODE_ENV'
              value: 'production'
            }
            {
              name: 'PORT'
              value: '3001'
            }
            {
              name: 'FRONTEND_URL'
              value: frontendUrl
            }
            {
              name: 'PGHOST'
              value: postgresHost
            }
            {
              name: 'PGPORT'
              value: '5432'
            }
            {
              name: 'PGUSER'
              value: 'pgadmin'
            }
            {
              name: 'PGPASSWORD'
              secretRef: 'postgres-password'
            }
            {
              name: 'PGDATABASE'
              value: 'teamskills'
            }
            {
              name: 'PGSSLMODE'
              value: 'require'
            }
            {
              name: 'AZURE_AD_CLIENT_ID'
              value: azureAdClientId
            }
            {
              name: 'AZURE_AD_TENANT_ID'
              value: azureAdTenantId
            }
          ]
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 3
      }
    }
  }
}

output uri string = 'https://${backend.properties.configuration.ingress.fqdn}'
output name string = backend.name
output principalId string = backend.identity.principalId

// NOTE: Easy Auth explicitly disabled on backend — Express middleware handles JWT validation directly.
// This is the standard pattern for SPA + API: MSAL sends Bearer tokens, Express validates via JWKS.
// We must keep this resource to ensure Easy Auth stays disabled (removing it doesn't delete the config).
// Always deployed unconditionally — if env vars are empty and this resource
// isn't deployed, any pre-existing Easy Auth config would persist.
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
