import { describe, expect, it } from 'vitest'

const fs = process.getBuiltinModule('node:fs') as typeof import('node:fs')
const path = process.getBuiltinModule('node:path') as typeof import('node:path')

describe('ChannelsPage renderer guardrails', () => {
  it('auto syncs Feishu normalized config before rebuilding the channel list', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src', 'pages', 'ChannelsPage.tsx'),
      'utf8'
    )

    expect(source).toContain('const [channelConfigNotice, setChannelConfigNotice] = useState')
    expect(source).toContain("import { getFeishuOfficialPluginStateReady } from '../lib/feishu-official-plugin-auto-sync'")
    expect(source).toContain('getFeishuOfficialPluginStateReady(window.api).catch((reason) => {')
    expect(source).toContain('Qclaw 自动修复飞书配置失败：${feishuConfigRepairError}')
    expect(source).toContain('title="飞书配置修复失败"')
    expect(source).toContain('withChannelsPageTimeoutFallback(')
    expect(source).toContain('读取渠道配置超时，请点击“刷新”重试。')
    expect(source).not.toContain('需要显式同步飞书配置')
    expect(source).not.toContain('本页不会在后台静默写入 managed channel 配置')
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
