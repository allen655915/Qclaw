import { describe, expect, it } from 'vitest'

const fs = process.getBuiltinModule('node:fs') as typeof import('node:fs')
const path = process.getBuiltinModule('node:path') as typeof import('node:path')

describe('ipc channel-aware config patch source', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'electron', 'main', 'ipc-handlers.ts'),
    'utf-8'
  )

  it('routes renderer config patch IPC through the channel-aware wrapper', () => {
    expect(source).toContain("import { applyChannelAwareConfigPatchGuarded } from './channel-aware-config-patch'")
    expect(source).toContain("ipcMain.handle('openclaw:config:apply-patch'")
    expect(source).toContain('applyChannelAwareConfigPatchGuarded(request, candidate)')
  })

  it('routes renderer full config writes through channel-aware patching with strict reads for existing configs', () => {
    const guardedWriteIndex = source.indexOf("ipcMain.handle('openclaw:config:guarded-write'")
    const applyIndex = source.indexOf('applyChannelAwareConfigPatchGuarded(', guardedWriteIndex)
    const configPathIndex = source.indexOf("const configPath = String(candidate?.configPath || resolveOpenClawPaths().configFile || '').trim()", guardedWriteIndex)
    const readIndex = source.indexOf('const [beforeConfig, configFileExists] = await Promise.all([', guardedWriteIndex)
    const strictReadIndex = source.indexOf('strictRead: configFileExists', guardedWriteIndex)

    expect(guardedWriteIndex).toBeGreaterThan(-1)
    expect(configPathIndex).toBeGreaterThan(guardedWriteIndex)
    expect(readIndex).toBeGreaterThan(configPathIndex)
    expect(applyIndex).toBeGreaterThan(readIndex)
    expect(strictReadIndex).toBeGreaterThan(applyIndex)
    expect(source).not.toContain('guardedWriteConfig(request, preferredCandidate)')
  })
})
