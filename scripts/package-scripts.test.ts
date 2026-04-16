import { describe, expect, it } from 'vitest'

const fs = process.getBuiltinModule('node:fs') as typeof import('node:fs')
const path = process.getBuiltinModule('node:path') as typeof import('node:path')

function readPackageJson(): Record<string, unknown> {
  const packageJsonPath = path.join(process.cwd(), 'package.json')
  return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as Record<string, unknown>
}

describe('package scripts', () => {
  it('keeps unsigned Windows packaging on the no-sign executable-edit path to avoid winCodeSign symlink extraction failures', () => {
    const packageJson = readPackageJson()
    const scripts = (packageJson.scripts ?? {}) as Record<string, unknown>
    const packageWinUnsigned = String(scripts['package:win:unsigned'] ?? '')

    expect(packageWinUnsigned).toContain('--config.win.signAndEditExecutable=false')
  })
})
