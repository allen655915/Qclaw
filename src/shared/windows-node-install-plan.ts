export type WindowsNodeInstallExecutionFamily = 'nvm-global' | 'private-runtime'

export type WindowsNodeDetectedInstallStrategy = 'nvm' | 'installer'

export type WindowsNodeInstallFallbackPolicy =
  | 'not-applicable'
  | 'allow-private-runtime-fallback-after-rollback'

export type WindowsNodeInstallFallbackReason =
  | 'not-applicable'
  | 'legacy-private-runtime-path'
  | 'nvm-missing'
  | 'nvm-command-unavailable'
  | 'nvm-install-failed'
  | 'nvm-use-failed'
  | 'nvm-post-verify-failed'
  | 'nvm-rollback-failed'
  | 'nvm-side-effect-detected'

export type WindowsNodeInstallExecutionMode = 'legacy-private-runtime' | 'plan-driven'

export interface WindowsNodeInstallExecutionPlanView {
  planId: string
  platform: 'win32'
  family: WindowsNodeInstallExecutionFamily
  targetVersion: string
  detectedNodePath: string | null
  detectedInstallStrategy: WindowsNodeDetectedInstallStrategy
  requiresBindingRepair: boolean
  fallbackPolicy: WindowsNodeInstallFallbackPolicy
  nvmDir: string | null
  nvmExecutable: string | null
  nvmExecutableAvailable: boolean
  nvmProbeOk: boolean
  nvmSymlinkDir: string | null
  hasSelectedRuntimeSnapshot: boolean
  hasAuthoritativeSnapshot: boolean
  hasDetectedRuntimeCandidate: boolean
}

export interface WindowsNodeInstallExecutionOutcome {
  planId: string | null
  resolvedFamily: WindowsNodeInstallExecutionFamily | null
  appliedFamily: WindowsNodeInstallExecutionFamily | null
  executionMode: WindowsNodeInstallExecutionMode
  requiresBindingRepair: boolean
  usedFallback: boolean
  fallbackReason: WindowsNodeInstallFallbackReason
}
