export const OPENCLAW_412_QQBOT_CONTRACT_VERSION = '2026.4.12'

export const OPENCLAW_412_QQBOT_RUNTIME_CONTRACT = {
  packageName: '@openclaw/qqbot',
  packageVersion: OPENCLAW_412_QQBOT_CONTRACT_VERSION,
  pluginId: 'qqbot',
  channelId: 'qqbot',
  installLocalPath: 'extensions/qqbot',
  installNpmSpec: '@openclaw/qqbot',
  minHostVersion: '>=2026.4.10',
  pluginApi: '>=2026.4.12',
  channelEnvVars: ['QQBOT_APP_ID', 'QQBOT_CLIENT_SECRET'],
} as const

export const OPENCLAW_412_QQBOT_RUNTIME_CONFIG_CONTRACT = {
  explicitAllowIds: ['qqbot'],
  allowOptionalWhenChannelConfigured: true,
  installsEntryRequired: false,
  evidence: {
    pluginsListShowsBundledId: 'Plugins list reports stock QQ as ID "qqbot".',
    legacyAllowWarning:
      'plugins.allow: plugin not found: openclaw-qqbot (stale config entry ignored; remove it from plugins config)',
    bundledAllowOk: 'plugins doctor reports no QQ-specific issues when allow=["qqbot"].',
    noAllowOk: 'plugins doctor reports no QQ-specific issues when channels.qqbot exists without plugins.allow.',
    noInstallsOk: 'plugins doctor reports no QQ-specific issues when bundled QQ is configured without plugins.installs.',
  },
} as const

export const OPENCLAW_412_QQBOT_LEGACY_EXTERNAL_PLUGIN_IDS = [
  'qqbot',
  'openclaw-qq',
  '@sliverp/qqbot',
  '@tencent-connect/qqbot',
  '@tencent-connect/openclaw-qq',
  '@tencent-connect/openclaw-qqbot',
  'openclaw-qqbot',
 ] as const

export const OPENCLAW_412_QQBOT_CURRENT_QCLAW_CONTRACT = {
  managedRegistryPluginId: 'openclaw-qqbot',
  managedRegistryPackageName: '@tencent-connect/openclaw-qqbot@latest',
  lifecycleCanonicalPluginId: 'openclaw-qqbot',
  lifecycleInstallStrategy: 'package',
  channelDefinitionAllowId: 'qqbot',
  uiExpectedPluginIds: ['openclaw-qqbot', 'qqbot'],
} as const

export const OPENCLAW_412_QQBOT_IDENTITY_MATRIX = {
  runtimeBundledPluginId: OPENCLAW_412_QQBOT_RUNTIME_CONTRACT.pluginId,
  configAllowIds: [...OPENCLAW_412_QQBOT_RUNTIME_CONFIG_CONTRACT.explicitAllowIds],
  configAllowOptional: OPENCLAW_412_QQBOT_RUNTIME_CONFIG_CONTRACT.allowOptionalWhenChannelConfigured,
  pluginsInstallsRequired: OPENCLAW_412_QQBOT_RUNTIME_CONFIG_CONTRACT.installsEntryRequired,
  legacyExternalPluginIds: [...OPENCLAW_412_QQBOT_LEGACY_EXTERNAL_PLUGIN_IDS],
  currentQclawCanonicalPluginId: OPENCLAW_412_QQBOT_CURRENT_QCLAW_CONTRACT.lifecycleCanonicalPluginId,
  uiExpectedPluginIds: [...OPENCLAW_412_QQBOT_CURRENT_QCLAW_CONTRACT.uiExpectedPluginIds],
} as const
