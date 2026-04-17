import type { OpenClawInstallCandidate } from '../../src/shared/openclaw-phase1'
import { isQclawOwnedOpenClawSource } from '../../src/shared/openclaw-phase1'
import type {
  OpenClawBackupEntry,
  OpenClawCleanupCandidateResult,
  OpenClawCleanupRunRequest,
  OpenClawCleanupRunResult,
  OpenClawCleanupStepResult,
  OpenClawCleanupSummary,
  OpenClawCleanupVerificationResult,
} from '../../src/shared/openclaw-phase3'
import {
  clearSelectedWindowsOpenClawRuntimeSelection,
  cleanupOpenClawStateAndData,
  runShell,
  uninstallOpenClawNpmGlobalPackage,
} from './cli'
import { createManagedBackupArchive } from './openclaw-backup-index'
import { buildOpenClawCleanupPreview } from './openclaw-cleanup-planner'
import { resolveOpenClawPathsFromStateRoot } from './openclaw-paths'
import { resolveOpenClawBinaryPath } from './openclaw-package'
import { getSelectedWindowsActiveRuntimeSnapshot } from './windows-active-runtime'

const fs = process.getBuiltinModule('node:fs') as typeof import('node:fs')
const path = process.getBuiltinModule('node:path') as typeof import('node:path')
const { access, rm } = fs.promises

function normalizePathForCompare(targetPath: string): string {
  const normalized = String(targetPath || '').trim()
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

function resolveManualQClawUninstallStep(): string {
  if (process.platform === 'darwin') {
    return '请将 Qclaw 应用拖入废纸篓以完成卸载。'
  }
  if (process.platform === 'win32') {
    return '请通过“应用和功能”或安装器卸载 Qclaw。'
  }
  return '请手动删除或卸载 Qclaw 应用本体。'
}

async function uninstallHomebrewPackage(): Promise<{ ok: boolean; error?: string }> {
  const result = await runShell('brew', ['uninstall', 'openclaw'], undefined, 'upgrade')
  if (!result.ok) {
    const stderr = `${result.stderr}\n${result.stdout}`.trim()
    if (/No such keg|No available formula|not installed/i.test(stderr)) {
      return { ok: true }
    }

    return {
      ok: false,
      error: stderr || 'brew uninstall openclaw failed',
    }
  }

  return { ok: true }
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath)
    return true
  } catch {
    return false
  }
}

async function runStateCleanupStep(
  candidate: OpenClawInstallCandidate
): Promise<OpenClawCleanupStepResult> {
  const stateCleanupResult = await cleanupOpenClawStateAndData({
    stateRootOverride: candidate.stateRoot,
    displayStateRootOverride: candidate.displayStateRoot,
    targetedStateCleanup: true,
  })
  const errors = stateCleanupResult.ok
    ? []
    : String(stateCleanupResult.stderr || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
  return {
    attempted: true,
    ok: stateCleanupResult.ok,
    command: process.platform === 'win32' ? undefined : `openclaw gateway stop && rm -rf ${candidate.displayStateRoot}`,
    message: stateCleanupResult.ok ? '状态与数据清理命令执行成功。' : '状态与数据清理命令执行失败。',
    errors,
  }
}

function collectWindowsOwnedProgramPaths(candidate: OpenClawInstallCandidate): string[] {
  const candidates = [
    candidate.binaryPath,
    candidate.resolvedBinaryPath,
    candidate.packageRoot,
  ]
  const binaryDirs = [
    path.win32.dirname(String(candidate.binaryPath || '').trim()),
    path.win32.dirname(String(candidate.resolvedBinaryPath || '').trim()),
  ]

  for (const binaryDir of binaryDirs) {
    if (!String(binaryDir || '').trim()) continue
    candidates.push(path.win32.join(binaryDir, 'openclaw'))
    candidates.push(path.win32.join(binaryDir, 'openclaw.cmd'))
    candidates.push(path.win32.join(binaryDir, 'openclaw.exe'))
    candidates.push(path.win32.join(binaryDir, 'openclaw.ps1'))
  }

  const deduped = new Map<string, string>()
  for (const candidatePath of candidates) {
    const trimmed = String(candidatePath || '').trim()
    const normalized = normalizePathForCompare(trimmed)
    if (!trimmed || !normalized || deduped.has(normalized)) continue
    deduped.set(normalized, trimmed)
  }
  return Array.from(deduped.values())
}

function collectProgramVerificationPaths(candidate: OpenClawInstallCandidate): string[] {
  if (process.platform === 'win32' && isQclawOwnedOpenClawSource(candidate.installSource)) {
    return collectWindowsOwnedProgramPaths(candidate)
  }
  return [
    candidate.binaryPath,
    candidate.resolvedBinaryPath,
    candidate.packageRoot,
  ]
}

function matchesSelectedWindowsRuntimeCandidate(candidate: OpenClawInstallCandidate): boolean {
  if (process.platform !== 'win32') return false
  const selectedRuntimeSnapshot = getSelectedWindowsActiveRuntimeSnapshot()
  if (!selectedRuntimeSnapshot) return false

  const selectedPaths = [
    selectedRuntimeSnapshot.openclawPath,
    selectedRuntimeSnapshot.hostPackageRoot,
  ]
    .map((targetPath) => normalizePathForCompare(targetPath))
    .filter(Boolean)
  if (selectedPaths.length === 0) return false

  return collectWindowsOwnedProgramPaths(candidate).some((targetPath) =>
    selectedPaths.includes(normalizePathForCompare(targetPath))
  )
}

async function runWindowsOwnedProgramCleanupStep(
  candidate: OpenClawInstallCandidate
): Promise<OpenClawCleanupStepResult> {
  const shouldClearSelectedRuntime = matchesSelectedWindowsRuntimeCandidate(candidate)
  const errors: string[] = []
  for (const targetPath of collectWindowsOwnedProgramPaths(candidate)) {
    try {
      await rm(targetPath, { recursive: true, force: true })
    } catch (error) {
      errors.push(`${targetPath}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  if (errors.length === 0 && shouldClearSelectedRuntime) {
    clearSelectedWindowsOpenClawRuntimeSelection()
  }

  return {
    attempted: true,
    ok: errors.length === 0,
    message:
      errors.length === 0
        ? 'Qclaw 自带/托管 OpenClaw 程序文件删除完成。'
        : 'Qclaw 自带/托管 OpenClaw 程序文件删除失败。',
    errors,
  }
}

async function runProgramUninstallStep(
  candidate: OpenClawInstallCandidate
): Promise<OpenClawCleanupStepResult> {
  const { installSource } = candidate
  if (installSource === 'homebrew') {
    const brewResult = await uninstallHomebrewPackage()
    return {
      attempted: true,
      ok: brewResult.ok,
      command: 'brew uninstall openclaw',
      message: brewResult.ok ? 'Homebrew 程序卸载完成。' : 'Homebrew 程序卸载失败。',
      errors: brewResult.ok ? [] : [brewResult.error || 'brew uninstall openclaw failed'],
    }
  }

  if (installSource === 'custom' || installSource === 'unknown') {
    return {
      attempted: false,
      ok: true,
      message: `安装来源为 ${installSource}，为避免误删，未自动卸载程序本体。`,
      errors: [],
    }
  }

  if (process.platform === 'win32' && isQclawOwnedOpenClawSource(installSource)) {
    return runWindowsOwnedProgramCleanupStep(candidate)
  }

  const packageRemovalResult = await uninstallOpenClawNpmGlobalPackage()
  return {
    attempted: true,
    ok: packageRemovalResult.ok,
    command: 'npm uninstall -g openclaw',
    message: packageRemovalResult.ok ? 'npm 全局程序卸载完成。' : 'npm 全局程序卸载失败。',
    errors: packageRemovalResult.ok
      ? []
      : String(packageRemovalResult.stderr || '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
  }
}

async function verifyCandidateCleanup(
  candidate: OpenClawInstallCandidate
): Promise<OpenClawCleanupVerificationResult> {
  const runtimePaths = resolveOpenClawPathsFromStateRoot({
    stateRoot: candidate.stateRoot,
    configFile: candidate.configPath,
  })
  const statePaths = [
    candidate.stateRoot,
    candidate.configPath,
    runtimePaths.envFile,
    runtimePaths.credentialsDir,
  ]
  const programPaths = collectProgramVerificationPaths(candidate)
  const remainingPaths: string[] = []

  for (const targetPath of [...statePaths, ...programPaths]) {
    if (await pathExists(targetPath)) {
      remainingPaths.push(targetPath)
    }
  }

  const stateRemoved = statePaths.every((targetPath) => !remainingPaths.includes(targetPath))
  const programRemoved = programPaths.every((targetPath) => !remainingPaths.includes(targetPath))
  let commandAvailable = false
  let commandResolvedBinaryPath: string | null = null
  let commandPointsToTarget: boolean | null = null

  try {
    const resolvedBinaryPath = String(await resolveOpenClawBinaryPath()).trim()
    if (resolvedBinaryPath) {
      commandAvailable = true
      commandResolvedBinaryPath = resolvedBinaryPath
      const normalizeForCompare = (value: string) =>
        process.platform === 'win32' ? String(value || '').toLowerCase() : String(value || '')
      const targetPaths = new Set(
        programPaths
          .map((targetPath) => normalizeForCompare(targetPath))
          .filter(Boolean)
      )
      commandPointsToTarget = targetPaths.has(normalizeForCompare(resolvedBinaryPath))
    }
  } catch {
    commandAvailable = false
    commandResolvedBinaryPath = null
    commandPointsToTarget = null
  }

  const notes: string[] = []
  notes.push(stateRemoved ? '状态目录与配置路径未发现残留。' : '检测到状态目录或配置路径仍有残留。')
  notes.push(programRemoved ? '程序路径未发现残留。' : '检测到程序路径仍有残留。')
  if (!commandAvailable) {
    notes.push('当前 shell 中未检测到 openclaw 命令。')
  } else if (commandPointsToTarget === true) {
    notes.push('当前 shell 中的 openclaw 仍指向该实例路径。')
  } else if (commandPointsToTarget === false) {
    notes.push('当前 shell 中仍可调用 openclaw，但指向其他安装路径。')
  }

  return {
    checked: true,
    stateRemoved,
    programRemoved,
    commandAvailable,
    commandResolvedBinaryPath,
    commandPointsToTarget,
    remainingPaths,
    notes,
  }
}

function normalizeSelectedCandidateIds(candidateIds: string[] | undefined): string[] {
  return Array.from(
    new Set(
      (candidateIds || [])
        .map((candidateId) => String(candidateId || '').trim())
        .filter(Boolean)
    )
  )
}

function isBatchCleanupEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = String(env.QCLAW_OPENCLAW_BATCH_CLEANUP_ENABLED || '').trim().toLowerCase()
  if (!raw) return true
  return raw !== '0' && raw !== 'false' && raw !== 'off'
}

function resolveCleanupTargets(options: {
  candidates: OpenClawInstallCandidate[]
  selectedCandidateIds: string[]
  fallbackCandidate: OpenClawInstallCandidate | null
  batchEnabled?: boolean
}): OpenClawInstallCandidate[] {
  if (options.batchEnabled === false) {
    return options.fallbackCandidate ? [options.fallbackCandidate] : []
  }
  const selectedCandidateIds = normalizeSelectedCandidateIds(options.selectedCandidateIds)
  if (selectedCandidateIds.length === 0) {
    return options.fallbackCandidate ? [options.fallbackCandidate] : []
  }

  const selectedSet = new Set(selectedCandidateIds)
  return options.candidates.filter((candidate) => selectedSet.has(candidate.candidateId))
}

function summarizeCandidateResults(
  perCandidateResults: OpenClawCleanupCandidateResult[]
): OpenClawCleanupSummary {
  const summary: OpenClawCleanupSummary = {
    total: perCandidateResults.length,
    success: 0,
    partial: 0,
    failed: 0,
    skipped: 0,
  }

  for (const result of perCandidateResults) {
    if (result.finalStatus === 'success') summary.success += 1
    else if (result.finalStatus === 'partial') summary.partial += 1
    else if (result.finalStatus === 'failed') summary.failed += 1
    else summary.skipped += 1
  }

  return summary
}

function collectCandidateErrors(
  perCandidateResults: OpenClawCleanupCandidateResult[]
): string[] {
  const errors: string[] = []
  for (const candidateResult of perCandidateResults) {
    for (const error of candidateResult.errors) {
      if (!error) continue
      errors.push(`[${candidateResult.candidateId}] ${error}`)
    }
  }
  return errors
}

function buildRunCompletionMessage(options: {
  actionType: OpenClawCleanupRunRequest['actionType']
  summary: OpenClawCleanupSummary
}): string {
  const { summary, actionType } = options
  if (summary.total === 0) return '当前没有可处理的 OpenClaw 实例。'
  if (summary.failed === 0 && summary.partial === 0) {
    return actionType === 'qclaw-uninstall-remove-openclaw'
      ? `OpenClaw 已清理完成（${summary.success}/${summary.total}），Qclaw 可以继续卸载。`
      : `OpenClaw 已清理完成（${summary.success}/${summary.total}）。`
  }
  return `OpenClaw 批量清理完成：成功 ${summary.success}，部分成功 ${summary.partial}，失败 ${summary.failed}，跳过 ${summary.skipped}。`
}

export async function runOpenClawCleanup(
  request: OpenClawCleanupRunRequest
): Promise<OpenClawCleanupRunResult> {
  const batchEnabled = isBatchCleanupEnabled()
  const preview = await buildOpenClawCleanupPreview(request)
  if (!preview.ok || !preview.canRun || preview.blockedReasons.length > 0) {
    return {
      ok: false,
      blocked: true,
      actionType: request.actionType,
      backupCreated: null,
      warnings: preview.warnings,
      errors: preview.blockedReasons,
      message: preview.blockedReasons[0] || '当前清理动作被阻止。',
      manualNextStep: preview.manualNextStep,
    }
  }

  if (request.actionType === 'qclaw-uninstall-keep-openclaw') {
    const selectedTargets = resolveCleanupTargets({
      candidates: preview.availableCandidates || [],
      selectedCandidateIds: request.selectedCandidateIds || preview.selectedCandidateIds || [],
      fallbackCandidate: preview.activeCandidate,
      batchEnabled,
    })
    const perCandidateResults: OpenClawCleanupCandidateResult[] = selectedTargets.map((candidate) => ({
      candidateId: candidate.candidateId,
      installSource: candidate.installSource,
      displayStateRoot: candidate.displayStateRoot,
      binaryPath: candidate.binaryPath,
      finalStatus: 'skipped',
      stateCleanup: {
        attempted: false,
        ok: true,
        message: '当前动作不会执行状态清理。',
      },
      programUninstall: {
        attempted: false,
        ok: true,
        message: '当前动作不会执行程序卸载。',
      },
      verification: {
        checked: false,
        stateRemoved: false,
        programRemoved: false,
        commandAvailable: false,
        commandResolvedBinaryPath: null,
        commandPointsToTarget: null,
        remainingPaths: [],
        notes: ['当前动作为保留 OpenClaw，未执行删除后校验。'],
      },
      message: '按当前动作保留 OpenClaw，不执行删除。',
      warnings: [],
      errors: [],
    }))
    const summary = summarizeCandidateResults(perCandidateResults)
    return {
      ok: true,
      blocked: false,
      actionType: request.actionType,
      backupCreated: null,
      warnings: preview.warnings,
      errors: [],
      summary,
      perCandidateResults,
      message: 'Qclaw 卸载准备已完成，当前不会删除 OpenClaw 或用户数据。',
      manualNextStep: resolveManualQClawUninstallStep(),
    }
  }

  const targets = resolveCleanupTargets({
    candidates: preview.availableCandidates || [],
    selectedCandidateIds: request.selectedCandidateIds || preview.selectedCandidateIds || [],
    fallbackCandidate: preview.activeCandidate,
    batchEnabled,
  })

  if (targets.length === 0) {
    return {
      ok: false,
      blocked: true,
      actionType: request.actionType,
      backupCreated: null,
      warnings: preview.warnings,
      errors: ['当前没有可删除的 OpenClaw 安装对象。'],
      summary: {
        total: 0,
        success: 0,
        partial: 0,
        failed: 0,
        skipped: 0,
      },
      perCandidateResults: [],
      message: '当前没有可删除的 OpenClaw 安装对象。',
      manualNextStep: preview.manualNextStep,
    }
  }

  let backupCreated: OpenClawBackupEntry | null = null
  const perCandidateResults: OpenClawCleanupCandidateResult[] = []
  const stateCleanupCache = new Map<string, OpenClawCleanupStepResult>()

  for (const candidate of targets) {
    const warnings: string[] = []
    const errors: string[] = []
    let backupError = ''

    if (request.backupBeforeDelete) {
      try {
        const candidateBackup = await createManagedBackupArchive({
          candidate,
          backupType: 'cleanup-backup',
          strategyId: 'full-state',
        })
        if (!backupCreated) backupCreated = candidateBackup
      } catch (error) {
        backupError = `创建清理前备份失败: ${error instanceof Error ? error.message : String(error)}`
        warnings.push(backupError)
      }
    }

    const normalizedStateRoot = normalizePathForCompare(candidate.stateRoot)
    const cachedStateCleanup = normalizedStateRoot ? stateCleanupCache.get(normalizedStateRoot) : null
    const stateCleanup = cachedStateCleanup
      ? {
          attempted: false,
          ok: cachedStateCleanup.ok,
          message: cachedStateCleanup.ok
            ? '该状态目录已在本次批量清理中处理，本实例复用前序清理结果。'
            : '该状态目录已在本次批量清理中处理，但前序清理未成功，本实例复用前序结果。',
          errors: [],
        }
      : await runStateCleanupStep(candidate)
    if (!cachedStateCleanup && normalizedStateRoot) {
      stateCleanupCache.set(normalizedStateRoot, stateCleanup)
    }
    if (cachedStateCleanup) {
      warnings.push('检测到已选实例共用同一状态目录，本实例未重复执行状态清理。')
    } else if (!stateCleanup.ok) {
      errors.push(...(stateCleanup.errors || []))
    }
    const programUninstall = await runProgramUninstallStep(candidate)
    if (!programUninstall.ok) {
      errors.push(...(programUninstall.errors || []))
    }
    const verification = await verifyCandidateCleanup(candidate)
    if (!verification.stateRemoved || !verification.programRemoved) {
      errors.push('删除后校验发现仍有残留路径。')
    }
    const commandStillMappedToTarget = verification.commandPointsToTarget === true
    if (commandStillMappedToTarget) {
      errors.push('删除后校验发现 openclaw 命令仍指向该实例路径。')
    }

    const fullyVerifiedRemoved = verification.stateRemoved && verification.programRemoved
    const verificationPassed = fullyVerifiedRemoved && !commandStillMappedToTarget
    const criticalStepFailed = !stateCleanup.ok || !programUninstall.ok
    const hasSoftIssue = Boolean(backupError)

    const finalStatus = !verificationPassed
      ? 'failed'
      : criticalStepFailed
        ? 'failed'
        : hasSoftIssue
          ? 'partial'
          : 'success'

    perCandidateResults.push({
      candidateId: candidate.candidateId,
      installSource: candidate.installSource,
      displayStateRoot: candidate.displayStateRoot,
      binaryPath: candidate.binaryPath,
      finalStatus,
      stateCleanup,
      programUninstall,
      verification,
      message:
        finalStatus === 'success'
          ? `实例 ${candidate.candidateId} 清理完成且校验通过。`
          : finalStatus === 'partial'
            ? `实例 ${candidate.candidateId} 清理基本完成，但存在需关注项。`
            : `实例 ${candidate.candidateId} 清理失败或校验未通过。`,
      warnings,
      errors,
    })
  }

  const summary = summarizeCandidateResults(perCandidateResults)
  const flattenedErrors = collectCandidateErrors(perCandidateResults)
  const ok = summary.failed === 0 && summary.partial === 0

  return {
    ok,
    blocked: false,
    actionType: request.actionType,
    backupCreated,
    warnings: preview.warnings,
    errors: flattenedErrors,
    summary,
    perCandidateResults,
    message: buildRunCompletionMessage({
      actionType: request.actionType,
      summary,
    }),
    manualNextStep:
      request.actionType === 'qclaw-uninstall-remove-openclaw' ? resolveManualQClawUninstallStep() : undefined,
  }
}

export async function prepareQClawUninstall(
  request: {
    actionType: 'qclaw-uninstall-keep-openclaw' | 'qclaw-uninstall-remove-openclaw'
    backupBeforeDelete: boolean
    selectedCandidateIds?: string[]
  }
): Promise<OpenClawCleanupRunResult> {
  return runOpenClawCleanup(request)
}
