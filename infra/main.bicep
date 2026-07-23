targetScope = 'subscription'

param environmentName string
param location string

var tags = {
  'azd-env-name': environmentName
}

resource resourceGroup 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: 'rg-${environmentName}'
  location: location
  tags: tags
}

module web './modules/static-web-app.bicep' = {
  name: 'web'
  scope: resourceGroup
  params: {
    environmentName: environmentName
    location: location
    tags: tags
  }
}

output AZURE_RESOURCE_GROUP string = resourceGroup.name
output WEB_URL string = web.outputs.webUrl
output STATIC_WEB_APP_NAME string = web.outputs.name
