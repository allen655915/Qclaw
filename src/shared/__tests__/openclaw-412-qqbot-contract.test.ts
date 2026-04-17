import { describe, expect, it } from 'vitest'

import {
  getChannelDefinition,
  resolveChannelPluginAllowId,
} from '../../lib/openclaw-channel-registry'
import { resolveManagedChannelIdentity } from '../managed-channel-identity'
import { getManagedChannelLifecycleSpec } from '../managed-channel-plugin-lifecycle'
import { getManagedChannelPluginByChannelId } from '../managed-channel-plugin-registry'
import {
  OPENCLAW_412_QQBOT_CONTRACT_VERSION,
  OPENCLAW_412_QQBOT_CURRENT_QCLAW_CONTRACT,
  OPENCLAW_412_QQBOT_IDENTITY_MATRIX,
  OPENCLAW_412_QQBOT_LEGACY_EXTERNAL_PLUGIN_IDS,
  OPENCLAW_412_QQBOT_RUNTIME_CONFIG_CONTRACT,
  OPENCLAW_412_QQBOT_RUNTIME_CONTRACT,
} from './fixtures/openclaw-2026-4-12-qqbot-contract'

describe('OpenClaw 2026.4.12 QQ bundled contract fixture', () => {
  it('pins the observed bundled QQ runtime contract and config matrix', () => {
    expect(OPENCLAW_412_QQBOT_CONTRACT_VERSION).toBe('2026.4.12')
    expect(OPENCLAW_412_QQBOT_RUNTIME_CONTRACT).toMatchObject({
      packageName: '@openclaw/qqbot',
      pluginId: 'qqbot',
      channelId: 'qqbot',
      installLocalPath: 'extensions/qqbot',
      installNpmSpec: '@openclaw/qqbot',
      minHostVersion: '>=2026.4.10',
      pluginApi: '>=2026.4.12',
    })
    expect(OPENCLAW_412_QQBOT_RUNTIME_CONTRACT.channelEnvVars).toEqual([
      'QQBOT_APP_ID',
      'QQBOT_CLIENT_SECRET',
    ])
    expect(OPENCLAW_412_QQBOT_RUNTIME_CONFIG_CONTRACT.explicitAllowIds).toEqual(['qqbot'])
    expect(OPENCLAW_412_QQBOT_RUNTIME_CONFIG_CONTRACT.allowOptionalWhenChannelConfigured).toBe(
      true
    )
    expect(OPENCLAW_412_QQBOT_RUNTIME_CONFIG_CONTRACT.installsEntryRequired).toBe(false)
    expect(OPENCLAW_412_QQBOT_IDENTITY_MATRIX).toMatchObject({
      runtimeBundledPluginId: 'qqbot',
      configAllowIds: ['qqbot'],
      configAllowOptional: true,
      pluginsInstallsRequired: false,
      currentQclawCanonicalPluginId: 'openclaw-qqbot',
      uiExpectedPluginIds: ['openclaw-qqbot', 'qqbot'],
    })
  })

  it('documents the remaining repo mismatch against the 4.12 bundled runtime contract', () => {
    const record = getManagedChannelPluginByChannelId('qqbot')
    const spec = getManagedChannelLifecycleSpec('qqbot')
    const channel = getChannelDefinition('qqbot')
    const identity = resolveManagedChannelIdentity({
      configChannelId: 'qqbot',
      platform: 'qqbot',
    })

    expect(record).toMatchObject({
      channelId: 'qqbot',
      pluginId: OPENCLAW_412_QQBOT_CURRENT_QCLAW_CONTRACT.managedRegistryPluginId,
      packageName: OPENCLAW_412_QQBOT_CURRENT_QCLAW_CONTRACT.managedRegistryPackageName,
    })
    expect(record?.cleanupPluginIds).toEqual([
      ...OPENCLAW_412_QQBOT_LEGACY_EXTERNAL_PLUGIN_IDS,
    ])
    expect(spec).toMatchObject({
      channelId: 'qqbot',
      canonicalPluginId: OPENCLAW_412_QQBOT_CURRENT_QCLAW_CONTRACT.lifecycleCanonicalPluginId,
      installStrategy: OPENCLAW_412_QQBOT_CURRENT_QCLAW_CONTRACT.lifecycleInstallStrategy,
      packageName: OPENCLAW_412_QQBOT_CURRENT_QCLAW_CONTRACT.managedRegistryPackageName,
    })
    expect(identity).toMatchObject({
      channelId: 'qqbot',
      configChannelId: 'qqbot',
      platform: 'qqbot',
      pluginId: OPENCLAW_412_QQBOT_CURRENT_QCLAW_CONTRACT.lifecycleCanonicalPluginId,
      managementKind: 'official-managed',
      sourceOfTruth: 'qclaw-shared-registry',
    })
    expect(channel?.plugin?.packageName).toBe(
      OPENCLAW_412_QQBOT_CURRENT_QCLAW_CONTRACT.managedRegistryPackageName
    )
    expect(resolveChannelPluginAllowId(channel!)).toBe(
      OPENCLAW_412_QQBOT_CURRENT_QCLAW_CONTRACT.channelDefinitionAllowId
    )
  })
})
