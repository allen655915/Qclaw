import { describe, expect, it } from 'vitest'

import {
  buildWindowsNodeInstallExecutionOutcome,
  buildWindowsNodeInstallExecutionPlanId,
  resolveWindowsNodeInstallExecutionPlanFromInputs,
  toWindowsNodeInstallExecutionPlanView,
} from '../windows-node-install-execution'

describe('resolveWindowsNodeInstallExecutionPlanFromInputs', () => {
  it('prefers nvm-global when the detected strategy is nvm and nvm.exe is usable', () => {
    const plan = resolveWindowsNodeInstallExecutionPlanFromInputs({
      targetVersion: 'v24.14.1',
      detectedNodePath: 'C:\\Users\\alice\\AppData\\Roaming\\nvm\\v22.17.0\\node.exe',
      detectedInstallStrategy: 'nvm',
      nvmDir: 'C:\\Users\\alice\\AppData\\Roaming\\nvm',
      nvmExecutable: 'C:\\Users\\alice\\AppData\\Roaming\\nvm\\nvm.exe',
      nvmExecutableAvailable: true,
      nvmProbeOk: true,
      nvmSymlinkDir: 'C:\\Program Files\\nodejs',
      hasDetectedRuntimeCandidate: false,
    })

    expect(plan.family).toBe('nvm-global')
    expect(plan.fallbackPolicy).toBe('allow-private-runtime-fallback-after-rollback')
    expect(plan.requiresBindingRepair).toBe(false)
    expect(plan.planId).toContain('nvm-global')
  })

  it('falls back to private-runtime when nvm.exe cannot be used', () => {
    const plan = resolveWindowsNodeInstallExecutionPlanFromInputs({
      targetVersion: 'v24.14.1',
      detectedNodePath: 'C:\\Users\\alice\\AppData\\Roaming\\nvm\\v22.17.0\\node.exe',
      detectedInstallStrategy: 'nvm',
      nvmDir: 'C:\\Users\\alice\\AppData\\Roaming\\nvm',
      nvmExecutable: 'C:\\Users\\alice\\AppData\\Roaming\\nvm\\nvm.exe',
      nvmExecutableAvailable: true,
      nvmProbeOk: false,
      nvmSymlinkDir: 'C:\\Program Files\\nodejs',
      hasDetectedRuntimeCandidate: false,
    })

    expect(plan.family).toBe('private-runtime')
    expect(plan.fallbackPolicy).toBe('not-applicable')
  })

  it('marks binding repair when any existing runtime binding signal is present', () => {
    const plan = resolveWindowsNodeInstallExecutionPlanFromInputs({
      targetVersion: 'v24.14.1',
      detectedNodePath: 'C:\\Program Files\\nodejs\\node.exe',
      detectedInstallStrategy: 'installer',
      hasDetectedRuntimeCandidate: true,
    })

    expect(plan.requiresBindingRepair).toBe(true)
    expect(plan.hasDetectedRuntimeCandidate).toBe(true)
  })
})

describe('buildWindowsNodeInstallExecutionPlanId', () => {
  it('is deterministic for equivalent plan views', () => {
    const input = {
      platform: 'win32' as const,
      family: 'private-runtime' as const,
      targetVersion: 'v24.14.1',
      detectedNodePath: 'C:\\Program Files\\nodejs\\node.exe',
      detectedInstallStrategy: 'installer' as const,
      requiresBindingRepair: true,
      fallbackPolicy: 'not-applicable' as const,
      nvmDir: null,
      nvmExecutable: null,
      nvmExecutableAvailable: false,
      nvmProbeOk: false,
      nvmSymlinkDir: null,
      hasSelectedRuntimeSnapshot: true,
      hasAuthoritativeSnapshot: false,
      hasDetectedRuntimeCandidate: false,
    }

    expect(buildWindowsNodeInstallExecutionPlanId(input)).toBe(
      buildWindowsNodeInstallExecutionPlanId(toWindowsNodeInstallExecutionPlanView({
        ...input,
        planId: 'ignored',
        previousSelectedRuntimeSnapshot: null,
        previousAuthoritativeSnapshot: null,
      }))
    )
  })
})

describe('buildWindowsNodeInstallExecutionOutcome', () => {
  it('captures the legacy private-runtime execution mode without pretending it was a fallback', () => {
    const outcome = buildWindowsNodeInstallExecutionOutcome({
      appliedFamily: 'private-runtime',
      executionMode: 'legacy-private-runtime',
      fallbackReason: 'legacy-private-runtime-path',
      plan: {
        family: 'nvm-global',
        planId: 'plan-1',
        requiresBindingRepair: true,
      },
      usedFallback: false,
    })

    expect(outcome).toEqual({
      planId: 'plan-1',
      resolvedFamily: 'nvm-global',
      appliedFamily: 'private-runtime',
      executionMode: 'legacy-private-runtime',
      requiresBindingRepair: true,
      usedFallback: false,
      fallbackReason: 'legacy-private-runtime-path',
    })
  })
})
