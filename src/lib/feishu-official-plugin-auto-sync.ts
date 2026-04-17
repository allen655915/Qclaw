import { toUserFacingCliFailureMessage } from './user-facing-cli-feedback'

export interface FeishuOfficialPluginStateLike {
  configChanged: boolean
  configAvailable: boolean
  installedOnDisk: boolean
  officialPluginConfigured: boolean
  normalizedConfig: Record<string, any>
}

export interface FeishuOfficialPluginEnsureReadyResultLike {
  ok: boolean
  installedThisRun: boolean
  state: FeishuOfficialPluginStateLike
  message?: string
  stderr?: string
  stdout?: string
  code?: number | null
}

interface FeishuInstallerStateLike {
  active: boolean
}

export interface FeishuOfficialPluginAutoSyncApi {
  getFeishuOfficialPluginState: () => Promise<FeishuOfficialPluginStateLike>
  ensureFeishuOfficialPluginReady: () => Promise<FeishuOfficialPluginEnsureReadyResultLike>
  getFeishuInstallerState?: () => Promise<FeishuInstallerStateLike | null>
}

export interface FeishuOfficialPluginAutoSyncResult {
  state: FeishuOfficialPluginStateLike
  syncAttempted: boolean
  synced: boolean
  installedThisRun: boolean
  blockedByActiveInstaller: boolean
}

let inFlightEnsureReadyPromise: Promise<FeishuOfficialPluginEnsureReadyResultLike> | null = null

function buildAutoSyncFailureMessage(
  result: FeishuOfficialPluginEnsureReadyResultLike
): string {
  const explicitMessage = String(result.message || '').trim()
  if (explicitMessage) return explicitMessage

  return toUserFacingCliFailureMessage({
    stderr: [result.stderr, result.stdout].map((value) => String(value || '').trim()).filter(Boolean).join('\n\n'),
    fallback: 'Qclaw 自动同步飞书配置失败，请稍后重试。',
  })
}

async function hasActiveFeishuInstaller(
  api: FeishuOfficialPluginAutoSyncApi
): Promise<boolean> {
  if (!api.getFeishuInstallerState) return false
  try {
    const snapshot = await api.getFeishuInstallerState()
    return snapshot?.active === true
  } catch {
    return false
  }
}

async function ensureFeishuOfficialPluginReadyDeduped(
  api: FeishuOfficialPluginAutoSyncApi
): Promise<FeishuOfficialPluginEnsureReadyResultLike> {
  if (inFlightEnsureReadyPromise) {
    return inFlightEnsureReadyPromise
  }

  const promise = api.ensureFeishuOfficialPluginReady()
  inFlightEnsureReadyPromise = promise
  try {
    return await promise
  } finally {
    if (inFlightEnsureReadyPromise === promise) {
      inFlightEnsureReadyPromise = null
    }
  }
}

export async function getFeishuOfficialPluginStateReady(
  api: FeishuOfficialPluginAutoSyncApi
): Promise<FeishuOfficialPluginAutoSyncResult> {
  const initialState = await api.getFeishuOfficialPluginState()
  if (!initialState.configChanged || initialState.configAvailable === false) {
    return {
      state: initialState,
      syncAttempted: false,
      synced: false,
      installedThisRun: false,
      blockedByActiveInstaller: false,
    }
  }

  if (await hasActiveFeishuInstaller(api)) {
    return {
      state: initialState,
      syncAttempted: false,
      synced: false,
      installedThisRun: false,
      blockedByActiveInstaller: true,
    }
  }

  const ensureResult = await ensureFeishuOfficialPluginReadyDeduped(api)
  if (!ensureResult.ok) {
    throw new Error(buildAutoSyncFailureMessage(ensureResult))
  }

  const syncedState = await api.getFeishuOfficialPluginState().catch(() => ensureResult.state || initialState)
  if (syncedState.configChanged && syncedState.configAvailable !== false) {
    throw new Error('Qclaw 已尝试自动同步飞书配置，但仍检测到配置漂移。')
  }

  return {
    state: syncedState,
    syncAttempted: true,
    synced: true,
    installedThisRun: Boolean(ensureResult.installedThisRun),
    blockedByActiveInstaller: false,
  }
}

export function resetFeishuOfficialPluginAutoSyncForTests(): void {
  inFlightEnsureReadyPromise = null
}
