targetScope = 'subscription'

@description('Name prefix for policy resources')
param namePrefix string

@description('Resource group name for the policy assignment scope')
param resourceGroupName string

@description('Resource group location for the managed identity')
param location string

@description('Tag name to enforce')
param tagName string = 'CostControl'

@description('Tag value to enforce')
param tagValue string = 'Ignore'

@description('Resource type to target')
param resourceType string = 'Microsoft.DBforPostgreSQL/flexibleServers'

// Custom policy definition at subscription scope
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

// Deploy assignment and role assignment at resource group scope via nested module
module policyAssignmentModule 'cost-control-tag-assignment.bicep' = {
  name: '${namePrefix}-costcontrol-assign-deploy'
  scope: resourceGroup(resourceGroupName)
  params: {
    namePrefix: namePrefix
    policyDefinitionId: policyDefinition.id
    tagName: tagName
    tagValue: tagValue
    location: location
  }
}

output policyDefinitionId string = policyDefinition.id
output policyAssignmentId string = policyAssignmentModule.outputs.policyAssignmentId
