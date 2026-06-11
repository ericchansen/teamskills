targetScope = 'subscription'

@minLength(1)
@maxLength(64)
@description('Name of the environment')
param environmentName string

@minLength(1)
@description('Primary location for all resources')
param location string

@description('Name of the resource group')
param resourceGroupName string = ''

@description('PostgreSQL administrator password')
@secure()
param postgresPassword string

@description('Initialization secret for seeding/admin operations')
@secure()
param initSecret string = ''

@description('Azure OpenAI model deployment name')
param openAiModelDeploymentName string = 'gpt-4o'

@description('Azure OpenAI model name')
param openAiModelName string = 'gpt-4o'

@description('Microsoft Entra ID Client ID for authentication (optional)')
param azureAdClientId string = ''

@description('Microsoft Entra ID Tenant ID for authentication (optional)')
param azureAdTenantId string = ''

@description('Microsoft Entra ID Client Secret for Easy Auth (optional)')
@secure()
param azureAdClientSecret string = ''

@description('Email address for alert notifications (optional)')
param alertEmailAddress string = ''

@description('Enable private networking (VNet + private endpoints). Set to false for brownfield environments without VNet integration.')
param enablePrivateNetworking bool = false

var abbrs = loadJsonContent('./abbreviations.json')
var resourceToken = toLower(uniqueString(subscription().id, environmentName, location))
var tags = { 'azd-env-name': environmentName }

// Resource Group
resource rg 'Microsoft.Resources/resourceGroups@2022-09-01' = {
  name: !empty(resourceGroupName) ? resourceGroupName : '${abbrs.resourcesResourceGroups}${environmentName}'
  location: location
  tags: tags
}

// Virtual Network for private networking (only deployed for greenfield environments)
module vnet './core/network/vnet.bicep' = if (enablePrivateNetworking) {
  name: 'vnet'
  scope: rg
  params: {
    name: '${abbrs.networkVirtualNetworks}${resourceToken}'
    location: location
    tags: tags
  }
}

// Container Apps Environment and supporting resources
module containerApps './core/host/container-apps.bicep' = {
  name: 'container-apps'
  scope: rg
  params: {
    name: 'app'
    location: location
    tags: tags
    containerAppsEnvironmentName: '${abbrs.appManagedEnvironments}${resourceToken}'
    containerRegistryName: '${abbrs.containerRegistryRegistries}${resourceToken}'
    logAnalyticsWorkspaceName: '${abbrs.operationalInsightsWorkspaces}${resourceToken}'
    infrastructureSubnetId: enablePrivateNetworking ? vnet.outputs.containerAppsSubnetId : ''
  }
}

// PostgreSQL Flexible Server
module postgres './core/database/postgresql.bicep' = {
  name: 'postgresql'
  scope: rg
  params: {
    name: '${abbrs.dBforPostgreSQLServers}${resourceToken}'
    location: location
    tags: tags
    administratorLogin: 'pgadmin'
    administratorLoginPassword: postgresPassword
    databaseName: 'teamskills'
    sku: {
      name: 'Standard_B1ms'
      tier: 'Burstable'
    }
    storage: {
      storageSizeGB: 32
    }
  }
}

// Private endpoint for PostgreSQL (connects via VNet)
module postgresPrivateEndpoint './core/network/private-endpoint-postgres.bicep' = if (enablePrivateNetworking) {
  name: 'postgres-private-endpoint'
  scope: rg
  params: {
    name: '${abbrs.networkPrivateEndpoints}psql-${resourceToken}'
    location: location
    tags: tags
    postgresServerId: postgres.outputs.id
    subnetId: vnet.outputs.privateEndpointsSubnetId
    vnetId: vnet.outputs.id
  }
}

// Azure Policy: Enforce CostControl=Ignore tag on PostgreSQL (subscription-scoped)
module costControlPolicy './core/policy/cost-control-tag.bicep' = {
  name: 'cost-control-policy'
  params: {
    namePrefix: resourceToken
    resourceGroupName: rg.name
    location: location
  }
}

// Azure OpenAI for Chat Agent
module openai './core/ai/openai.bicep' = {
  name: 'openai'
  scope: rg
  params: {
    name: '${abbrs.cognitiveServicesAccounts}${resourceToken}'
    location: location
    tags: tags
    deployments: [
      {
        name: openAiModelDeploymentName
        model: openAiModelName
        capacity: 10
      }
    ]
  }
}

// Application Insights for observability
module appInsights './core/monitoring/app-insights.bicep' = {
  name: 'app-insights'
  scope: rg
  params: {
    name: '${abbrs.insightsComponents}${resourceToken}'
    location: location
    tags: tags
    logAnalyticsWorkspaceId: containerApps.outputs.logAnalyticsWorkspaceId
  }
}

// Backend Container App
module backend './app/backend.bicep' = {
  name: 'backend'
  scope: rg
  params: {
    name: '${abbrs.appContainerApps}backend-${resourceToken}'
    location: location
    tags: union(tags, { 'azd-service-name': 'backend' })
    containerAppsEnvironmentName: containerApps.outputs.environmentName
    containerRegistryName: containerApps.outputs.registryName
    postgresHost: postgres.outputs.fqdn
    postgresPassword: postgresPassword
    initSecret: initSecret
    frontendUrl: 'https://${abbrs.appContainerApps}frontend-${resourceToken}.${containerApps.outputs.defaultDomain}'
    azureAdClientId: azureAdClientId
    azureAdTenantId: azureAdTenantId
    appInsightsConnectionString: appInsights.outputs.connectionString
  }
}

// Frontend Container App
module frontend './app/frontend.bicep' = {
  name: 'frontend'
  scope: rg
  params: {
    name: '${abbrs.appContainerApps}frontend-${resourceToken}'
    location: location
    tags: union(tags, { 'azd-service-name': 'frontend' })
    containerAppsEnvironmentName: containerApps.outputs.environmentName
    containerRegistryName: containerApps.outputs.registryName
    backendUrl: backend.outputs.uri
    azureAdClientId: azureAdClientId
    azureAdTenantId: azureAdTenantId
    azureAdClientSecret: azureAdClientSecret
  }
}

// Agent Container App (Chat Assistant)
module agent './app/agent.bicep' = {
  name: 'agent'
  scope: rg
  params: {
    name: '${abbrs.appContainerApps}agent-${resourceToken}'
    location: location
    tags: union(tags, { 'azd-service-name': 'agent' })
    containerAppsEnvironmentName: containerApps.outputs.environmentName
    containerRegistryName: containerApps.outputs.registryName
    postgresHost: postgres.outputs.fqdn
    postgresPassword: postgresPassword
    azureOpenAiEndpoint: openai.outputs.endpoint
    azureOpenAiDeploymentName: openAiModelDeploymentName
    azureOpenAiResourceId: openai.outputs.id
    frontendUrl: frontend.outputs.uri
    appInsightsConnectionString: appInsights.outputs.connectionString
  }
}

// Alert Rules (depends on App Insights and Container Apps)
module alerts './core/monitoring/alerts.bicep' = {
  name: 'alerts'
  scope: rg
  params: {
    namePrefix: '${abbrs.insightsComponents}alert-${resourceToken}'
    location: location
    tags: tags
    appInsightsId: appInsights.outputs.id
    backendContainerAppId: backend.outputs.id
    agentContainerAppId: agent.outputs.id
    alertEmailAddress: alertEmailAddress
  }
}

output AZURE_CONTAINER_REGISTRY_ENDPOINT string = containerApps.outputs.registryLoginServer
output AZURE_CONTAINER_REGISTRY_NAME string = containerApps.outputs.registryName
output AZURE_CONTAINER_ENVIRONMENT_NAME string = containerApps.outputs.environmentName
output BACKEND_URI string = backend.outputs.uri
output FRONTEND_URI string = frontend.outputs.uri
output AGENT_URI string = agent.outputs.uri
output POSTGRES_HOST string = postgres.outputs.fqdn
output AZURE_OPENAI_ENDPOINT string = openai.outputs.endpoint
output AZURE_OPENAI_DEPLOYMENT_NAME string = openAiModelDeploymentName
output APPLICATIONINSIGHTS_CONNECTION_STRING string = appInsights.outputs.connectionString

// AcrPull role assignments for Container Apps managed identity
module backendAcrPull './core/security/acr-pull.bicep' = {
  name: 'backend-acr-pull'
  scope: rg
  params: {
    containerRegistryName: containerApps.outputs.registryName
    principalId: backend.outputs.principalId
  }
}

module frontendAcrPull './core/security/acr-pull.bicep' = {
  name: 'frontend-acr-pull'
  scope: rg
  params: {
    containerRegistryName: containerApps.outputs.registryName
    principalId: frontend.outputs.principalId
  }
}

module agentAcrPull './core/security/acr-pull.bicep' = {
  name: 'agent-acr-pull'
  scope: rg
  params: {
    containerRegistryName: containerApps.outputs.registryName
    principalId: agent.outputs.principalId
  }
}
