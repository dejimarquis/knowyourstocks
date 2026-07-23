import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from '@azure/functions'
import { fetchSecFundamentals } from '../lib/sec'

const handler = async (
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> => {
  const symbol = request.params.symbol

  if (!symbol) {
    return {
      status: 400,
      jsonBody: { error: 'A ticker symbol is required.' },
    }
  }

  try {
    const fundamentals = await fetchSecFundamentals(symbol)
    context.log(`Loaded SEC fundamentals for ${fundamentals.symbol}.`)
    return {
      status: 200,
      headers: {
        'Cache-Control': 'public, max-age=3600',
      },
      jsonBody: fundamentals,
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'SEC fundamentals failed.'
    context.error(`SEC fundamentals failed for ${symbol}: ${message}`)
    return {
      status: message.includes('does not have') ? 404 : 502,
      jsonBody: { error: message },
    }
  }
}

app.http('secFundamentals', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'sec-fundamentals/{symbol}',
  handler,
})
