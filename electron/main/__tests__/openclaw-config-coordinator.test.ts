import { beforeEach, describe, expect, it, vi } from 'vitest'

const { readConfigMock, runCliMock, restartGatewayLifecycleMock, guardedWriteConfigMock } = vi.hoisted(() => ({
  readConfigMock: vi.fn(),
  runCliMock: vi.fn(),
  restartGatewayLifecycleMock: vi.fn(),
  guardedWriteConfigMock: vi.fn(),
}))

vi.mock('../cli', () => ({
  readConfig: readConfigMock,
  runCli: runCliMock,
}))

vi.mock('../gateway-lifecycle-controller', () => ({
  restartGatewayLifecycle: restartGatewayLifecycleMock,
}))

vi.mock('../openclaw-config-guard', () => ({
  guardedWriteConfig: guardedWriteConfigMock,
}))

import { applyConfigPatchGuarded } from '../openclaw-config-coordinator'

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

async function waitForGuardedWriteCalls(expectedCalls: number, timeoutMs = 200): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (guardedWriteConfigMock.mock.calls.length >= expectedCalls) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error(`Timed out waiting for ${expectedCalls} guarded write calls`)
}

describe('openclaw config coordinator', () => {
  beforeEach(() => {
    readConfigMock.mockReset()
    runCliMock.mockReset()
    restartGatewayLifecycleMock.mockReset()
    guardedWriteConfigMock.mockReset()

    runCliMock.mockResolvedValue({
      ok: true,
      stdout: '',
      stderr: '',
      code: 0,
    })
    restartGatewayLifecycleMock.mockResolvedValue({
      ok: true,
      stdout: '',
      stderr: '',
      code: 0,
    })
  })

  it('rebases patch edits on top of latest config to preserve unrelated concurrent changes', async () => {
    readConfigMock.mockResolvedValue({
      channels: {
        telegram: {
          enabled: true,
        },
      },
      models: {
        openai: {
          enabled: false,
        },
      },
      ui: {
        compact: true,
      },
    })
    guardedWriteConfigMock.mockResolvedValue({
      ok: true,
      blocked: false,
      wrote: true,
      target: 'config',
      snapshotCreated: false,
      snapshot: null,
      changedJsonPaths: ['$.channels.telegram'],
      ownershipSummary: null,
      message: 'ok',
    })

    await applyConfigPatchGuarded({
      beforeConfig: {
        channels: {
          telegram: {
            enabled: true,
          },
        },
        models: {
          openai: {
            enabled: true,
          },
        },
      },
      afterConfig: {
        channels: {},
        models: {
          openai: {
            enabled: true,
          },
        },
      },
      reason: 'channels-remove-channel',
    })

    expect(guardedWriteConfigMock).toHaveBeenCalledTimes(1)
    expect(guardedWriteConfigMock).toHaveBeenCalledWith(
      {
        config: {
          channels: {},
          models: {
            openai: {
              enabled: false,
            },
          },
          ui: {
            compact: true,
          },
        },
        reason: 'channels-remove-channel',
      },
      undefined
    )
    expect(restartGatewayLifecycleMock).toHaveBeenCalledTimes(1)
    expect(runCliMock).not.toHaveBeenCalled()
  })

  it('merges concurrent agent and binding additions by identity when Feishu bots are added in parallel', async () => {
    readConfigMock.mockResolvedValue({
      agents: {
        list: [
          { id: 'feishu-default', workspace: '~/.openclaw/workspace-feishu-default' },
          { id: 'feishu-work', workspace: '~/.openclaw/workspace-feishu-work' },
        ],
      },
      bindings: [
        { agentId: 'feishu-default', match: { channel: 'feishu', accountId: 'default' } },
        { agentId: 'feishu-work', match: { channel: 'feishu', accountId: 'work' } },
      ],
    })
    guardedWriteConfigMock.mockResolvedValue({
      ok: true,
      blocked: false,
      wrote: true,
      target: 'config',
      snapshotCreated: false,
      snapshot: null,
      changedJsonPaths: ['$.agents.list[2]', '$.bindings[2]'],
      ownershipSummary: null,
      message: 'ok',
    })

    await applyConfigPatchGuarded(
      {
        beforeConfig: {
          agents: {
            list: [
              { id: 'feishu-default', workspace: '~/.openclaw/workspace-feishu-default' },
            ],
          },
          bindings: [
            { agentId: 'feishu-default', match: { channel: 'feishu', accountId: 'default' } },
          ],
        },
        afterConfig: {
          agents: {
            list: [
              { id: 'feishu-default', workspace: '~/.openclaw/workspace-feishu-default' },
              { id: 'feishu-support', workspace: '~/.openclaw/workspace-feishu-support' },
            ],
          },
          bindings: [
            { agentId: 'feishu-default', match: { channel: 'feishu', accountId: 'default' } },
            { agentId: 'feishu-support', match: { channel: 'feishu', accountId: 'support' } },
          ],
        },
        reason: 'channel-connect-feishu-finish-create',
      },
      undefined,
      {
        applyGatewayPolicy: false,
      }
    )

    expect(guardedWriteConfigMock).toHaveBeenCalledWith(
      {
        config: {
          agents: {
            list: [
              { id: 'feishu-default', workspace: '~/.openclaw/workspace-feishu-default' },
              { id: 'feishu-work', workspace: '~/.openclaw/workspace-feishu-work' },
              { id: 'feishu-support', workspace: '~/.openclaw/workspace-feishu-support' },
            ],
          },
          bindings: [
            { agentId: 'feishu-default', match: { channel: 'feishu', accountId: 'default' } },
            { agentId: 'feishu-work', match: { channel: 'feishu', accountId: 'work' } },
            { agentId: 'feishu-support', match: { channel: 'feishu', accountId: 'support' } },
          ],
        },
        reason: 'channel-connect-feishu-finish-create',
      },
      undefined
    )
  })

  it('merges concurrent plugin allow-list additions instead of dropping one side', async () => {
    readConfigMock.mockResolvedValue({
      plugins: {
        allow: ['openclaw-weixin', 'wecom-openclaw-plugin'],
      },
    })
    guardedWriteConfigMock.mockResolvedValue({
      ok: true,
      blocked: false,
      wrote: true,
      target: 'config',
      snapshotCreated: false,
      snapshot: null,
      changedJsonPaths: ['$.plugins.allow[2]'],
      ownershipSummary: null,
      message: 'ok',
    })

    await applyConfigPatchGuarded(
      {
        beforeConfig: {
          plugins: {
            allow: ['openclaw-weixin'],
          },
        },
        afterConfig: {
          plugins: {
            allow: ['openclaw-weixin', 'openclaw-lark'],
          },
        },
        reason: 'channel-connect-configure',
      },
      undefined,
      {
        applyGatewayPolicy: false,
      }
    )

    expect(guardedWriteConfigMock).toHaveBeenCalledWith(
      {
        config: {
          plugins: {
            allow: ['openclaw-weixin', 'wecom-openclaw-plugin', 'openclaw-lark'],
          },
        },
        reason: 'channel-connect-configure',
      },
      undefined
    )
  })

  it('keeps the legacy fallback-to-empty latest config behavior unless strictRead is enabled', async () => {
    readConfigMock.mockResolvedValue(null)
    guardedWriteConfigMock.mockResolvedValue({
      ok: true,
      blocked: false,
      wrote: true,
      target: 'config',
      snapshotCreated: false,
      snapshot: null,
      changedJsonPaths: ['$.models.openai.enabled'],
      ownershipSummary: null,
      message: 'ok',
    })

    await applyConfigPatchGuarded(
      {
        beforeConfig: {
          models: {
            openai: {
              enabled: false,
            },
          },
        },
        afterConfig: {
          models: {
            openai: {
              enabled: true,
            },
          },
        },
        reason: 'unknown',
      },
      undefined,
      {
        applyGatewayPolicy: false,
      }
    )

    expect(guardedWriteConfigMock).toHaveBeenCalledWith(
      {
        config: {
          models: {
            openai: {
              enabled: true,
            },
          },
        },
        reason: 'unknown',
      },
      undefined
    )
  })

  it('blocks strict config patches when the latest config cannot be read', async () => {
    readConfigMock.mockResolvedValue(null)

    const result = await applyConfigPatchGuarded(
      {
        beforeConfig: {
          plugins: {
            allow: ['wecom'],
          },
        },
        afterConfig: {
          plugins: {
            allow: ['wecom-openclaw-plugin'],
          },
        },
        reason: 'managed-channel-plugin-repair',
      },
      undefined,
      {
        strictRead: true,
        applyGatewayPolicy: false,
      }
    )

    expect(result).toMatchObject({
      ok: false,
      blocked: true,
      wrote: false,
      errorCode: 'config_read_failed',
    })
    expect(result.message).toContain('配置读取失败')
    expect(guardedWriteConfigMock).not.toHaveBeenCalled()
  })

  it('uses a fixed config path for latest read and guarded write when a runtime context is provided', async () => {
    readConfigMock.mockResolvedValue({
      plugins: {
        allow: ['wecom'],
      },
      ui: {
        compact: true,
      },
    })
    guardedWriteConfigMock.mockResolvedValue({
      ok: true,
      blocked: false,
      wrote: true,
      target: 'config',
      snapshotCreated: false,
      snapshot: null,
      changedJsonPaths: ['$.plugins.allow'],
      ownershipSummary: null,
      message: 'ok',
    })

    await applyConfigPatchGuarded(
      {
        beforeConfig: {
          plugins: {
            allow: ['wecom'],
          },
        },
        afterConfig: {
          plugins: {
            allow: ['wecom-openclaw-plugin'],
          },
        },
        reason: 'managed-channel-plugin-repair',
      },
      undefined,
      {
        runtimeContext: {
          configPath: 'C:/Users/demo/.openclaw/openclaw.json',
        },
        strictRead: true,
        applyGatewayPolicy: false,
      }
    )

    expect(readConfigMock).toHaveBeenCalledWith({
      configPath: 'C:/Users/demo/.openclaw/openclaw.json',
    })
    expect(guardedWriteConfigMock).toHaveBeenCalledWith(
      {
        config: {
          plugins: {
            allow: ['wecom-openclaw-plugin'],
          },
          ui: {
            compact: true,
          },
        },
        reason: 'managed-channel-plugin-repair',
      },
      undefined,
      {
        configPath: 'C:/Users/demo/.openclaw/openclaw.json',
      }
    )
  })

  it('serializes concurrent config patch requests through one write queue', async () => {
    const firstWrite = createDeferred<any>()

    readConfigMock.mockResolvedValue({})
    guardedWriteConfigMock
      .mockImplementationOnce(() => firstWrite.promise)
      .mockResolvedValueOnce({
        ok: true,
        blocked: false,
        wrote: true,
        target: 'config',
        snapshotCreated: false,
        snapshot: null,
        changedJsonPaths: ['$.b'],
        ownershipSummary: null,
      })

    const firstCall = applyConfigPatchGuarded({
      beforeConfig: { a: 1 },
      afterConfig: { a: 2 },
      reason: 'unknown',
    })
    const secondCall = applyConfigPatchGuarded({
      beforeConfig: { b: 1 },
      afterConfig: { b: 2 },
      reason: 'unknown',
    })

    await waitForGuardedWriteCalls(1)
    expect(guardedWriteConfigMock).toHaveBeenCalledTimes(1)

    firstWrite.resolve({
      ok: true,
      blocked: false,
      wrote: true,
      target: 'config',
      snapshotCreated: false,
      snapshot: null,
      changedJsonPaths: ['$.a'],
      ownershipSummary: null,
    })

    await Promise.all([firstCall, secondCall])
    expect(guardedWriteConfigMock).toHaveBeenCalledTimes(2)
    expect(runCliMock).not.toHaveBeenCalled()
    expect(restartGatewayLifecycleMock).not.toHaveBeenCalled()
  })

  it('skips gateway apply actions when applyGatewayPolicy is disabled', async () => {
    readConfigMock.mockResolvedValue({
      channels: {
        feishu: {
          enabled: true,
        },
      },
    })
    guardedWriteConfigMock.mockResolvedValue({
      ok: true,
      blocked: false,
      wrote: true,
      target: 'config',
      snapshotCreated: false,
      snapshot: null,
      changedJsonPaths: ['$.channels.feishu.enabled'],
      ownershipSummary: null,
      message: 'ok',
    })

    await applyConfigPatchGuarded(
      {
        beforeConfig: {
          channels: {
            feishu: {
              enabled: true,
            },
          },
        },
        afterConfig: {
          channels: {},
        },
        reason: 'channels-remove-channel',
      },
      undefined,
      {
        applyGatewayPolicy: false,
      }
    )

    expect(runCliMock).not.toHaveBeenCalled()
    expect(restartGatewayLifecycleMock).not.toHaveBeenCalled()
  })

  it('falls back to gateway restart when hot-reload fails', async () => {
    readConfigMock.mockResolvedValue({
      gateway: {
        auth: {
          token: 'old-token',
        },
      },
    })
    guardedWriteConfigMock.mockResolvedValue({
      ok: true,
      blocked: false,
      wrote: true,
      target: 'config',
      snapshotCreated: false,
      snapshot: null,
      changedJsonPaths: ['$.gateway.auth.token'],
      ownershipSummary: null,
      message: 'ok',
    })
    runCliMock.mockResolvedValueOnce({
      ok: false,
      stdout: '',
      stderr: 'reload failed',
      code: 1,
    })

    const result = await applyConfigPatchGuarded({
      beforeConfig: {
        gateway: {
          auth: {
            token: 'old-token',
          },
        },
      },
      afterConfig: {
        gateway: {
          auth: {
            token: 'new-token',
          },
        },
      },
      reason: 'unknown',
    })

    expect(result.gatewayApply).toEqual({
      ok: true,
      requestedAction: 'hot-reload',
      appliedAction: 'restart',
      note: 'hot-reload failed, fallback to restart',
    })
    expect(runCliMock).toHaveBeenCalledTimes(1)
    expect(runCliMock).toHaveBeenCalledWith(['secrets', 'reload'], undefined, 'config-write')
    expect(restartGatewayLifecycleMock).toHaveBeenCalledTimes(1)
  })

  it('keeps write success when config write succeeds but gateway apply action fails', async () => {
    readConfigMock.mockResolvedValue({
      gateway: {
        auth: {
          token: 'old-token',
        },
      },
    })
    guardedWriteConfigMock.mockResolvedValue({
      ok: true,
      blocked: false,
      wrote: true,
      target: 'config',
      snapshotCreated: false,
      snapshot: null,
      changedJsonPaths: ['$.gateway.auth.token'],
      ownershipSummary: null,
      message: 'ok',
    })
    runCliMock.mockResolvedValueOnce({
      ok: false,
      stdout: '',
      stderr: 'reload failed',
      code: 1,
    })
    restartGatewayLifecycleMock.mockResolvedValueOnce({
      ok: false,
      stdout: '',
      stderr: 'restart failed',
      code: 1,
    })

    const result = await applyConfigPatchGuarded({
      beforeConfig: {
        gateway: {
          auth: {
            token: 'old-token',
          },
        },
      },
      afterConfig: {
        gateway: {
          auth: {
            token: 'new-token',
          },
        },
      },
      reason: 'unknown',
    })

    expect(result.ok).toBe(true)
    expect(result.wrote).toBe(true)
    expect(result.message).toContain('配置写入成功，但网关生效动作失败')
    expect(result.message).toContain('请稍后手动重载网关')
    expect(result.gatewayApply).toEqual({
      ok: false,
      requestedAction: 'hot-reload',
      appliedAction: 'restart',
      note: 'restart failed',
    })
    expect(runCliMock).toHaveBeenCalledTimes(1)
    expect(restartGatewayLifecycleMock).toHaveBeenCalledTimes(1)
  })
})
