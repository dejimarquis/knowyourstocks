import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from '@azure/functions'
import {
  generateWatchlistIntelligence,
  parseIntelligenceRequest,
} from '../lib/watchlistIntelligence'
import { intelligenceErrorStatus } from '../lib/groundedIntelligence'

const handler = async (
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> => {
  try {
    const body = parseIntelligenceRequest(await request.json())
    const clientId =
      request.headers.get('x-intelligence-client') ??
      request.headers.get('x-watchlist-client') ??
      'anonymous-browser'
    const intelligence = await generateWatchlistIntelligence(body, clientId)

    context.log('Generated watchlist intelligence.')
    return {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
      },
      jsonBody: intelligence,
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Watchlist intelligence failed.'
    const status = intelligenceErrorStatus(error)
    context.error(`Watchlist intelligence failed: ${message}`)
    return {
      status,
      jsonBody: { error: message },
    }
  }
}

app.http('watchlistIntelligence', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'watchlist-intelligence',
  handler,
})
