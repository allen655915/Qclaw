import { describe, expect, it, vi } from 'vitest'
import { ensureWindowsNvmNodeRuntime } from '../platforms/windows/windows-nvm-node-runtime'

const path = process.getBuiltinModule('node:path') as typeof import('node:path')
const pathModule = path.win32
const nvmDir = 'C:\\Users\\alice\\AppData\\Roaming\\nvm'
const nvmExecutable = `${nvmDir}\\nvm.exe`
const nvmSymlinkDir = 'C:\\Program Files\\nodejs'
const targetVersion = 'v22.17.0'

function makeCliResult(overrides: Partial<{
  ok: boolean
  stdout: string
  stderr: string
  code: number | null
}> = {}) {
  return {
    ok: overrides.ok ?? true,
    stdout: overrides.stdout ?? '',
    stderr: overrides.stderr ?? '',
    code: overrides.code ?? 0,
  }
}

describe('ensureWindowsNvmNodeRuntime', () => {
  it('installs and verifies the requested nvm-windows runtime', async () => {
    const runDirect = vi.fn(async (command: string, args: string[]) => {
      if (command === nvmExecutable && args[0] === 'current') {
        return makeCliResult({ stdout: 'v20.11.1' })
      }
      if (command === nvmExecutable && args[0] === 'install') {
        return makeCliResult({ stdout: 'installation ok' })
      }
      if (command === nvmExecutable && args[0] === 'use') {
        return makeCliResult({ stdout: 'switch ok' })
      }
      if (command === `${nvmSymlinkDir}\\node.exe`) {
        return makeCliResult({ stdout: targetVersion })
      }
      throw new Error(`unexpected direct command: ${command} ${args.join(' ')}`)
    })
    const runShell = vi.fn(async (command: string) => {
      if (command === `${nvmSymlinkDir}\\npm.cmd`) {
        return makeCliResult({ stdout: '10.8.2' })
      }
      throw new Error(`unexpected shell command: ${command}`)
    })

    const result = await ensureWindowsNvmNodeRuntime(
      {
        targetVersion,
        nvmDir,
        nvmExecutable,
        nvmSymlinkDir,
        timeoutMs: 1,
        probeTimeoutMs: 1,
        runDirect,
        runShell,
      },
      {
        access: vi.fn(async (targetPath: string) => {
          if (targetPath.startsWith(`${nvmDir}\\v22.17.0`)) {
            throw new Error('skip version dir candidate')
          }
        }),
        pathModule,
      }
    )

    expect(result.ok).toBe(true)
    expect(result.previousNvmCurrentVersion).toBe('v20.11.1')
    expect(result.currentNvmCurrentVersion).toBe(targetVersion)
    expect(result.nodeBinDir).toBe(nvmSymlinkDir)
    expect(result.nodeExecutable).toBe(`${nvmSymlinkDir}\\node.exe`)
    expect(result.npmExecutable).toBe(`${nvmSymlinkDir}\\npm.cmd`)
    expect(result.verifiedNodeVersion).toBe(targetVersion)
    expect(result.verifiedNpmVersion).toBe('10.8.2')
    expect(result.allowPrivateRuntimeFallback).toBe(false)
  })

  it('allows private runtime fallback when nvm install fails before any switch', async () => {
    const runDirect = vi.fn(async (command: string, args: string[]) => {
      if (command === nvmExecutable && args[0] === 'current') {
        return makeCliResult({ stdout: 'v20.11.1' })
      }
      if (command === nvmExecutable && args[0] === 'install') {
        return makeCliResult({ ok: false, stderr: 'download failed', code: 1 })
      }
      throw new Error(`unexpected direct command: ${command} ${args.join(' ')}`)
    })

    const result = await ensureWindowsNvmNodeRuntime(
      {
        targetVersion,
        nvmDir,
        nvmExecutable,
        nvmSymlinkDir,
        timeoutMs: 1,
        probeTimeoutMs: 1,
        runDirect,
        runShell: vi.fn(async () => makeCliResult()),
      },
      {
        access: vi.fn(async (targetPath: string) => {
          if (targetPath.startsWith(`${nvmDir}\\v22.17.0`)) {
            throw new Error('skip version dir candidate')
          }
        }),
        pathModule,
      }
    )

    expect(result.ok).toBe(false)
    expect(result.allowPrivateRuntimeFallback).toBe(true)
    expect(result.fallbackReason).toBe('nvm-install-failed')
    expect(result.previousNvmCurrentVersion).toBe('v20.11.1')
    expect(result.currentNvmCurrentVersion).toBe('v20.11.1')
  })

  it('allows private runtime fallback when nvm use fails without changing current', async () => {
    const runDirect = vi.fn(async (command: string, args: string[]) => {
      if (command === nvmExecutable && args[0] === 'current') {
        return makeCliResult({ stdout: 'v20.11.1' })
      }
      if (command === nvmExecutable && args[0] === 'install') {
        return makeCliResult({ stdout: 'installation ok' })
      }
      if (command === nvmExecutable && args[0] === 'use') {
        if (args[1] === '22.17.0') {
          return makeCliResult({ ok: false, stderr: 'access denied', code: 1 })
        }
        throw new Error(`unexpected rollback use command: ${args.join(' ')}`)
      }
      throw new Error(`unexpected direct command: ${command} ${args.join(' ')}`)
    })

    const result = await ensureWindowsNvmNodeRuntime(
      {
        targetVersion,
        nvmDir,
        nvmExecutable,
        nvmSymlinkDir,
        timeoutMs: 1,
        probeTimeoutMs: 1,
        runDirect,
        runShell: vi.fn(async () => makeCliResult()),
      },
      {
        access: vi.fn(async (targetPath: string) => {
          if (targetPath.startsWith(`${nvmDir}\\v22.17.0`)) {
            throw new Error('skip version dir candidate')
          }
        }),
        pathModule,
      }
    )

    expect(result.ok).toBe(false)
    expect(result.allowPrivateRuntimeFallback).toBe(true)
    expect(result.fallbackReason).toBe('nvm-use-failed')
    expect(result.rollbackAttempted).toBe(false)
    expect(result.previousNvmCurrentVersion).toBe('v20.11.1')
    expect(result.currentNvmCurrentVersion).toBe('v20.11.1')
  })

  it('rolls back before allowing fallback when post-verify fails after switching current', async () => {
    let currentVersion = 'v20.11.1'
    const runDirect = vi.fn(async (command: string, args: string[]) => {
      if (command === nvmExecutable && args[0] === 'current') {
        return makeCliResult({ stdout: currentVersion })
      }
      if (command === nvmExecutable && args[0] === 'install') {
        return makeCliResult({ stdout: 'installation ok' })
      }
      if (command === nvmExecutable && args[0] === 'use' && args[1] === '22.17.0') {
        currentVersion = targetVersion
        return makeCliResult({ stdout: 'switch ok' })
      }
      if (command === nvmExecutable && args[0] === 'use' && args[1] === '20.11.1') {
        currentVersion = 'v20.11.1'
        return makeCliResult({ stdout: 'rollback ok' })
      }
      if (command.endsWith('\\node.exe')) {
        return makeCliResult({ stdout: 'v20.11.1' })
      }
      throw new Error(`unexpected direct command: ${command} ${args.join(' ')}`)
    })

    const result = await ensureWindowsNvmNodeRuntime(
      {
        targetVersion,
        nvmDir,
        nvmExecutable,
        nvmSymlinkDir,
        timeoutMs: 1,
        probeTimeoutMs: 1,
        runDirect,
        runShell: vi.fn(async () => makeCliResult({ stdout: '10.8.2' })),
      },
      {
        access: vi.fn(async (targetPath: string) => {
          if (targetPath.startsWith(`${nvmDir}\\v22.17.0`)) {
            throw new Error('skip version dir candidate')
          }
        }),
        pathModule,
      }
    )

    expect(result.ok).toBe(false)
    expect(result.allowPrivateRuntimeFallback).toBe(true)
    expect(result.fallbackReason).toBe('nvm-post-verify-failed')
    expect(result.rollbackAttempted).toBe(true)
    expect(result.rollbackSucceeded).toBe(true)
    expect(result.previousNvmCurrentVersion).toBe('v20.11.1')
    expect(result.currentNvmCurrentVersion).toBe('v20.11.1')
  })

  it('stops fallback when rollback fails after a side-effecting switch', async () => {
    let currentVersion = 'v20.11.1'
    const runDirect = vi.fn(async (command: string, args: string[]) => {
      if (command === nvmExecutable && args[0] === 'current') {
        return makeCliResult({ stdout: currentVersion })
      }
      if (command === nvmExecutable && args[0] === 'install') {
        return makeCliResult({ stdout: 'installation ok' })
      }
      if (command === nvmExecutable && args[0] === 'use' && args[1] === '22.17.0') {
        currentVersion = targetVersion
        return makeCliResult({ stdout: 'switch ok' })
      }
      if (command === nvmExecutable && args[0] === 'use' && args[1] === '20.11.1') {
        return makeCliResult({ ok: false, stderr: 'rollback denied', code: 1 })
      }
      if (command.endsWith('\\node.exe')) {
        return makeCliResult({ stdout: 'v20.11.1' })
      }
      throw new Error(`unexpected direct command: ${command} ${args.join(' ')}`)
    })

    const result = await ensureWindowsNvmNodeRuntime(
      {
        targetVersion,
        nvmDir,
        nvmExecutable,
        nvmSymlinkDir,
        timeoutMs: 1,
        probeTimeoutMs: 1,
        runDirect,
        runShell: vi.fn(async () => makeCliResult({ stdout: '10.8.2' })),
      },
      {
        access: vi.fn(async () => undefined),
        pathModule,
      }
    )

    expect(result.ok).toBe(false)
    expect(result.allowPrivateRuntimeFallback).toBe(false)
    expect(result.fallbackReason).toBe('nvm-rollback-failed')
    expect(result.rollbackAttempted).toBe(true)
    expect(result.rollbackSucceeded).toBe(false)
    expect(result.currentNvmCurrentVersion).toBe(targetVersion)
  })
})
