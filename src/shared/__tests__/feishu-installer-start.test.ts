import { describe, expect, it } from 'vitest'

import {
  extractFeishuInstallerStartFailureDetail,
  shouldWaitForFeishuInstallerActivation,
} from '../feishu-installer-start'

describe('feishu installer start helpers', () => {
  it('waits only while startup may still be in progress', () => {
    expect(shouldWaitForFeishuInstallerActivation(null)).toBe(true)
    expect(shouldWaitForFeishuInstallerActivation({})).toBe(true)
    expect(shouldWaitForFeishuInstallerActivation({ active: true })).toBe(false)
    expect(shouldWaitForFeishuInstallerActivation({ phase: 'exited' })).toBe(false)
    expect(shouldWaitForFeishuInstallerActivation({ code: 1 })).toBe(false)
    expect(
      shouldWaitForFeishuInstallerActivation({
        guardrail: {
          failure: {
            code: 'spawn-failed',
            message: 'spawn failed',
            step: 'spawn',
          },
        },
      })
    ).toBe(false)
  })

  it('prefers structured guardrail failures when extracting startup detail', () => {
    expect(
      extractFeishuInstallerStartFailureDetail({
        output: 'fallback stderr',
        guardrail: {
          failure: {
            code: 'spawn-failed',
            message: 'spawn failed',
            step: 'spawn',
          },
        },
      })
    ).toBe('spawn failed')

    expect(
      extractFeishuInstallerStartFailureDetail({
        output: 'plain stderr',
      })
    ).toBe('plain stderr')

    expect(extractFeishuInstallerStartFailureDetail(null)).toBe('')
  })
})
