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
