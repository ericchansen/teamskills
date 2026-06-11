@description('Name of the virtual network')
param name string

@description('Location for the virtual network')
param location string = resourceGroup().location

@description('Tags for the virtual network')
param tags object = {}

@description('Address space for the VNet')
param addressPrefix string = '10.0.0.0/16'

@description('Subnet for Container Apps infrastructure')
param containerAppsSubnetName string = 'snet-container-apps'

@description('Address prefix for Container Apps subnet (minimum /23 required)')
param containerAppsSubnetPrefix string = '10.0.0.0/23'

@description('Subnet for private endpoints')
param privateEndpointsSubnetName string = 'snet-private-endpoints'

@description('Address prefix for private endpoints subnet')
param privateEndpointsSubnetPrefix string = '10.0.2.0/24'

resource vnet 'Microsoft.Network/virtualNetworks@2023-09-01' = {
  name: name
  location: location
  tags: tags
  properties: {
    addressSpace: {
      addressPrefixes: [addressPrefix]
    }
    subnets: [
      {
        name: containerAppsSubnetName
        properties: {
          addressPrefix: containerAppsSubnetPrefix
          delegations: []
        }
      }
      {
        name: privateEndpointsSubnetName
        properties: {
          addressPrefix: privateEndpointsSubnetPrefix
          privateEndpointNetworkPolicies: 'Disabled'
        }
      }
    ]
  }
}

output id string = vnet.id
output name string = vnet.name
output containerAppsSubnetId string = vnet.properties.subnets[0].id
output privateEndpointsSubnetId string = vnet.properties.subnets[1].id
