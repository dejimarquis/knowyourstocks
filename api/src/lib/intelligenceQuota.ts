import { createHmac } from 'node:crypto'
import { TableClient, TableTransaction } from '@azure/data-tables'

type UsageEntity = {
  count: number
}

const tableName = 'IntelligenceUsage'
const maxReservationAttempts = 6
let tableClient: TableClient | null = null
let tableReady: Promise<void> | null = null

class QuotaExceededError extends Error {}

const getTableClient = () => {
  const connectionString =
    process.env.INTELLIGENCE_USAGE_STORAGE_CONNECTION_STRING

  if (!connectionString) {
    return null
  }

  tableClient ??= TableClient.fromConnectionString(connectionString, tableName)
  tableReady ??= tableClient.createTable()
  return tableClient
}

const statusCode = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  'statusCode' in error &&
  typeof error.statusCode === 'number'
    ? error.statusCode
    : null

const loadUsageEntity = async (
  client: TableClient,
  partitionKey: string,
  rowKey: string,
) => {
  try {
    return await client.getEntity<UsageEntity>(partitionKey, rowKey)
  } catch (error) {
    if (statusCode(error) === 404) {
      return null
    }
    throw error
  }
}

const addReservation = (
  transaction: TableTransaction,
  partitionKey: string,
  rowKey: string,
  entity: Awaited<ReturnType<typeof loadUsageEntity>>,
) => {
  const next = {
    partitionKey,
    rowKey,
    count: (entity?.count ?? 0) + 1,
  }

  if (entity) {
    transaction.updateEntity(next, 'Merge', { etag: entity.etag })
  } else {
    transaction.createEntity(next)
  }
}

export const reserveIntelligenceQuota = async (
  clientId: string,
  maxMonthlyCalls: number,
  maxClientDailyCalls: number,
) => {
  const client = getTableClient()

  if (!client) {
    if (process.env.WEBSITE_SITE_NAME) {
      throw new Error('Durable intelligence quota is not configured.')
    }
    return
  }

  await tableReady
  const now = new Date()
  const month = now.toISOString().slice(0, 7)
  const day = now.toISOString().slice(0, 10)
  const connectionString =
    process.env.INTELLIGENCE_USAGE_STORAGE_CONNECTION_STRING ?? ''
  const clientHash = createHmac('sha256', connectionString)
    .update(`${day}:${clientId}`)
    .digest('hex')
    .slice(0, 32)
  const partitionKey = `quota-${month}`
  const clientRowKey = `client-${day}-${clientHash}`

  for (let attempt = 0; attempt < maxReservationAttempts; attempt += 1) {
    const [globalEntity, clientEntity] = await Promise.all([
      loadUsageEntity(client, partitionKey, 'global'),
      loadUsageEntity(client, partitionKey, clientRowKey),
    ])

    if ((globalEntity?.count ?? 0) >= maxMonthlyCalls) {
      throw new QuotaExceededError(
        'The monthly intelligence budget has been reached.',
      )
    }
    if ((clientEntity?.count ?? 0) >= maxClientDailyCalls) {
      throw new QuotaExceededError(
        'The daily intelligence limit for this browser was reached.',
      )
    }

    const transaction = new TableTransaction()
    addReservation(
      transaction,
      partitionKey,
      'global',
      globalEntity,
    )
    addReservation(
      transaction,
      partitionKey,
      clientRowKey,
      clientEntity,
    )

    try {
      await client.submitTransaction(transaction.actions)
      return
    } catch (error) {
      if (statusCode(error) === 409 || statusCode(error) === 412) {
        continue
      }
      throw error
    }
  }

  throw new Error('Could not reserve intelligence quota safely.')
}
