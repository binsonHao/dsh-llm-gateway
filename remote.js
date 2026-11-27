/**
 * Host-side declaration of the methods the Settings page may call.
 *
 * The page runs in the browser; these descriptors are what makes
 * `ctx.remote.llmGateway.status()` resolve back to this host service.
 */
export const PACKAGE = 'dsh-llm-gateway'
export const NAMESPACE = 'llmGateway'

const METHODS = ['status', 'start', 'stop', 'restart', 'reload', 'models']

function descriptor(method) {
  return {
    id: `${PACKAGE}#${NAMESPACE}/${method}`,
    service: NAMESPACE,
    namespace: NAMESPACE,
    method,
    invocation: { kind: 'direct' },
    parameters: [{
      name: 'request',
      wire: 'request',
      source: 'json',
      codec: { mode: 'src-json' },
    }],
    result: { mode: 'src-json' },
  }
}

export const DESCRIPTORS = Object.freeze(METHODS.map(descriptor))

export function registerLlmGatewayRemote(ctx) {
  return ctx.typert.register({
    package: PACKAGE,
    face: 'host',
    schemas: [],
    model: {
      services: [{
        key: NAMESPACE,
        exportName: 'LlmGatewayService',
        description: 'Local LLM relay: process lifecycle, channel health, and reload, shared with the agent tool.',
        members: [
          { kind: 'method', name: 'status', signature: 'status(request: LlmGatewayRequest): LlmGatewayStatus' },
          { kind: 'method', name: 'start', signature: 'start(request: LlmGatewayRequest): Promise<LlmGatewayStatus>' },
          { kind: 'method', name: 'stop', signature: 'stop(request: LlmGatewayRequest): Promise<LlmGatewayStatus>' },
          { kind: 'method', name: 'restart', signature: 'restart(request: LlmGatewayRequest): Promise<LlmGatewayStatus>' },
          { kind: 'method', name: 'reload', signature: 'reload(request: LlmGatewayRequest): Promise<LlmGatewayReloadResult>' },
          { kind: 'method', name: 'models', signature: 'models(request: LlmGatewayRequest): string[]' },
        ],
        types: [
          { name: 'LlmGatewayRequest', declaration: 'export interface LlmGatewayRequest {}' },
          {
            name: 'LlmGatewayChannelRow',
            declaration: 'export interface LlmGatewayChannelRow { id: string; site: string; models: number; healthy: boolean; ok: number; fail: number; cooldown: number; latencyMs: number; lastError: string }',
          },
          {
            name: 'LlmGatewayStatus',
            declaration: 'export interface LlmGatewayStatus { running: boolean; base: string; dir: string; detail?: string; channels: LlmGatewayChannelRow[]; healthy: number; verified: number; modelCount: number; models: string[] }',
          },
          {
            name: 'LlmGatewayReloadResult',
            declaration: 'export interface LlmGatewayReloadResult { channels: number; models: number; status: LlmGatewayStatus }',
          },
        ],
      }],
      events: [],
      objects: [],
    },
    invocations: DESCRIPTORS,
  })
}
