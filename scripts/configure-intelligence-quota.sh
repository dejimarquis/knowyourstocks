#!/usr/bin/env bash
set -euo pipefail

: "${AZURE_RESOURCE_GROUP:?AZURE_RESOURCE_GROUP is required}"
: "${STATIC_WEB_APP_NAME:?STATIC_WEB_APP_NAME is required}"
: "${INTELLIGENCE_STORAGE_ACCOUNT_NAME:?INTELLIGENCE_STORAGE_ACCOUNT_NAME is required}"

connection_string="$(
  az storage account show-connection-string \
    --resource-group "$AZURE_RESOURCE_GROUP" \
    --name "$INTELLIGENCE_STORAGE_ACCOUNT_NAME" \
    --query connectionString \
    --output tsv
)"

az staticwebapp appsettings set \
  --name "$STATIC_WEB_APP_NAME" \
  --setting-names \
    "INTELLIGENCE_USAGE_STORAGE_CONNECTION_STRING=$connection_string" \
    "FOUNDRY_MAX_MONTHLY_CALLS=1000" \
  >/dev/null

echo "Configured durable intelligence quota settings."
