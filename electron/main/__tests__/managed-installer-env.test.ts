import { describe, expect, it } from 'vitest'
import {
  sanitizeManagedInstallerEnv,
  shouldDropManagedInstallerEnvKey,
} from '../managed-installer-env'
import { buildTestEnv } from './test-env'

describe('managed-installer-env', () => {
  it('drops high-risk runtime and package manager environment keys', () => {
    expect(shouldDropManagedInstallerEnvKey('NODE_OPTIONS')).toBe(true)
    expect(shouldDropManagedInstallerEnvKey('npm_config_registry')).toBe(true)
    expect(shouldDropManagedInstallerEnvKey('NPM_CONFIG_CAFILE')).toBe(true)
    expect(shouldDropManagedInstallerEnvKey('YARN_CACHE_FOLDER')).toBe(true)
    expect(shouldDropManagedInstallerEnvKey('VOLTA_HOME')).toBe(true)
    expect(shouldDropManagedInstallerEnvKey('ASDF_DIR')).toBe(true)
    expect(shouldDropManagedInstallerEnvKey('NVM_HOME', { platform: 'darwin' })).toBe(true)
    expect(shouldDropManagedInstallerEnvKey('NVM_HOME', { platform: 'win32' })).toBe(false)
  })

  it('keeps network proxy variables while removing installer pollution', () => {
    const sanitized = sanitizeManagedInstallerEnv(
      buildTestEnv({
        PATH: '/usr/bin',
        HOME: '/Users/tester',
        HTTP_PROXY: 'http://127.0.0.1:8080',
        HTTPS_PROXY: 'http://127.0.0.1:8080',
        NO_PROXY: 'localhost,127.0.0.1',
        NODE_OPTIONS: '--use-bundled-ca',
        npm_config_registry: 'https://bad.example.com',
        NPM_CONFIG_CACHE: '/tmp/custom-cache',
        YARN_CACHE_FOLDER: '/tmp/yarn',
      })
    )

    expect(sanitized.PATH).toBe('/usr/bin')
    expect(sanitized.HOME).toBe('/Users/tester')
    expect(sanitized.HTTP_PROXY).toBe('http://127.0.0.1:8080')
    expect(sanitized.HTTPS_PROXY).toBe('http://127.0.0.1:8080')
    expect(sanitized.NO_PROXY).toBe('localhost,127.0.0.1')
    expect(sanitized.NODE_OPTIONS).toBeUndefined()
    expect(sanitized.npm_config_registry).toBeUndefined()
    expect(sanitized.NPM_CONFIG_CACHE).toBeUndefined()
    expect(sanitized.YARN_CACHE_FOLDER).toBeUndefined()
  })

  it('preserves nvm-windows environment on Windows while still removing package manager pollution', () => {
    const sanitized = sanitizeManagedInstallerEnv(
      buildTestEnv({
        PATH: 'D:\\Programs\\nodejs;C:\\Windows\\System32',
        NVM_HOME: 'D:\\Programs\\nvm',
        NVM_SYMLINK: 'D:\\Programs\\nodejs',
        NVM_NODEJS_ORG_MIRROR: 'https://npmmirror.com/mirrors/node/',
        npm_config_registry: 'https://bad.example.com',
        NPM_CONFIG_PREFIX: 'D:\\bad-prefix',
      }),
      {
        platform: 'win32',
      }
    )

    expect(sanitized.NVM_HOME).toBe('D:\\Programs\\nvm')
    expect(sanitized.NVM_SYMLINK).toBe('D:\\Programs\\nodejs')
    expect(sanitized.NVM_NODEJS_ORG_MIRROR).toBe('https://npmmirror.com/mirrors/node/')
    expect(sanitized.npm_config_registry).toBeUndefined()
    expect(sanitized.NPM_CONFIG_PREFIX).toBeUndefined()
  })
})
