import { describe, expect, it } from 'vitest'
import { resolveMainWindowIconPath, resolveRuntimeAppIconPath } from '../window-icon'

describe('window-icon', () => {
  it('uses the orange claw asset for the Windows main window icon in development', () => {
    expect(
      resolveMainWindowIconPath({
        appRoot: 'G:\\Qclaw-temp\\Qclaw',
        isPackaged: false,
        platform: 'win32',
        publicPath: 'G:\\Qclaw-temp\\Qclaw\\public',
        resourcesPath: 'C:\\Program Files\\Qclaw\\resources',
      }),
    ).toBe('G:\\Qclaw-temp\\Qclaw\\src\\assets\\logo.png')
  })

  it('uses the packaged orange claw asset for the Windows main window icon after packaging', () => {
    expect(
      resolveMainWindowIconPath({
        appRoot: 'G:\\Qclaw-temp\\Qclaw',
        isPackaged: true,
        platform: 'win32',
        publicPath: 'G:\\Qclaw-temp\\Qclaw\\dist',
        resourcesPath: 'C:\\Program Files\\Qclaw\\resources',
      }),
    ).toBe('C:\\Program Files\\Qclaw\\resources\\app-icon.png')
  })

  it('keeps the existing non-Windows tray icon path behavior', () => {
    expect(
      resolveMainWindowIconPath({
        appRoot: 'G:\\Qclaw-temp\\Qclaw',
        isPackaged: false,
        platform: 'darwin',
        publicPath: 'G:\\Qclaw-temp\\Qclaw\\public',
        resourcesPath: 'C:\\Program Files\\Qclaw\\resources',
      }),
    ).toBe('G:\\Qclaw-temp\\Qclaw\\public\\tray@2x.png')
  })

  it('resolves the packaged runtime icon from app resources', () => {
    expect(
      resolveRuntimeAppIconPath({
        appRoot: 'G:\\Qclaw-temp\\Qclaw',
        isPackaged: true,
        resourcesPath: 'C:\\Program Files\\Qclaw\\resources',
      }),
    ).toBe('C:\\Program Files\\Qclaw\\resources\\app-icon.png')
  })
})
