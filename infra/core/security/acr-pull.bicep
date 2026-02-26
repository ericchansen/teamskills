@description('Name of the Container Registry')
param containerRegistryName string

@description('Principal ID to grant AcrPull role')
param principalId string

resource containerRegistry 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: containerRegistryName
}

// AcrPull role: 7f951dda-4ed3-4680-a7ca-43fe172d538d
resource acrPullRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(containerRegistry.id, principalId, '7f951dda-4ed3-4680-a7ca-43fe172d538d')
  scope: containerRegistry
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
    principalId: principalId
    principalType: 'ServicePrincipal'
  }
}
