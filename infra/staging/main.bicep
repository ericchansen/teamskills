// PR Staging Environment - Minimal infrastructure for pull request previews
// All PR environments deploy into a shared resource group (rg-teamskills-staging)
// with per-PR resource naming to avoid subscription-level permissions.

targetScope = 'resourceGroup'

@description('PR number for unique resource naming')
param prNumber string

@description('Location for all resources')
param location string = resourceGroup().location

@description('PostgreSQL administrator password')
@secure()
param postgresPassword string

@description('Container image tag (typically git SHA)')
param imageTag string = 'latest'

@description('Existing Container Registry name (from production)')
param acrName string

@description('Existing Container Registry resource group')
param acrResourceGroup string = 'rg-teamskills-prod'

var resourceToken = 'pr${prNumber}'
var tags = { 
  'pr-staging': 'true'
  'pr-number': prNumber
}

// Reference existing ACR from production (to avoid duplicate registry costs)
resource containerRegistry 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: acrName
  scope: resourceGroup(acrResourceGroup)
}

// Shared Log Analytics Workspace for all PR environments
resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: 'log-staging-${resourceToken}'
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

// Per-PR Container Apps Environment
resource containerAppsEnvironment 'Microsoft.App/managedEnvironments@2023-05-01' = {
  name: 'cae-staging-${resourceToken}'
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

// PostgreSQL Flexible Server (cheapest tier for staging)
resource postgresServer 'Microsoft.DBforPostgreSQL/flexibleServers@2023-06-01-preview' = {
  name: 'psql-staging-${resourceToken}'
  location: location
  tags: tags
  sku: {
    name: 'Standard_B1ms'
    tier: 'Burstable'
  }
  properties: {
    administratorLogin: 'pgadmin'
    administratorLoginPassword: postgresPassword
    storage: {
      storageSizeGB: 32
    }
    version: '16'
    highAvailability: {
      mode: 'Disabled'
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
  }
}

// Allow Azure services to connect to PostgreSQL
resource postgresFirewall 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2023-06-01-preview' = {
  parent: postgresServer
  name: 'AllowAllAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

// Database
resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-06-01-preview' = {
  parent: postgresServer
  name: 'teamskills'
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

// Backend Container App
resource backend 'Microsoft.App/containerApps@2023-05-01' = {
  name: 'ca-backend-${resourceToken}'
  location: location
  tags: tags
  properties: {
    managedEnvironmentId: containerAppsEnvironment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 3001
        transport: 'http'
        corsPolicy: {
          allowedOrigins: ['https://ca-frontend-${resourceToken}.${containerAppsEnvironment.properties.defaultDomain}']
          allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
          allowedHeaders: ['Content-Type', 'Authorization']
        }
      }
      registries: [
        {
          server: containerRegistry.properties.loginServer
          username: containerRegistry.listCredentials().username
          passwordSecretRef: 'registry-password'
        }
      ]
      secrets: [
        {
          name: 'registry-password'
          value: containerRegistry.listCredentials().passwords[0].value
        }
        {
          name: 'postgres-password'
          value: postgresPassword
        }
        {
          name: 'init-secret'
          value: 'staging-init-${prNumber}'
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'backend'
          image: '${containerRegistry.properties.loginServer}/backend:${imageTag}'
          env: [
            { name: 'NODE_ENV', value: 'production' }
            { name: 'PORT', value: '3001' }
            { name: 'FRONTEND_URL', value: 'https://ca-frontend-${resourceToken}.${containerAppsEnvironment.properties.defaultDomain}' }
            { name: 'PGHOST', value: postgresServer.properties.fullyQualifiedDomainName }
            { name: 'PGPORT', value: '5432' }
            { name: 'PGUSER', value: 'pgadmin' }
            { name: 'PGPASSWORD', secretRef: 'postgres-password' }
            { name: 'PGDATABASE', value: 'teamskills' }
            { name: 'PGSSLMODE', value: 'require' }
            { name: 'INIT_SECRET', secretRef: 'init-secret' }
          ]
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 1
      }
    }
  }
  dependsOn: [database]
}

// Frontend Container App
resource frontend 'Microsoft.App/containerApps@2023-05-01' = {
  name: 'ca-frontend-${resourceToken}'
  location: location
  tags: tags
  properties: {
    managedEnvironmentId: containerAppsEnvironment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 80
        transport: 'http'
      }
      registries: [
        {
          server: containerRegistry.properties.loginServer
          username: containerRegistry.listCredentials().username
          passwordSecretRef: 'registry-password'
        }
      ]
      secrets: [
        {
          name: 'registry-password'
          value: containerRegistry.listCredentials().passwords[0].value
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'frontend'
          image: '${containerRegistry.properties.loginServer}/frontend:${imageTag}'
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 1
      }
    }
  }
}

// Outputs for GitHub Actions
output frontendUrl string = 'https://${frontend.properties.configuration.ingress.fqdn}'
output backendUrl string = 'https://${backend.properties.configuration.ingress.fqdn}'
output initSecret string = 'staging-init-${prNumber}'
