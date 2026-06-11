@description('Name prefix for policy resources')
param namePrefix string

@description('Tag name to enforce')
param tagName string = 'CostControl'

@description('Tag value to enforce')
param tagValue string = 'Ignore'

@description('Resource type to target')
param resourceType string = 'Microsoft.DBforPostgreSQL/flexibleServers'

// Custom policy definition: Modify effect to add/replace CostControl tag
resource policyDefinition 'Microsoft.Authorization/policyDefinitions@2021-06-01' = {
  name: '${namePrefix}-costcontrol-tag'
  properties: {
    displayName: 'Enforce ${tagName}=${tagValue} on ${resourceType}'
    description: 'Automatically adds or replaces the ${tagName} tag with value ${tagValue} on ${resourceType} resources to prevent MCAPS cost-control auto-stop.'
    policyType: 'Custom'
    mode: 'Indexed'
    metadata: {
      category: 'Tags'
    }
    parameters: {}
    policyRule: {
      if: {
        allOf: [
          {
            field: 'type'
            equals: resourceType
          }
          {
            field: 'tags[\'${tagName}\']'
            notEquals: tagValue
          }
        ]
      }
      then: {
        effect: 'modify'
        details: {
          roleDefinitionIds: [
            // Tag Contributor built-in role
            '/providers/Microsoft.Authorization/roleDefinitions/4a9ae827-6dc8-4573-8ac7-8239d42aa03f'
          ]
          operations: [
            {
              operation: 'addOrReplace'
              field: 'tags[\'${tagName}\']'
              value: tagValue
            }
          ]
        }
      }
    }
  }
}

// Policy assignment at current scope (resource group)
resource policyAssignment 'Microsoft.Authorization/policyAssignments@2022-06-01' = {
  name: '${namePrefix}-costcontrol-assign'
  location: resourceGroup().location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    policyDefinitionId: policyDefinition.id
    displayName: 'Enforce ${tagName}=${tagValue} on PostgreSQL'
    description: 'Prevents MCAPS cost-control automation from stopping PostgreSQL by ensuring the ${tagName} tag is always present.'
    enforcementMode: 'Default'
  }
}

// Role assignment so the policy's managed identity can modify tags
resource roleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(policyAssignment.id, 'tag-contributor')
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4a9ae827-6dc8-4573-8ac7-8239d42aa03f')
    principalId: policyAssignment.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

output policyDefinitionId string = policyDefinition.id
output policyAssignmentId string = policyAssignment.id
