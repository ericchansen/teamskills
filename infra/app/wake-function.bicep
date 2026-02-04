@description('Name of the Function App')
param name string

@description('Location for all resources')
param location string = resourceGroup().location

@description('Tags for all resources')
param tags object = {}

@description('PostgreSQL Server Resource ID')
param postgresServerResourceId string

@description('Log Analytics Workspace ID')
param logAnalyticsWorkspaceId string = ''

@description('Unique resource token')
param resourceToken string

var storageAccountName = 'stwake${resourceToken}'
var appServicePlanName = 'asp-wake-${resourceToken}'

module functionApp '../core/host/function-app.bicep' = {
  name: 'wake-function-app'
  params: {
    name: name
    location: location
    tags: tags
    storageAccountName: storageAccountName
    appServicePlanName: appServicePlanName
    postgresServerResourceId: postgresServerResourceId
    logAnalyticsWorkspaceId: logAnalyticsWorkspaceId
  }
}

output uri string = functionApp.outputs.uri
output name string = functionApp.outputs.name
output principalId string = functionApp.outputs.principalId
