import { HttpResponseInit, InvocationContext } from '@azure/functions'
import { HeadersInit } from 'undici'

export const createJsonResponse = (body: unknown, status: number = 200, headers?: HeadersInit): HttpResponseInit => {
  const finalHeaders: HeadersInit = headers ?? {}
  if (!(finalHeaders as Record<string, string>)['Content-Type']) {
    ;(finalHeaders as Record<string, string>)['Content-Type'] = 'application/json'
  }

  return {
    body: body === undefined || body === null ? undefined : JSON.stringify(body),
    status,
    headers: finalHeaders,
  }
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'off'

export const logMessage = (msg: string, logLevel: LogLevel, context: InvocationContext) => {
  switch (logLevel) {
    case 'debug':
      context.debug(msg)
      break
    case 'info':
      context.info(msg)
      break
    case 'warn':
      context.warn(msg)
      break
    case 'error':
      context.error(msg)
      break
    case 'off':
      break
  }
}
