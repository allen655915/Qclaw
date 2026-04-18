import { describe, expect, it } from 'vitest'
import { buildWindowsActiveRuntimeSnapshot } from '../platforms/windows/windows-runtime-policy'
import { buildInstallerCommandEnv } from '../installer-command-env'
import { buildTestEnv } from './test-env'

describe('buildInstallerCommandEnv', () => {
  it('prepends the Windows private runtime node directory ahead of the current PATH', () => {
    const env = buildInstallerCommandEnv({
      platform: 'win32',
      env: buildTestEnv({
        LOCALAPPDATA: 'C:\\Users\\alice\\AppData\\Local',
        PATH: 'C:\\Windows\\System32',
      }),
    })

    const entries = String(env.PATH || '').split(';')
    expect(entries[0]).toBe('C:\\Users\\alice\\AppData\\Local\\Qclaw\\runtime\\win32\\node\\v24.14.1')
    expect(entries).toContain('C:\\Windows\\System32')
  })

  it('preserves the original Windows Path entries when PATH is absent', () => {
    const env = buildInstallerCommandEnv({
      platform: 'win32',
      env: buildTestEnv({
        LOCALAPPDATA: 'C:\\Users\\alice\\AppData\\Local',
        Path: 'C:\\Windows\\System32;C:\\Windows',
      }),
    })

    const entries = String(env.PATH || '').split(';')
    expect(entries).toContain('C:\\Windows\\System32')
    expect(entries).toContain('C:\\Windows')
    expect(env.Path).toBe(env.PATH)
  })

  it('preserves unrelated environment variables while augmenting PATH', () => {
    const env = buildInstallerCommandEnv({
      platform: 'darwin',
      env: buildTestEnv({
        HOME: '/Users/alice',
        PATH: '/usr/bin:/bin',
        QCLAW_FEISHU_DIAG: '1',
      }),
    })

    expect(env.QCLAW_FEISHU_DIAG).toBe('1')
    expect(String(env.PATH || '').endsWith('/usr/bin:/bin')).toBe(true)
  })

  it('prefers an explicitly detected node bin directory when building the installer env', () => {
    const env = buildInstallerCommandEnv({
      platform: 'win32',
      detectedNodeBinDir: 'D:\\PortableNode',
      env: buildTestEnv({
        PATH: 'C:\\Windows\\System32',
      }),
    })

    const entries = String(env.PATH || '').split(';')
    expect(entries[0]).toBe('D:\\PortableNode')
  })

  it('reuses the selected runtime snapshot npm prefix when building the installer env', () => {
    const snapshot = buildWindowsActiveRuntimeSnapshot({
      openclawExecutable: 'E:\\QclawRuntime\\npm\\openclaw.cmd',
      nodeExecutable: 'E:\\QclawRuntime\\node\\node.exe',
      npmPrefix: 'E:\\QclawRuntime\\npm',
      configPath: 'C:\\Users\\alice\\.openclaw\\openclaw.json',
      stateDir: 'C:\\Users\\alice\\.openclaw',
      extensionsDir: 'C:\\Users\\alice\\.openclaw\\extensions',
    })

    const env = buildInstallerCommandEnv({
      platform: 'win32',
      activeRuntimeSnapshot: snapshot,
      env: buildTestEnv({
        PATH: 'C:\\Windows\\System32',
      }),
    })

    const entries = String(env.PATH || '').split(';')
    expect(entries).toContain('E:\\QclawRuntime\\npm')
    expect(entries).toContain('E:\\QclawRuntime\\node')
  })

  it('clears stale OpenClaw runtime env and binds the installer to the selected Windows runtime', () => {
    const snapshot = buildWindowsActiveRuntimeSnapshot({
      openclawExecutable: 'E:\\QclawRuntime\\npm\\openclaw.cmd',
      nodeExecutable: 'E:\\QclawRuntime\\node\\node.exe',
      npmPrefix: 'E:\\QclawRuntime\\npm',
      configPath: 'E:\\QclawState\\openclaw.json',
      stateDir: 'E:\\QclawState',
      extensionsDir: 'E:\\QclawState\\extensions',
    })

    const env = buildInstallerCommandEnv({
      platform: 'win32',
      activeRuntimeSnapshot: snapshot,
      env: buildTestEnv({
        PATH: 'C:\\Windows\\System32',
        OPENCLAW_HOME: 'D:\\OldState',
        OPENCLAW_STATE_DIR: 'D:\\OldState',
        OPENCLAW_CONFIG_PATH: 'D:\\OldState\\openclaw.json',
        CLAWDBOT_STATE_DIR: 'D:\\LegacyState',
        MOLTBOT_CONFIG_PATH: 'D:\\LegacyState\\openclaw.json',
        npm_config_prefix: 'D:\\BadPrefix',
      }),
    })

    expect(env.OPENCLAW_HOME).toBe('E:\\QclawState')
    expect(env.OPENCLAW_STATE_DIR).toBe('E:\\QclawState')
    expect(env.OPENCLAW_CONFIG_PATH).toBe('E:\\QclawState\\openclaw.json')
    expect(env.CLAWDBOT_STATE_DIR).toBeUndefined()
    expect(env.MOLTBOT_CONFIG_PATH).toBeUndefined()
    expect(env.npm_config_prefix).toBeUndefined()
  })
})
