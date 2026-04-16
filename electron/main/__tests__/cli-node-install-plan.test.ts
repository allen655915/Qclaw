import { describe, expect, it } from 'vitest'

const { readFile } = process.getBuiltinModule('node:fs/promises') as typeof import('node:fs/promises')
const path = process.getBuiltinModule('node:path') as typeof import('node:path')

describe('Windows node install execution plan wiring', () => {
  it('attaches the Windows execution plan to checkNode results and exports a dedicated resolver', async () => {
    const cliSource = await readFile(path.join(process.cwd(), 'electron/main/cli.ts'), 'utf8')

    expect(cliSource).toContain('export async function resolveWindowsNodeInstallExecutionPlan(')
    expect(cliSource).toContain('executionPlan?: WindowsNodeInstallExecutionPlanView | null')
    expect(cliSource).toContain('detectedNodeExecutablePath?: string | null')
    expect(cliSource).toContain('detectedNodePath: detectedNodeExecutablePath')
    expect(cliSource).toContain('resolveSelectedWindowsOpenClawRuntimeSnapshot({')
    expect(cliSource).toContain('return checkNodeInternal({ includeExecutionPlan: true })')
    expect(cliSource).toContain('await resolveWindowsNodeInstallExecutionPlan({')
    expect(cliSource).toContain("appendEnvCheckDiagnostic('main-node-install-strategy-resolved'")
  })

  it('wires the dedicated resolver through IPC and preload', async () => {
    const ipcHandlersSource = await readFile(path.join(process.cwd(), 'electron/main/ipc-handlers.ts'), 'utf8')
    const preloadSource = await readFile(path.join(process.cwd(), 'electron/preload/index.ts'), 'utf8')

    expect(ipcHandlersSource).toContain("ipcMain.handle('env:resolveWindowsNodeInstallExecutionPlan'")
    expect(preloadSource).toContain("resolveWindowsNodeInstallExecutionPlan: () => ipcRenderer.invoke('env:resolveWindowsNodeInstallExecutionPlan')")
  })

  it('routes Windows node installation through the plan-driven nvm executor and fallback diagnostics', async () => {
    const cliSource = await readFile(path.join(process.cwd(), 'electron/main/cli.ts'), 'utf8')

    expect(cliSource).toContain('ensureWindowsNvmNodeRuntime({')
    expect(cliSource).toContain("appendEnvCheckDiagnostic('main-node-install-nvm-result'")
    expect(cliSource).toContain("appendEnvCheckDiagnostic('main-node-install-fallback-to-private-runtime'")
  })

  it('threads the detected node executable into plan resolution instead of relying on stale global state', async () => {
    const cliSource = await readFile(path.join(process.cwd(), 'electron/main/cli.ts'), 'utf8')

    expect(cliSource).toContain('detectedNodeExecutablePath: resolveDetectedNodeExecutablePathFromBinDir(')
    expect(cliSource).toContain('preferredNode.candidate.binDir')
    expect(cliSource).toContain('detectedNodeExecutablePath: nodePath')
    expect(cliSource).toContain('resolveSelectedWindowsNodeExecutablePath(options.nodeExecutablePath)')
  })
})
