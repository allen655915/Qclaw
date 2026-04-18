import { describe, expect, it } from 'vitest'

const fs = process.getBuiltinModule('node:fs') as typeof import('node:fs')
const path = process.getBuiltinModule('node:path') as typeof import('node:path')

function readChannelConnectSource(): string {
  return fs.readFileSync(
    path.join(process.cwd(), 'src', 'pages', 'ChannelConnect.tsx'),
    'utf8'
  )
}

describe('ChannelConnect renderer guardrails', () => {
  it('renders installer guardrail views for Feishu and Weixin from structured state', () => {
    const source = readChannelConnectSource()

    expect(source).toContain("import { resolveChannelInstallerGuardrailView } from '../lib/channel-installer-guardrail'")
    expect(source).toContain('const [feishuInstallerGuardrail, setFeishuInstallerGuardrail]')
    expect(source).toContain('const [weixinInstallerGuardrail, setWeixinInstallerGuardrail]')
    expect(source).toContain('const feishuGuardrailView = useMemo(')
    expect(source).toContain('const weixinGuardrailView = useMemo(')
    expect(source).toContain('const hasBlockingFeishuGuardrailFailure = Boolean(feishuInstallerGuardrail?.failure)')
    expect(source).toContain('const feishuInstallerFailureView = showFeishuCreateInstallerArtifacts && !hasBlockingFeishuGuardrailFailure')
    expect(source).toContain('setFeishuInstallerGuardrail(snapshot.guardrail || null)')
    expect(source).toContain('setWeixinInstallerGuardrail(snapshot.guardrail || null)')
    expect(source).toContain('setFeishuInstallerGuardrail(payload.guardrail || null)')
    expect(source).toContain('setWeixinInstallerGuardrail(payload.guardrail || null)')
  })

  it('keeps Feishu config drift on the explicit-sync path before surfacing refresh state', () => {
    const source = readChannelConnectSource()

    expect(source).not.toContain("import { getFeishuOfficialPluginStateReady } from '../lib/feishu-official-plugin-auto-sync'")
    expect(source).toContain('const pluginState = await window.api.getFeishuOfficialPluginState()')
    expect(source).toContain('不会在后台静默写入 managed channel 配置')
    expect(source).toContain('需要显式同步')
    expect(source).not.toContain('自动同步配置')
  })

  it('lets the Weixin backend installer own managed plugin preflight state', () => {
    const source = readChannelConnectSource()

    expect(source).not.toContain("channel: getChannelDefinition('openclaw-weixin')")
    expect(source).toContain('const snapshot = await window.api.startWeixinInstaller()')
    expect(source).toContain('applyWeixinInstallerSnapshot(snapshot)')
  })

  it('suppresses the shared bottom failure alert on the personal Weixin installer surface', () => {
    const source = readChannelConnectSource()

    expect(source).toContain("selectedChannel?.id !== 'openclaw-weixin'")
  })

  it('keeps Feishu create session ownership separate from recovered-config readiness', () => {
    const source = readChannelConnectSource()

    expect(source).toContain('ownedFeishuCreateSessionId')
    expect(source).toContain('ownedFeishuCreateSessionSource')
    expect(source).toContain('feishuCreateRequestTokenRef')
    expect(source).toContain('configRecoveredFeishuCreateReady')
    expect(source).toContain('isStaleExitedFeishuSession')
    expect(source).toContain('canFinishFeishuRecoveredCreateWithoutSession')
  })

  it('adopts delayed Feishu create sessions with request tokens instead of hiding installer artifacts', () => {
    const source = readChannelConnectSource()

    expect(source).toContain('shouldAdoptFeishuCreateSession(')
    expect(source).toContain('payload.requestToken')
    expect(source).toContain('waitForFeishuInstallerActivation(mode, waitSeq)')
    expect(source).toContain('正在启动飞书官方安装器并等待二维码，请稍候...')
    expect(source).not.toContain('检测到旧的飞书安装器会话，Qclaw 已先将其终止。重新点击“新建机器人”会启动新的官方安装流程。')
  })

  it('renders the Feishu create confirmation inline instead of relying on browser confirm dialogs', () => {
    const source = readChannelConnectSource()

    expect(source).toContain('const [feishuInstallerPromptDecision, setFeishuInstallerPromptDecision]')
    expect(source).toContain('handleFeishuCreateBotPromptDecision')
    expect(source).toContain('shouldStopFeishuInstallerForPendingPromptCleanup(')
    expect(source).toContain('submitFeishuInstallerPromptDecision({')
    expect(source).toContain('title="等待确认"')
    expect(source).toContain('继续新建')
    expect(source).not.toContain('window.confirm(buildFeishuCreateBotConfirmationMessage')
  })

  it('keeps the Feishu installer console and sync notice visible for any active create session', () => {
    const source = readChannelConnectSource()

    expect(source).toContain("|| Boolean(params.session?.active || params.session?.phase === 'running')")
    expect(source).toContain('const hasActiveFeishuCreateSession =')
    expect(source).toContain('hasActiveCreateSession: hasActiveFeishuCreateSession')
  })

  it('does not auto-open the Feishu QR modal for arbitrary stale ASCII output', () => {
    const source = readChannelConnectSource()

    expect(source).not.toMatch(/if \(feishuInstallerAsciiQr\.length > 0\) \{\s*setShowFeishuQrModal\(true\)\s*\}/)
    expect(source).toContain('shouldAutoOpenFeishuQrModal({')
    expect(source).toContain('showInstallerConsoleSurface: showFeishuInstallerConsoleSurface')
    expect(source).toContain('installerRunning: feishuInstallerRunning')
    expect(source).toContain('qrUrl: feishuInstallerQrUrl')
    expect(source).toContain("payload.type === 'qr-ready'")
    expect(source).toContain("setFeishuInstallerQrUrl(String(payload.qrUrl || '').trim())")
    expect(source).toContain('<QRCodeSVG value={feishuInstallerQrUrl} size={220} includeMargin />')
  })

  it('keeps sessionless refresh recovery manual-only instead of auto-finishing stale sessions', () => {
    const source = readChannelConnectSource()

    expect(source).toContain('setConfigRecoveredFeishuCreateReady(true)')
    expect(source).toContain('当前没有可继续复用的安装器会话，你可以点击“完成配置”收口这次新建流程')
    expect(source).toContain('showOwnedCreateSessionSurface: showOwnedFeishuCreateSessionSurface')
  })

  it('hands Feishu manual credential fallback over to the existing manual binding path after the installer exits', () => {
    const source = readChannelConnectSource()

    expect(source).toContain("payload.type === 'manual-credentials-required'")
    expect(source).toContain('setFeishuInstallerManualCredentialRequirement(payload.manualCredentialRequirement || null)')
    expect(source).toContain('waitForFeishuInstallerToStop')
    expect(source).toContain('await window.api.stopFeishuInstaller().catch(() => {')
    expect(source).toContain('await prepareFeishuManualBinding()')
    expect(source).toContain('已切换到手动绑定，并预填 App ID')
  })
})
