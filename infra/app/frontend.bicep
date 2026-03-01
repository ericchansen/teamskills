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

@description('Backend URL for API proxy')
param backendUrl string

@description('Microsoft Entra ID Client ID for Easy Auth (optional)')
param azureAdClientId string = ''

@description('Microsoft Entra ID Tenant ID for Easy Auth (optional)')
param azureAdTenantId string = ''

resource containerAppsEnvironment 'Microsoft.App/managedEnvironments@2023-05-01' existing = {
  name: containerAppsEnvironmentName
}

resource containerRegistry 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: containerRegistryName
}

resource frontend 'Microsoft.App/containerApps@2023-05-01' = {
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
        targetPort: 80
        transport: 'http'
      }
      registries: [
        {
          server: containerRegistry.properties.loginServer
          identity: 'system'
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'frontend'
          image: '${containerRegistry.properties.loginServer}/frontend:latest'
          env: [
            {
              name: 'VITE_API_URL'
              value: backendUrl
            }
            {
              name: 'VITE_AZURE_AD_CLIENT_ID'
              value: azureAdClientId
            }
            {
              name: 'VITE_AZURE_AD_TENANT_ID'
              value: azureAdTenantId
            }
          ]
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
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

output uri string = 'https://${frontend.properties.configuration.ingress.fqdn}'
output name string = frontend.name
output principalId string = frontend.identity.principalId

// NOTE: Easy Auth explicitly disabled on frontend — MSAL.js handles authentication directly in the browser.
// This is the standard pattern for SPAs: MSAL acquires tokens client-side, sends to backend via Bearer header.
// We must keep this resource to ensure Easy Auth stays disabled (removing it doesn't delete the config).
// Always deployed unconditionally — if env vars are empty and this resource
// isn't deployed, any pre-existing Easy Auth config would persist.
resource frontendAuth 'Microsoft.App/containerApps/authConfigs@2023-05-01' = {
  parent: frontend
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


