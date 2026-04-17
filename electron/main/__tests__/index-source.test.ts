import { describe, expect, it } from 'vitest'

const fs = process.getBuiltinModule('node:fs') as typeof import('node:fs')
const path = process.getBuiltinModule('node:path') as typeof import('node:path')
const source = fs.readFileSync(
  path.join(process.cwd(), 'electron/main/index.ts'),
  'utf8'
)

describe('main process startup source', () => {
  it('initializes Qclaw process paths before registering IPC handlers', () => {
    const whenReadyIndex = source.indexOf('app.whenReady().then(async () => {')
    const findInWhenReady = (needle: string) => source.indexOf(needle, whenReadyIndex)
    const initializeIndex = findInWhenReady('initializeQclawProcessPaths()')
    const registerIpcHandlersIndex = findInWhenReady('registerIpcHandlers()')

    expect(whenReadyIndex).toBeGreaterThan(-1)
    expect(initializeIndex).toBeGreaterThan(-1)
    expect(registerIpcHandlersIndex).toBeGreaterThan(-1)
    expect(initializeIndex).toBeLessThan(registerIpcHandlersIndex)
  })
})
