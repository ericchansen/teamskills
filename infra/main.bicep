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

@description('Azure OpenAI model deployment name')
param openAiModelDeploymentName string = 'gpt-4o'

@description('Azure OpenAI model name')
param openAiModelName string = 'gpt-4o'

var abbrs = loadJsonContent('./abbreviations.json')
var resourceToken = toLower(uniqueString(subscription().id, environmentName, location))
var tags = { 'azd-env-name': environmentName }

// Resource Group
resource rg 'Microsoft.Resources/resourceGroups@2022-09-01' = {
  name: !empty(resourceGroupName) ? resourceGroupName : '${abbrs.resourcesResourceGroups}${environmentName}'
  location: location
  tags: tags
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
    frontendUrl: 'https://${abbrs.appContainerApps}frontend-${resourceToken}.${containerApps.outputs.defaultDomain}'
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
  }
}

// Wake Function App (auto-starts PostgreSQL on demand)
module wakeFunction './app/wake-function.bicep' = {
  name: 'wake-function'
  scope: rg
  params: {
    name: '${abbrs.webSitesFunctions}wake-${resourceToken}'
    location: location
    tags: union(tags, { 'azd-service-name': 'wake-function' })
    postgresServerResourceId: postgres.outputs.id
    resourceToken: resourceToken
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
output WAKE_FUNCTION_URI string = wakeFunction.outputs.uri
