/**
 * Parallel health probe: for each (channel, model) reachable pair, time a real
 * small completion and record status + latency. Used by `llm_gateway probe` and
 * to build the speed/availability ranking the settings page shows.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHealth, loadChannels } from './gateway.mjs'

const UA = 'dsh-llm-gateway/1.0 (+https://github.com/binsonHao/dsh-llm-gateway)'

/**
 * One timed request. `kind`: 'text' | 'image'.
 * Returns { ok, status, ms, error } — never throws.
 */
export async function probeOnce({ base, key, model, timeoutMs = 30_000, kind = 'text' }) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const started = Date.now()
  const body = kind === 'image'
    ? {
        model,
        max_tokens: 16,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: 'What color is this square? Answer with one word.' },
            {
              type: 'image_url',
              // 64x64 纯色 PNG：有些上游要求最小像素数（8x8 会被拒），这个够用且只有 136 字节
              image_url: { url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAT0lEQVR42u3PQQkAAAgEsItgZKMZzQi+hcEKLNXzWgQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQELgvgrgE8LHq6tAAAAABJRU5ErkJggg==' },
            },
          ],
        }],
      }
    : {
        model,
        max_tokens: 16,
        messages: [{ role: 'user', content: 'ping' }],
      }

  try {
    const response = await fetch(`${base}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
        'user-agent': UA,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const ms = Date.now() - started
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      return { ok: false, status: response.status, ms, error: text.slice(0, 200) }
    }
    const text = await response.text()
    // 200 也可能是错误信封
    try {
      const payload = JSON.parse(text)
      if (payload?.error) return { ok: false, status: 200, ms, error: String(payload.error.message ?? '').slice(0, 200) }
      const choice = payload?.choices?.[0]
      if (!choice) return { ok: false, status: 200, ms, error: 'no choices in 200 response' }
      // 推理模型常把预算全花在 reasoning 上、content 为 null——那是模型在工作，不是通道坏了
      const message = choice.message ?? choice.delta ?? {}
      const produced = message.content || message.reasoning || message.reasoning_content || choice.finish_reason
      if (!produced) return { ok: false, status: 200, ms, error: 'empty completion (no content, no reasoning)' }
      return { ok: true, status: 200, ms }
    } catch {
      return { ok: false, status: 200, ms, error: 'non-JSON 200 body' }
    }
  } catch (error) {
    const ms = Date.now() - started
    const aborted = error?.name === 'AbortError'
    return { ok: false, status: aborted ? 504 : 502, ms, error: aborted ? `timeout ${timeoutMs}ms` : String(error?.message ?? error) }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Probe every channel once for one model. Runs with bounded concurrency so 23
 * channels finish in seconds rather than minutes.
 */
export async function probeModel({ dir, model, timeoutMs = 30_000, concurrency = 8, kind = 'text' }) {
  const channels = loadChannels(dir).filter(channel => channel.models.includes(model))
  const results = []
  let cursor = 0

  async function worker() {
    while (cursor < channels.length) {
      const channel = channels[cursor++]
      const result = await probeOnce({ base: channel.base, key: channel.key, model, timeoutMs, kind })
      results.push({ channel: channel.id, site: channel.site, base: channel.base, model, kind, ...result })
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, channels.length) }, worker))
  results.sort((a, b) => (a.ok === b.ok ? a.ms - b.ms : a.ok ? -1 : 1))
  return results
}

/** Merge probe results into the persistent health file so the UI keeps them. */
export function recordProbes(dir, results) {
  const health = createHealth(dir)
  for (const result of results) {
    if (result.ok) health.recordOk(result.channel, result.ms)
    else health.recordFail(result.channel, result.status, result.error)
  }
  health.persist()
  return health.snapshot()
}

/* --------------------------------------------------------------- 测速快照 */

const SNAPSHOT_FILE = 'probe.json'

/** 上次测速的结果，页面一打开就能显示，不必每次重测。 */
export function readProbeSnapshot(dir) {
  const file = join(dir, SNAPSHOT_FILE)
  if (!existsSync(file)) return null
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

export function writeProbeSnapshot(dir, snapshot) {
  try {
    writeFileSync(join(dir, SNAPSHOT_FILE), JSON.stringify(snapshot, null, 2), 'utf8')
  } catch {
    // 快照只是缓存
  }
}

/**
 * 测所有模型的全部通道：文本一次 + 图片一次。
 * 结果按 通道 × 模型 展开，并按延迟排序。
 */
export async function probeAll({ dir, timeoutMs = 30_000, concurrency = 6, onProgress }) {
  const channels = loadChannels(dir)
  const startedAt = new Date().toISOString()

  // 每个通道只挑一个代表模型：优先用它已验证过的那个（channels.json 的 tested），
  // 否则用列表第一个——否则会挑到该站并不真正供给的模型，误判成通道挂了。
  const jobs = channels.map(channel => ({
    channel,
    model: channel.tested && channel.models.includes(channel.tested)
      ? channel.tested
      : channel.models[0],
  }))

  let cursor = 0
  const rows = []
  async function worker() {
    while (cursor < jobs.length) {
      const job = jobs[cursor++]
      const text = await probeOnce({ base: job.channel.base, key: job.channel.key, model: job.model, timeoutMs, kind: 'text' })
      const image = text.ok
        ? await probeOnce({ base: job.channel.base, key: job.channel.key, model: job.model, timeoutMs, kind: 'image' })
        : { ok: false, ms: 0, status: 0, error: 'skipped' }
      rows.push({
        channel: job.channel.id,
        site: job.channel.site,
        base: job.channel.base,
        model: job.model,
        ok: text.ok,
        ms: text.ms,
        status: text.status,
        error: text.ok ? '' : String(text.error ?? '').slice(0, 200),
        image: image.ok,
        imageMs: image.ms,
        imageError: image.ok ? '' : String(image.error ?? '').slice(0, 120),
      })
      onProgress?.(rows.length, jobs.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker))

  rows.sort((a, b) => (a.ok === b.ok ? a.ms - b.ms : a.ok ? -1 : 1))
  const snapshot = {
    at: startedAt,
    finishedAt: new Date().toISOString(),
    total: rows.length,
    ok: rows.filter(r => r.ok).length,
    image: rows.filter(r => r.image).length,
    rows,
  }
  writeProbeSnapshot(dir, snapshot)
  recordProbes(dir, rows.map(row => ({ channel: row.channel, ok: row.ok, ms: row.ms, status: row.status, error: row.error })))
  return snapshot
}
