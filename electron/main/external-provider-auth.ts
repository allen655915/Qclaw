import { canonicalizeModelProviderId } from '../../src/lib/model-provider-aliases'
import { MAIN_RUNTIME_POLICY } from './runtime-policy'
import type { CliResult } from './cli'

type CleanupMatchMode = 'merged' | 'exact'

export interface ClearExternalProviderAuthInput {
  providerIds: string[]
  matchMode?: CleanupMatchMode
}

export interface ClearExternalProviderAuthResult {
  ok: boolean
  cleared: boolean
  attemptedSources: string[]
  error?: string
}

interface ExternalProviderAuthOptions {
  runCommand?: (command: string, args: string[], timeout?: number) => Promise<CliResult>
}

function normalizeProviderSet(
  providerIds: string[],
  matchMode: CleanupMatchMode = 'merged'
): Set<string> {
  if (matchMode === 'exact') {
    return new Set(
      (providerIds || [])
        .map((value) => String(value || '').trim().toLowerCase())
        .filter(Boolean)
    )
  }

  return new Set(
    (providerIds || [])
      .flatMap((value) => {
        const normalized = String(value || '').trim().toLowerCase()
        const canonical = canonicalizeModelProviderId(normalized)
        return [normalized, canonical]
      })
      .filter(Boolean)
  )
}

async function defaultRunCommand(command: string, args: string[], timeout?: number): Promise<CliResult> {
  const cli = await import('./cli')
  return cli.runShell(command, args, timeout, 'oauth')
}

export async function clearExternalProviderAuth(
  input: ClearExternalProviderAuthInput,
  options: ExternalProviderAuthOptions = {}
): Promise<ClearExternalProviderAuthResult> {
  const matchMode = input.matchMode || 'merged'
  const providerSet = normalizeProviderSet(input.providerIds || [], matchMode)
  const attemptedSources: string[] = []
  let cleared = false

  const shouldRunCodexLogout = matchMode === 'exact'
    ? providerSet.has('openai-codex')
    : providerSet.has('openai')

  if (shouldRunCodexLogout) {
    attemptedSources.push('codex-cli')
    const runCommand = options.runCommand ?? defaultRunCommand
    const result = await runCommand('codex', ['logout'], MAIN_RUNTIME_POLICY.cli.defaultCommandTimeoutMs)
    if (!result.ok) {
      return {
        ok: false,
        cleared,
        attemptedSources,
        error: result.stderr || result.stdout || 'Codex logout failed',
      }
    }
    cleared = true
  }

  return {
    ok: true,
    cleared,
    attemptedSources,
  }
}
