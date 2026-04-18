export type FeishuInstallerPendingPromptKind = 'useExisting'
export type FeishuInstallerPendingPromptAction = 'confirm-create-bot'
export type FeishuInstallerManualCredentialKind = 'app-id-secret' | 'secret-only'

export interface FeishuInstallerPendingPrompt {
  promptId: string
  kind: FeishuInstallerPendingPromptKind
  action: FeishuInstallerPendingPromptAction
  promptType: 'confirm'
  appId?: string
  defaultValue?: boolean | null
}

export interface FeishuInstallerManualCredentialRequirement {
  kind: FeishuInstallerManualCredentialKind
  defaultAppId?: string
}

export type FeishuInstallerPromptResolution = 'confirm' | 'cancel'

export interface SubmitFeishuInstallerPromptDecisionParams {
  sessionId: string | null | undefined
  prompt: FeishuInstallerPendingPrompt | null | undefined
  decision: FeishuInstallerPromptResolution
  answerPrompt: (
    sessionId: string,
    promptId: string,
    decision: FeishuInstallerPromptResolution
  ) => Promise<{ ok: boolean; message?: string | null }>
}

export type SubmitFeishuInstallerPromptDecisionResult =
  | { ok: true; confirmed: boolean }
  | { ok: false; confirmed: boolean; reason: 'missing-context' | 'api-error'; message: string }

export function isFeishuCreateBotConfirmationPrompt(
  prompt: FeishuInstallerPendingPrompt | null | undefined
): prompt is FeishuInstallerPendingPrompt {
  return Boolean(
    prompt
    && prompt.kind === 'useExisting'
    && prompt.action === 'confirm-create-bot'
    && prompt.promptType === 'confirm'
  )
}

export function shouldDisableFeishuInstallerManualInput(
  prompt: FeishuInstallerPendingPrompt | null | undefined,
  requirement?: FeishuInstallerManualCredentialRequirement | null | undefined
): boolean {
  return Boolean(prompt || requirement)
}

export function shouldStopFeishuInstallerForPendingPromptCleanup(
  prompt: FeishuInstallerPendingPrompt | null | undefined,
  decision: FeishuInstallerPromptResolution | null | undefined
): boolean {
  return isFeishuCreateBotConfirmationPrompt(prompt) && decision !== 'confirm'
}

export function hasFeishuInstallerManualCredentialRequirement(
  requirement: FeishuInstallerManualCredentialRequirement | null | undefined
): requirement is FeishuInstallerManualCredentialRequirement {
  return Boolean(
    requirement
    && (requirement.kind === 'app-id-secret' || requirement.kind === 'secret-only')
  )
}

export function shouldDisableFeishuCreateInstallerButton(params: {
  installerRunning?: boolean
  installerBusy?: boolean
  preparingManualBinding?: boolean
  finishingSetup?: boolean
}): boolean {
  return Boolean(
    params.installerRunning
    || params.installerBusy
    || params.preparingManualBinding
    || params.finishingSetup
  )
}

export function buildFeishuCreateBotConfirmationMessage(
  prompt: FeishuInstallerPendingPrompt | null | undefined
): string {
  void prompt
  return '确认新建机器人？'
}

export async function submitFeishuInstallerPromptDecision(
  params: SubmitFeishuInstallerPromptDecisionParams
): Promise<SubmitFeishuInstallerPromptDecisionResult> {
  const confirmed = params.decision === 'confirm'
  if (!isFeishuCreateBotConfirmationPrompt(params.prompt)) {
    return {
      ok: false,
      confirmed,
      reason: 'missing-context',
      message: '飞书官方安装器确认状态已失效，请重新点击“新建机器人”。',
    }
  }

  const sessionId = String(params.sessionId || '').trim()
  const promptId = String(params.prompt.promptId || '').trim()
  if (!sessionId || !promptId) {
    return {
      ok: false,
      confirmed,
      reason: 'missing-context',
      message: '飞书官方安装器确认状态已失效，请重新点击“新建机器人”。',
    }
  }

  const result = await params.answerPrompt(sessionId, promptId, params.decision)
  if (!result.ok) {
    return {
      ok: false,
      confirmed,
      reason: 'api-error',
      message: result.message || (confirmed ? '继续新建机器人失败' : '取消新建机器人失败'),
    }
  }

  return {
    ok: true,
    confirmed,
  }
}
