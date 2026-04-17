import { useEffect, useMemo, useState } from 'react'
import { Button, Text, Title } from '@mantine/core'
import type {
  EnvCheckReadyPayload,
  OpenClawClassificationResult,
  OpenClawDiscoveryResult,
  OpenClawLatestVersionCheckResult,
} from '../shared/openclaw-phase1'
import {
  classifyOpenClawPhase1,
  compareLooseVersions,
  shouldRouteToSetupAfterPhase1,
} from '../shared/openclaw-phase1'
import { PINNED_OPENCLAW_VERSION } from '../shared/openclaw-version-policy'

export default function OpenClawClassify({
  discovery,
  envSummary,
  onProceed,
}: {
  discovery: OpenClawDiscoveryResult
  envSummary: EnvCheckReadyPayload | null
  onProceed: (target: 'setup' | 'dashboard', options?: { openUpdateCenter?: boolean }) => void
}) {
  const [latestCheck, setLatestCheck] = useState<OpenClawLatestVersionCheckResult | null>(null)
  const [checkingLatest, setCheckingLatest] = useState(Boolean(discovery.activeCandidateId))
  const [latestCheckAttempt, setLatestCheckAttempt] = useState(0)

  useEffect(() => {
    if (!discovery.activeCandidateId) {
      setCheckingLatest(false)
      setLatestCheck(null)
      return
    }

    let disposed = false
    const run = async () => {
      setCheckingLatest(true)
      const result = await window.api.checkOpenClawLatestVersion()
      if (!disposed) {
        setLatestCheck(result)
        setCheckingLatest(false)
      }
    }

    void run()
    return () => {
      disposed = true
    }
  }, [discovery.activeCandidateId, latestCheckAttempt])

  const classification: OpenClawClassificationResult = useMemo(
    () => classifyOpenClawPhase1(discovery, latestCheck),
    [discovery, latestCheck]
  )

  const freshManagedInstall = Boolean(
    envSummary && !envSummary.hadOpenClawInstalled && envSummary.installedOpenClawDuringCheck
  )
  const setupRequired = shouldRouteToSetupAfterPhase1(envSummary)

  const activeCandidate = classification.activeCandidate
  const matchesPinnedVersion = Boolean(
    activeCandidate &&
    compareLooseVersions(activeCandidate.version, PINNED_OPENCLAW_VERSION) === 0
  )
  const canEnterDashboard = !setupRequired && matchesPinnedVersion
  const handleRefreshLatestVersion = () => {
    if (!discovery.activeCandidateId || checkingLatest) return
    setLatestCheckAttempt((current) => current + 1)
  }

  return (
    <div className="w-full max-w-2xl rounded-2xl border app-border app-bg-inset p-6 shadow-2xl">
      <Text size="xs" tt="uppercase" lts="0.24em" c="success.4" style={{ opacity: 0.8 }}>OpenClaw Classify</Text>
      <Title order={2} size="h4" fw={600} mt="xs" c="var(--app-text-primary)">安装状态与版本分流</Title>
      <Text size="sm" lh="1.625" mt="xs" c="var(--app-text-tertiary)">
        Qclaw 会根据当前安装状态决定是直接进入控制面板，还是继续进行首次配置。
      </Text>

      <div className="mt-5 rounded-xl border app-border app-bg-tertiary p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border app-border-light px-2 py-0.5 text-[11px] app-text-tertiary">
            分类：{classification.versionStatus}
          </span>
          {activeCandidate && (
            <span className="rounded-full border app-border-light px-2 py-0.5 text-[11px] app-text-tertiary">
              来源：{activeCandidate.installSource}
            </span>
          )}
          {classification.latestVersion && (
            <span className="rounded-full border app-border-light px-2 py-0.5 text-[11px] app-text-tertiary">
              最新：{classification.latestVersion}
            </span>
          )}
        </div>

        {activeCandidate && (
          <div className="mt-3 space-y-1 text-sm app-text-secondary">
            <div>当前版本：{activeCandidate.version || '未知版本'}</div>
            <div className="break-all app-text-muted">命令路径：{activeCandidate.binaryPath}</div>
            {activeCandidate.baselineBackup && (
              <div className="break-all app-text-success">
                已备份：{activeCandidate.baselineBackup.archivePath}
              </div>
            )}
          </div>
        )}

        {checkingLatest && activeCandidate && (
          <div className="mt-4 flex items-center gap-3 text-sm app-text-tertiary">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
            <span>正在检查 OpenClaw 最新版本...</span>
          </div>
        )}

        {!checkingLatest && classification.warnings.length > 0 && (
          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100/85">
            {classification.warnings.map((warning) => (
              <Text key={warning} size="xs" lh="1.25rem">
                {warning}
              </Text>
            ))}
          </div>
        )}
      </div>

      {setupRequired ? (
        <div className="mt-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
          <Title order={3} size="sm" fw={500} c="var(--mantine-color-success-3)">
            {freshManagedInstall
              ? '已安装最新 OpenClaw，并由 Qclaw 管理'
              : '已检测到 OpenClaw，但尚未完成首次初始化'}
          </Title>
          <Text size="sm" lh="1.625" mt="xs" style={{ color: 'rgba(167, 243, 208, 0.85)' }}>
            {freshManagedInstall
              ? '当前环境是本次启动中新安装的 OpenClaw，下一步将进入首次配置流程。'
              : '这台电脑上已经安装了 OpenClaw，下一步将进入配置向导。'}
          </Text>
          <Button
            onClick={() => onProceed('setup')}
            color="success"
            mt="md"
            size="sm"
          >
            继续配置
          </Button>
        </div>
      ) : classification.versionStatus === 'equal' && canEnterDashboard ? (
        <div className="mt-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
          <Title order={3} size="sm" fw={500} c="var(--mantine-color-success-3)">当前 OpenClaw 已与固定支持版本一致</Title>
          <Text size="sm" lh="1.625" mt="xs" style={{ color: 'rgba(167, 243, 208, 0.85)' }}>
            Qclaw 不会改写你现有的安装，只会作为监控与控制面板使用。
          </Text>
          <Button
            onClick={() => onProceed('dashboard')}
            color="success"
            mt="md"
            size="sm"
          >
            进入控制面板
          </Button>
        </div>
      ) : classification.versionStatus === 'outdated' ? (
        <div className="mt-5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <Title order={3} size="sm" fw={500} c="warning.3">当前 OpenClaw 尚未达到固定支持版本</Title>
          <Text size="sm" lh="1.625" mt="xs" style={{ color: 'rgba(254, 243, 199, 0.85)' }}>
            Qclaw 目前只允许 OpenClaw {PINNED_OPENCLAW_VERSION} 进入控制面板。请先完成升级，再继续后续流程。
          </Text>
          <Button
            onClick={() => onProceed('setup')}
            color="warning"
            mt="md"
            size="sm"
          >
            继续配置
          </Button>
        </div>
      ) : classification.versionStatus === 'latest-unknown' ? (
        <div className="mt-5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <Title order={3} size="sm" fw={500} c="warning.3">已检测到 OpenClaw，但最新版本暂时未知</Title>
          <Text size="sm" lh="1.625" mt="xs" style={{ color: 'rgba(254, 243, 199, 0.85)' }}>
            当前还不能确认本机 OpenClaw 是否为 {PINNED_OPENCLAW_VERSION}，因此暂不允许进入控制面板。请先刷新版本信息并完成升级确认。
          </Text>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button
              onClick={handleRefreshLatestVersion}
              disabled={checkingLatest}
              variant="outline"
              color="warning"
              size="sm"
              mt="md"
            >
              {checkingLatest ? '正在重新检测...' : '刷新版本信息'}
            </Button>
            <Button
              onClick={() => onProceed('setup')}
              color="warning"
              size="sm"
              mt="md"
            >
              继续配置
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-5 rounded-xl border app-border app-bg-tertiary p-4">
          <Title order={3} size="sm" fw={500} c="var(--app-text-primary)">下一步</Title>
          <Text size="sm" lh="1.625" mt="xs" c="var(--app-text-tertiary)">
            当前版本还没有通过固定版本校验，需先处理升级或修复后再继续。
          </Text>
          <Button
            onClick={() => onProceed('setup')}
            color="success"
            mt="md"
            size="sm"
          >
            下一步
          </Button>
        </div>
      )}
    </div>
  )
}
