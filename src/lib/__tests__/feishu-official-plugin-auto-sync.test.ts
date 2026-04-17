import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  getFeishuOfficialPluginStateReady,
  resetFeishuOfficialPluginAutoSyncForTests,
  type FeishuOfficialPluginAutoSyncApi,
  type FeishuOfficialPluginEnsureReadyResultLike,
  type FeishuOfficialPluginStateLike,
} from '../feishu-official-plugin-auto-sync'

function createState(
  overrides: Partial<FeishuOfficialPluginStateLike> = {}
): FeishuOfficialPluginStateLike {
  return {
    configChanged: false,
    configAvailable: true,
    installedOnDisk: true,
    officialPluginConfigured: true,
    normalizedConfig: {},
    ...overrides,
  }
}

describe('feishu official plugin auto sync', () => {
  beforeEach(() => {
    resetFeishuOfficialPluginAutoSyncForTests()
  })

  it('returns the current state when no config drift is detected', async () => {
    const state = createState()
    const api: FeishuOfficialPluginAutoSyncApi = {
      getFeishuOfficialPluginState: vi.fn(async () => state),
      ensureFeishuOfficialPluginReady: vi.fn(),
    }

    const result = await getFeishuOfficialPluginStateReady(api)

    expect(result).toEqual({
      state,
      syncAttempted: false,
      synced: false,
      installedThisRun: false,
      blockedByActiveInstaller: false,
    })
    expect(api.ensureFeishuOfficialPluginReady).not.toHaveBeenCalled()
  })

  it('auto syncs drifted config when the installer is idle', async () => {
    const driftedState = createState({
      configChanged: true,
      normalizedConfig: {
        channels: {
          feishu: {
            enabled: true,
          },
        },
      },
    })
    const syncedState = createState({
      normalizedConfig: driftedState.normalizedConfig,
    })
    const api: FeishuOfficialPluginAutoSyncApi = {
      getFeishuOfficialPluginState: vi
        .fn()
        .mockResolvedValueOnce(driftedState)
        .mockResolvedValueOnce(syncedState),
      getFeishuInstallerState: vi.fn(async () => ({ active: false })),
      ensureFeishuOfficialPluginReady: vi.fn(async () => ({
        ok: true,
        installedThisRun: false,
        state: syncedState,
        stderr: '',
        stdout: '',
        code: 0,
      })),
    }

    const result = await getFeishuOfficialPluginStateReady(api)

    expect(result).toEqual({
      state: syncedState,
      syncAttempted: true,
      synced: true,
      installedThisRun: false,
      blockedByActiveInstaller: false,
    })
    expect(api.ensureFeishuOfficialPluginReady).toHaveBeenCalledTimes(1)
  })

  it('skips auto sync while the official installer is still running', async () => {
    const driftedState = createState({ configChanged: true })
    const api: FeishuOfficialPluginAutoSyncApi = {
      getFeishuOfficialPluginState: vi.fn(async () => driftedState),
      getFeishuInstallerState: vi.fn(async () => ({ active: true })),
      ensureFeishuOfficialPluginReady: vi.fn(),
    }

    const result = await getFeishuOfficialPluginStateReady(api)

    expect(result).toEqual({
      state: driftedState,
      syncAttempted: false,
      synced: false,
      installedThisRun: false,
      blockedByActiveInstaller: true,
    })
    expect(api.ensureFeishuOfficialPluginReady).not.toHaveBeenCalled()
  })

  it('dedupes concurrent auto sync attempts through one ensure-ready call', async () => {
    const driftedState = createState({ configChanged: true })
    const syncedState = createState()
    let resolveEnsurePromise: (value: FeishuOfficialPluginEnsureReadyResultLike) => void = () => {}
    const ensurePromise = new Promise<FeishuOfficialPluginEnsureReadyResultLike>((resolve) => {
      resolveEnsurePromise = resolve
    })

    const api: FeishuOfficialPluginAutoSyncApi = {
      getFeishuOfficialPluginState: vi
        .fn()
        .mockResolvedValueOnce(driftedState)
        .mockResolvedValueOnce(driftedState)
        .mockResolvedValue(syncedState),
      getFeishuInstallerState: vi.fn(async () => ({ active: false })),
      ensureFeishuOfficialPluginReady: vi.fn(() => ensurePromise),
    }

    const first = getFeishuOfficialPluginStateReady(api)
    const second = getFeishuOfficialPluginStateReady(api)
    await vi.waitFor(() => {
      expect(api.ensureFeishuOfficialPluginReady).toHaveBeenCalledTimes(1)
    })

    resolveEnsurePromise({
      ok: true,
      installedThisRun: false,
      state: syncedState,
      stderr: '',
      stdout: '',
      code: 0,
    })
    const [firstResult, secondResult] = await Promise.all([first, second])

    expect(firstResult.state).toEqual(syncedState)
    expect(secondResult.state).toEqual(syncedState)
    expect(api.ensureFeishuOfficialPluginReady).toHaveBeenCalledTimes(1)
  })

  it('throws a user-facing error when auto sync fails', async () => {
    const driftedState = createState({ configChanged: true })
    const api: FeishuOfficialPluginAutoSyncApi = {
      getFeishuOfficialPluginState: vi.fn(async () => driftedState),
      getFeishuInstallerState: vi.fn(async () => ({ active: false })),
      ensureFeishuOfficialPluginReady: vi.fn(async () => ({
        ok: false,
        installedThisRun: false,
        state: driftedState,
        stderr: 'permission denied while writing config',
        stdout: '',
        code: 1,
      })),
    }

    await expect(getFeishuOfficialPluginStateReady(api)).rejects.toThrow('配置写入失败，请检查本机权限后重试。')
  })
})
