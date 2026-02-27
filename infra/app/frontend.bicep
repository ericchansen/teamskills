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

@secure()
@description('Microsoft Entra ID Client Secret for Easy Auth (optional)')
param azureAdClientSecret string = ''

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
      secrets: !empty(azureAdClientSecret) ? [
        {
          name: 'azure-ad-client-secret'
          value: azureAdClientSecret
        }
      ] : []
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

// Easy Auth: Entra ID authentication (only when configured)
resource frontendAuth 'Microsoft.App/containerApps/authConfigs@2023-05-01' = if (!empty(azureAdClientId) && !empty(azureAdTenantId)) {
  parent: frontend
  name: 'current'
  properties: {
    platform: {
      enabled: true
    }
    globalValidation: {
      unauthenticatedClientAction: 'RedirectToLoginPage'
      redirectToProvider: 'azureactivedirectory'
      excludedPaths: ['/config.js']
    }
    identityProviders: {
      azureActiveDirectory: {
        enabled: true
        registration: {
          clientId: azureAdClientId
          clientSecretSettingName: 'azure-ad-client-secret'
          openIdIssuer: 'https://login.microsoftonline.com/${azureAdTenantId}/v2.0'
        }
        validation: {
          allowedAudiences: [
            'api://${azureAdClientId}'
            azureAdClientId
          ]
        }
      }
    }
  }
}
