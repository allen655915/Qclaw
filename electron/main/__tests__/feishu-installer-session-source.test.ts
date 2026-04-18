import { describe, expect, it } from 'vitest'

const fs = process.getBuiltinModule('node:fs') as typeof import('node:fs')
const path = process.getBuiltinModule('node:path') as typeof import('node:path')
const source = fs.readFileSync(
  path.join(process.cwd(), 'electron/main/feishu-installer-session.ts'),
  'utf8'
)

describe('feishu installer session source', () => {
  it('lets create requests prefer immediate installer launch while keeping the regular guarded startup path', () => {
    const startSessionIndex = source.indexOf('export async function startFeishuInstallerSession')
    const findInStartSession = (needle: string) => source.indexOf(needle, startSessionIndex)
    expect(startSessionIndex).toBeGreaterThan(-1)
    expect(findInStartSession('runSerializedFeishuInstallerStart(async () => {')).toBeGreaterThan(-1)
    expect(findInStartSession('const existingSession = activeSession')).toBeGreaterThan(-1)
    expect(findInStartSession('existingSession?.phase === \'running\'')).toBeGreaterThan(-1)
    expect(findInStartSession('const stopResult = await stopFeishuInstallerSession()')).toBeGreaterThan(-1)
    expect(findInStartSession('waitForFeishuInstallerSessionTerminalCleanup(existingSession)')).toBeGreaterThan(-1)
    expect(findInStartSession("'restart-replacing-running-session'")).toBeGreaterThan(-1)
    expect(findInStartSession("const preferImmediateLaunch = normalizedRequestToken !== ''")).toBeGreaterThan(-1)
    expect(findInStartSession('createBypassManagedOperationLease(FEISHU_MANAGED_CHANNEL_LOCK_KEY)')).toBeGreaterThan(-1)
    expect(findInStartSession("message: '已跳过启动前预检，收到新建请求后立即启动飞书官方安装器。'")).toBeGreaterThan(-1)
    expect(findInStartSession("preferImmediateLaunch\n      ? {")).toBeGreaterThan(-1)
    expect(findInStartSession('spawn(resolvedInstallerCommandPath')).toBeGreaterThan(-1)
    expect(findInStartSession('const guardrailAfterStartupChecks = mergeChannelInstallerGuardrailStatus(preflightResult.guardrail, {')).toBeGreaterThan(-1)
  })

  it('keeps the regular Windows runtime binding and final sync while allowing immediate create launch', () => {
    expect(source).toContain('resolveWindowsActiveRuntimeSnapshotForRead')
    expect(source).toContain("caller: 'channel-preflight'")
    expect(source).toContain('resolveWindowsChannelRuntimeContext')
    expect(source).toContain('snapshot: activeRuntimeSnapshot')
    expect(source).toContain('runtimeSnapshot: runtimeResult.context.snapshot')
    expect(source).toContain('const preferImmediateLaunch = normalizedRequestToken !== \'\'')
    expect(source).toContain('createBypassManagedOperationLease')
    expect(source).toContain("await runFeishuInstallerPreflight(initialRuntimeSnapshot)")
    expect(source).toContain('areRuntimeSnapshotsEquivalent(effectiveRuntimeSnapshot, initialRuntimeSnapshot)')
    expect(source).toContain('prepareFeishuInstallerRuntimeBinding({')
    expect(source).toContain('cleanupFeishuInstallerRuntimeBinding(runtimeBinding)')
    expect(source).toContain('runtimeBinding.env')
    expect(source).toContain('capability.resolvedPath || runtimeBinding.npxCommandPath || commandResolution.command[0]')
    expect(source).toContain("state: 'skipped'")
    expect(source).not.toContain('prepareFeishuOfficialPluginForInstaller({')
    expect(source).toContain('ensureFeishuOfficialPluginReady({')
    expect(source).toContain("pluginPrepareSkipped: true")
    expect(source).toContain('const skipInstalledPluginUpdate = await isFeishuOfficialPluginInstalledOnDisk().catch(() => false)')
    expect(source).toContain('QCLAW_FEISHU_SKIP_INSTALLED_PLUGIN_UPDATE')
    expect(source).toContain('runtimeContext: preflightResult.runtimeContext')
    expect(source).not.toContain("message: '已跳过启动前网关停止，优先立即拉起飞书官方安装器。'")
  })

  it('serializes Feishu installer terminal cleanup instead of coupling it to gateway recovery', () => {
    expect(source).toContain('let feishuInstallerTerminalCleanupQueue: Promise<void> = Promise.resolve()')
    expect(source).toContain('function enqueueFeishuInstallerTerminalCleanup(')
    expect(source).toContain('const queuedTask = feishuInstallerTerminalCleanupQueue')
    expect(source).toContain('feishuInstallerTerminalCleanupQueue = queuedTask.catch(() => undefined)')
    expect(source).toContain('enqueueFeishuInstallerTerminalCleanup(session, async () => {')
    expect(source).not.toContain("recoverGatewayForSession(session, 'feishu-installer-close')")
    expect(source).not.toContain("recoverGatewayForSession(session, 'feishu-installer-error')")
    expect(source).not.toContain('runGatewayRecoveryWithTimeout')
    expect(source).not.toContain("stopGatewayForInstaller('feishu-installer-start')")
  })

  it('surfaces structured guardrail state in snapshots and events', () => {
    expect(source).toContain('guardrail: ChannelInstallerGuardrailStatus')
    expect(source).toContain('createIdleChannelInstallerGuardrailStatus(FEISHU_MANAGED_CHANNEL_ID)')
    expect(source).toContain('failChannelInstallerGuardrailStatus({')
    expect(source).toContain('mergeChannelInstallerGuardrailStatus(preflightResult.guardrail')
    expect(source).toContain('guardrail: activeSession.guardrail')
    expect(source).toContain('managedOperationLease: operationLease')
    expect(source).toContain('releaseSessionManagedOperationLease(session)')
    expect(source).toContain('terminalCleanupDone: terminalCleanup.promise')
    expect(source).toContain('resolveTerminalCleanup: terminalCleanup.resolve')
    expect(source).toMatch(
      /lock: \{\r?\n\s+state: 'running',\r?\n\s+key: FEISHU_MANAGED_CHANNEL_LOCK_KEY/
    )
    expect(source).toContain('finalSync: {')
  })

  it('captures installer auth results for auto-pairing the scanned bot owner', () => {
    expect(source).toContain("type: 'auth-result'")
    expect(source).toContain('authResults: [...activeSession.authResults]')
    expect(source).toContain('recordFeishuInstallerAuthResult(activeSession, payload)')
  })

  it('captures structured qr-ready events for the live Feishu QR surface', () => {
    expect(source).toContain("type: 'qr-ready'")
    expect(source).toContain('recordFeishuInstallerQrReady(activeSession, payload)')
    expect(source).toContain('qrUrl: activeSession.qrUrl')
  })

  it('captures manual credential fallback as a narrow structured Feishu event', () => {
    expect(source).toContain("type: 'manual-credentials-required'")
    expect(source).toContain('FeishuPromptBridgeManualCredentialsRequiredRequest')
    expect(source).toContain('manualCredentialRequirement: FeishuInstallerManualCredentialRequirement | null')
    expect(source).toContain('recordFeishuInstallerManualCredentialRequirement(activeSession, payload)')
    expect(source).toContain("'manual-credentials-required-received'")
  })

  it('does not attach a fixed timeout to the interactive installer process', () => {
    expect(source).toContain('spawn(resolvedInstallerCommandPath')
    expect(source).not.toContain('timeout: MAIN_RUNTIME_POLICY.cli.pluginInstallNpxTimeoutMs')
  })
})
