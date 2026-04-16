import type { WindowsActiveRuntimeSnapshot } from './platforms/windows/windows-runtime-policy'
import type { WindowsChannelRuntimeSnapshot } from './platforms/windows/windows-channel-runtime-snapshot'
import type {
  WindowsNodeDetectedInstallStrategy,
  WindowsNodeInstallExecutionFamily,
  WindowsNodeInstallExecutionMode,
  WindowsNodeInstallExecutionOutcome,
  WindowsNodeInstallExecutionPlanView,
  WindowsNodeInstallFallbackPolicy,
  WindowsNodeInstallFallbackReason,
} from '../../src/shared/windows-node-install-plan'

export interface ResolveWindowsNodeInstallExecutionPlanInput {
  targetVersion: string
  detectedNodePath?: string | null
  detectedInstallStrategy: WindowsNodeDetectedInstallStrategy
  nvmDir?: string | null
  nvmExecutable?: string | null
  nvmExecutableAvailable?: boolean
  nvmProbeOk?: boolean
  nvmSymlinkDir?: string | null
  previousSelectedRuntimeSnapshot?: WindowsActiveRuntimeSnapshot | null
  previousAuthoritativeSnapshot?: WindowsChannelRuntimeSnapshot | null
  hasDetectedRuntimeCandidate?: boolean
}

export interface ResolvedWindowsNodeInstallExecutionPlan extends WindowsNodeInstallExecutionPlanView {
  previousSelectedRuntimeSnapshot: WindowsActiveRuntimeSnapshot | null
  previousAuthoritativeSnapshot: WindowsChannelRuntimeSnapshot | null
}

export interface BuildWindowsNodeInstallExecutionOutcomeInput {
  appliedFamily: WindowsNodeInstallExecutionFamily | null
  executionMode: WindowsNodeInstallExecutionMode
  fallbackReason?: WindowsNodeInstallFallbackReason
  plan?: Pick<
    WindowsNodeInstallExecutionPlanView,
    'family' | 'planId' | 'requiresBindingRepair'
  > | null
  usedFallback?: boolean
}

function normalizeComparablePath(value: string | null | undefined): string {
  return String(value || '').trim().toLowerCase()
}

function normalizeComparableText(value: string | null | undefined): string {
  return String(value || '').trim().toLowerCase()
}

export function buildWindowsNodeInstallExecutionPlanId(
  input: Omit<WindowsNodeInstallExecutionPlanView, 'planId'>
): string {
  return [
    'win32',
    input.family,
    normalizeComparableText(input.targetVersion),
    normalizeComparablePath(input.detectedNodePath),
    input.detectedInstallStrategy,
    input.requiresBindingRepair ? 'repair' : 'node-only',
    input.hasSelectedRuntimeSnapshot ? 'selected' : 'no-selected',
    input.hasAuthoritativeSnapshot ? 'authoritative' : 'no-authoritative',
    input.hasDetectedRuntimeCandidate ? 'candidate' : 'no-candidate',
    normalizeComparablePath(input.nvmDir),
    normalizeComparablePath(input.nvmExecutable),
    input.nvmExecutableAvailable ? 'nvm-exe' : 'no-nvm-exe',
    input.nvmProbeOk ? 'nvm-probe-ok' : 'nvm-probe-failed',
    normalizeComparablePath(input.nvmSymlinkDir),
  ].join('|')
}

export function resolveWindowsNodeInstallExecutionPlanFromInputs(
  input: ResolveWindowsNodeInstallExecutionPlanInput
): ResolvedWindowsNodeInstallExecutionPlan {
  const hasSelectedRuntimeSnapshot = Boolean(input.previousSelectedRuntimeSnapshot)
  const hasAuthoritativeSnapshot = Boolean(input.previousAuthoritativeSnapshot)
  const hasDetectedRuntimeCandidate = input.hasDetectedRuntimeCandidate === true
  const requiresBindingRepair =
    hasSelectedRuntimeSnapshot || hasAuthoritativeSnapshot || hasDetectedRuntimeCandidate

  const family: WindowsNodeInstallExecutionFamily =
    input.detectedInstallStrategy === 'nvm'
    && String(input.nvmDir || '').trim()
    && input.nvmExecutableAvailable === true
    && input.nvmProbeOk === true
      ? 'nvm-global'
      : 'private-runtime'

  const fallbackPolicy: WindowsNodeInstallFallbackPolicy =
    family === 'nvm-global'
      ? 'allow-private-runtime-fallback-after-rollback'
      : 'not-applicable'

  const planViewWithoutId: Omit<WindowsNodeInstallExecutionPlanView, 'planId'> = {
    platform: 'win32',
    family,
    targetVersion: String(input.targetVersion || '').trim(),
    detectedNodePath: String(input.detectedNodePath || '').trim() || null,
    detectedInstallStrategy: input.detectedInstallStrategy,
    requiresBindingRepair,
    fallbackPolicy,
    nvmDir: String(input.nvmDir || '').trim() || null,
    nvmExecutable: String(input.nvmExecutable || '').trim() || null,
    nvmExecutableAvailable: input.nvmExecutableAvailable === true,
    nvmProbeOk: input.nvmProbeOk === true,
    nvmSymlinkDir: String(input.nvmSymlinkDir || '').trim() || null,
    hasSelectedRuntimeSnapshot,
    hasAuthoritativeSnapshot,
    hasDetectedRuntimeCandidate,
  }

  return {
    ...planViewWithoutId,
    planId: buildWindowsNodeInstallExecutionPlanId(planViewWithoutId),
    previousSelectedRuntimeSnapshot: input.previousSelectedRuntimeSnapshot || null,
    previousAuthoritativeSnapshot: input.previousAuthoritativeSnapshot || null,
  }
}

export function toWindowsNodeInstallExecutionPlanView(
  plan: ResolvedWindowsNodeInstallExecutionPlan
): WindowsNodeInstallExecutionPlanView {
  return {
    planId: plan.planId,
    platform: plan.platform,
    family: plan.family,
    targetVersion: plan.targetVersion,
    detectedNodePath: plan.detectedNodePath,
    detectedInstallStrategy: plan.detectedInstallStrategy,
    requiresBindingRepair: plan.requiresBindingRepair,
    fallbackPolicy: plan.fallbackPolicy,
    nvmDir: plan.nvmDir,
    nvmExecutable: plan.nvmExecutable,
    nvmExecutableAvailable: plan.nvmExecutableAvailable,
    nvmProbeOk: plan.nvmProbeOk,
    nvmSymlinkDir: plan.nvmSymlinkDir,
    hasSelectedRuntimeSnapshot: plan.hasSelectedRuntimeSnapshot,
    hasAuthoritativeSnapshot: plan.hasAuthoritativeSnapshot,
    hasDetectedRuntimeCandidate: plan.hasDetectedRuntimeCandidate,
  }
}

export function buildWindowsNodeInstallExecutionOutcome(
  input: BuildWindowsNodeInstallExecutionOutcomeInput
): WindowsNodeInstallExecutionOutcome {
  return {
    planId: input.plan?.planId || null,
    resolvedFamily: input.plan?.family || null,
    appliedFamily: input.appliedFamily,
    executionMode: input.executionMode,
    requiresBindingRepair: input.plan?.requiresBindingRepair === true,
    usedFallback: input.usedFallback === true,
    fallbackReason: input.fallbackReason || 'not-applicable',
  }
}
