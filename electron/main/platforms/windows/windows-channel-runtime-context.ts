import { getSelectedWindowsActiveRuntimeSnapshot } from '../../windows-active-runtime'
import { resolveWindowsActiveRuntimeSnapshotForRead } from '../../openclaw-runtime-readonly'
import { buildCliPathWithCandidates } from '../../runtime-path-discovery'
import { MAIN_RUNTIME_POLICY } from '../../runtime-policy'
import type { WindowsActiveRuntimeSnapshot } from './windows-runtime-policy'
import {
  ensureWindowsPluginHostRuntimeBridgeForRuntimeSnapshot,
  type WindowsPluginHostRuntimeBridgeFailureKind,
  type WindowsPluginHostRuntimeBridgeCaller,
  type WindowsPluginHostRuntimeBridgeResult,
} from './windows-plugin-runtime-bridge'
import {
  PINNED_OPENCLAW_VERSION,
  normalizeOpenClawPolicyVersion,
} from '../../../../src/shared/openclaw-version-policy'

export interface WindowsChannelRuntimeContext {
  bridge: WindowsPluginHostRuntimeBridgeResult
  configPath: string
  homeDir: string
  hostPackageRoot: string
  nodePath: string
  npmPrefix: string
  openclawPath: string
  openclawVersion: string | null
  privateNodeEnv: {
    pathPrefix: string
  }
  snapshot: WindowsActiveRuntimeSnapshot
  stateDir: string
}

export interface ResolveWindowsChannelRuntimeContextOptions {
  caller?: WindowsPluginHostRuntimeBridgeCaller
  platform?: NodeJS.Platform
  snapshot?: WindowsActiveRuntimeSnapshot | null
  probeOpenClawVersion?: (
    snapshot: WindowsActiveRuntimeSnapshot
  ) => Promise<string | null>
  refreshSnapshotAfterRepair?: () => Promise<WindowsActiveRuntimeSnapshot | null>
  runVersionAutoRepair?: () => Promise<{ ok: boolean; message?: string }>
}

export type ResolveWindowsChannelRuntimeContextResult =
  | {
      ok: true
      context: WindowsChannelRuntimeContext
    }
  | {
      ok: false
      bridge: WindowsPluginHostRuntimeBridgeResult
      context: null
      message: string
    }

function cloneSnapshot(snapshot: WindowsActiveRuntimeSnapshot): WindowsActiveRuntimeSnapshot {
  return { ...snapshot }
}

function collectMissingRuntimeContextFields(snapshot: WindowsActiveRuntimeSnapshot): string[] {
  return [
    ['stateDir', snapshot.stateDir],
    ['configPath', snapshot.configPath],
    ['hostPackageRoot', snapshot.hostPackageRoot],
    ['nodePath', snapshot.nodePath],
    ['npmPrefix', snapshot.npmPrefix],
    ['openclawPath', snapshot.openclawPath],
  ]
    .filter(([, value]) => !String(value || '').trim())
    .map(([key]) => key)
}

function isVersionRepairAllowed(
  caller: WindowsPluginHostRuntimeBridgeCaller | null | undefined,
  platform: NodeJS.Platform
): boolean {
  return platform === 'win32' && caller === 'channel-preflight'
}

function isPinnedVersionMismatch(version: string | null | undefined): boolean {
  const normalizedVersion = normalizeOpenClawPolicyVersion(version)
  return Boolean(normalizedVersion) && normalizedVersion !== PINNED_OPENCLAW_VERSION
}

function buildVersionMismatchMessage(version: string | null | undefined): string {
  return `Selected Windows OpenClaw executable version ${version || 'unknown'} does not match ${PINNED_OPENCLAW_VERSION}.`
}

function buildVersionProbeFailedMessage(openclawPath: string | null | undefined): string {
  return `Unable to determine the selected Windows OpenClaw executable version from ${openclawPath || 'the configured openclaw path'}.`
}

function toBridgeFailureResult(
  bridge: WindowsPluginHostRuntimeBridgeResult,
  message: string,
  caller: WindowsPluginHostRuntimeBridgeCaller | null | undefined,
  packageVersion?: string | null,
  failureKind: WindowsPluginHostRuntimeBridgeFailureKind = 'version_mismatch'
): WindowsPluginHostRuntimeBridgeResult {
  return {
    ...bridge,
    ok: false,
    diagnosticSeverity: caller === 'channel-preflight' ? 'error' : 'warning',
    failureKind,
    message,
    packageVersion: packageVersion ?? bridge.packageVersion,
  }
}

async function probeWindowsOpenClawVersion(
  snapshot: WindowsActiveRuntimeSnapshot,
  options: ResolveWindowsChannelRuntimeContextOptions
): Promise<string | null> {
  if (options.probeOpenClawVersion) {
    return normalizeOpenClawPolicyVersion(await options.probeOpenClawVersion(snapshot))
  }

  const { runCliWithBinary } = await import('../../cli')
  const envPath = buildCliPathWithCandidates({
    activeRuntimeSnapshot: snapshot,
    currentPath: String(process.env.PATH || ''),
    env: process.env,
    platform: options.platform || process.platform,
  })
  const result = await runCliWithBinary(
    snapshot.openclawPath,
    ['--version'],
    MAIN_RUNTIME_POLICY.cli.lightweightProbeTimeoutMs,
    'env-setup',
    {
      PATH: envPath,
    }
  ).catch(() => null)
  const rawVersion = String(result?.stdout || result?.stderr || '').trim()
  return normalizeOpenClawPolicyVersion(rawVersion)
}

async function runWindowsChannelVersionAutoRepair(
  options: ResolveWindowsChannelRuntimeContextOptions
): Promise<{ ok: boolean; message?: string }> {
  if (options.runVersionAutoRepair) {
    return await options.runVersionAutoRepair()
  }

  const { runOpenClawUpgrade } = await import('../../openclaw-upgrade-service')
  const result = await runOpenClawUpgrade()
  return {
    ok: result.ok,
    message: result.message,
  }
}

async function refreshWindowsChannelRuntimeSnapshot(
  options: ResolveWindowsChannelRuntimeContextOptions
): Promise<WindowsActiveRuntimeSnapshot | null> {
  if (options.refreshSnapshotAfterRepair) {
    return await options.refreshSnapshotAfterRepair()
  }

  return await resolveWindowsActiveRuntimeSnapshotForRead({
    platform: options.platform || process.platform,
    getCachedRuntimeSnapshot: getSelectedWindowsActiveRuntimeSnapshot,
  })
}

export async function resolveWindowsChannelRuntimeContext(
  options: ResolveWindowsChannelRuntimeContextOptions = {}
): Promise<ResolveWindowsChannelRuntimeContextResult> {
  let snapshot =
    options.snapshot
    || await resolveWindowsActiveRuntimeSnapshotForRead({
      platform: options.platform || process.platform,
      getCachedRuntimeSnapshot: getSelectedWindowsActiveRuntimeSnapshot,
    })
  let attemptedVersionRepair = false

  while (true) {
    const bridge = await ensureWindowsPluginHostRuntimeBridgeForRuntimeSnapshot(snapshot, {
      caller: options.caller,
      platform: options.platform,
    })

    if (!snapshot || !bridge.ok) {
      const versionRepairAllowed = isVersionRepairAllowed(
        options.caller,
        options.platform || process.platform
      )
      const canRepairBridgeVersionMismatch =
        versionRepairAllowed &&
        !attemptedVersionRepair &&
        bridge.failureKind === 'version_mismatch'

      if (canRepairBridgeVersionMismatch) {
        const repairResult = await runWindowsChannelVersionAutoRepair(options)
        attemptedVersionRepair = true
        if (!repairResult.ok) {
          const message = repairResult.message || bridge.message || 'Windows OpenClaw runtime context is unavailable.'
          return {
            ok: false,
            bridge: toBridgeFailureResult(bridge, message, options.caller),
            context: null,
            message,
          }
        }

        snapshot = await refreshWindowsChannelRuntimeSnapshot(options)
        continue
      }

      return {
        ok: false,
        bridge,
        context: null,
        message: bridge.message || 'Windows OpenClaw runtime context is unavailable.',
      }
    }

    const missingFields = collectMissingRuntimeContextFields(snapshot)
    if (missingFields.length > 0) {
      return {
        ok: false,
        bridge,
        context: null,
        message: `Windows OpenClaw runtime snapshot is incomplete: ${missingFields.join(', ')}.`,
      }
    }

    const resolvedVersion = await probeWindowsOpenClawVersion(snapshot, options).catch(() => null)
    const versionRepairAllowed = isVersionRepairAllowed(
      options.caller,
      options.platform || process.platform
    )
    if (!resolvedVersion) {
      if (versionRepairAllowed && !attemptedVersionRepair) {
        const repairResult = await runWindowsChannelVersionAutoRepair(options)
        attemptedVersionRepair = true
        if (!repairResult.ok) {
          const message =
            repairResult.message
            || buildVersionProbeFailedMessage(snapshot.openclawPath)
          return {
            ok: false,
            bridge: toBridgeFailureResult(
              bridge,
              message,
              options.caller,
              null,
              'version_probe_failed'
            ),
            context: null,
            message,
          }
        }

        snapshot = await refreshWindowsChannelRuntimeSnapshot(options)
        continue
      }

      const message = buildVersionProbeFailedMessage(snapshot.openclawPath)
      return {
        ok: false,
        bridge: toBridgeFailureResult(
          bridge,
          message,
          options.caller,
          null,
          'version_probe_failed'
        ),
        context: null,
        message,
      }
    }

    if (isPinnedVersionMismatch(resolvedVersion)) {
      if (versionRepairAllowed && !attemptedVersionRepair) {
        const repairResult = await runWindowsChannelVersionAutoRepair(options)
        attemptedVersionRepair = true
        if (!repairResult.ok) {
          const message =
            repairResult.message
            || buildVersionMismatchMessage(resolvedVersion)
          return {
            ok: false,
            bridge: toBridgeFailureResult(bridge, message, options.caller, resolvedVersion),
            context: null,
            message,
          }
        }

        snapshot = await refreshWindowsChannelRuntimeSnapshot(options)
        continue
      }

      const message = buildVersionMismatchMessage(resolvedVersion)
      return {
        ok: false,
        bridge: toBridgeFailureResult(bridge, message, options.caller, resolvedVersion),
        context: null,
        message,
      }
    }

    const clonedSnapshot = cloneSnapshot(snapshot)
    return {
      ok: true,
      context: {
        bridge,
        configPath: clonedSnapshot.configPath,
        homeDir: clonedSnapshot.stateDir,
        hostPackageRoot: clonedSnapshot.hostPackageRoot,
        nodePath: clonedSnapshot.nodePath,
        npmPrefix: clonedSnapshot.npmPrefix,
        openclawPath: clonedSnapshot.openclawPath,
        openclawVersion: resolvedVersion || bridge.packageVersion,
        privateNodeEnv: {
          pathPrefix: clonedSnapshot.npmPrefix,
        },
        snapshot: clonedSnapshot,
        stateDir: clonedSnapshot.stateDir,
      },
    }
  }
}
