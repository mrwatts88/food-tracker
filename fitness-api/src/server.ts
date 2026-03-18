import { serve } from '@hono/node-server'

import { loadConfig } from './config'
import { app } from './app'

const config = loadConfig()

serve(
  {
    fetch: app.fetch,
    port: config.port
  },
  info => {
    console.log(`fitness-api listening on http://localhost:${info.port}`)
  }
)
