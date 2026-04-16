import { describe, expect, it } from 'vitest'

const { readFile } = process.getBuiltinModule('node:fs/promises') as typeof import('node:fs/promises')
const path = process.getBuiltinModule('node:path') as typeof import('node:path')

describe('Windows OpenClaw install context wiring', () => {
  it('routes Windows OpenClaw installs through explicit private/external install contexts', async () => {
    const cliSource = await readFile(path.join(process.cwd(), 'electron/main/cli.ts'), 'utf8')

    expect(cliSource).toContain("type WindowsOpenClawInstallFamily = 'private-managed' | 'external-global'")
    expect(cliSource).toContain('async function resolveWindowsPrivateOpenClawInstallContext(')
    expect(cliSource).toContain('async function resolveWindowsExternalOpenClawInstallContext(')
    expect(cliSource).toContain('nodeExecutable: string | null')
    expect(cliSource).toContain('windowsOpenClawInstallContext.npmCommand')
    expect(cliSource).toContain('windowsOpenClawInstallContext.npmCommandOptions')
    expect(cliSource).toContain('windowsOpenClawInstallContext.openClawCommandPath')
  })

  it('probes the external npm prefix before pinning the Windows global openclaw install target', async () => {
    const cliSource = await readFile(path.join(process.cwd(), 'electron/main/cli.ts'), 'utf8')

    expect(cliSource).toContain('async function resolveWindowsExternalOpenClawInstallPrefix(')
    expect(cliSource).toContain('buildOpenClawConfigGetPrefixArgs(npmCommandOptions)')
    expect(cliSource).toContain("appendEnvCheckDiagnostic('main-openclaw-install-prefix-probe'")
    expect(cliSource).toContain('resolveWindowsExternalOpenClawRuntimePaths({')
  })

  it('keeps finalizeInstallResult family-aware so external installs skip the private marker and use explicit readiness commands', async () => {
    const cliSource = await readFile(path.join(process.cwd(), 'electron/main/cli.ts'), 'utf8')

    expect(cliSource).toContain("windowsOpenClawInstallFamily?: WindowsOpenClawInstallFamily | null")
    expect(cliSource).toContain("windowsOpenClawCommandPath?: string | null")
    expect(cliSource).toContain("expectations.windowsOpenClawInstallFamily !== 'external-global'")
    expect(cliSource).toContain("String(expectations.windowsOpenClawCommandPath || '').trim() || 'openclaw'")
  })

  it('wraps Windows installs in a runtime transaction and upgrades node-only repairs into combined repair flows', async () => {
    const cliSource = await readFile(path.join(process.cwd(), 'electron/main/cli.ts'), 'utf8')

    expect(cliSource).toContain('beginWindowsRuntimeInstallTransaction(')
    expect(cliSource).toContain('finalizeAndCommitWindowsOpenClawInstallResult(')
    expect(cliSource).toContain('const effectiveWindowsNeedOpenClaw =')
    expect(cliSource).toContain("effectiveWindowsNodeInstallExecutionPlan?.requiresBindingRepair")
    expect(cliSource).toContain('windowsRuntimeInstallTransaction.restore(')
  })
})
