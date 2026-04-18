import { describe, expect, it, vi } from 'vitest'

import {
  buildFeishuCreateBotConfirmationMessage,
  hasFeishuInstallerManualCredentialRequirement,
  isFeishuCreateBotConfirmationPrompt,
  shouldDisableFeishuCreateInstallerButton,
  shouldDisableFeishuInstallerManualInput,
  shouldStopFeishuInstallerForPendingPromptCleanup,
  submitFeishuInstallerPromptDecision,
  type FeishuInstallerManualCredentialRequirement,
  type FeishuInstallerPendingPrompt,
} from '../feishu-installer-session'

function buildPrompt(overrides?: Partial<FeishuInstallerPendingPrompt>): FeishuInstallerPendingPrompt {
  return {
    promptId: 'prompt-1',
    kind: 'useExisting',
    action: 'confirm-create-bot',
    promptType: 'confirm',
    defaultValue: true,
    ...overrides,
  }
}

function buildManualRequirement(
  overrides?: Partial<FeishuInstallerManualCredentialRequirement>
): FeishuInstallerManualCredentialRequirement {
  return {
    kind: 'app-id-secret',
    ...overrides,
  }
}

describe('feishu installer prompt helpers', () => {
  it('identifies the structured create-bot confirmation prompt', () => {
    expect(isFeishuCreateBotConfirmationPrompt(buildPrompt())).toBe(true)
    expect(isFeishuCreateBotConfirmationPrompt(null)).toBe(false)
    expect(
      isFeishuCreateBotConfirmationPrompt(buildPrompt({ action: 'confirm-create-bot', kind: 'useExisting' }))
    ).toBe(true)
    expect(
      isFeishuCreateBotConfirmationPrompt({
        ...buildPrompt(),
        promptType: 'input' as FeishuInstallerPendingPrompt['promptType'],
      })
    ).toBe(false)
  })

  it('blocks manual stdin input whenever a structured prompt is pending', () => {
    expect(shouldDisableFeishuInstallerManualInput(buildPrompt())).toBe(true)
    expect(shouldDisableFeishuInstallerManualInput(null, buildManualRequirement())).toBe(true)
    expect(shouldDisableFeishuInstallerManualInput(null)).toBe(false)
  })

  it('does not auto-stop the installer once confirm is already in flight', () => {
    expect(shouldStopFeishuInstallerForPendingPromptCleanup(buildPrompt(), null)).toBe(true)
    expect(shouldStopFeishuInstallerForPendingPromptCleanup(buildPrompt(), 'cancel')).toBe(true)
    expect(shouldStopFeishuInstallerForPendingPromptCleanup(buildPrompt(), 'confirm')).toBe(false)
    expect(shouldStopFeishuInstallerForPendingPromptCleanup(null, 'confirm')).toBe(false)
  })

  it('recognizes the narrow structured manual credential fallback state', () => {
    expect(hasFeishuInstallerManualCredentialRequirement(buildManualRequirement())).toBe(true)
    expect(hasFeishuInstallerManualCredentialRequirement(buildManualRequirement({ kind: 'secret-only' }))).toBe(true)
    expect(hasFeishuInstallerManualCredentialRequirement(null)).toBe(false)
  })

  it('blocks create-bot action while an installer operation is already active', () => {
    expect(shouldDisableFeishuCreateInstallerButton({ installerRunning: true })).toBe(true)
    expect(shouldDisableFeishuCreateInstallerButton({ installerBusy: true })).toBe(true)
    expect(shouldDisableFeishuCreateInstallerButton({ preparingManualBinding: true })).toBe(true)
    expect(shouldDisableFeishuCreateInstallerButton({ finishingSetup: true })).toBe(true)
    expect(shouldDisableFeishuCreateInstallerButton({})).toBe(false)
  })

  it('builds a user-facing confirmation message with the detected app id when available', () => {
    expect(buildFeishuCreateBotConfirmationMessage(buildPrompt({ appId: 'cli_existing_bot' }))).toBe('确认新建机器人？')
    expect(buildFeishuCreateBotConfirmationMessage(buildPrompt())).toBe('确认新建机器人？')
  })

  it('submits the structured prompt decision through the installer api', async () => {
    const answerPrompt = vi.fn().mockResolvedValue({ ok: true })

    const result = await submitFeishuInstallerPromptDecision({
      sessionId: 'session-1',
      prompt: buildPrompt({ promptId: 'prompt-123' }),
      decision: 'confirm',
      answerPrompt,
    })

    expect(result).toEqual({ ok: true, confirmed: true })
    expect(answerPrompt).toHaveBeenCalledWith('session-1', 'prompt-123', 'confirm')
  })

  it('returns a missing-context result instead of calling the api when prompt metadata is stale', async () => {
    const answerPrompt = vi.fn()

    const result = await submitFeishuInstallerPromptDecision({
      sessionId: '   ',
      prompt: buildPrompt({ promptId: '' }),
      decision: 'cancel',
      answerPrompt,
    })

    expect(result).toEqual({
      ok: false,
      confirmed: false,
      reason: 'missing-context',
      message: '飞书官方安装器确认状态已失效，请重新点击“新建机器人”。',
    })
    expect(answerPrompt).not.toHaveBeenCalled()
  })

  it('surfaces installer api failures with the matching decision fallback copy', async () => {
    const answerPrompt = vi.fn().mockResolvedValue({ ok: false, message: '' })

    const result = await submitFeishuInstallerPromptDecision({
      sessionId: 'session-1',
      prompt: buildPrompt({ promptId: 'prompt-456' }),
      decision: 'cancel',
      answerPrompt,
    })

    expect(result).toEqual({
      ok: false,
      confirmed: false,
      reason: 'api-error',
      message: '取消新建机器人失败',
    })
    expect(answerPrompt).toHaveBeenCalledWith('session-1', 'prompt-456', 'cancel')
  })
})
