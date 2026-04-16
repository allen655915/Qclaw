import type { CliResult } from '../../cli'
import type { WindowsNodeInstallFallbackReason } from '../../../../src/shared/windows-node-install-plan'
import {
  normalizeNvmInstallVersion,
  normalizeNvmVersionTag,
} from '../../nvm-node-runtime'

const fs = process.getBuiltinModule('node:fs/promises') as typeof import('node:fs/promises')
const path = process.getBuiltinModule('node:path') as typeof import('node:path')

export interface EnsureWindowsNvmNodeRuntimeOptions {
  targetVersion: string
  nvmDir?: string | null
  nvmExecutable?: string | null
  nvmSymlinkDir?: string | null
  timeoutMs: number
  probeTimeoutMs: number
  runDirect: (command: string, args: string[], timeoutMs: number) => Promise<CliResult>
  runShell: (
    command: string,
    args: string[],
    timeoutMs: number,
    options?: {
      env?: Partial<NodeJS.ProcessEnv>
      shell?: boolean
    }
  ) => Promise<CliResult>
}

export interface EnsureWindowsNvmNodeRuntimeDependencies {
  access?: (targetPath: string) => Promise<void>
  pathModule?: typeof import('node:path')
}

export interface WindowsNvmNodeRuntimeResult extends CliResult {
  allowPrivateRuntimeFallback: boolean
  fallbackReason: WindowsNodeInstallFallbackReason
  previousNvmCurrentVersion: string | null
  currentNvmCurrentVersion: string | null
  rollbackAttempted: boolean
  rollbackSucceeded: boolean
  nodeBinDir?: string | null
  nodeExecutable?: string | null
  npmExecutable?: string | null
  verifiedNodeVersion?: string | null
  verifiedNpmVersion?: string | null
}

interface NvmCurrentVersionProbe {
  ok: boolean
  version: string | null
  rawOutput: string
}

function trim(value: string | null | undefined): string {
  return String(value || '').trim()
}

function normalizeVersionTag(value: string | null | undefined): string {
  const normalized = normalizeNvmInstallVersion(trim(value))
  return normalized ? `v${normalized}` : ''
}

function sameVersion(left: string | null | undefined, right: string | null | undefined): boolean {
  const normalizedLeft = normalizeVersionTag(left)
  const normalizedRight = normalizeVersionTag(right)
  if (!normalizedLeft || !normalizedRight) return false
  return normalizedLeft === normalizedRight
}

function parseNvmCurrentVersion(rawOutput: string): string | null {
  const trimmed = trim(rawOutput)
  if (!trimmed) return null

  const normalizedOutput = trimmed.toLowerCase()
  if (
    normalizedOutput.includes('no current version')
    || normalizedOutput.includes('not currently using')
    || normalizedOutput === 'none'
  ) {
    return null
  }

  const matched = trimmed.match(/v?\d+(?:\.\d+){0,2}/)
  return matched ? normalizeVersionTag(matched[0]) : null
}

function buildFailureResult(
  overrides: Partial<WindowsNvmNodeRuntimeResult>
): WindowsNvmNodeRuntimeResult {
  return {
    ok: false,
    stdout: '',
    stderr: '',
    code: 1,
    allowPrivateRuntimeFallback: false,
    fallbackReason: 'not-applicable',
    previousNvmCurrentVersion: null,
    currentNvmCurrentVersion: null,
    rollbackAttempted: false,
    rollbackSucceeded: false,
    ...overrides,
  }
}

async function defaultAccess(targetPath: string): Promise<void> {
  await fs.access(targetPath)
}

async function probeNvmCurrentVersion(
  options: EnsureWindowsNvmNodeRuntimeOptions
): Promise<NvmCurrentVersionProbe> {
  const executable = trim(options.nvmExecutable)
  if (!executable) {
    return {
      ok: false,
      version: null,
      rawOutput: '',
    }
  }

  const result = await options.runDirect(executable, ['current'], options.probeTimeoutMs)
  const rawOutput = [trim(result.stdout), trim(result.stderr)].filter(Boolean).join('\n')
  return {
    ok: result.ok,
    version: parseNvmCurrentVersion(rawOutput),
    rawOutput,
  }
}

function buildCandidateBinDirs(
  targetVersion: string,
  nvmDir: string,
  nvmSymlinkDir: string,
  pathModule: typeof import('node:path')
): string[] {
  const normalizedVersion = normalizeNvmInstallVersion(targetVersion)
  const versionTag = normalizeNvmVersionTag(targetVersion)
  return Array.from(
    new Set(
      [
        trim(nvmSymlinkDir),
        versionTag ? pathModule.join(nvmDir, versionTag) : '',
        normalizedVersion ? pathModule.join(nvmDir, normalizedVersion) : '',
      ].filter(Boolean)
    )
  )
}

async function verifyCandidateBinDir(
  binDir: string,
  targetVersion: string,
  options: EnsureWindowsNvmNodeRuntimeOptions,
  dependencies: EnsureWindowsNvmNodeRuntimeDependencies
): Promise<WindowsNvmNodeRuntimeResult | null> {
  const access = dependencies.access || defaultAccess
  const pathModule = dependencies.pathModule || path
  const nodeExecutable = pathModule.join(binDir, 'node.exe')
  const npmExecutable = pathModule.join(binDir, 'npm.cmd')

  try {
    await access(nodeExecutable)
    await access(npmExecutable)
  } catch {
    return null
  }

  const nodeVersionResult = await options.runDirect(
    nodeExecutable,
    ['--version'],
    options.probeTimeoutMs
  )
  if (!nodeVersionResult.ok) {
    return buildFailureResult({
      stdout: trim(nodeVersionResult.stdout),
      stderr: trim(nodeVersionResult.stderr) || 'nvm Node runtime verification failed',
      code: nodeVersionResult.code ?? 1,
      fallbackReason: 'nvm-post-verify-failed',
      nodeBinDir: binDir,
      nodeExecutable,
      npmExecutable,
    })
  }

  const verifiedNodeVersion = normalizeVersionTag(nodeVersionResult.stdout)
  if (!sameVersion(verifiedNodeVersion, targetVersion)) {
    return buildFailureResult({
      stdout: trim(nodeVersionResult.stdout),
      stderr: `nvm Node runtime verification returned ${trim(nodeVersionResult.stdout)} instead of ${normalizeVersionTag(targetVersion)}`,
      code: nodeVersionResult.code ?? 1,
      fallbackReason: 'nvm-post-verify-failed',
      nodeBinDir: binDir,
      nodeExecutable,
      npmExecutable,
      verifiedNodeVersion,
    })
  }

  const npmVersionResult = await options.runShell(
    npmExecutable,
    ['--version'],
    options.probeTimeoutMs,
    { shell: false }
  )
  if (!npmVersionResult.ok || !trim(npmVersionResult.stdout)) {
    return buildFailureResult({
      stdout: [trim(nodeVersionResult.stdout), trim(npmVersionResult.stdout)].filter(Boolean).join('\n'),
      stderr: trim(npmVersionResult.stderr) || 'nvm npm runtime verification failed',
      code: npmVersionResult.code ?? 1,
      fallbackReason: 'nvm-post-verify-failed',
      nodeBinDir: binDir,
      nodeExecutable,
      npmExecutable,
      verifiedNodeVersion,
    })
  }

  return {
    ok: true,
    stdout: [trim(nodeVersionResult.stdout), trim(npmVersionResult.stdout)].filter(Boolean).join('\n'),
    stderr: '',
    code: 0,
    allowPrivateRuntimeFallback: false,
    fallbackReason: 'not-applicable',
    previousNvmCurrentVersion: null,
    currentNvmCurrentVersion: normalizeVersionTag(targetVersion),
    rollbackAttempted: false,
    rollbackSucceeded: false,
    nodeBinDir: binDir,
    nodeExecutable,
    npmExecutable,
    verifiedNodeVersion,
    verifiedNpmVersion: trim(npmVersionResult.stdout),
  }
}

function didNvmCurrentChange(
  previousVersion: string | null,
  currentVersion: string | null,
  targetVersion: string
): boolean {
  if (sameVersion(previousVersion, currentVersion)) return false
  if (sameVersion(currentVersion, targetVersion)) return true
  return Boolean(previousVersion && currentVersion && !sameVersion(previousVersion, currentVersion))
}

async function rollbackNvmCurrentVersion(
  previousVersion: string | null,
  options: EnsureWindowsNvmNodeRuntimeOptions
): Promise<{ attempted: boolean; ok: boolean; currentVersion: string | null; result: CliResult | null }> {
  if (!previousVersion) {
    return {
      attempted: false,
      ok: false,
      currentVersion: null,
      result: null,
    }
  }

  const result = await options.runDirect(
    trim(options.nvmExecutable),
    ['use', normalizeNvmInstallVersion(previousVersion)],
    options.timeoutMs
  )
  if (!result.ok) {
    return {
      attempted: true,
      ok: false,
      currentVersion: null,
      result,
    }
  }

  const currentProbe = await probeNvmCurrentVersion(options)
  return {
    attempted: true,
    ok: currentProbe.ok && sameVersion(previousVersion, currentProbe.version),
    currentVersion: currentProbe.version,
    result,
  }
}

export async function ensureWindowsNvmNodeRuntime(
  options: EnsureWindowsNvmNodeRuntimeOptions,
  dependencies: EnsureWindowsNvmNodeRuntimeDependencies = {}
): Promise<WindowsNvmNodeRuntimeResult> {
  const pathModule = dependencies.pathModule || path
  const nvmExecutable = trim(options.nvmExecutable)
  const nvmDir = trim(options.nvmDir)
  const targetVersion = normalizeVersionTag(options.targetVersion)

  if (!nvmExecutable || !nvmDir || !targetVersion) {
    return buildFailureResult({
      stderr: 'Windows nvm runtime requires a resolved nvm executable and target version',
      fallbackReason: 'nvm-command-unavailable',
      allowPrivateRuntimeFallback: true,
    })
  }

  const previousCurrentProbe = await probeNvmCurrentVersion(options)
  const previousNvmCurrentVersion = previousCurrentProbe.version

  const installResult = await options.runDirect(
    nvmExecutable,
    ['install', normalizeNvmInstallVersion(targetVersion)],
    options.timeoutMs
  )
  if (!installResult.ok) {
    return buildFailureResult({
      stdout: trim(installResult.stdout),
      stderr: trim(installResult.stderr) || 'nvm install failed',
      code: installResult.code ?? 1,
      allowPrivateRuntimeFallback: true,
      fallbackReason: 'nvm-install-failed',
      previousNvmCurrentVersion,
      currentNvmCurrentVersion: previousNvmCurrentVersion,
    })
  }

  const useResult = await options.runDirect(
    nvmExecutable,
    ['use', normalizeNvmInstallVersion(targetVersion)],
    options.timeoutMs
  )
  if (!useResult.ok) {
    const currentProbe = await probeNvmCurrentVersion(options)
    const currentNvmCurrentVersion = currentProbe.version
    const sideEffectDetected = didNvmCurrentChange(
      previousNvmCurrentVersion,
      currentNvmCurrentVersion,
      targetVersion
    )

    if (!sideEffectDetected) {
      return buildFailureResult({
        stdout: trim(useResult.stdout),
        stderr: trim(useResult.stderr) || 'nvm use failed',
        code: useResult.code ?? 1,
        allowPrivateRuntimeFallback: true,
        fallbackReason: 'nvm-use-failed',
        previousNvmCurrentVersion,
        currentNvmCurrentVersion,
      })
    }

    const rollback = await rollbackNvmCurrentVersion(previousNvmCurrentVersion, options)
    if (!rollback.ok) {
      return buildFailureResult({
        stdout: [trim(useResult.stdout), trim(rollback.result?.stdout)].filter(Boolean).join('\n'),
        stderr: [trim(useResult.stderr), trim(rollback.result?.stderr)]
          .filter(Boolean)
          .join('\n') || 'nvm rollback failed after use failure',
        code: rollback.result?.code ?? useResult.code ?? 1,
        allowPrivateRuntimeFallback: false,
        fallbackReason: previousNvmCurrentVersion ? 'nvm-rollback-failed' : 'nvm-side-effect-detected',
        previousNvmCurrentVersion,
        currentNvmCurrentVersion: rollback.currentVersion || currentNvmCurrentVersion,
        rollbackAttempted: rollback.attempted,
        rollbackSucceeded: rollback.ok,
      })
    }

    return buildFailureResult({
      stdout: [trim(useResult.stdout), trim(rollback.result?.stdout)].filter(Boolean).join('\n'),
      stderr: trim(useResult.stderr) || 'nvm use failed',
      code: useResult.code ?? 1,
      allowPrivateRuntimeFallback: true,
      fallbackReason: 'nvm-use-failed',
      previousNvmCurrentVersion,
      currentNvmCurrentVersion: rollback.currentVersion,
      rollbackAttempted: rollback.attempted,
      rollbackSucceeded: rollback.ok,
    })
  }

  const candidateBinDirs = buildCandidateBinDirs(
    targetVersion,
    nvmDir,
    trim(options.nvmSymlinkDir),
    pathModule
  )

  let verificationFailure: WindowsNvmNodeRuntimeResult | null = null
  for (const candidateBinDir of candidateBinDirs) {
    const verifiedRuntime = await verifyCandidateBinDir(
      candidateBinDir,
      targetVersion,
      options,
      dependencies
    )
    if (!verifiedRuntime) continue
    if (verifiedRuntime.ok) {
      return {
        ...verifiedRuntime,
        previousNvmCurrentVersion,
      }
    }
    verificationFailure = verifiedRuntime
  }

  const currentProbe = await probeNvmCurrentVersion(options)
  const currentNvmCurrentVersion = currentProbe.version
  const sideEffectDetected = didNvmCurrentChange(
    previousNvmCurrentVersion,
    currentNvmCurrentVersion,
    targetVersion
  )

  if (!sideEffectDetected) {
    return buildFailureResult({
      stdout: trim(verificationFailure?.stdout),
      stderr: trim(verificationFailure?.stderr) || 'nvm post-install verification failed',
      code: verificationFailure?.code ?? 1,
      allowPrivateRuntimeFallback: true,
      fallbackReason: 'nvm-post-verify-failed',
      previousNvmCurrentVersion,
      currentNvmCurrentVersion,
      nodeBinDir: verificationFailure?.nodeBinDir || null,
      nodeExecutable: verificationFailure?.nodeExecutable || null,
      npmExecutable: verificationFailure?.npmExecutable || null,
      verifiedNodeVersion: verificationFailure?.verifiedNodeVersion || null,
      verifiedNpmVersion: verificationFailure?.verifiedNpmVersion || null,
    })
  }

  const rollback = await rollbackNvmCurrentVersion(previousNvmCurrentVersion, options)
  if (!rollback.ok) {
    return buildFailureResult({
      stdout: [
        trim(verificationFailure?.stdout),
        trim(rollback.result?.stdout),
      ].filter(Boolean).join('\n'),
      stderr: [
        trim(verificationFailure?.stderr),
        trim(rollback.result?.stderr),
      ].filter(Boolean).join('\n') || 'nvm rollback failed after post-install verification failure',
      code: rollback.result?.code ?? verificationFailure?.code ?? 1,
      allowPrivateRuntimeFallback: false,
      fallbackReason: previousNvmCurrentVersion ? 'nvm-rollback-failed' : 'nvm-side-effect-detected',
      previousNvmCurrentVersion,
      currentNvmCurrentVersion: rollback.currentVersion || currentNvmCurrentVersion,
      rollbackAttempted: rollback.attempted,
      rollbackSucceeded: rollback.ok,
      nodeBinDir: verificationFailure?.nodeBinDir || null,
      nodeExecutable: verificationFailure?.nodeExecutable || null,
      npmExecutable: verificationFailure?.npmExecutable || null,
      verifiedNodeVersion: verificationFailure?.verifiedNodeVersion || null,
      verifiedNpmVersion: verificationFailure?.verifiedNpmVersion || null,
    })
  }

  return buildFailureResult({
    stdout: [
      trim(verificationFailure?.stdout),
      trim(rollback.result?.stdout),
    ].filter(Boolean).join('\n'),
    stderr: trim(verificationFailure?.stderr) || 'nvm post-install verification failed',
    code: verificationFailure?.code ?? 1,
    allowPrivateRuntimeFallback: true,
    fallbackReason: 'nvm-post-verify-failed',
    previousNvmCurrentVersion,
    currentNvmCurrentVersion: rollback.currentVersion,
    rollbackAttempted: rollback.attempted,
    rollbackSucceeded: rollback.ok,
    nodeBinDir: verificationFailure?.nodeBinDir || null,
    nodeExecutable: verificationFailure?.nodeExecutable || null,
    npmExecutable: verificationFailure?.npmExecutable || null,
    verifiedNodeVersion: verificationFailure?.verifiedNodeVersion || null,
    verifiedNpmVersion: verificationFailure?.verifiedNpmVersion || null,
  })
}
