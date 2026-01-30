@description('Name of the PostgreSQL server')
param name string

@description('Location for the PostgreSQL server')
param location string = resourceGroup().location

@description('Tags for the PostgreSQL server')
param tags object = {}

@description('Administrator login name')
param administratorLogin string

@description('Administrator login password')
@secure()
param administratorLoginPassword string

@description('Name of the database to create')
param databaseName string

@description('SKU configuration')
param sku object = {
  name: 'Standard_B1ms'
  tier: 'Burstable'
}

@description('Storage configuration')
param storage object = {
  storageSizeGB: 32
}

@description('PostgreSQL version')
param version string = '16'

resource postgresServer 'Microsoft.DBforPostgreSQL/flexibleServers@2023-06-01-preview' = {
  name: name
  location: location
  tags: tags
  sku: sku
  properties: {
    administratorLogin: administratorLogin
    administratorLoginPassword: administratorLoginPassword
    storage: storage
    version: version
    highAvailability: {
      mode: 'Disabled'
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
  }
}

// Firewall rule to allow Azure services
resource allowAzureServices 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2023-06-01-preview' = {
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
  name: databaseName
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

output id string = postgresServer.id
output name string = postgresServer.name
output fqdn string = postgresServer.properties.fullyQualifiedDomainName
