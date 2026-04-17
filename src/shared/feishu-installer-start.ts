import type { ChannelInstallerGuardrailStatus } from './channel-installer-session'

export interface FeishuInstallerStartSnapshotLike {
  active?: boolean
  sessionId?: string | null
  phase?: 'idle' | 'running' | 'exited' | string | null
  code?: number | null
  output?: string | null
  guardrail?: Pick<ChannelInstallerGuardrailStatus, 'failure'> | null
}

export function shouldWaitForFeishuInstallerActivation(
  snapshot: FeishuInstallerStartSnapshotLike | null | undefined
): boolean {
  if (!snapshot) return true
  if (snapshot.active) return false
  if (snapshot.phase === 'exited') return false
  if (snapshot.code !== null && snapshot.code !== undefined) return false
  if (snapshot.guardrail?.failure) return false
  return true
}

export function extractFeishuInstallerStartFailureDetail(
  snapshot: FeishuInstallerStartSnapshotLike | null | undefined
): string {
  return String(
    snapshot?.guardrail?.failure?.message
      || snapshot?.output
      || ''
  ).trim()
}
