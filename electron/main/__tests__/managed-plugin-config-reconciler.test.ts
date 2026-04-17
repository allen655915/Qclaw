import { afterEach, describe, expect, it, vi } from 'vitest'

import { applyChannelConfig } from '../../../src/lib/openclaw-channel-registry'
import { reconcileManagedPluginConfig } from '../managed-plugin-config-reconciler'

const path = process.getBuiltinModule('node:path') as typeof import('node:path')
const { tmpdir } = process.getBuiltinModule('node:os') as typeof import('node:os')
const { mkdtemp, mkdir, rm } = process.getBuiltinModule('node:fs/promises') as typeof import('node:fs/promises')

const tempDirs: string[] = []

async function createTempHome(): Promise<string> {
  const homeDir = await mkdtemp(path.join(tmpdir(), 'qclaw-managed-reconciler-'))
  tempDirs.push(homeDir)
  await mkdir(path.join(homeDir, 'extensions'), { recursive: true })
  return homeDir
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  )
})

describe('reconcileManagedPluginConfig', () => {
  it('dry-runs scoped plugin cleanup without deleting channel credentials or writing config', async () => {
    const homeDir = await createTempHome()
    const hiddenStageDir = path.join(homeDir, 'extensions', '.openclaw-install-stage-wecom123')
    await mkdir(hiddenStageDir, { recursive: true })
    const applyConfigPatchGuarded = vi.fn()

    const result = await reconcileManagedPluginConfig(
      {
        channelId: 'wecom',
        runtimeContext: {
          homeDir,
          configPath: path.join(homeDir, 'openclaw.json'),
          openclawVersion: '2026.4.12',
        },
        currentConfig: {
          channels: {
            wecom: {
              enabled: true,
              botId: 'bot_123',
              secret: 'secret_456',
            },
          },
          plugins: {
            allow: ['wecom', 'wecom-openclaw-plugin'],
            entries: {
              wecom: {
                enabled: true,
              },
              'wecom-openclaw-plugin': {
                enabled: true,
                installPath: hiddenStageDir,
              },
            },
            installs: {
              'wecom-openclaw-plugin': {
                installPath: hiddenStageDir,
              },
            },
          },
        },
      },
      { applyConfigPatchGuarded }
    )

    expect(result.ok).toBe(true)
    expect(result.apply).toBe(false)
    expect(result.changed).toBe(true)
    expect(result.written).toBe(false)
    expect(result.orphanedPluginIds).toEqual(['wecom-openclaw-plugin'])
    expect(result.prunedPluginIds).toEqual(['wecom', 'wecom-openclaw-plugin'])
    expect(result.afterConfig).toEqual({
      channels: {
        wecom: {
          enabled: true,
          botId: 'bot_123',
          secret: 'secret_456',
        },
      },
      plugins: {
        allow: [],
        entries: {},
        installs: {},
      },
    })
    expect(result.manifest).toMatchObject({
      channelId: 'wecom',
      scope: 'plugins-only',
      apply: false,
      changed: true,
      written: false,
      runtime: {
        configPath: path.join(homeDir, 'openclaw.json'),
        homeDir,
        openclawVersion: '2026.4.12',
      },
    })
    expect(JSON.stringify(result.manifest)).not.toContain('secret_456')
    expect(applyConfigPatchGuarded).not.toHaveBeenCalled()
  })

  it('preserves a valid non-canonical configured install path on Windows-safe orphan checks', async () => {
    const homeDir = await createTempHome()
    const externalInstallDir = path.join(homeDir, 'custom-openclaw-plugins', 'wecom-stable')
    await mkdir(externalInstallDir, { recursive: true })

    const config = {
      channels: {
        wecom: {
          enabled: true,
          botId: 'bot_123',
          secret: 'secret_456',
        },
      },
      plugins: {
        allow: ['wecom-openclaw-plugin'],
        installs: {
          'wecom-openclaw-plugin': {
            installPath: externalInstallDir,
          },
        },
      },
    }

    const result = await reconcileManagedPluginConfig({
      channelId: 'wecom',
      runtimeContext: {
        homeDir,
      },
      currentConfig: config,
    })

    expect(result.ok).toBe(true)
    expect(result.changed).toBe(false)
    expect(result.orphanedPluginIds).toEqual([])
    expect(result.afterConfig).toEqual(config)
  })

  it('only removes channel config when the caller explicitly requests plugins-and-channels scope', async () => {
    const homeDir = await createTempHome()

    const result = await reconcileManagedPluginConfig({
      channelId: 'wecom',
      runtimeContext: {
        homeDir,
      },
      scope: 'plugins-and-channels',
      currentConfig: {
        channels: {
          wecom: {
            enabled: true,
            botId: 'bot_123',
            secret: 'secret_456',
          },
        },
        plugins: {
          allow: ['wecom-openclaw-plugin'],
        },
      },
    })

    expect(result.ok).toBe(true)
    expect(result.changed).toBe(true)
    expect(result.removedFrom.channels).toEqual(['wecom'])
    expect(result.afterConfig).toEqual({
      channels: {},
      plugins: {
        allow: [],
      },
    })
  })

  it('fails closed when config cannot be read and never calls strict writer', async () => {
    const homeDir = await createTempHome()
    const applyConfigPatchGuarded = vi.fn()

    const result = await reconcileManagedPluginConfig(
      {
        channelId: 'wecom',
        runtimeContext: {
          homeDir,
          configPath: path.join(homeDir, 'openclaw.json'),
        },
        apply: true,
      },
      {
        readConfig: vi.fn(async () => null),
        applyConfigPatchGuarded,
      }
    )

    expect(result).toMatchObject({
      ok: false,
      configReadFailed: true,
      failureReason: 'config-read-failed',
      written: false,
      retryable: true,
    })
    expect(applyConfigPatchGuarded).not.toHaveBeenCalled()
  })

  it('applies changes through strict guarded patch with the fixed runtime config path', async () => {
    const homeDir = await createTempHome()
    const configPath = path.join(homeDir, 'openclaw.json')
    const applyConfigPatchGuarded = vi.fn(async () => ({
      ok: true,
      blocked: false,
      wrote: true,
      target: 'config' as const,
      snapshotCreated: false,
      snapshot: null,
      changedJsonPaths: ['$.plugins.allow'],
      ownershipSummary: null,
      message: 'ok',
    }))

    const result = await reconcileManagedPluginConfig(
      {
        channelId: 'wecom',
        runtimeContext: {
          homeDir,
          configPath,
        },
        currentConfig: {
          channels: {
            wecom: {
              enabled: true,
              botId: 'bot_123',
              secret: 'secret_456',
            },
          },
          plugins: {
            allow: ['wecom'],
          },
        },
        apply: true,
      },
      { applyConfigPatchGuarded }
    )

    expect(result.ok).toBe(true)
    expect(result.written).toBe(true)
    expect(applyConfigPatchGuarded).toHaveBeenCalledWith(
      {
        beforeConfig: {
          channels: {
            wecom: {
              enabled: true,
              botId: 'bot_123',
              secret: 'secret_456',
            },
          },
          plugins: {
            allow: ['wecom'],
          },
        },
        afterConfig: {
          channels: {
            wecom: {
              enabled: true,
              botId: 'bot_123',
              secret: 'secret_456',
            },
          },
          plugins: {
            allow: [],
          },
        },
        reason: 'managed-channel-plugin-repair',
      },
      undefined,
      {
        strictRead: true,
        applyGatewayPolicy: false,
        runtimeContext: {
          configPath,
        },
      }
    )
  })

  it('applies a caller-provided desired config through the same strict writer without running generic prune', async () => {
    const homeDir = await createTempHome()
    const configPath = path.join(homeDir, 'openclaw.json')
    const applyConfigPatchGuarded = vi.fn(async () => ({
      ok: true,
      blocked: false,
      wrote: true,
      target: 'config' as const,
      snapshotCreated: false,
      snapshot: null,
      changedJsonPaths: ['$.plugins.allow'],
      ownershipSummary: null,
      message: 'ok',
    }))

    const beforeConfig = {
      channels: {
        feishu: {
          enabled: true,
          appId: 'cli_default',
          appSecret: 'secret-default',
        },
      },
      plugins: {
        allow: ['feishu'],
      },
    }
    const desiredConfig = {
      channels: beforeConfig.channels,
      plugins: {
        allow: ['openclaw-lark'],
        installs: {
          'openclaw-lark': {
            source: 'npm',
            spec: '@larksuite/openclaw-lark',
            installPath: path.join(homeDir, 'extensions', 'openclaw-lark'),
          },
        },
      },
      session: {
        dmScope: 'per-account-channel-peer',
      },
    }

    const result = await reconcileManagedPluginConfig(
      {
        channelId: 'feishu',
        runtimeContext: {
          homeDir,
          configPath,
        },
        currentConfig: beforeConfig,
        desiredConfig,
        apply: true,
        applyGatewayPolicy: true,
      },
      { applyConfigPatchGuarded }
    )

    expect(result.ok).toBe(true)
    expect(result.afterConfig).toEqual(desiredConfig)
    expect(result.removedFrom).toEqual({
      allow: [],
      entries: [],
      installs: [],
      channels: [],
    })
    expect(applyConfigPatchGuarded).toHaveBeenCalledWith(
      {
        beforeConfig,
        afterConfig: desiredConfig,
        reason: 'managed-channel-plugin-repair',
      },
      undefined,
      {
        strictRead: true,
        applyGatewayPolicy: true,
        runtimeContext: {
          configPath,
        },
      }
    )
  })

  it('does not create plugin config when a channel has no plugin residue and is not installed', async () => {
    const homeDir = await createTempHome()

    const result = await reconcileManagedPluginConfig({
      channelId: 'wecom',
      runtimeContext: {
        homeDir,
      },
      currentConfig: {
        channels: {
          wecom: {
            enabled: true,
            botId: 'bot_123',
            secret: 'secret_456',
          },
        },
      },
    })

    expect(result.ok).toBe(true)
    expect(result.changed).toBe(false)
    expect(result.afterConfig).toEqual({
      channels: {
        wecom: {
          enabled: true,
          botId: 'bot_123',
          secret: 'secret_456',
        },
      },
    })
  })

  it('normalizes bundled qqbot config to the runtime allow id and clears stale legacy plugin entries', async () => {
    const homeDir = await createTempHome()

    const result = await reconcileManagedPluginConfig({
      channelId: 'qqbot',
      runtimeContext: {
        homeDir,
        openclawVersion: '2026.4.12',
      },
      installedOnDisk: true,
      currentConfig: {
        channels: {
          qqbot: {
            enabled: true,
            appId: 'bot_123',
            clientSecret: 'secret_456',
            allowFrom: ['*'],
          },
        },
        plugins: {
          allow: ['openclaw-qqbot', 'other-plugin'],
          entries: {
            'openclaw-qqbot': {
              enabled: true,
              installPath: path.join(homeDir, 'extensions', 'openclaw-qqbot'),
            },
          },
          installs: {
            'openclaw-qqbot': {
              installPath: path.join(homeDir, 'extensions', 'openclaw-qqbot'),
            },
          },
        },
      },
    })

    expect(result.ok).toBe(true)
    expect(result.changed).toBe(true)
    expect(result.orphanedPluginIds).toEqual([])
    expect(result.prunedPluginIds).toEqual(['openclaw-qqbot'])
    expect(result.removedFrom).toEqual({
      allow: ['openclaw-qqbot'],
      entries: ['openclaw-qqbot'],
      installs: ['openclaw-qqbot'],
      channels: [],
    })
    expect(result.afterConfig).toEqual({
      channels: {
        qqbot: {
          enabled: true,
          appId: 'bot_123',
          clientSecret: 'secret_456',
          allowFrom: ['*'],
        },
      },
      plugins: {
        allow: ['other-plugin', 'qqbot'],
        entries: {},
        installs: {},
      },
    })
  })

  it('preserves the runtime qqbot allow entry while pruning external qqbot install residue for a configured bundled channel', async () => {
    const homeDir = await createTempHome()

    const result = await reconcileManagedPluginConfig({
      channelId: 'qqbot',
      runtimeContext: {
        homeDir,
        openclawVersion: '2026.4.12',
      },
      installedOnDisk: true,
      currentConfig: {
        channels: {
          qqbot: {
            enabled: true,
            appId: 'bot_123',
            clientSecret: 'secret_456',
            allowFrom: ['*'],
          },
        },
        plugins: {
          allow: ['qqbot', 'other-plugin'],
          entries: {
            qqbot: {
              enabled: true,
              installPath: path.join(homeDir, 'extensions', 'qqbot'),
            },
          },
          installs: {
            qqbot: {
              installPath: path.join(homeDir, 'extensions', 'qqbot'),
            },
          },
        },
      },
    })

    expect(result.ok).toBe(true)
    expect(result.changed).toBe(true)
    expect(result.orphanedPluginIds).toEqual([])
    expect(result.prunedPluginIds).toEqual(['qqbot'])
    expect(result.removedFrom).toEqual({
      allow: [],
      entries: ['qqbot'],
      installs: ['qqbot'],
      channels: [],
    })
    expect(result.afterConfig).toEqual({
      channels: {
        qqbot: {
          enabled: true,
          appId: 'bot_123',
          clientSecret: 'secret_456',
          allowFrom: ['*'],
        },
      },
      plugins: {
        allow: ['qqbot', 'other-plugin'],
        entries: {},
        installs: {},
      },
    })
  })

  it('does not invent bundled qqbot plugin config before the channel itself is configured', async () => {
    const homeDir = await createTempHome()

    const result = await reconcileManagedPluginConfig({
      channelId: 'qqbot',
      runtimeContext: {
        homeDir,
        openclawVersion: '2026.4.12',
      },
      installedOnDisk: true,
      currentConfig: {},
    })

    expect(result.ok).toBe(true)
    expect(result.changed).toBe(false)
    expect(result.orphanedPluginIds).toEqual([])
    expect(result.afterConfig).toEqual({})
  })

  it('prunes residue-only bundled qqbot plugin config instead of inventing a runtime allow entry', async () => {
    const homeDir = await createTempHome()

    const result = await reconcileManagedPluginConfig({
      channelId: 'qqbot',
      runtimeContext: {
        homeDir,
        openclawVersion: '2026.4.12',
      },
      installedOnDisk: true,
      currentConfig: {
        plugins: {
          allow: ['other-plugin', 'qqbot', 'openclaw-qqbot'],
          entries: {
            qqbot: {
              enabled: true,
              installPath: path.join(homeDir, 'extensions', 'qqbot'),
            },
            'openclaw-qqbot': {
              enabled: true,
              installPath: path.join(homeDir, 'extensions', 'openclaw-qqbot'),
            },
          },
          installs: {
            qqbot: {
              installPath: path.join(homeDir, 'extensions', 'qqbot'),
            },
            'openclaw-qqbot': {
              installPath: path.join(homeDir, 'extensions', 'openclaw-qqbot'),
            },
          },
        },
      },
    })

    expect(result.ok).toBe(true)
    expect(result.changed).toBe(true)
    expect(result.orphanedPluginIds).toEqual([])
    expect(result.prunedPluginIds).toEqual(['qqbot', 'openclaw-qqbot'])
    expect(result.removedFrom).toEqual({
      allow: ['qqbot', 'openclaw-qqbot'],
      entries: ['qqbot', 'openclaw-qqbot'],
      installs: ['qqbot', 'openclaw-qqbot'],
      channels: [],
    })
    expect(result.afterConfig).toEqual({
      plugins: {
        allow: ['other-plugin'],
        entries: {},
        installs: {},
      },
    })
  })

  it('normalizes the conservative renderer qqbot config shape to the pinned bundled runtime contract', async () => {
    const homeDir = await createTempHome()
    const currentConfig = applyChannelConfig({}, 'qqbot', {
      appId: 'bot_123',
      appSecret: 'secret_456',
    })

    const result = await reconcileManagedPluginConfig({
      channelId: 'qqbot',
      runtimeContext: {
        homeDir,
        openclawVersion: '2026.4.12',
      },
      installedOnDisk: true,
      currentConfig,
    })

    expect(result.ok).toBe(true)
    expect(result.changed).toBe(true)
    expect(result.orphanedPluginIds).toEqual([])
    expect(result.prunedPluginIds).toEqual(['openclaw-qqbot'])
    expect(result.afterConfig).toEqual({
      channels: currentConfig.channels,
      plugins: {
        allow: ['qqbot'],
      },
    })
  })

  it('keeps qqbot on the legacy generic contract outside the pinned 2026.4.12 runtime', async () => {
    const homeDir = await createTempHome()
    const currentConfig = {
      channels: {
        qqbot: {
          enabled: true,
          appId: 'bot_123',
          clientSecret: 'secret_456',
          allowFrom: ['*'],
        },
      },
      plugins: {
        allow: ['openclaw-qqbot'],
      },
    }

    const result = await reconcileManagedPluginConfig({
      channelId: 'qqbot',
      runtimeContext: {
        homeDir,
        openclawVersion: '2026.4.11',
      },
      installedOnDisk: true,
      currentConfig,
    })

    expect(result.ok).toBe(true)
    expect(result.changed).toBe(false)
    expect(result.orphanedPluginIds).toEqual([])
    expect(result.prunedPluginIds).toEqual([])
    expect(result.afterConfig).toEqual(currentConfig)
  })
})
