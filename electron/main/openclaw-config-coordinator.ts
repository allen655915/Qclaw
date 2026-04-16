import type { OpenClawInstallCandidate } from '../../src/shared/openclaw-phase1'
import type {
  OpenClawConfigPatchWriteRequest,
  OpenClawGuardedWriteResult,
} from '../../src/shared/openclaw-phase2'
import { collectChangedJsonPaths } from './openclaw-config-diff'
import { resolveGatewayApplyAction } from './gateway-apply-policy'
import { readConfig, runCli } from './cli'
import { restartGatewayLifecycle } from './gateway-lifecycle-controller'
import { guardedWriteConfig } from './openclaw-config-guard'

let configWriteQueue: Promise<void> = Promise.resolve()

export interface ApplyConfigPatchGuardedOptions {
  applyGatewayPolicy?: boolean
  strictRead?: boolean
  configPath?: string | null
  runtimeContext?: {
    configPath?: string | null
  } | null
}

function enqueueConfigWriteTask<T>(task: () => Promise<T>): Promise<T> {
  const runTask = configWriteQueue.then(task, task)
  configWriteQueue = runTask.then(
    () => undefined,
    () => undefined
  )
  return runTask
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function cloneJsonValue<T>(value: T): T {
  if (value === undefined) return value
  return JSON.parse(JSON.stringify(value)) as T
}

function normalizeIdentityText(value: unknown): string {
  return String(value || '').trim().toLowerCase()
}

function normalizeConfig(config: Record<string, any> | null | undefined): Record<string, any> {
  if (!isPlainObject(config)) return {}
  return cloneJsonValue(config)
}

function isDeepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true

  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return false
    for (let index = 0; index < left.length; index += 1) {
      if (!isDeepEqual(left[index], right[index])) return false
    }
    return true
  }

  if (isPlainObject(left) && isPlainObject(right)) {
    const leftKeys = Object.keys(left)
    const rightKeys = Object.keys(right)
    if (leftKeys.length !== rightKeys.length) return false
    for (const key of leftKeys) {
      if (!Object.prototype.hasOwnProperty.call(right, key)) return false
      if (!isDeepEqual(left[key], right[key])) return false
    }
    return true
  }

  return false
}

function isScalarJsonValue(value: unknown): value is string | number | boolean | null {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value)
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(',')}]`
  }

  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort((left, right) => left.localeCompare(right))
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
      .join(',')}}`
  }

  return JSON.stringify(value)
}

function canMergeScalarArrayAtPath(currentPath: string): boolean {
  return (
    currentPath === '$.plugins.allow'
    || currentPath.endsWith('.allowFrom')
    || currentPath.endsWith('.groupAllowFrom')
  )
}

function rebaseScalarArray(
  base: unknown[],
  desired: unknown[],
  latest: unknown[],
): unknown[] | null {
  if (![base, desired, latest].every((value) => value.every((item) => isScalarJsonValue(item)))) {
    return null
  }

  const desiredKeys = new Set(desired.map((item) => stableSerialize(item)))
  const baseKeys = new Set(base.map((item) => stableSerialize(item)))
  const additions = desired.filter((item) => !baseKeys.has(stableSerialize(item)))
  const removals = new Set(
    base
      .filter((item) => !desiredKeys.has(stableSerialize(item)))
      .map((item) => stableSerialize(item))
  )

  const result: unknown[] = []
  const seen = new Set<string>()
  for (const item of latest) {
    const key = stableSerialize(item)
    if (removals.has(key) || seen.has(key)) continue
    result.push(cloneJsonValue(item))
    seen.add(key)
  }

  for (const item of additions) {
    const key = stableSerialize(item)
    if (seen.has(key)) continue
    result.push(cloneJsonValue(item))
    seen.add(key)
  }

  return result
}

function getObjectArrayIdentity(currentPath: string, item: unknown): string | null {
  if (!isPlainObject(item)) return null

  const normalizedId = normalizeIdentityText(item.id)
  if (normalizedId) return `id:${normalizedId}`

  if (currentPath === '$.bindings') {
    const agentId = normalizeIdentityText(item.agentId)
    const matchKey = isPlainObject(item.match) ? stableSerialize(item.match) : ''
    if (agentId || matchKey) {
      return `binding:${agentId}:${matchKey}`
    }
  }

  return null
}

function buildObjectArrayMap(
  currentPath: string,
  values: unknown[]
): Map<string, unknown> | null {
  const result = new Map<string, unknown>()
  for (const item of values) {
    const identity = getObjectArrayIdentity(currentPath, item)
    if (!identity || result.has(identity)) return null
    result.set(identity, item)
  }
  return result
}

function rebaseObjectArray(
  base: unknown[],
  desired: unknown[],
  latest: unknown[],
  currentPath: string
): unknown[] | null {
  const [baseMap, desiredMap, latestMap] = [
    buildObjectArrayMap(currentPath, base),
    buildObjectArrayMap(currentPath, desired),
    buildObjectArrayMap(currentPath, latest),
  ]

  if (!baseMap || !desiredMap || !latestMap) {
    return null
  }

  const resultIds: string[] = []
  const result = new Map<string, unknown>()

  for (const [identity, latestItem] of latestMap.entries()) {
    const hasBase = baseMap.has(identity)
    const hasDesired = desiredMap.has(identity)

    if (!hasDesired && hasBase) {
      continue
    }

    if (!hasDesired) {
      result.set(identity, cloneJsonValue(latestItem))
      resultIds.push(identity)
      continue
    }

    const desiredItem = desiredMap.get(identity)
    if (!hasBase) {
      result.set(
        identity,
        rebaseConfigValue({}, desiredItem, latestItem, `${currentPath}[${identity}]`)
      )
      resultIds.push(identity)
      continue
    }

    const baseItem = baseMap.get(identity)
    result.set(
      identity,
      isDeepEqual(baseItem, desiredItem)
        ? cloneJsonValue(latestItem)
        : rebaseConfigValue(baseItem, desiredItem, latestItem, `${currentPath}[${identity}]`)
    )
    resultIds.push(identity)
  }

  for (const [identity, desiredItem] of desiredMap.entries()) {
    if (result.has(identity)) continue

    if (!baseMap.has(identity)) {
      result.set(identity, cloneJsonValue(desiredItem))
      resultIds.push(identity)
      continue
    }

    const baseItem = baseMap.get(identity)
    if (isDeepEqual(baseItem, desiredItem)) continue

    result.set(identity, cloneJsonValue(desiredItem))
    resultIds.push(identity)
  }

  return resultIds.map((identity) => result.get(identity))
}

/**
 * Rebase renderer-side config edits (before -> after) onto the latest config snapshot.
 * Unchanged fields keep latest values to reduce concurrent overwrite risk.
 */
function rebaseConfigValue(base: unknown, desired: unknown, latest: unknown, currentPath = '$'): unknown {
  if (isDeepEqual(base, desired)) {
    return cloneJsonValue(latest)
  }

  if (Array.isArray(base) && Array.isArray(desired)) {
    const latestArray = Array.isArray(latest) ? latest : []

    if (canMergeScalarArrayAtPath(currentPath)) {
      const mergedScalarArray = rebaseScalarArray(base, desired, latestArray)
      if (mergedScalarArray) return mergedScalarArray
    }

    const mergedObjectArray = rebaseObjectArray(base, desired, latestArray, currentPath)
    if (mergedObjectArray) return mergedObjectArray

    return cloneJsonValue(desired)
  }

  if (isPlainObject(base) && isPlainObject(desired)) {
    const latestObject = isPlainObject(latest) ? cloneJsonValue(latest) : {}
    const result: Record<string, any> = { ...latestObject }
    const keys = new Set([...Object.keys(base), ...Object.keys(desired)])

    for (const key of keys) {
      const baseHas = Object.prototype.hasOwnProperty.call(base, key)
      const desiredHas = Object.prototype.hasOwnProperty.call(desired, key)

      if (!desiredHas) {
        if (baseHas) {
          delete result[key]
        }
        continue
      }

      if (!baseHas) {
        result[key] = cloneJsonValue(desired[key])
        continue
      }

      const baseValue = base[key]
      const desiredValue = desired[key]
      if (isDeepEqual(baseValue, desiredValue)) {
        continue
      }

      if (
        (isPlainObject(baseValue) && isPlainObject(desiredValue))
        || (Array.isArray(baseValue) && Array.isArray(desiredValue))
      ) {
        const latestValue = Object.prototype.hasOwnProperty.call(result, key) ? result[key] : undefined
        const nextPath = currentPath === '$' ? `$.${key}` : `${currentPath}.${key}`
        result[key] = rebaseConfigValue(baseValue, desiredValue, latestValue, nextPath)
        continue
      }

      result[key] = cloneJsonValue(desiredValue)
    }

    return result
  }

  return cloneJsonValue(desired)
}

function buildNoopResult(): OpenClawGuardedWriteResult {
  return {
    ok: true,
    blocked: false,
    wrote: false,
    target: 'config',
    snapshotCreated: false,
    snapshot: null,
    changedJsonPaths: [],
    ownershipSummary: null,
    message: '配置没有发生变化，无需写入。',
  }
}

function appendMessage(baseMessage: string | undefined, extraMessage: string): string {
  const normalizedBase = String(baseMessage || '').trim()
  if (!normalizedBase) return extraMessage
  return `${normalizedBase} ${extraMessage}`
}

function normalizeOptionalPath(value: string | null | undefined): string {
  return String(value || '').trim()
}

function buildStrictReadFailureResult(message: string): OpenClawGuardedWriteResult {
  return {
    ok: false,
    blocked: true,
    wrote: false,
    target: 'config',
    snapshotCreated: false,
    snapshot: null,
    changedJsonPaths: [],
    ownershipSummary: null,
    message,
    errorCode: 'config_read_failed',
  }
}

async function applyGatewayDecision(action: 'none' | 'hot-reload' | 'restart'): Promise<{
  ok: boolean
  mode: 'none' | 'hot-reload' | 'restart'
  note?: string
}> {
  if (action === 'none') {
    return {
      ok: true,
      mode: 'none',
    }
  }

  if (action === 'restart') {
    const restartResult = await restartGatewayLifecycle('config-coordinator-policy-restart')
    return {
      ok: Boolean(restartResult?.ok),
      mode: 'restart',
      note: restartResult?.stderr || restartResult?.stdout || '',
    }
  }

  const hotReloadResult = await runCli(['secrets', 'reload'], undefined, 'config-write')
  if (hotReloadResult.ok) {
    return {
      ok: true,
      mode: 'hot-reload',
    }
  }

  const restartResult = await restartGatewayLifecycle('config-coordinator-hot-reload-fallback')
  if (restartResult.ok) {
    return {
      ok: true,
      mode: 'restart',
      note: 'hot-reload failed, fallback to restart',
    }
  }

  return {
    ok: false,
    mode: 'restart',
    note:
      restartResult.stderr ||
      hotReloadResult.stderr ||
      hotReloadResult.stdout ||
      'gateway apply action failed',
  }
}

export async function applyConfigPatchGuarded(
  request: OpenClawConfigPatchWriteRequest,
  preferredCandidate?: OpenClawInstallCandidate | null,
  options: ApplyConfigPatchGuardedOptions = {}
): Promise<OpenClawGuardedWriteResult> {
  return enqueueConfigWriteTask(async () => {
    const beforeConfig = normalizeConfig(request.beforeConfig)
    const afterConfig = normalizeConfig(request.afterConfig)
    const configPath = normalizeOptionalPath(options.configPath || options.runtimeContext?.configPath || null)
    const requestedChangedJsonPaths = collectChangedJsonPaths(beforeConfig, afterConfig)
    if (requestedChangedJsonPaths.length === 0) {
      return buildNoopResult()
    }

    const latestConfigRaw = await readConfig(configPath ? { configPath } : undefined).catch(() => null)
    if (options.strictRead === true && !isPlainObject(latestConfigRaw)) {
      return buildStrictReadFailureResult('OpenClaw 配置读取失败，已停止写入以避免覆盖现有配置。')
    }
    const latestConfig = normalizeConfig(latestConfigRaw)
    const rebasedConfig = rebaseConfigValue(beforeConfig, afterConfig, latestConfig)
    const nextConfig = normalizeConfig(isPlainObject(rebasedConfig) ? rebasedConfig : null)

    const writeRequest = {
      config: nextConfig,
      reason: request.reason,
    }
    const writeResult = configPath
      ? await guardedWriteConfig(writeRequest, preferredCandidate, { configPath })
      : await guardedWriteConfig(writeRequest, preferredCandidate)

    if (writeResult.ok && writeResult.wrote && options.applyGatewayPolicy !== false) {
      const decision = resolveGatewayApplyAction({
        changedJsonPaths: writeResult.changedJsonPaths,
      })
      const applyResult = await applyGatewayDecision(decision.action)
      const gatewayApply = {
        ok: applyResult.ok,
        requestedAction: decision.action,
        appliedAction: applyResult.mode,
        ...(applyResult.note ? { note: applyResult.note } : {}),
      } as const
      if (!applyResult.ok) {
        return {
          ...writeResult,
          gatewayApply,
          message: appendMessage(
            writeResult.message,
            `配置写入成功，但网关生效动作失败（action=${decision.action}）。请稍后手动重载网关。`
          ),
        }
      }

      if (process.env.NODE_ENV !== 'test') {
        console.info(
          `[gateway-policy] reason=${request.reason || 'unknown'} policyAction=${decision.action} appliedAction=${applyResult.mode} policyReason=${decision.reason} changedPaths=${writeResult.changedJsonPaths.join(',')} note=${applyResult.note || '-'}`
        )
      }

      return {
        ...writeResult,
        gatewayApply,
      }
    }

    return writeResult
  })
}
