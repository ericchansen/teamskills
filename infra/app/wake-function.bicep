@description('Name of the Function App')
param name string

@description('Location for all resources')
param location string = resourceGroup().location

@description('Tags for the Function App (includes azd-service-name)')
param tags object = {}

@description('PostgreSQL Server Resource ID')
param postgresServerResourceId string

@description('Log Analytics Workspace ID')
param logAnalyticsWorkspaceId string = ''

@description('Unique resource token')
param resourceToken string

var storageAccountName = 'stwake${resourceToken}'
var appServicePlanName = 'asp-wake-${resourceToken}'

// Remove azd-service-name from common tags for storage and app service plan
var commonTags = {
  'azd-env-name': contains(tags, 'azd-env-name') ? tags['azd-env-name'] : ''
}

module functionApp '../core/host/function-app.bicep' = {
  name: 'wake-function-app'
  params: {
    name: name
    location: location
    tags: tags
    commonTags: commonTags
    storageAccountName: storageAccountName
    appServicePlanName: appServicePlanName
    postgresServerResourceId: postgresServerResourceId
    logAnalyticsWorkspaceId: logAnalyticsWorkspaceId
  }
}

output uri string = functionApp.outputs.uri
output name string = functionApp.outputs.name
output principalId string = functionApp.outputs.principalId
