import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from '@azure/functions'

const handler = async (
  _request: HttpRequest,
  _context: InvocationContext,
): Promise<HttpResponseInit> => ({
  status: 200,
  jsonBody: { status: 'healthy' },
})

app.http('health', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'health',
  handler,
})
