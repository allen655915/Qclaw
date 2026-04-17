import { afterEach, describe, expect, it } from 'vitest'
import {
  cleanupFeishuInstallerRuntimeBinding,
  prepareFeishuInstallerRuntimeBinding,
} from '../feishu-installer-runtime-binding'
import {
  probePlatformCommandCapability,
  resetCommandCapabilityCacheForTests,
} from '../command-capabilities'
import { buildWindowsActiveRuntimeSnapshot } from '../platforms/windows/windows-runtime-policy'
import { buildTestEnv } from './test-env'

const childProcess = process.getBuiltinModule('node:child_process') as typeof import('node:child_process')
const fs = process.getBuiltinModule('node:fs') as typeof import('node:fs')
const os = process.getBuiltinModule('node:os') as typeof import('node:os')
const path = process.getBuiltinModule('node:path') as typeof import('node:path')

const tempDirs: string[] = []
const itOnWindows = process.platform === 'win32' ? it : it.skip

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qclaw-feishu-runtime-binding-'))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  resetCommandCapabilityCacheForTests()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }
})

describe('prepareFeishuInstallerRuntimeBinding', () => {
  it('isolates Windows PATH and user directories around the selected OpenClaw runtime', async () => {
    const runtimeRoot = makeTempDir()
    const npmPrefix = path.join(runtimeRoot, 'npm')
    const nodeDir = path.join(runtimeRoot, 'node')
    const hostPackageRoot = path.join(npmPrefix, 'node_modules', 'openclaw')
    const oldOpenclawDir = path.join(runtimeRoot, 'legacy-npm')
    const stateDir = path.join(runtimeRoot, 'state')
    fs.mkdirSync(npmPrefix, { recursive: true })
    fs.mkdirSync(nodeDir, { recursive: true })
    fs.mkdirSync(hostPackageRoot, { recursive: true })
    fs.mkdirSync(oldOpenclawDir, { recursive: true })
    fs.mkdirSync(stateDir, { recursive: true })
    fs.writeFileSync(path.join(oldOpenclawDir, 'openclaw.cmd'), '@echo off\r\necho OpenClaw 2026.2.21\r\n')
    fs.writeFileSync(path.join(npmPrefix, 'npm.cmd'), '@echo off\r\n')
    fs.writeFileSync(path.join(npmPrefix, 'npx.cmd'), '@echo off\r\n')
    fs.writeFileSync(path.join(nodeDir, 'node.exe'), '')
    fs.writeFileSync(
      path.join(hostPackageRoot, 'package.json'),
      JSON.stringify({
        name: 'openclaw',
        version: '2026.4.12',
        bin: {
          openclaw: 'openclaw.mjs',
        },
      })
    )
    fs.writeFileSync(path.join(hostPackageRoot, 'openclaw.mjs'), 'console.log("OpenClaw 2026.4.12")\n')

    const snapshot = buildWindowsActiveRuntimeSnapshot({
      hostPackageRoot,
      openclawExecutable: path.join(oldOpenclawDir, 'openclaw.cmd'),
      nodeExecutable: path.join(nodeDir, 'node.exe'),
      npmPrefix,
      configPath: path.join(stateDir, 'openclaw.json'),
      stateDir,
      extensionsDir: path.join(stateDir, 'extensions'),
    })

    const binding = await prepareFeishuInstallerRuntimeBinding({
      activeRuntimeSnapshot: snapshot,
      baseEnv: buildTestEnv({
        APPDATA: 'D:\\OldRoaming',
        COMSPEC: 'C:\\Windows\\System32\\cmd.exe',
        LOCALAPPDATA: 'D:\\OldLocal',
        PATH: 'D:\\OldRoaming\\npm;C:\\Windows\\System32',
        SystemRoot: 'C:\\Windows',
        USERPROFILE: 'D:\\OldUser',
      }),
      platform: 'win32',
      sessionToken: 'case-one',
    })

    const pathEntries = String(binding.env.PATH || '').split(';')
    expect(binding.npxCommandPath).toBe(path.join(binding.shimDir, 'npx.cmd'))
    expect(pathEntries[0]).toBe(binding.shimDir)
    expect(pathEntries).toContain(nodeDir)
    expect(pathEntries).not.toContain(npmPrefix)
    expect(pathEntries).not.toContain('D:\\OldRoaming\\npm')
    expect(pathEntries).not.toContain(oldOpenclawDir)
    expect(binding.env.OPENCLAW_STATE_DIR).toBe(stateDir)
    expect(binding.env.OPENCLAW_CONFIG_PATH).toBe(path.join(stateDir, 'openclaw.json'))
    expect(binding.env.USERPROFILE).toBe(path.join(binding.cleanupDir, 'profile'))
    expect(binding.env.APPDATA).toBe(path.join(binding.cleanupDir, 'profile', 'AppData', 'Roaming'))
    expect(binding.env.LOCALAPPDATA).toBe(path.join(binding.cleanupDir, 'profile', 'AppData', 'Local'))
    expect(binding.env.TEMP).toBe(path.join(binding.cleanupDir, 'tmp'))
    expect(binding.env.Path).toBe(binding.env.PATH)
    expect(binding.env.COMSPEC).toBe('C:\\Windows\\System32\\cmd.exe')
    expect(binding.env.ComSpec).toBe('C:\\Windows\\System32\\cmd.exe')
    expect(
      fs.readFileSync(path.join(binding.shimDir, 'openclaw.cmd'), 'utf8')
    ).toContain(`"${path.join(nodeDir, 'node.exe')}"`)
    expect(
      fs.readFileSync(path.join(binding.shimDir, 'openclaw.cmd'), 'utf8')
    ).toContain(`"${path.join(hostPackageRoot, 'openclaw.mjs')}"`)
    expect(
      fs.readFileSync(path.join(binding.shimDir, 'openclaw.cmd'), 'utf8')
    ).not.toContain(path.join(oldOpenclawDir, 'openclaw.cmd'))
    expect(fs.readFileSync(path.join(binding.shimDir, 'npm.cmd'), 'utf8')).toContain(
      `"${path.join(npmPrefix, 'npm.cmd')}"`
    )
    expect(fs.readFileSync(path.join(binding.shimDir, 'npx.cmd'), 'utf8')).toContain(
      `"${path.join(npmPrefix, 'npx.cmd')}"`
    )
    const openclawCapability = await probePlatformCommandCapability('openclaw', {
      platform: 'win32',
      env: binding.env,
    })
    const npxCapability = await probePlatformCommandCapability('npx', {
      platform: 'win32',
      env: binding.env,
    })
    expect(openclawCapability.available).toBe(true)
    expect(openclawCapability.resolvedPath?.toLowerCase()).toBe(
      path.join(binding.shimDir, 'openclaw.cmd').toLowerCase()
    )
    expect(npxCapability.available).toBe(true)
    expect(npxCapability.resolvedPath?.toLowerCase()).toBe(
      path.join(binding.shimDir, 'npx.cmd').toLowerCase()
    )

    await cleanupFeishuInstallerRuntimeBinding(binding)
    expect(fs.existsSync(binding.cleanupDir)).toBe(false)
  })

  it('escapes percent signs when generating Windows cmd shims', async () => {
    const runtimeRoot = makeTempDir()
    const percentRoot = path.join(runtimeRoot, '100%demo')
    const npmPrefix = path.join(percentRoot, 'npm')
    const nodeDir = path.join(percentRoot, 'node')
    const hostPackageRoot = path.join(npmPrefix, 'node_modules', 'openclaw')
    const stateDir = path.join(percentRoot, 'state')
    fs.mkdirSync(npmPrefix, { recursive: true })
    fs.mkdirSync(nodeDir, { recursive: true })
    fs.mkdirSync(hostPackageRoot, { recursive: true })
    fs.mkdirSync(stateDir, { recursive: true })
    fs.writeFileSync(path.join(npmPrefix, 'npm.cmd'), '@echo off\r\n')
    fs.writeFileSync(path.join(npmPrefix, 'npx.cmd'), '@echo off\r\n')
    fs.writeFileSync(path.join(nodeDir, 'node.exe'), '')
    fs.writeFileSync(
      path.join(hostPackageRoot, 'package.json'),
      JSON.stringify({
        name: 'openclaw',
        version: '2026.4.12',
        bin: {
          openclaw: 'openclaw.mjs',
        },
      })
    )
    fs.writeFileSync(path.join(hostPackageRoot, 'openclaw.mjs'), 'console.log("OpenClaw 2026.4.12")\n')

    const snapshot = buildWindowsActiveRuntimeSnapshot({
      hostPackageRoot,
      openclawExecutable: path.join(percentRoot, 'legacy-npm', 'openclaw.cmd'),
      nodeExecutable: path.join(nodeDir, 'node.exe'),
      npmPrefix,
      configPath: path.join(stateDir, 'openclaw.json'),
      stateDir,
      extensionsDir: path.join(stateDir, 'extensions'),
    })

    const binding = await prepareFeishuInstallerRuntimeBinding({
      activeRuntimeSnapshot: snapshot,
      baseEnv: buildTestEnv({
        APPDATA: 'D:\\OldRoaming',
        COMSPEC: 'C:\\Windows\\System32\\cmd.exe',
        LOCALAPPDATA: 'D:\\OldLocal',
        PATH: 'C:\\Windows\\System32',
        SystemRoot: 'C:\\Windows',
        USERPROFILE: 'D:\\OldUser',
      }),
      platform: 'win32',
      sessionToken: 'case-percent',
    })

    try {
      expect(fs.readFileSync(path.join(binding.shimDir, 'npx.cmd'), 'utf8')).toContain('100%%demo')
      expect(fs.readFileSync(path.join(binding.shimDir, 'npm.cmd'), 'utf8')).toContain('100%%demo')
      expect(fs.readFileSync(path.join(binding.shimDir, 'openclaw.cmd'), 'utf8')).toContain('100%%demo')
    } finally {
      await cleanupFeishuInstallerRuntimeBinding(binding)
    }
  })

  itOnWindows(
    'forces nested openclaw lookup through the selected runtime package even when PATH contains an older global shim',
    async () => {
      const runtimeRoot = makeTempDir()
      const npmPrefix = path.join(runtimeRoot, 'npm')
      const hostPackageRoot = path.join(npmPrefix, 'node_modules', 'openclaw')
      const oldOpenclawDir = path.join(runtimeRoot, 'legacy-npm')
      const stateDir = path.join(runtimeRoot, 'state')
      fs.mkdirSync(npmPrefix, { recursive: true })
      fs.mkdirSync(hostPackageRoot, { recursive: true })
      fs.mkdirSync(oldOpenclawDir, { recursive: true })
      fs.mkdirSync(stateDir, { recursive: true })
      fs.writeFileSync(path.join(oldOpenclawDir, 'openclaw.cmd'), '@echo off\r\necho OpenClaw 2026.2.21\r\n')
      fs.writeFileSync(path.join(npmPrefix, 'npm.cmd'), '@echo off\r\n')
      fs.writeFileSync(
        path.join(hostPackageRoot, 'package.json'),
        JSON.stringify({
          name: 'openclaw',
          version: '2026.4.12',
          bin: {
            openclaw: 'openclaw.mjs',
          },
        })
      )
      fs.writeFileSync(
        path.join(hostPackageRoot, 'openclaw.mjs'),
        [
          "const version = process.argv.includes('--version') ? 'OpenClaw 2026.4.12' : 'unexpected';",
          'console.log(version)',
        ].join('\n')
      )
      const nestedRunnerPath = path.join(runtimeRoot, 'nested-runner.cjs')
      fs.writeFileSync(
        nestedRunnerPath,
        [
          "const { spawnSync } = require('node:child_process')",
          "const result = spawnSync('openclaw', ['--version'], {",
          "  shell: true,",
          "  env: process.env,",
          "  encoding: 'utf8',",
          "  windowsHide: true,",
          '})',
          'process.stdout.write(JSON.stringify({',
          '  status: result.status,',
          '  stdout: String(result.stdout || "").trim(),',
          '  stderr: String(result.stderr || "").trim(),',
          '}))',
        ].join('\n')
      )
      fs.writeFileSync(
        path.join(npmPrefix, 'npx.cmd'),
        [
          '@echo off',
          `call "${process.execPath}" "${nestedRunnerPath}" %*`,
          'exit /b %errorlevel%',
        ].join('\r\n')
      )

      const snapshot = buildWindowsActiveRuntimeSnapshot({
        hostPackageRoot,
        openclawExecutable: path.join(oldOpenclawDir, 'openclaw.cmd'),
        nodeExecutable: process.execPath,
        npmPrefix,
        configPath: path.join(stateDir, 'openclaw.json'),
        stateDir,
        extensionsDir: path.join(stateDir, 'extensions'),
      })

      const binding = await prepareFeishuInstallerRuntimeBinding({
        activeRuntimeSnapshot: snapshot,
        baseEnv: buildTestEnv({
          APPDATA: 'D:\\OldRoaming',
          COMSPEC: 'C:\\Windows\\System32\\cmd.exe',
          LOCALAPPDATA: 'D:\\OldLocal',
          PATH: `${oldOpenclawDir};C:\\Windows\\System32`,
          SystemRoot: 'C:\\Windows',
          USERPROFILE: 'D:\\OldUser',
        }),
        platform: 'win32',
        sessionToken: 'case-two',
      })

      try {
        const result = childProcess.spawnSync(binding.npxCommandPath, [], {
          shell: true,
          env: binding.env,
          encoding: 'utf8',
          windowsHide: true,
        })
        const nested = JSON.parse(String(result.stdout || '').trim()) as {
          status: number | null
          stdout: string
          stderr: string
        }
        expect(result.status).toBe(0)
        expect(nested.status).toBe(0)
        expect(nested.stdout).toContain('2026.4.12')
        expect(nested.stdout).not.toContain('2026.2.21')
      } finally {
        await cleanupFeishuInstallerRuntimeBinding(binding)
      }
    }
  )

  it('passes through the original env when no Windows runtime snapshot is available', async () => {
    const env = buildTestEnv({
      PATH: '/usr/bin:/bin',
    })

    const binding = await prepareFeishuInstallerRuntimeBinding({
      baseEnv: env,
      platform: 'darwin',
    })

    expect(binding.cleanupDir).toBe('')
    expect(binding.npxCommandPath).toBe('npx')
    expect(binding.env).toEqual(env)
  })
})
