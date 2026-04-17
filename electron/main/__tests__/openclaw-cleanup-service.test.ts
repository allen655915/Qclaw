import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const fs = process.getBuiltinModule('node:fs') as typeof import('node:fs')
const os = process.getBuiltinModule('node:os') as typeof import('node:os')
const path = process.getBuiltinModule('node:path') as typeof import('node:path')

const {
  clearSelectedWindowsOpenClawRuntimeSelectionMock,
  cleanupOpenClawStateAndDataMock,
  getSelectedWindowsActiveRuntimeSnapshotMock,
  runShellMock,
  uninstallOpenClawNpmGlobalPackageMock,
  createManagedBackupArchiveMock,
  buildOpenClawCleanupPreviewMock,
  resolveOpenClawBinaryPathMock,
} = vi.hoisted(() => ({
  clearSelectedWindowsOpenClawRuntimeSelectionMock: vi.fn(),
  cleanupOpenClawStateAndDataMock: vi.fn(),
  getSelectedWindowsActiveRuntimeSnapshotMock: vi.fn(),
  runShellMock: vi.fn(),
  uninstallOpenClawNpmGlobalPackageMock: vi.fn(),
  createManagedBackupArchiveMock: vi.fn(),
  buildOpenClawCleanupPreviewMock: vi.fn(),
  resolveOpenClawBinaryPathMock: vi.fn(),
}))

vi.mock('../cli', () => ({
  clearSelectedWindowsOpenClawRuntimeSelection: clearSelectedWindowsOpenClawRuntimeSelectionMock,
  cleanupOpenClawStateAndData: cleanupOpenClawStateAndDataMock,
  runShell: runShellMock,
  uninstallOpenClawNpmGlobalPackage: uninstallOpenClawNpmGlobalPackageMock,
}))

vi.mock('../openclaw-backup-index', () => ({
  createManagedBackupArchive: createManagedBackupArchiveMock,
}))

vi.mock('../openclaw-cleanup-planner', () => ({
  buildOpenClawCleanupPreview: buildOpenClawCleanupPreviewMock,
}))

vi.mock('../openclaw-package', () => ({
  resolveOpenClawBinaryPath: resolveOpenClawBinaryPathMock,
}))

vi.mock('../windows-active-runtime', () => ({
  getSelectedWindowsActiveRuntimeSnapshot: getSelectedWindowsActiveRuntimeSnapshotMock,
}))

import { runOpenClawCleanup } from '../openclaw-cleanup-service'

function buildCandidate(input: { id: string; source: string }) {
  return {
    candidateId: input.id,
    binaryPath: `/usr/local/bin/openclaw-${input.id}`,
    resolvedBinaryPath: `/usr/local/bin/openclaw-${input.id}`,
    packageRoot: `/usr/local/lib/node_modules/openclaw-${input.id}`,
    version: '2026.3.12',
    installSource: input.source,
    isPathActive: input.id === 'candidate-1',
    configPath: `/Users/test/.openclaw-${input.id}/openclaw.json`,
    stateRoot: `/Users/test/.openclaw-${input.id}`,
    displayConfigPath: `~/.openclaw-${input.id}/openclaw.json`,
    displayStateRoot: `~/.openclaw-${input.id}`,
    ownershipState: 'mixed-managed',
    installFingerprint: `fingerprint-${input.id}`,
    baselineBackup: null,
    baselineBackupBypass: null,
  } as const
}

function buildWindowsSelectedRuntimeSnapshot(input: {
  configPath?: string
  hostPackageRoot: string
  openclawPath: string
  stateDir?: string
}) {
  const stateDir = input.stateDir || path.dirname(String(input.configPath || '')) || 'C:\\Users\\test\\.openclaw'
  return {
    configPath: input.configPath || path.join(stateDir, 'openclaw.json'),
    extensionsDir: path.join(stateDir, 'extensions'),
    hostPackageRoot: input.hostPackageRoot,
    logsDir: path.join(stateDir, 'logs'),
    nodePath: path.join(path.dirname(input.openclawPath), 'node.exe'),
    npmPrefix: path.dirname(input.openclawPath),
    openclawPath: input.openclawPath,
    stateDir,
    tmpDir: path.join(stateDir, 'tmp'),
  }
}

describe('openclaw cleanup service', () => {
  const tempDirs: string[] = []
  const originalBatchCleanupFlag = process.env.QCLAW_OPENCLAW_BATCH_CLEANUP_ENABLED

  beforeEach(() => {
    clearSelectedWindowsOpenClawRuntimeSelectionMock.mockReset()
    cleanupOpenClawStateAndDataMock.mockReset()
    getSelectedWindowsActiveRuntimeSnapshotMock.mockReset()
    getSelectedWindowsActiveRuntimeSnapshotMock.mockReturnValue(null)
    runShellMock.mockReset()
    uninstallOpenClawNpmGlobalPackageMock.mockReset()
    createManagedBackupArchiveMock.mockReset()
    buildOpenClawCleanupPreviewMock.mockReset()
    resolveOpenClawBinaryPathMock.mockReset()
    resolveOpenClawBinaryPathMock.mockRejectedValue(new Error('not found'))
  })

  function makeTempDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qclaw-cleanup-verify-'))
    tempDirs.push(dir)
    return dir
  }

  afterEach(() => {
    if (originalBatchCleanupFlag === undefined) {
      delete process.env.QCLAW_OPENCLAW_BATCH_CLEANUP_ENABLED
    } else {
      process.env.QCLAW_OPENCLAW_BATCH_CLEANUP_ENABLED = originalBatchCleanupFlag
    }
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop()
      if (dir) fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('runs batch cleanup for selected candidates and summarizes successes', async () => {
    const candidate1 = buildCandidate({ id: 'candidate-1', source: 'homebrew' })
    const candidate2 = buildCandidate({ id: 'candidate-2', source: 'npm-global' })

    buildOpenClawCleanupPreviewMock.mockResolvedValue({
      ok: true,
      canRun: true,
      actionType: 'remove-openclaw',
      activeCandidate: candidate1,
      availableCandidates: [candidate1, candidate2],
      selectedCandidateIds: [candidate1.candidateId, candidate2.candidateId],
      deleteItems: [],
      keepItems: [],
      backupItems: [],
      warnings: [],
      blockedReasons: [],
      backupDirectory: '/Users/test/Documents/Qclaw Lite Backups',
    })
    cleanupOpenClawStateAndDataMock.mockResolvedValue({
      ok: true,
      stdout: 'ok',
      stderr: '',
      code: 0,
    })
    runShellMock.mockResolvedValue({
      ok: true,
      stdout: '',
      stderr: '',
      code: 0,
    })
    uninstallOpenClawNpmGlobalPackageMock.mockResolvedValue({
      ok: true,
      stdout: '',
      stderr: '',
      code: 0,
    })
    createManagedBackupArchiveMock.mockResolvedValue({
      backupId: 'cleanup-backup-1',
      createdAt: '2026-03-18T00:00:00.000Z',
      archivePath: '/tmp/cleanup-backup-1',
      manifestPath: '/tmp/cleanup-backup-1/manifest.json',
      type: 'cleanup-backup',
      installFingerprint: 'fingerprint-candidate-1',
      sourceVersion: '2026.3.12',
      scopeAvailability: {
        hasConfigData: true,
        hasMemoryData: true,
        hasEnvData: true,
        hasCredentialsData: true,
      },
    })

    const result = await runOpenClawCleanup({
      actionType: 'remove-openclaw',
      backupBeforeDelete: true,
      selectedCandidateIds: [candidate1.candidateId, candidate2.candidateId],
    })

    expect(result.ok).toBe(true)
    expect(result.summary).toEqual({
      total: 2,
      success: 2,
      partial: 0,
      failed: 0,
      skipped: 0,
    })
    expect(result.perCandidateResults?.map((item) => item.candidateId)).toEqual([
      candidate1.candidateId,
      candidate2.candidateId,
    ])
    expect(cleanupOpenClawStateAndDataMock).toHaveBeenNthCalledWith(1, {
      stateRootOverride: candidate1.stateRoot,
      displayStateRootOverride: candidate1.displayStateRoot,
      targetedStateCleanup: true,
    })
    expect(cleanupOpenClawStateAndDataMock).toHaveBeenNthCalledWith(2, {
      stateRootOverride: candidate2.stateRoot,
      displayStateRootOverride: candidate2.displayStateRoot,
      targetedStateCleanup: true,
    })
    expect(runShellMock).toHaveBeenCalledWith('brew', ['uninstall', 'openclaw'], undefined, 'upgrade')
    expect(uninstallOpenClawNpmGlobalPackageMock).toHaveBeenCalledTimes(1)
  })

  it('does not run npm uninstall for custom installs', async () => {
    const candidate = buildCandidate({ id: 'candidate-custom', source: 'custom' })

    buildOpenClawCleanupPreviewMock.mockResolvedValue({
      ok: true,
      canRun: true,
      actionType: 'remove-openclaw',
      activeCandidate: candidate,
      availableCandidates: [candidate],
      selectedCandidateIds: [candidate.candidateId],
      deleteItems: [],
      keepItems: [],
      backupItems: [],
      warnings: [],
      blockedReasons: [],
      backupDirectory: '/Users/test/Documents/Qclaw Lite Backups',
    })
    cleanupOpenClawStateAndDataMock.mockResolvedValue({
      ok: true,
      stdout: 'ok',
      stderr: '',
      code: 0,
    })

    const result = await runOpenClawCleanup({
      actionType: 'remove-openclaw',
      backupBeforeDelete: false,
      selectedCandidateIds: [candidate.candidateId],
    })

    expect(result.ok).toBe(true)
    expect(result.summary).toEqual({
      total: 1,
      success: 1,
      partial: 0,
      failed: 0,
      skipped: 0,
    })
    expect(uninstallOpenClawNpmGlobalPackageMock).not.toHaveBeenCalled()
    expect(runShellMock).not.toHaveBeenCalledWith('brew', ['uninstall', 'openclaw'], undefined, 'upgrade')
    expect(result.perCandidateResults?.[0]?.programUninstall?.attempted).toBe(false)
    expect(result.perCandidateResults?.[0]?.programUninstall?.message).toContain('未自动卸载程序本体')
  })

  it('reuses state cleanup when selected instances share the same state root', async () => {
    const candidate1 = buildCandidate({ id: 'candidate-1', source: 'npm-global' })
    const candidate2 = {
      ...buildCandidate({ id: 'candidate-2', source: 'npm-global' }),
      configPath: candidate1.configPath,
      stateRoot: candidate1.stateRoot,
      displayConfigPath: candidate1.displayConfigPath,
      displayStateRoot: candidate1.displayStateRoot,
    }

    buildOpenClawCleanupPreviewMock.mockResolvedValue({
      ok: true,
      canRun: true,
      actionType: 'remove-openclaw',
      activeCandidate: candidate1,
      availableCandidates: [candidate1, candidate2],
      selectedCandidateIds: [candidate1.candidateId, candidate2.candidateId],
      deleteItems: [],
      keepItems: [],
      backupItems: [],
      warnings: [],
      blockedReasons: [],
      backupDirectory: '/Users/test/Documents/Qclaw Lite Backups',
    })
    cleanupOpenClawStateAndDataMock.mockResolvedValue({
      ok: true,
      stdout: 'ok',
      stderr: '',
      code: 0,
    })
    uninstallOpenClawNpmGlobalPackageMock.mockResolvedValue({
      ok: true,
      stdout: '',
      stderr: '',
      code: 0,
    })

    const result = await runOpenClawCleanup({
      actionType: 'remove-openclaw',
      backupBeforeDelete: false,
      selectedCandidateIds: [candidate1.candidateId, candidate2.candidateId],
    })

    expect(result.ok).toBe(true)
    expect(result.summary).toEqual({
      total: 2,
      success: 2,
      partial: 0,
      failed: 0,
      skipped: 0,
    })
    expect(cleanupOpenClawStateAndDataMock).toHaveBeenCalledTimes(1)
    expect(cleanupOpenClawStateAndDataMock).toHaveBeenCalledWith({
      stateRootOverride: candidate1.stateRoot,
      displayStateRootOverride: candidate1.displayStateRoot,
      targetedStateCleanup: true,
    })
    expect(uninstallOpenClawNpmGlobalPackageMock).toHaveBeenCalledTimes(2)
    expect(result.perCandidateResults?.[1]?.stateCleanup?.attempted).toBe(false)
    expect(result.perCandidateResults?.[1]?.warnings).toContain(
      '检测到已选实例共用同一状态目录，本实例未重复执行状态清理。'
    )
  })

  it('does not report a fake shell command for windows state cleanup metadata', async () => {
    const candidate = buildCandidate({ id: 'candidate-win', source: 'custom' })
    const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')

    Object.defineProperty(process, 'platform', {
      value: 'win32',
    })

    try {
      buildOpenClawCleanupPreviewMock.mockResolvedValue({
        ok: true,
        canRun: true,
        actionType: 'remove-openclaw',
        activeCandidate: candidate,
        availableCandidates: [candidate],
        selectedCandidateIds: [candidate.candidateId],
        deleteItems: [],
        keepItems: [],
        backupItems: [],
        warnings: [],
        blockedReasons: [],
        backupDirectory: '/Users/test/Documents/Qclaw Lite Backups',
      })
      cleanupOpenClawStateAndDataMock.mockResolvedValue({
        ok: true,
        stdout: 'ok',
        stderr: '',
        code: 0,
      })

      const result = await runOpenClawCleanup({
        actionType: 'remove-openclaw',
        backupBeforeDelete: false,
        selectedCandidateIds: [candidate.candidateId],
      })

      expect(result.ok).toBe(true)
      expect(result.perCandidateResults?.[0]?.stateCleanup?.command).toBeUndefined()
    } finally {
      if (originalPlatformDescriptor) {
        Object.defineProperty(process, 'platform', originalPlatformDescriptor)
      }
    }
  })

  it('removes qclaw-managed Windows program files without using global npm uninstall', async () => {
    const tempRoot = makeTempDir()
    const runtimeRoot = path.join(tempRoot, 'managed-runtime')
    const packageRoot = path.join(runtimeRoot, 'node_modules', 'openclaw')
    const binaryPath = path.join(runtimeRoot, 'openclaw.cmd')
    const shimPath = path.join(runtimeRoot, 'openclaw')
    const powershellShimPath = path.join(runtimeRoot, 'openclaw.ps1')
    const candidate = {
      ...buildCandidate({ id: 'candidate-managed', source: 'qclaw-managed' }),
      binaryPath,
      resolvedBinaryPath: binaryPath,
      packageRoot,
      stateRoot: path.join(tempRoot, 'missing-openclaw-home'),
      configPath: path.join(tempRoot, 'missing-openclaw-home', 'openclaw.json'),
      displayStateRoot: path.join(tempRoot, 'missing-openclaw-home'),
    }
    const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')

    fs.mkdirSync(packageRoot, { recursive: true })
    fs.writeFileSync(binaryPath, '@echo off\r\n')
    fs.writeFileSync(shimPath, '#!/bin/sh\n')
    fs.writeFileSync(powershellShimPath, 'Write-Output "openclaw"\n')
    Object.defineProperty(process, 'platform', {
      value: 'win32',
    })
    getSelectedWindowsActiveRuntimeSnapshotMock.mockReturnValue(
      buildWindowsSelectedRuntimeSnapshot({
        configPath: candidate.configPath,
        hostPackageRoot: candidate.packageRoot,
        openclawPath: candidate.binaryPath,
        stateDir: candidate.stateRoot,
      })
    )

    try {
      buildOpenClawCleanupPreviewMock.mockResolvedValue({
        ok: true,
        canRun: true,
        actionType: 'remove-openclaw',
        activeCandidate: candidate,
        availableCandidates: [candidate],
        selectedCandidateIds: [candidate.candidateId],
        deleteItems: [],
        keepItems: [],
        backupItems: [],
        warnings: [],
        blockedReasons: [],
        backupDirectory: '/Users/test/Documents/Qclaw Lite Backups',
      })
      cleanupOpenClawStateAndDataMock.mockResolvedValue({
        ok: true,
        stdout: 'ok',
        stderr: '',
        code: 0,
      })

      const result = await runOpenClawCleanup({
        actionType: 'remove-openclaw',
        backupBeforeDelete: false,
        selectedCandidateIds: [candidate.candidateId],
      })

      expect(result.ok).toBe(true)
      expect(result.perCandidateResults?.[0]?.finalStatus).toBe('success')
      expect(uninstallOpenClawNpmGlobalPackageMock).not.toHaveBeenCalled()
      expect(clearSelectedWindowsOpenClawRuntimeSelectionMock).toHaveBeenCalledTimes(1)
      expect(fs.existsSync(binaryPath)).toBe(false)
      expect(fs.existsSync(shimPath)).toBe(false)
      expect(fs.existsSync(powershellShimPath)).toBe(false)
      expect(fs.existsSync(packageRoot)).toBe(false)
    } finally {
      if (originalPlatformDescriptor) {
        Object.defineProperty(process, 'platform', originalPlatformDescriptor)
      }
    }
  })

  it('does not clear the selected Windows runtime when deleting an inactive owned candidate', async () => {
    const tempRoot = makeTempDir()
    const runtimeRoot = path.join(tempRoot, 'managed-runtime')
    const packageRoot = path.join(runtimeRoot, 'node_modules', 'openclaw')
    const binaryPath = path.join(runtimeRoot, 'openclaw.cmd')
    const candidate = {
      ...buildCandidate({ id: 'candidate-managed-inactive', source: 'qclaw-managed' }),
      binaryPath,
      resolvedBinaryPath: binaryPath,
      packageRoot,
      stateRoot: path.join(tempRoot, 'missing-openclaw-home'),
      configPath: path.join(tempRoot, 'missing-openclaw-home', 'openclaw.json'),
      displayStateRoot: path.join(tempRoot, 'missing-openclaw-home'),
    }
    const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')

    fs.mkdirSync(packageRoot, { recursive: true })
    fs.writeFileSync(binaryPath, '@echo off\r\n')
    Object.defineProperty(process, 'platform', {
      value: 'win32',
    })
    getSelectedWindowsActiveRuntimeSnapshotMock.mockReturnValue(
      buildWindowsSelectedRuntimeSnapshot({
        hostPackageRoot: path.join(tempRoot, 'other-runtime', 'node_modules', 'openclaw'),
        openclawPath: path.join(tempRoot, 'other-runtime', 'openclaw.cmd'),
        stateDir: path.join(tempRoot, 'other-state'),
      })
    )

    try {
      buildOpenClawCleanupPreviewMock.mockResolvedValue({
        ok: true,
        canRun: true,
        actionType: 'remove-openclaw',
        activeCandidate: candidate,
        availableCandidates: [candidate],
        selectedCandidateIds: [candidate.candidateId],
        deleteItems: [],
        keepItems: [],
        backupItems: [],
        warnings: [],
        blockedReasons: [],
        backupDirectory: '/Users/test/Documents/Qclaw Lite Backups',
      })
      cleanupOpenClawStateAndDataMock.mockResolvedValue({
        ok: true,
        stdout: 'ok',
        stderr: '',
        code: 0,
      })

      const result = await runOpenClawCleanup({
        actionType: 'remove-openclaw',
        backupBeforeDelete: false,
        selectedCandidateIds: [candidate.candidateId],
      })

      expect(result.ok).toBe(true)
      expect(clearSelectedWindowsOpenClawRuntimeSelectionMock).not.toHaveBeenCalled()
    } finally {
      if (originalPlatformDescriptor) {
        Object.defineProperty(process, 'platform', originalPlatformDescriptor)
      }
    }
  })

  it('fails verification when openclaw still resolves to a leftover Windows sibling shim', async () => {
    const tempRoot = makeTempDir()
    const runtimeRoot = path.join(tempRoot, 'managed-runtime')
    const packageRoot = path.join(runtimeRoot, 'node_modules', 'openclaw')
    const binaryPath = path.join(runtimeRoot, 'openclaw.cmd')
    const shimPath = path.join(runtimeRoot, 'openclaw')
    const candidate = {
      ...buildCandidate({ id: 'candidate-managed-shim', source: 'qclaw-managed' }),
      binaryPath,
      resolvedBinaryPath: binaryPath,
      packageRoot,
      stateRoot: path.join(tempRoot, 'missing-openclaw-home'),
      configPath: path.join(tempRoot, 'missing-openclaw-home', 'openclaw.json'),
      displayStateRoot: path.join(tempRoot, 'missing-openclaw-home'),
    }
    const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')

    fs.mkdirSync(packageRoot, { recursive: true })
    fs.writeFileSync(binaryPath, '@echo off\r\n')
    fs.writeFileSync(shimPath, '#!/bin/sh\n')
    Object.defineProperty(process, 'platform', {
      value: 'win32',
    })
    resolveOpenClawBinaryPathMock.mockResolvedValue(shimPath)

    try {
      buildOpenClawCleanupPreviewMock.mockResolvedValue({
        ok: true,
        canRun: true,
        actionType: 'remove-openclaw',
        activeCandidate: candidate,
        availableCandidates: [candidate],
        selectedCandidateIds: [candidate.candidateId],
        deleteItems: [],
        keepItems: [],
        backupItems: [],
        warnings: [],
        blockedReasons: [],
        backupDirectory: '/Users/test/Documents/Qclaw Lite Backups',
      })
      cleanupOpenClawStateAndDataMock.mockResolvedValue({
        ok: true,
        stdout: 'ok',
        stderr: '',
        code: 0,
      })

      const result = await runOpenClawCleanup({
        actionType: 'remove-openclaw',
        backupBeforeDelete: false,
        selectedCandidateIds: [candidate.candidateId],
      })

      expect(result.ok).toBe(false)
      expect(result.perCandidateResults?.[0]?.verification?.commandPointsToTarget).toBe(true)
      expect(result.perCandidateResults?.[0]?.errors.some((error) => error.includes('指向该实例路径'))).toBe(true)
    } finally {
      if (originalPlatformDescriptor) {
        Object.defineProperty(process, 'platform', originalPlatformDescriptor)
      }
    }
  })

  it('keeps batch running when one candidate fails and reports failure summary', async () => {
    const candidate1 = buildCandidate({ id: 'candidate-1', source: 'homebrew' })
    const candidate2 = buildCandidate({ id: 'candidate-2', source: 'npm-global' })

    buildOpenClawCleanupPreviewMock.mockResolvedValue({
      ok: true,
      canRun: true,
      actionType: 'remove-openclaw',
      activeCandidate: candidate1,
      availableCandidates: [candidate1, candidate2],
      selectedCandidateIds: [candidate1.candidateId, candidate2.candidateId],
      deleteItems: [],
      keepItems: [],
      backupItems: [],
      warnings: [],
      blockedReasons: [],
      backupDirectory: '/Users/test/Documents/Qclaw Lite Backups',
    })
    cleanupOpenClawStateAndDataMock.mockResolvedValue({
      ok: true,
      stdout: 'ok',
      stderr: '',
      code: 0,
    })
    runShellMock.mockResolvedValue({
      ok: true,
      stdout: '',
      stderr: '',
      code: 0,
    })
    uninstallOpenClawNpmGlobalPackageMock.mockResolvedValue({
      ok: false,
      stdout: '',
      stderr: 'npm uninstall failed',
      code: 1,
    })
    createManagedBackupArchiveMock.mockResolvedValue({
      backupId: 'cleanup-backup-2',
      createdAt: '2026-03-18T00:00:00.000Z',
      archivePath: '/tmp/cleanup-backup-2',
      manifestPath: '/tmp/cleanup-backup-2/manifest.json',
      type: 'cleanup-backup',
      installFingerprint: 'fingerprint-candidate-1',
      sourceVersion: '2026.3.12',
      scopeAvailability: {
        hasConfigData: true,
        hasMemoryData: true,
        hasEnvData: true,
        hasCredentialsData: true,
      },
    })

    const result = await runOpenClawCleanup({
      actionType: 'remove-openclaw',
      backupBeforeDelete: true,
      selectedCandidateIds: [candidate1.candidateId, candidate2.candidateId],
    })

    expect(result.ok).toBe(false)
    expect(result.summary).toEqual({
      total: 2,
      success: 1,
      partial: 0,
      failed: 1,
      skipped: 0,
    })
    expect(result.perCandidateResults?.[0]?.finalStatus).toBe('success')
    expect(result.perCandidateResults?.[1]?.finalStatus).toBe('failed')
    expect(result.errors.some((item) => item.includes('candidate-2'))).toBe(true)
  })

  it('returns skipped per-candidate results for keep-openclaw action', async () => {
    const candidate1 = buildCandidate({ id: 'candidate-1', source: 'homebrew' })

    buildOpenClawCleanupPreviewMock.mockResolvedValue({
      ok: true,
      canRun: true,
      actionType: 'qclaw-uninstall-keep-openclaw',
      activeCandidate: candidate1,
      availableCandidates: [candidate1],
      selectedCandidateIds: [candidate1.candidateId],
      deleteItems: [],
      keepItems: [],
      backupItems: [],
      warnings: [],
      blockedReasons: [],
      backupDirectory: '/Users/test/Documents/Qclaw Lite Backups',
      manualNextStep: 'manual',
    })

    const result = await runOpenClawCleanup({
      actionType: 'qclaw-uninstall-keep-openclaw',
      backupBeforeDelete: false,
      selectedCandidateIds: [candidate1.candidateId],
    })

    expect(result.ok).toBe(true)
    expect(result.summary).toEqual({
      total: 1,
      success: 0,
      partial: 0,
      failed: 0,
      skipped: 1,
    })
    expect(result.perCandidateResults?.[0]?.finalStatus).toBe('skipped')
  })

  it('marks candidate as failed when verification finds remaining paths', async () => {
    const tempRoot = makeTempDir()
    const stateRoot = path.join(tempRoot, 'openclaw-home')
    const binaryPath = path.join(tempRoot, 'bin', 'openclaw')
    const packageRoot = path.join(tempRoot, 'node_modules', 'openclaw')
    fs.mkdirSync(stateRoot, { recursive: true })
    fs.mkdirSync(path.dirname(binaryPath), { recursive: true })
    fs.mkdirSync(packageRoot, { recursive: true })
    fs.writeFileSync(path.join(stateRoot, 'openclaw.json'), '{}')
    fs.writeFileSync(binaryPath, '#!/bin/sh\n')

    const candidate = {
      ...buildCandidate({ id: 'candidate-remain', source: 'npm-global' }),
      binaryPath,
      resolvedBinaryPath: binaryPath,
      packageRoot,
      configPath: path.join(stateRoot, 'openclaw.json'),
      stateRoot,
      displayStateRoot: stateRoot,
    }

    buildOpenClawCleanupPreviewMock.mockResolvedValue({
      ok: true,
      canRun: true,
      actionType: 'remove-openclaw',
      activeCandidate: candidate,
      availableCandidates: [candidate],
      selectedCandidateIds: [candidate.candidateId],
      deleteItems: [],
      keepItems: [],
      backupItems: [],
      warnings: [],
      blockedReasons: [],
      backupDirectory: '/Users/test/Documents/Qclaw Lite Backups',
    })
    cleanupOpenClawStateAndDataMock.mockResolvedValue({
      ok: true,
      stdout: 'ok',
      stderr: '',
      code: 0,
    })
    uninstallOpenClawNpmGlobalPackageMock.mockResolvedValue({
      ok: true,
      stdout: '',
      stderr: '',
      code: 0,
    })
    createManagedBackupArchiveMock.mockResolvedValue({
      backupId: 'cleanup-backup-remain',
      createdAt: '2026-03-18T00:00:00.000Z',
      archivePath: '/tmp/cleanup-backup-remain',
      manifestPath: '/tmp/cleanup-backup-remain/manifest.json',
      type: 'cleanup-backup',
      installFingerprint: 'fingerprint-candidate-remain',
      sourceVersion: '2026.3.12',
      scopeAvailability: {
        hasConfigData: true,
        hasMemoryData: true,
        hasEnvData: true,
        hasCredentialsData: true,
      },
    })

    const result = await runOpenClawCleanup({
      actionType: 'remove-openclaw',
      backupBeforeDelete: true,
      selectedCandidateIds: [candidate.candidateId],
    })

    expect(result.ok).toBe(false)
    expect(result.summary).toEqual({
      total: 1,
      success: 0,
      partial: 0,
      failed: 1,
      skipped: 0,
    })
    expect(result.perCandidateResults?.[0]?.verification?.remainingPaths.length).toBeGreaterThan(0)
    expect(result.perCandidateResults?.[0]?.finalStatus).toBe('failed')
  })

  it('fails candidate verification when command still resolves to the same target binary', async () => {
    const candidate = buildCandidate({ id: 'candidate-1', source: 'npm-global' })

    buildOpenClawCleanupPreviewMock.mockResolvedValue({
      ok: true,
      canRun: true,
      actionType: 'remove-openclaw',
      activeCandidate: candidate,
      availableCandidates: [candidate],
      selectedCandidateIds: [candidate.candidateId],
      deleteItems: [],
      keepItems: [],
      backupItems: [],
      warnings: [],
      blockedReasons: [],
      backupDirectory: '/Users/test/Documents/Qclaw Lite Backups',
    })
    cleanupOpenClawStateAndDataMock.mockResolvedValue({
      ok: true,
      stdout: 'ok',
      stderr: '',
      code: 0,
    })
    uninstallOpenClawNpmGlobalPackageMock.mockResolvedValue({
      ok: true,
      stdout: '',
      stderr: '',
      code: 0,
    })
    resolveOpenClawBinaryPathMock.mockResolvedValue(candidate.binaryPath)

    const result = await runOpenClawCleanup({
      actionType: 'remove-openclaw',
      backupBeforeDelete: false,
      selectedCandidateIds: [candidate.candidateId],
    })

    expect(result.ok).toBe(false)
    expect(result.perCandidateResults?.[0]?.verification?.commandPointsToTarget).toBe(true)
    expect(result.perCandidateResults?.[0]?.errors.some((error) => error.includes('指向该实例路径'))).toBe(true)
  })

  it('falls back to single-target cleanup when batch feature flag is disabled', async () => {
    process.env.QCLAW_OPENCLAW_BATCH_CLEANUP_ENABLED = '0'
    const candidate1 = buildCandidate({ id: 'candidate-1', source: 'homebrew' })
    const candidate2 = buildCandidate({ id: 'candidate-2', source: 'npm-global' })

    buildOpenClawCleanupPreviewMock.mockResolvedValue({
      ok: true,
      canRun: true,
      actionType: 'remove-openclaw',
      activeCandidate: candidate1,
      availableCandidates: [candidate1, candidate2],
      selectedCandidateIds: [candidate1.candidateId, candidate2.candidateId],
      deleteItems: [],
      keepItems: [],
      backupItems: [],
      warnings: [],
      blockedReasons: [],
      backupDirectory: '/Users/test/Documents/Qclaw Lite Backups',
    })
    cleanupOpenClawStateAndDataMock.mockResolvedValue({
      ok: true,
      stdout: 'ok',
      stderr: '',
      code: 0,
    })
    runShellMock.mockResolvedValue({
      ok: true,
      stdout: '',
      stderr: '',
      code: 0,
    })
    uninstallOpenClawNpmGlobalPackageMock.mockResolvedValue({
      ok: true,
      stdout: '',
      stderr: '',
      code: 0,
    })
    createManagedBackupArchiveMock.mockResolvedValue({
      backupId: 'cleanup-backup-flag',
      createdAt: '2026-03-18T00:00:00.000Z',
      archivePath: '/tmp/cleanup-backup-flag',
      manifestPath: '/tmp/cleanup-backup-flag/manifest.json',
      type: 'cleanup-backup',
      installFingerprint: 'fingerprint-candidate-1',
      sourceVersion: '2026.3.12',
      scopeAvailability: {
        hasConfigData: true,
        hasMemoryData: true,
        hasEnvData: true,
        hasCredentialsData: true,
      },
    })

    const result = await runOpenClawCleanup({
      actionType: 'remove-openclaw',
      backupBeforeDelete: false,
      selectedCandidateIds: [candidate1.candidateId, candidate2.candidateId],
    })

    expect(result.summary).toEqual({
      total: 1,
      success: 1,
      partial: 0,
      failed: 0,
      skipped: 0,
    })
    expect(result.perCandidateResults?.map((item) => item.candidateId)).toEqual([candidate1.candidateId])
    expect(cleanupOpenClawStateAndDataMock).toHaveBeenCalledTimes(1)
    expect(cleanupOpenClawStateAndDataMock).toHaveBeenCalledWith({
      stateRootOverride: candidate1.stateRoot,
      displayStateRootOverride: candidate1.displayStateRoot,
      targetedStateCleanup: true,
    })
    expect(uninstallOpenClawNpmGlobalPackageMock).toHaveBeenCalledTimes(0)
  })
})
