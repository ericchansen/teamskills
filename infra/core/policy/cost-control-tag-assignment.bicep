@description('Name prefix for policy resources')
param namePrefix string

@description('Policy definition ID (subscription-scoped)')
param policyDefinitionId string

@description('Tag name being enforced')
param tagName string

@description('Tag value being enforced')
param tagValue string

@description('Location for the managed identity')
param location string

// Policy assignment at resource group scope
resource policyAssignment 'Microsoft.Authorization/policyAssignments@2022-06-01' = {
  name: '${namePrefix}-costcontrol-assign'
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    policyDefinitionId: policyDefinitionId
    displayName: 'Enforce ${tagName}=${tagValue} on PostgreSQL'
    description: 'Prevents MCAPS cost-control automation from stopping PostgreSQL by ensuring the ${tagName} tag is always present.'
    enforcementMode: 'Default'
  }
}

// Role assignment so the policy managed identity can modify tags
resource roleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(policyAssignment.id, 'tag-contributor')
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4a9ae827-6dc8-4573-8ac7-8239d42aa03f')
    principalId: policyAssignment.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

output policyAssignmentId string = policyAssignment.id
