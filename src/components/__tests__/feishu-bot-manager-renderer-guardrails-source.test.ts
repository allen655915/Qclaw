import { describe, expect, it } from 'vitest'

const fs = process.getBuiltinModule('node:fs') as typeof import('node:fs')
const path = process.getBuiltinModule('node:path') as typeof import('node:path')

describe('FeishuBotManagerModal renderer guardrails', () => {
  it('renders installer guardrails and auto syncs Feishu config before listing bots', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src', 'components', 'FeishuBotManagerModal.tsx'),
      'utf8'
    )

    expect(source).toContain("import { resolveChannelInstallerGuardrailView } from '../lib/channel-installer-guardrail'")
    expect(source).toContain("import { getFeishuOfficialPluginStateReady } from '../lib/feishu-official-plugin-auto-sync'")
    expect(source).toContain('const [feishuConfigNotice, setFeishuConfigNotice] = useState')
    expect(source).toContain('const [feishuInstallerGuardrail, setFeishuInstallerGuardrail]')
    expect(source).toContain('setFeishuInstallerGuardrail(snapshot.guardrail || null)')
    expect(source).toContain('setFeishuInstallerGuardrail(payload.guardrail || null)')
    expect(source).toContain('const pluginStateResult = await getFeishuOfficialPluginStateReady(window.api)')
    expect(source).toContain('title="飞书配置修复失败"')
    expect(source).not.toContain('需要显式同步飞书配置')
  })

  it('retains owned successful exits long enough to finalize on reopen while still clearing unrelated stale sessions', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src', 'components', 'FeishuBotManagerModal.tsx'),
      'utf8'
    )

    expect(source).toContain('ownedFeishuCreateSessionId')
    expect(source).toContain('ownedFeishuCreateSessionSource')
    expect(source).toContain('isOwnedFeishuManagerCreateSession')
    expect(source).toContain('snapshotMatchesOwnedSession')
    expect(source).toContain('if (snapshot.active && snapshotSessionId)')
    expect(source).toContain('feishuCreateStartConfigSnapshotKnown')
    expect(source).toContain('feishuCreateRuntimeSessionId')
    expect(source).toContain('shouldAdoptFeishuCreateSession(snapshot.sessionId, snapshot.active, snapshot.requestToken)')
    expect(source).toContain('shouldAdoptFeishuCreateSession(payload.sessionId, true, payload.requestToken)')
    expect(source).toContain('rememberFeishuCreateRuntimeSession')
    expect(source).toContain('clearOwnedFeishuCreateSessionMarkers')
    expect(source).toContain('shouldRetainExitedOwnedFeishuManagerCreateSession')
    expect(source).toContain('shouldRetainOwnedFeishuManagerCreateSessionWhileHidden')
    expect(source).toContain('showOwnedFeishuCreateSessionSurface')
    expect(source).toContain('showFeishuCreateRuntimeSurface')
    expect(source).toContain('当前没有正在进行的飞书新建会话')
  })

  it('finalizes owned create sessions through the same merge and auto-pair recovery path as channel connect', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src', 'components', 'FeishuBotManagerModal.tsx'),
      'utf8'
    )

    expect(source).toContain('captureFeishuBotConfigSnapshot')
    expect(source).toContain('mergeFeishuCreateModeBots')
    expect(source).toContain('mergeFeishuPairingAllowFromUsersIntoConfig')
    expect(source).toContain('resolveFeishuInstallerAutoPairOpenId')
    expect(source).toContain('finalizeOwnedFeishuCreateSession')
    expect(source).toContain("window.api.pairingAddAllowFrom(")
    expect(source).toContain("ensureGatewayReadyForChannelConnect(window.api")
    expect(source).toContain('handledOwnedFeishuCreateSessionIdRef')
  })

  it('keeps Feishu create startup on lightweight installer polling instead of refreshing plugin-ready state', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src', 'components', 'FeishuBotManagerModal.tsx'),
      'utf8'
    )

    expect(source).toContain('waitForFeishuManagerInstallerActivation')
    expect(source).toContain('feishuInstallerActivationWaitSeqRef')
    expect(source).toContain('feishuCreateRequestTokenRef')
    expect(source).toContain("setFeishuInstallerNotice('正在启动飞书官方安装器并等待二维码，请稍候...')")
    expect(source).toContain("await window.api.startFeishuInstaller(")
    expect(source).toContain('shouldWaitForFeishuInstallerActivation')
    expect(source).toContain('resolveFeishuInstallerStartFailureMessage')
    expect(source).toContain("setBotError(toUserFacingUnknownErrorMessage(e, '启动飞书官方安装器失败'))")
    expect(source).not.toContain('检测到旧的飞书安装器会话，Qclaw 已先将其终止。重新点击“新建机器人”会启动新的官方安装流程。')
    expect(source).not.toContain('检测到已有飞书安装器正在运行。为避免误接管其他新建流程，请等待原流程完成，或先停止后重新开始。')
    expect(source).not.toContain("setFeishuInstallerNotice('飞书安装器正在启动，Qclaw 正在继续等待二维码。')")
    expect(source).not.toContain("setFeishuInstallerNotice('正在检测飞书安装器状态，请稍候...')")
  })

  it('renders the Feishu create confirmation inline instead of relying on browser confirm dialogs', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src', 'components', 'FeishuBotManagerModal.tsx'),
      'utf8'
    )

    expect(source).toContain('const [feishuInstallerPromptDecision, setFeishuInstallerPromptDecision]')
    expect(source).toContain('handleFeishuCreateBotPromptDecision')
    expect(source).toContain('shouldStopFeishuInstallerForPendingPromptCleanup(')
    expect(source).toContain('submitFeishuInstallerPromptDecision({')
    expect(source).toContain('title="等待确认"')
    expect(source).toContain('继续新建')
    expect(source).not.toContain('window.confirm(buildFeishuCreateBotConfirmationMessage')
  })

  it('shows installer console output whenever the shared Feishu console surface is active', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src', 'components', 'FeishuBotManagerModal.tsx'),
      'utf8'
    )

    expect(source).toContain('const visibleFeishuInstallerOutput = showFeishuInstallerConsoleSurface ? feishuInstallerOutput : \'\'')
    expect(source).toContain('const visibleFeishuInstallerRunning = showFeishuInstallerConsoleSurface && feishuInstallerRunning')
    expect(source).not.toContain('const visibleFeishuInstallerOutput = showFeishuCreateRuntimeSurface ? feishuInstallerOutput : \'\'')
  })

  it('stops the installer and shows a return-to-channel-config notice when manual credentials are required', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src', 'components', 'FeishuBotManagerModal.tsx'),
      'utf8'
    )

    expect(source).toContain("payload.type === 'manual-credentials-required'")
    expect(source).toContain('setFeishuInstallerManualCredentialRequirement(payload.manualCredentialRequirement || null)')
    expect(source).toContain('waitForFeishuInstallerToStop')
    expect(source).toContain('await window.api.stopFeishuInstaller().catch(() => {')
    expect(source).toContain('请关闭当前设置弹窗，回到飞书渠道配置页继续“关联已有机器人”')
    expect(source).not.toContain('PasswordInput')
  })
})
