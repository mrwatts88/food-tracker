import { handle } from 'hono/vercel'

import { app } from '../fitness-api/src/app'

const handler = handle(app)

function buildAppRequest(request: Request) {
  const rewrittenUrl = new URL(request.url)
  const path = rewrittenUrl.searchParams.get('path')

  rewrittenUrl.searchParams.delete('path')
  rewrittenUrl.pathname = path ? `/api/${path}` : '/api'

  return new Request(rewrittenUrl.toString(), request)
}

function webHandler(request: Request) {
  return handler(buildAppRequest(request))
}

export const GET = webHandler
export const POST = webHandler
export const PUT = webHandler
export const PATCH = webHandler
export const DELETE = webHandler
export const OPTIONS = webHandler
