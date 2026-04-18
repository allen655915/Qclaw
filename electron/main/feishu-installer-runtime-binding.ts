import type { WindowsActiveRuntimeSnapshot } from './platforms/windows/windows-runtime-policy'
import { resolveOpenClawCliEntrypointPath } from './openclaw-package'

const fs = process.getBuiltinModule('node:fs') as typeof import('node:fs')
const path = process.getBuiltinModule('node:path') as typeof import('node:path')

const WINDOWS_FEISHU_RUNTIME_ENV_KEYS_TO_CLEAR = [
  'OPENCLAW_HOME',
  'OPENCLAW_STATE_DIR',
  'OPENCLAW_CONFIG_PATH',
  'CLAWDBOT_STATE_DIR',
  'CLAWDBOT_CONFIG_PATH',
  'MOLTBOT_STATE_DIR',
  'MOLTBOT_CONFIG_PATH',
] as const

export interface FeishuInstallerRuntimeBinding {
  cleanupDir: string
  env: NodeJS.ProcessEnv
  npxCommandPath: string
  shimDir: string
}

interface PrepareFeishuInstallerRuntimeBindingOptions {
  activeRuntimeSnapshot?: WindowsActiveRuntimeSnapshot | null
  baseEnv?: NodeJS.ProcessEnv
  platform?: NodeJS.Platform
  sessionToken?: string
}

function trim(value: string | null | undefined): string {
  return String(value || '').trim()
}

function uniqueWindowsPaths(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>()
  const unique: string[] = []
  for (const value of values) {
    const normalized = trim(value).replace(/[\\/]+$/, '')
    if (!normalized) continue
    const comparable = normalized.toLowerCase()
    if (seen.has(comparable)) continue
    seen.add(comparable)
    unique.push(normalized)
  }
  return unique
}

function dirnameIfPresent(value: string | null | undefined): string {
  const normalized = trim(value)
  return normalized ? path.win32.dirname(normalized) : ''
}

async function resolveWindowsRuntimeCommandPath(
  commandName: 'npm.cmd' | 'npx.cmd',
  activeRuntimeSnapshot: WindowsActiveRuntimeSnapshot
): Promise<string> {
  const searchDirs = uniqueWindowsPaths([
    activeRuntimeSnapshot.npmPrefix,
    dirnameIfPresent(activeRuntimeSnapshot.nodePath),
    dirnameIfPresent(activeRuntimeSnapshot.openclawPath),
  ])

  for (const searchDir of searchDirs) {
    const candidatePath = path.win32.join(searchDir, commandName)
    try {
      await fs.promises.access(candidatePath)
      return candidatePath
    } catch {
      // Keep scanning the selected runtime command roots.
    }
  }

  const searchedLocations = searchDirs.length > 0 ? searchDirs.join(', ') : '(none)'
  throw new Error(
    `Unable to bind Feishu installer to the selected OpenClaw runtime: missing ${commandName} in ${searchedLocations}`
  )
}

function resolveWindowsSystemPathEntries(env: NodeJS.ProcessEnv): string[] {
  const systemRoot = trim(env.SystemRoot || env.SYSTEMROOT) || 'C:\\Windows'
  const comSpec = trim(env.ComSpec || env.COMSPEC)
  return uniqueWindowsPaths([
    comSpec ? path.win32.dirname(comSpec) : '',
    path.win32.join(systemRoot, 'System32'),
    path.win32.join(systemRoot, 'System32', 'Wbem'),
    path.win32.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0'),
    systemRoot,
  ])
}

function resolveWindowsSystemShellPath(env: NodeJS.ProcessEnv): string {
  const configuredComSpec = trim(env.ComSpec || env.COMSPEC)
  if (configuredComSpec) return configuredComSpec

  const systemRoot = trim(env.SystemRoot || env.SYSTEMROOT) || 'C:\\Windows'
  return path.win32.join(systemRoot, 'System32', 'cmd.exe')
}

function escapeBatchPercent(value: string): string {
  return value.replace(/%/g, '%%')
}

function quoteWindowsBatchArgument(value: string): string {
  return `"${escapeBatchPercent(trim(value)).replace(/"/g, '""')}"`
}

function buildWindowsCmdShimScript(targetPath: string, fixedArgs: string[] = []): string {
  const normalizedTargetPath = trim(targetPath)
  const normalizedFixedArgs = fixedArgs.map(quoteWindowsBatchArgument).join(' ')
  const commandLine = [quoteWindowsBatchArgument(normalizedTargetPath), normalizedFixedArgs, '%*']
    .filter(Boolean)
    .join(' ')
  return `@echo off\r\ncall ${commandLine}\r\nexit /b %errorlevel%\r\n`
}

async function writeWindowsCmdShim(
  shimPath: string,
  targetPath: string,
  fixedArgs: string[] = []
): Promise<void> {
  await fs.promises.writeFile(shimPath, buildWindowsCmdShimScript(targetPath, fixedArgs), 'utf8')
}

export async function prepareFeishuInstallerRuntimeBinding(
  options: PrepareFeishuInstallerRuntimeBindingOptions = {}
): Promise<FeishuInstallerRuntimeBinding> {
  const platform = options.platform || process.platform
  const baseEnv: NodeJS.ProcessEnv = { ...(options.baseEnv || process.env) }
  const activeRuntimeSnapshot = options.activeRuntimeSnapshot || null

  if (platform !== 'win32' || !activeRuntimeSnapshot) {
    return {
      cleanupDir: '',
      env: baseEnv,
      npxCommandPath: 'npx',
      shimDir: '',
    }
  }

  const npmPrefix = trim(activeRuntimeSnapshot.npmPrefix)
  const nodePath = trim(activeRuntimeSnapshot.nodePath)
  const stateDir = trim(activeRuntimeSnapshot.stateDir)
  const configPath = trim(activeRuntimeSnapshot.configPath)
  const openclawEntrypointPath = await resolveOpenClawCliEntrypointPath({
    activeRuntimeSnapshot,
    platform,
  }).catch((error) => {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Unable to bind Feishu installer to the selected OpenClaw runtime: ${message}`)
  })
  const tmpRoot =
    trim(activeRuntimeSnapshot.tmpDir)
    || path.win32.join(trim(baseEnv.LOCALAPPDATA), 'Qclaw', 'runtime', 'win32', 'tmp')
  const sessionToken = trim(options.sessionToken) || 'default'
  const cleanupDir = path.win32.join(tmpRoot, 'feishu-installer', sessionToken)
  const shimDir = path.win32.join(cleanupDir, 'bin')
  const profileDir = path.win32.join(cleanupDir, 'profile')
  const appDataDir = path.win32.join(profileDir, 'AppData', 'Roaming')
  const localAppDataDir = path.win32.join(profileDir, 'AppData', 'Local')
  const tempDir = path.win32.join(cleanupDir, 'tmp')
  const openclawShimPath = path.win32.join(shimDir, 'openclaw.cmd')
  const npmShimPath = path.win32.join(shimDir, 'npm.cmd')
  const npxShimPath = path.win32.join(shimDir, 'npx.cmd')
  const npmCommandPath = await resolveWindowsRuntimeCommandPath('npm.cmd', activeRuntimeSnapshot)
  const npxCommandPath = await resolveWindowsRuntimeCommandPath('npx.cmd', activeRuntimeSnapshot)
  const comSpecPath = resolveWindowsSystemShellPath(baseEnv)

  const requiredPaths = [
    ['node executable', nodePath],
    ['openclaw entrypoint', openclawEntrypointPath],
    ['npm command', npmCommandPath],
    ['npx command', npxCommandPath],
  ] as const
  for (const [label, targetPath] of requiredPaths) {
    if (!targetPath) {
      throw new Error(`Unable to bind Feishu installer to the selected OpenClaw runtime: missing ${label}`)
    }
  }

  await Promise.all(
    requiredPaths.map(([, targetPath]) => fs.promises.access(targetPath))
  ).catch((error) => {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Unable to bind Feishu installer to the selected OpenClaw runtime: ${message}`)
  })

  await Promise.all([
    fs.promises.mkdir(shimDir, { recursive: true }),
    fs.promises.mkdir(appDataDir, { recursive: true }),
    fs.promises.mkdir(localAppDataDir, { recursive: true }),
    fs.promises.mkdir(tempDir, { recursive: true }),
  ])
  await Promise.all([
    writeWindowsCmdShim(openclawShimPath, nodePath, [openclawEntrypointPath]),
    writeWindowsCmdShim(npmShimPath, npmCommandPath),
    writeWindowsCmdShim(npxShimPath, npxCommandPath),
  ])

  const strictPath = uniqueWindowsPaths([
    shimDir,
    nodePath ? path.win32.dirname(nodePath) : '',
    ...resolveWindowsSystemPathEntries(baseEnv),
  ]).join(';')

  const env: NodeJS.ProcessEnv = { ...baseEnv }
  for (const key of WINDOWS_FEISHU_RUNTIME_ENV_KEYS_TO_CLEAR) {
    delete env[key]
  }

  env.APPDATA = appDataDir
  env.COMSPEC = comSpecPath
  env.ComSpec = comSpecPath
  env.HOME = profileDir
  env.LOCALAPPDATA = localAppDataDir
  env.OPENCLAW_CONFIG_PATH = configPath
  env.OPENCLAW_HOME = stateDir
  env.OPENCLAW_STATE_DIR = stateDir
  env.PATH = strictPath
  env.Path = strictPath
  env.SYSTEMROOT = trim(baseEnv.SYSTEMROOT || baseEnv.SystemRoot) || path.win32.dirname(path.win32.dirname(comSpecPath))
  env.SystemRoot = env.SYSTEMROOT
  env.TEMP = tempDir
  env.TMP = tempDir
  env.USERPROFILE = profileDir

  return {
    cleanupDir,
    env,
    npxCommandPath: npxShimPath,
    shimDir,
  }
}

export async function cleanupFeishuInstallerRuntimeBinding(
  binding: FeishuInstallerRuntimeBinding | null | undefined
): Promise<void> {
  const cleanupDir = trim(binding?.cleanupDir)
  if (!cleanupDir) return
  await fs.promises.rm(cleanupDir, { recursive: true, force: true })
}
