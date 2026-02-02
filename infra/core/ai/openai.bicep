@description('Name of the Azure OpenAI resource')
param name string

@description('Location for the resource')
param location string = resourceGroup().location

@description('Tags for the resource')
param tags object = {}

@description('SKU for the Azure OpenAI resource')
param sku object = {
  name: 'S0'
}

@description('Model deployments for the Azure OpenAI resource')
param deployments array = []

resource openai 'Microsoft.CognitiveServices/accounts@2024-10-01' = {
  name: name
  location: location
  tags: tags
  kind: 'OpenAI'
  sku: sku
  properties: {
    customSubDomainName: name
    publicNetworkAccess: 'Enabled'
  }
}

@batchSize(1)
resource deployment 'Microsoft.CognitiveServices/accounts/deployments@2024-10-01' = [for deployment in deployments: {
  parent: openai
  name: deployment.name
  sku: {
    name: 'Standard'
    capacity: deployment.?capacity ?? 10
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: deployment.model
      version: deployment.?version ?? null
    }
  }
}]

output id string = openai.id
output name string = openai.name
output endpoint string = openai.properties.endpoint
