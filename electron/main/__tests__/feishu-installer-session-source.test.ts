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
    expect(findInStartSession("const preferImmediateLaunch = normalizedRequestToken !== ''")).toBeGreaterThan(-1)
    expect(findInStartSession('createBypassManagedOperationLease(FEISHU_MANAGED_CHANNEL_LOCK_KEY)')).toBeGreaterThan(-1)
    expect(findInStartSession("message: '已跳过启动前预检，收到新建请求后立即启动飞书官方安装器。'")).toBeGreaterThan(-1)
    expect(findInStartSession("message: '已跳过启动前网关停止，优先立即拉起飞书官方安装器。'")).toBeGreaterThan(-1)
    expect(findInStartSession("preferImmediateLaunch\n      ? {")).toBeGreaterThan(-1)
    expect(findInStartSession("stopGatewayForInstaller('feishu-installer-start')")).toBeGreaterThan(-1)
    expect(findInStartSession('spawn(resolvedInstallerCommandPath')).toBeGreaterThan(-1)
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
    expect(source).toContain("message: '已跳过启动前网关停止，优先立即拉起飞书官方安装器。'")
  })

  it('recovers only the gateway snapshot stopped for the Feishu installer on terminal paths', () => {
    expect(source).toContain('gatewayStopSnapshot: stopGatewayResult.snapshot')
    expect(source).toContain('gatewayStoppedForInstall: stopGatewayResult.stopped')
    expect(source).toContain("recoverGatewayForSession(session, 'feishu-installer-close')")
    expect(source).toContain("recoverGatewayForSession(session, 'feishu-installer-error')")
    expect(source).toContain('runGatewayRecoveryWithTimeout')
    expect(source).toContain('stopGatewayResult.snapshot')
    expect(source).toContain("'feishu-installer-start-failed'")
    expect(source).toContain("recoverGatewayForSession(session, 'feishu-installer-stop'")
  })

  it('surfaces structured guardrail state in snapshots and events', () => {
    expect(source).toContain('guardrail: ChannelInstallerGuardrailStatus')
    expect(source).toContain('createIdleChannelInstallerGuardrailStatus(FEISHU_MANAGED_CHANNEL_ID)')
    expect(source).toContain('failChannelInstallerGuardrailStatus({')
    expect(source).toContain('mergeChannelInstallerGuardrailStatus(preflightResult.guardrail')
    expect(source).toContain('guardrail: activeSession.guardrail')
    expect(source).toContain('managedOperationLease: operationLease')
    expect(source).toContain('releaseSessionManagedOperationLease(session)')
    expect(source).toMatch(
      /lock: \{\r?\n\s+state: 'running',\r?\n\s+key: FEISHU_MANAGED_CHANNEL_LOCK_KEY/
    )
    expect(source).toContain('gateway: {')
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

  it('does not attach a fixed timeout to the interactive installer process', () => {
    expect(source).toContain('spawn(resolvedInstallerCommandPath')
    expect(source).not.toContain('timeout: MAIN_RUNTIME_POLICY.cli.pluginInstallNpxTimeoutMs')
  })
})
