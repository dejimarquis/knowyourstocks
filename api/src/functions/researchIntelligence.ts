import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from '@azure/functions'
import { intelligenceErrorResponse } from '../lib/groundedIntelligence'
import {
  generateResearchIntelligence,
  parseResearchIntelligenceRequest,
} from '../lib/researchIntelligence'

const handler = async (
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> => {
  try {
    const body = parseResearchIntelligenceRequest(await request.json())
    const clientId =
      request.headers.get('x-intelligence-client') ?? 'anonymous-browser'
    const intelligence = await generateResearchIntelligence(body, clientId)

    context.log(`Generated research intelligence for ${body.symbol}.`)
    return {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
      jsonBody: intelligence,
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Research intelligence failed.'
    context.error(`Research intelligence failed: ${message}`)
    return intelligenceErrorResponse(error)
  }
}

app.http('researchIntelligence', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'research-intelligence',
  handler,
})
