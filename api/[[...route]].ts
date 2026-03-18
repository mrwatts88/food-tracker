import { handle } from 'hono/vercel'

type Handler = (request: Request, context?: unknown) => Response | Promise<Response>

let cachedHandler: Handler | undefined

async function getHandler() {
  if (!cachedHandler) {
    const { app } = await import('../fitness-api/src/app')
    cachedHandler = handle(app)
  }

  return cachedHandler
}

async function handler(request: Request, context?: unknown) {
  return (await getHandler())(request, context)
}

export const GET = handler
export const POST = handler
export const PUT = handler
export const PATCH = handler
export const DELETE = handler
export const OPTIONS = handler
