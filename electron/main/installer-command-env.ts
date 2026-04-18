import type { WindowsActiveRuntimeSnapshot } from './platforms/windows/windows-runtime-policy'
import { getDetectedNodeBinDir } from './detected-node-bin'
import { sanitizeManagedInstallerEnv } from './managed-installer-env'
import { buildCliPathWithCandidates } from './runtime-path-discovery'
import { getSelectedWindowsActiveRuntimeSnapshot } from './windows-active-runtime'

interface BuildInstallerCommandEnvOptions {
  activeRuntimeSnapshot?: WindowsActiveRuntimeSnapshot | null
  detectedNodeBinDir?: string | null
  env?: NodeJS.ProcessEnv
  platform?: NodeJS.Platform
}

function resolveEnvPathValue(env: NodeJS.ProcessEnv): string {
  return String(env.PATH || env.Path || '')
}

const OPENCLAW_INSTALLER_ENV_KEYS_TO_CLEAR = [
  'OPENCLAW_HOME',
  'OPENCLAW_STATE_DIR',
  'OPENCLAW_CONFIG_PATH',
  'CLAWDBOT_STATE_DIR',
  'CLAWDBOT_CONFIG_PATH',
  'MOLTBOT_STATE_DIR',
  'MOLTBOT_CONFIG_PATH',
] as const

function bindInstallerRuntimeEnv(
  env: NodeJS.ProcessEnv,
  activeRuntimeSnapshot: WindowsActiveRuntimeSnapshot | null,
  platform: NodeJS.Platform
): NodeJS.ProcessEnv {
  const boundEnv: NodeJS.ProcessEnv = { ...env }

  for (const key of OPENCLAW_INSTALLER_ENV_KEYS_TO_CLEAR) {
    delete boundEnv[key]
  }

  if (platform !== 'win32' || !activeRuntimeSnapshot) {
    return boundEnv
  }

  const stateDir = String(activeRuntimeSnapshot.stateDir || '').trim()
  const configPath = String(activeRuntimeSnapshot.configPath || '').trim()
  if (stateDir) {
    boundEnv.OPENCLAW_HOME = stateDir
    boundEnv.OPENCLAW_STATE_DIR = stateDir
  }
  if (configPath) {
    boundEnv.OPENCLAW_CONFIG_PATH = configPath
  }

  return boundEnv
}

export function buildInstallerCommandEnv(
  options: BuildInstallerCommandEnvOptions = {}
): NodeJS.ProcessEnv {
  const env = options.env || process.env
  const platform = options.platform || process.platform
  const activeRuntimeSnapshot =
    options.activeRuntimeSnapshot === undefined
      ? platform === 'win32'
        ? getSelectedWindowsActiveRuntimeSnapshot()
        : null
      : options.activeRuntimeSnapshot
  const detectedNodeBinDir =
    options.detectedNodeBinDir === undefined
      ? getDetectedNodeBinDir()
      : options.detectedNodeBinDir
  const sanitizedEnv = sanitizeManagedInstallerEnv(env, { platform })
  const installerEnv = bindInstallerRuntimeEnv(
    sanitizedEnv,
    activeRuntimeSnapshot || null,
    platform
  )
  const resolvedPath = buildCliPathWithCandidates({
    activeRuntimeSnapshot: activeRuntimeSnapshot || undefined,
    detectedNodeBinDir: detectedNodeBinDir || undefined,
    platform,
    currentPath: resolveEnvPathValue(installerEnv),
    env: installerEnv,
  })

  const nextEnv: NodeJS.ProcessEnv = {
    ...installerEnv,
    PATH: resolvedPath,
  }
  if (platform === 'win32') {
    nextEnv.Path = resolvedPath
  }
  return nextEnv
}
