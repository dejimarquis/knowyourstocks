import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from '@azure/functions'
import { intelligenceErrorResponse } from '../lib/groundedIntelligence'
import {
  generateRecommendationIntelligence,
  parseRecommendationIntelligenceRequest,
} from '../lib/recommendationIntelligence'

const handler = async (
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> => {
  try {
    const body = parseRecommendationIntelligenceRequest(await request.json())
    const clientId =
      request.headers.get('x-intelligence-client') ?? 'anonymous-browser'
    const intelligence = await generateRecommendationIntelligence(
      body,
      clientId,
    )

    context.log('Generated recommendation intelligence.')
    return {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
      jsonBody: intelligence,
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Recommendation intelligence failed.'
    context.error(`Recommendation intelligence failed: ${message}`)
    return intelligenceErrorResponse(error)
  }
}

app.http('recommendationIntelligence', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'recommendation-intelligence',
  handler,
})
