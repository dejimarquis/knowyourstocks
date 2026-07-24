targetScope = 'resourceGroup'

param environmentName string
param location string = resourceGroup().location
param tags object = {}

var suffix = take(uniqueString(subscription().id, resourceGroup().id, environmentName), 18)
var name = 'st${suffix}'

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: name
  location: location
  tags: union(tags, {
    purpose: 'intelligence-quota'
  })
  kind: 'StorageV2'
  sku: {
    name: 'Standard_ZRS'
  }
  properties: {
    allowBlobPublicAccess: false
    allowSharedKeyAccess: true
    defaultToOAuthAuthentication: false
    minimumTlsVersion: 'TLS1_2'
    publicNetworkAccess: 'Enabled'
    supportsHttpsTrafficOnly: true
  }
}

output name string = storage.name
