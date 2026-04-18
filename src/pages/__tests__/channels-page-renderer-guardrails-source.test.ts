import { describe, expect, it } from 'vitest'

const fs = process.getBuiltinModule('node:fs') as typeof import('node:fs')
const path = process.getBuiltinModule('node:path') as typeof import('node:path')

describe('ChannelsPage renderer guardrails', () => {
  it('keeps Feishu normalized config on the explicit-sync path before rebuilding the channel list', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src', 'pages', 'ChannelsPage.tsx'),
      'utf8'
    )

    expect(source).toContain('const [channelConfigNotice, setChannelConfigNotice] = useState')
    expect(source).not.toContain("import { getFeishuOfficialPluginStateReady } from '../lib/feishu-official-plugin-auto-sync'")
    expect(source).toContain('window.api.getFeishuOfficialPluginState().catch(() => null)')
    expect(source).toContain('检测到飞书官方插件配置需要同步。请打开飞书渠道执行显式修复或重新完成配置；本页不会在后台静默写入 managed channel 配置。')
    expect(source).toContain('title="需要显式同步飞书配置"')
    expect(source).toContain('withChannelsPageTimeoutFallback(')
    expect(source).toContain('读取渠道配置超时，请点击“刷新”重试。')
    expect(source).not.toContain('Qclaw 自动修复飞书配置失败')
  })

  it('removes personal Weixin account state only after the guarded config write succeeds', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src', 'pages', 'ChannelsPage.tsx'),
      'utf8'
    )
    const writeIndex = source.indexOf('const writeResult = await window.api.applyConfigPatchGuarded({')
    const failureCheckIndex = source.indexOf('if (!writeResult.ok)', writeIndex)
    const removeStateIndex = source.indexOf('await window.api.removeWeixinAccount(weixinAccountStateToRemove)', writeIndex)

    expect(source).toContain("let weixinAccountStateToRemove = ''")
    expect(writeIndex).toBeGreaterThan(-1)
    expect(failureCheckIndex).toBeGreaterThan(writeIndex)
    expect(removeStateIndex).toBeGreaterThan(failureCheckIndex)
  })
})
