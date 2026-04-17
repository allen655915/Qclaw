import { describe, expect, it } from 'vitest'

import openClawClassifySource from '../OpenClawClassify.tsx?raw'

describe('OpenClawClassify approved copy', () => {
  it('matches the approved DOCX copy for setup and fallback branches', () => {
    expect(openClawClassifySource).toContain('这台电脑上已经安装了 OpenClaw，下一步将进入配置向导。')
    expect(openClawClassifySource).toContain('Qclaw 目前只允许 OpenClaw {PINNED_OPENCLAW_VERSION} 进入控制面板。请先完成升级，再继续后续流程。')
    expect(openClawClassifySource).toContain('当前还不能确认本机 OpenClaw 是否为 {PINNED_OPENCLAW_VERSION}，因此暂不允许进入控制面板。请先刷新版本信息并完成升级确认。')
    expect(openClawClassifySource).toContain('当前版本还没有通过固定版本校验，需先处理升级或修复后再继续。')
    expect(openClawClassifySource).not.toContain('保留当前版本，可以先进入控制面板查看和使用，稍后再决定是否升级。')
    expect(openClawClassifySource).not.toContain('目前暂时无法确认最新版本，可能是网络连接异常。可以先进入控制面板，后续再检查更新。')
    expect(openClawClassifySource).not.toContain('当前状态不影响继续使用，可以先进入控制面板，后续再处理升级或修复。')
    expect(openClawClassifySource).toContain('下一步')
  })
})
