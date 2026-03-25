@description('Name prefix for alert rules')
param namePrefix string

@description('Location for resources')
param location string = resourceGroup().location

@description('Tags for resources')
param tags object = {}

@description('Resource ID of the Application Insights component')
param appInsightsId string

@description('Resource ID of the backend Container App')
param backendContainerAppId string

@description('Resource ID of the agent Container App')
param agentContainerAppId string

@description('Email address for alert notifications')
param alertEmailAddress string = ''

// Action Group for email notifications
resource actionGroup 'Microsoft.Insights/actionGroups@2023-01-01' = {
  name: '${namePrefix}-ag'
  location: 'global'
  tags: tags
  properties: {
    groupShortName: 'TeamSkills'
    enabled: true
    emailReceivers: !empty(alertEmailAddress) ? [
      {
        name: 'TeamSkillsAdmin'
        emailAddress: alertEmailAddress
        useCommonAlertSchema: true
      }
    ] : []
  }
}

// HTTP 5xx error rate > 5% over 5 minutes
resource http5xxAlert 'Microsoft.Insights/scheduledQueryRules@2023-03-15-preview' = {
  name: '${namePrefix}-http-5xx'
  location: location
  tags: tags
  properties: {
    displayName: 'HTTP 5xx Error Rate > 5%'
    description: 'Fires when more than 5% of requests return 5xx status codes over a 5-minute window.'
    severity: 1
    enabled: true
    evaluationFrequency: 'PT5M'
    scopes: [appInsightsId]
    windowSize: 'PT5M'
    criteria: {
      allOf: [
        {
          query: '''
            requests
            | where timestamp > ago(5m)
            | summarize total = count(), errors = countif(resultCode startswith "5")
            | extend errorRate = round(todouble(errors) / todouble(total) * 100, 2)
            | where errorRate > 5
          '''
          timeAggregation: 'Count'
          operator: 'GreaterThan'
          threshold: 0
          failingPeriods: {
            numberOfEvaluationPeriods: 1
            minFailingPeriodsToAlert: 1
          }
        }
      ]
    }
    actions: {
      actionGroups: [actionGroup.id]
    }
  }
}

// Response latency P95 > 2 seconds
resource latencyAlert 'Microsoft.Insights/scheduledQueryRules@2023-03-15-preview' = {
  name: '${namePrefix}-latency-p95'
  location: location
  tags: tags
  properties: {
    displayName: 'Response Latency P95 > 2s'
    description: 'Fires when P95 response time exceeds 2 seconds over a 5-minute window.'
    severity: 2
    enabled: true
    evaluationFrequency: 'PT5M'
    scopes: [appInsightsId]
    windowSize: 'PT5M'
    criteria: {
      allOf: [
        {
          query: '''
            requests
            | where timestamp > ago(5m)
            | summarize p95 = percentile(duration, 95)
            | where p95 > 2000
          '''
          timeAggregation: 'Count'
          operator: 'GreaterThan'
          threshold: 0
          failingPeriods: {
            numberOfEvaluationPeriods: 1
            minFailingPeriodsToAlert: 1
          }
        }
      ]
    }
    actions: {
      actionGroups: [actionGroup.id]
    }
  }
}

// Database connection failures
resource dbFailureAlert 'Microsoft.Insights/scheduledQueryRules@2023-03-15-preview' = {
  name: '${namePrefix}-db-failures'
  location: location
  tags: tags
  properties: {
    displayName: 'Database Connection Failures'
    description: 'Fires when database dependency calls fail repeatedly.'
    severity: 1
    enabled: true
    evaluationFrequency: 'PT5M'
    scopes: [appInsightsId]
    windowSize: 'PT5M'
    criteria: {
      allOf: [
        {
          query: '''
            dependencies
            | where timestamp > ago(5m)
            | where type == "PostgreSQL" or name contains "SELECT" or name contains "INSERT"
            | where success == false
            | summarize failureCount = count()
            | where failureCount > 5
          '''
          timeAggregation: 'Count'
          operator: 'GreaterThan'
          threshold: 0
          failingPeriods: {
            numberOfEvaluationPeriods: 1
            minFailingPeriodsToAlert: 1
          }
        }
      ]
    }
    actions: {
      actionGroups: [actionGroup.id]
    }
  }
}

// Health check failures (backend)
resource backendHealthAlert 'Microsoft.Insights/scheduledQueryRules@2023-03-15-preview' = {
  name: '${namePrefix}-backend-health'
  location: location
  tags: tags
  properties: {
    displayName: 'Backend Health Check Failures'
    description: 'Fires when the backend /health endpoint returns non-200 responses.'
    severity: 1
    enabled: true
    evaluationFrequency: 'PT5M'
    scopes: [appInsightsId]
    windowSize: 'PT5M'
    criteria: {
      allOf: [
        {
          query: '''
            requests
            | where timestamp > ago(5m)
            | where name == "GET /health" and cloud_RoleName contains "backend"
            | where resultCode != "200"
            | summarize failureCount = count()
            | where failureCount > 3
          '''
          timeAggregation: 'Count'
          operator: 'GreaterThan'
          threshold: 0
          failingPeriods: {
            numberOfEvaluationPeriods: 1
            minFailingPeriodsToAlert: 1
          }
        }
      ]
    }
    actions: {
      actionGroups: [actionGroup.id]
    }
  }
}

// Health check failures (agent)
resource agentHealthAlert 'Microsoft.Insights/scheduledQueryRules@2023-03-15-preview' = {
  name: '${namePrefix}-agent-health'
  location: location
  tags: tags
  properties: {
    displayName: 'Agent Health Check Failures'
    description: 'Fires when the agent /health endpoint returns non-200 responses.'
    severity: 1
    enabled: true
    evaluationFrequency: 'PT5M'
    scopes: [appInsightsId]
    windowSize: 'PT5M'
    criteria: {
      allOf: [
        {
          query: '''
            requests
            | where timestamp > ago(5m)
            | where name == "GET /health" and cloud_RoleName contains "agent"
            | where resultCode != "200"
            | summarize failureCount = count()
            | where failureCount > 3
          '''
          timeAggregation: 'Count'
          operator: 'GreaterThan'
          threshold: 0
          failingPeriods: {
            numberOfEvaluationPeriods: 1
            minFailingPeriodsToAlert: 1
          }
        }
      ]
    }
    actions: {
      actionGroups: [actionGroup.id]
    }
  }
}

// Container App restart count > 3 in 10 minutes (backend)
resource backendRestartAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: '${namePrefix}-backend-restarts'
  location: 'global'
  tags: tags
  properties: {
    description: 'Fires when backend container restarts more than 3 times in 10 minutes.'
    severity: 1
    enabled: true
    evaluationFrequency: 'PT5M'
    windowSize: 'PT10M'
    scopes: [backendContainerAppId]
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          name: 'RestartCount'
          metricName: 'RestartCount'
          metricNamespace: 'Microsoft.App/containerApps'
          operator: 'GreaterThan'
          threshold: 3
          timeAggregation: 'Total'
          criterionType: 'StaticThresholdCriterion'
        }
      ]
    }
    actions: [
      {
        actionGroupId: actionGroup.id
      }
    ]
  }
}

// Container App restart count > 3 in 10 minutes (agent)
resource agentRestartAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: '${namePrefix}-agent-restarts'
  location: 'global'
  tags: tags
  properties: {
    description: 'Fires when agent container restarts more than 3 times in 10 minutes.'
    severity: 1
    enabled: true
    evaluationFrequency: 'PT5M'
    windowSize: 'PT10M'
    scopes: [agentContainerAppId]
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          name: 'RestartCount'
          metricName: 'RestartCount'
          metricNamespace: 'Microsoft.App/containerApps'
          operator: 'GreaterThan'
          threshold: 3
          timeAggregation: 'Total'
          criterionType: 'StaticThresholdCriterion'
        }
      ]
    }
    actions: [
      {
        actionGroupId: actionGroup.id
      }
    ]
  }
}

// CPU > 80% sustained for 5 minutes (backend)
resource backendCpuAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: '${namePrefix}-backend-cpu'
  location: 'global'
  tags: tags
  properties: {
    description: 'Fires when backend CPU usage exceeds 80% sustained for 5 minutes.'
    severity: 2
    enabled: true
    evaluationFrequency: 'PT5M'
    windowSize: 'PT5M'
    scopes: [backendContainerAppId]
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          name: 'CpuUsage'
          metricName: 'UsageNanoCores'
          metricNamespace: 'Microsoft.App/containerApps'
          operator: 'GreaterThan'
          threshold: 400000000
          timeAggregation: 'Average'
          criterionType: 'StaticThresholdCriterion'
        }
      ]
    }
    actions: [
      {
        actionGroupId: actionGroup.id
      }
    ]
  }
}

// Memory > 80% sustained for 5 minutes (backend)
resource backendMemoryAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: '${namePrefix}-backend-memory'
  location: 'global'
  tags: tags
  properties: {
    description: 'Fires when backend memory usage exceeds 80% (>800Mi of 1Gi) sustained for 5 minutes.'
    severity: 2
    enabled: true
    evaluationFrequency: 'PT5M'
    windowSize: 'PT5M'
    scopes: [backendContainerAppId]
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          name: 'MemoryUsage'
          metricName: 'WorkingSetBytes'
          metricNamespace: 'Microsoft.App/containerApps'
          operator: 'GreaterThan'
          threshold: 858993459
          timeAggregation: 'Average'
          criterionType: 'StaticThresholdCriterion'
        }
      ]
    }
    actions: [
      {
        actionGroupId: actionGroup.id
      }
    ]
  }
}

output actionGroupId string = actionGroup.id
output actionGroupName string = actionGroup.name
