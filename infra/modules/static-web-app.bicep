targetScope = 'resourceGroup'

param environmentName string
param location string = resourceGroup().location
param tags object = {}

var suffix = take(uniqueString(subscription().id, resourceGroup().id, environmentName), 6)
var name = 'swa-${environmentName}-${suffix}'

resource web 'Microsoft.Web/staticSites@2023-12-01' = {
  name: name
  location: location
  tags: union(tags, {
    'azd-service-name': 'web'
  })
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {
    allowConfigFileUpdates: true
    stagingEnvironmentPolicy: 'Enabled'
  }
}

output name string = web.name
output webUrl string = 'https://${web.properties.defaultHostname}'
