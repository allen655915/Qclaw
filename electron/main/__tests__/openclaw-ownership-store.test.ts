import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { OpenClawInstallCandidate } from '../../../src/shared/openclaw-phase1'
import {
  getOwnershipEntry,
  recordManagedConfigWrite,
  recordManagedEnvWrite,
  recordManagedShellBlocks,
  setFirstManagedWriteSnapshot,
  summarizeOwnershipEntry,
  upsertOwnershipCandidate,
} from '../openclaw-ownership-store'

const fs = (process.getBuiltinModule('node:fs') as typeof import('node:fs')).promises
const path = process.getBuiltinModule('node:path') as typeof import('node:path')
const { createHash } = process.getBuiltinModule('node:crypto') as typeof import('node:crypto')

function createCandidate(): OpenClawInstallCandidate {
  return {
    candidateId: 'candidate-1',
    binaryPath: '/usr/local/bin/openclaw',
    resolvedBinaryPath: '/usr/local/bin/openclaw',
    packageRoot: '/usr/local/lib/node_modules/openclaw',
    version: '1.2.3',
    installSource: 'npm-global',
    isPathActive: true,
    configPath: '/Users/test/.openclaw/openclaw.json',
    stateRoot: '/Users/test/.openclaw',
    displayConfigPath: '~/.openclaw/openclaw.json',
    displayStateRoot: '~/.openclaw',
    ownershipState: 'mixed-managed',
    installFingerprint: 'fingerprint-1',
    baselineBackup: {
      backupId: 'baseline-1',
      createdAt: '2026-03-13T08:00:00.000Z',
      archivePath: '/Users/test/Documents/Qclaw Lite Backups/baseline-1',
      installFingerprint: 'fingerprint-1',
    },
    baselineBackupBypass: null,
  }
}

function buildLegacyFingerprint(candidate: OpenClawInstallCandidate): string {
  return createHash('sha256')
    .update([
      candidate.resolvedBinaryPath,
      candidate.packageRoot,
      candidate.version,
      candidate.configPath,
      candidate.stateRoot,
    ].join('\n'))
    .digest('hex')
}

function buildCanonicalFingerprint(candidate: OpenClawInstallCandidate): string {
  return createHash('sha256')
    .update([
      candidate.packageRoot || candidate.resolvedBinaryPath,
      candidate.version,
      candidate.configPath,
      candidate.stateRoot,
    ].join('\n'))
    .digest('hex')
}

describe('openclaw ownership store', () => {
  const originalUserDataDir = process.env.QCLAW_USER_DATA_DIR
  let userDataDir = ''

  beforeEach(async () => {
    userDataDir = path.join(
      '/tmp',
      `qclaw-ownership-store-${Date.now()}-${Math.random().toString(16).slice(2)}`
    )
    process.env.QCLAW_USER_DATA_DIR = userDataDir
    await fs.rm(userDataDir, { recursive: true, force: true })
  })

  afterEach(async () => {
    await fs.rm(userDataDir, { recursive: true, force: true })
    if (originalUserDataDir === undefined) {
      delete process.env.QCLAW_USER_DATA_DIR
      return
    }
    process.env.QCLAW_USER_DATA_DIR = originalUserDataDir
  })

  it('records file, json path, snapshot, and shell block ownership for an install fingerprint', async () => {
    const candidate = createCandidate()
    await upsertOwnershipCandidate(candidate)
    await setFirstManagedWriteSnapshot(candidate, {
      snapshotId: 'config-snapshot-1',
      createdAt: '2026-03-13T09:00:00.000Z',
      archivePath: '/Users/test/Documents/Qclaw Lite Backups/config-snapshot-1',
      installFingerprint: candidate.installFingerprint,
      snapshotType: 'config-snapshot',
    })
    await recordManagedConfigWrite(candidate, {
      filePath: candidate.configPath,
      jsonPaths: ['$.channels.feishu.appId', '$.channels.feishu.appSecret'],
    })
    await recordManagedEnvWrite(candidate, {
      filePath: '/Users/test/.openclaw/.env',
    })
    await recordManagedShellBlocks(candidate, [
      {
        filePath: '/Users/test/.zshrc',
        blockId: 'shell-init:/Users/test/.zshrc',
        blockType: 'openclaw-shell-init',
        startMarker: '# >>> qclaw-lite openclaw managed block >>>',
        endMarker: '# <<< qclaw-lite openclaw managed block <<<',
        source: 'qclaw-lite',
        firstManagedAt: '2026-03-13T09:10:00.000Z',
        lastManagedAt: '2026-03-13T09:10:00.000Z',
      },
    ])

    const entry = await getOwnershipEntry(candidate.installFingerprint)
    const summary = summarizeOwnershipEntry(entry)

    expect(entry?.files.map((record) => record.kind)).toEqual(['env', 'config'])
    expect(entry?.jsonPaths.map((record) => record.jsonPath)).toEqual([
      '$.channels.feishu.appId',
      '$.channels.feishu.appSecret',
    ])
    expect(entry?.shellBlocks.map((record) => record.filePath)).toEqual(['/Users/test/.zshrc'])
    expect(entry?.firstManagedWriteSnapshot?.snapshotId).toBe('config-snapshot-1')
    expect(summary).toEqual(
      expect.objectContaining({
        fileCount: 2,
        jsonPathCount: 2,
        shellBlockCount: 1,
      })
    )
  })

  it('reuses a legacy fingerprint entry when the candidate fingerprint changes to the canonical form', async () => {
    const candidate = createCandidate()
    candidate.installFingerprint = buildCanonicalFingerprint(candidate)
    const legacyFingerprint = buildLegacyFingerprint(candidate)

    await fs.mkdir(path.join(userDataDir, 'data-guard'), { recursive: true })
    await fs.writeFile(
      path.join(userDataDir, 'data-guard', 'ownership-store.json'),
      JSON.stringify({
        version: 1,
        installs: [
          {
            installFingerprint: legacyFingerprint,
            createdAt: '2026-03-13T08:00:00.000Z',
            updatedAt: '2026-03-13T08:00:00.000Z',
            candidate: {
              candidateId: candidate.candidateId,
              version: candidate.version,
              binaryPath: candidate.binaryPath,
              resolvedBinaryPath: candidate.resolvedBinaryPath,
              packageRoot: candidate.packageRoot,
              installSource: candidate.installSource,
              configPath: candidate.configPath,
              stateRoot: candidate.stateRoot,
            },
            firstManagedWriteSnapshot: {
              snapshotId: 'config-snapshot-legacy',
              createdAt: '2026-03-13T09:00:00.000Z',
              archivePath: '/Users/test/Documents/Qclaw Lite Backups/config-snapshot-legacy',
              installFingerprint: legacyFingerprint,
              snapshotType: 'config-snapshot',
            },
            files: [],
            jsonPaths: [],
            shellBlocks: [],
          },
        ],
      }, null, 2),
      'utf8'
    )

    const resolvedLegacyEntry = await getOwnershipEntry(candidate.installFingerprint)
    const migratedEntry = await upsertOwnershipCandidate(candidate)
    const fetchedEntry = await getOwnershipEntry(candidate.installFingerprint)

    expect(resolvedLegacyEntry?.installFingerprint).toBe(candidate.installFingerprint)
    expect(resolvedLegacyEntry?.firstManagedWriteSnapshot?.snapshotId).toBe('config-snapshot-legacy')
    expect(migratedEntry?.installFingerprint).toBe(candidate.installFingerprint)
    expect(migratedEntry?.firstManagedWriteSnapshot?.snapshotId).toBe('config-snapshot-legacy')
    expect(fetchedEntry?.installFingerprint).toBe(candidate.installFingerprint)
    expect(fetchedEntry?.firstManagedWriteSnapshot?.snapshotId).toBe('config-snapshot-legacy')
  })

  it('merges canonical and legacy ownership entries instead of dropping managed metadata during migration', async () => {
    const candidate = createCandidate()
    candidate.installFingerprint = buildCanonicalFingerprint(candidate)
    const legacyFingerprint = buildLegacyFingerprint(candidate)

    await fs.mkdir(path.join(userDataDir, 'data-guard'), { recursive: true })
    await fs.writeFile(
      path.join(userDataDir, 'data-guard', 'ownership-store.json'),
      JSON.stringify({
        version: 1,
        installs: [
          {
            installFingerprint: candidate.installFingerprint,
            createdAt: '2026-03-13T08:30:00.000Z',
            updatedAt: '2026-03-13T08:30:00.000Z',
            candidate: {
              candidateId: candidate.candidateId,
              version: candidate.version,
              binaryPath: candidate.binaryPath,
              resolvedBinaryPath: candidate.resolvedBinaryPath,
              packageRoot: candidate.packageRoot,
              installSource: candidate.installSource,
              configPath: candidate.configPath,
              stateRoot: candidate.stateRoot,
            },
            firstManagedWriteSnapshot: null,
            files: [
              {
                filePath: '/Users/test/.openclaw/.env',
                kind: 'env',
                source: 'qclaw-lite',
                firstManagedAt: '2026-03-13T08:30:00.000Z',
                lastManagedAt: '2026-03-13T08:30:00.000Z',
              },
            ],
            jsonPaths: [],
            shellBlocks: [
              {
                filePath: '/Users/test/.zshrc',
                blockId: 'shell-init:/Users/test/.zshrc',
                blockType: 'openclaw-shell-init',
                startMarker: '# >>> qclaw-lite openclaw managed block >>>',
                endMarker: '# <<< qclaw-lite openclaw managed block <<<',
                source: 'qclaw-lite',
                firstManagedAt: '2026-03-13T08:30:00.000Z',
                lastManagedAt: '2026-03-13T08:30:00.000Z',
              },
            ],
          },
          {
            installFingerprint: legacyFingerprint,
            createdAt: '2026-03-13T08:00:00.000Z',
            updatedAt: '2026-03-13T08:00:00.000Z',
            candidate: {
              candidateId: candidate.candidateId,
              version: candidate.version,
              binaryPath: candidate.binaryPath,
              resolvedBinaryPath: candidate.resolvedBinaryPath,
              packageRoot: candidate.packageRoot,
              installSource: candidate.installSource,
              configPath: candidate.configPath,
              stateRoot: candidate.stateRoot,
            },
            firstManagedWriteSnapshot: {
              snapshotId: 'config-snapshot-legacy',
              createdAt: '2026-03-13T08:00:00.000Z',
              archivePath: '/Users/test/Documents/Qclaw Lite Backups/config-snapshot-legacy',
              installFingerprint: legacyFingerprint,
              snapshotType: 'config-snapshot',
            },
            files: [
              {
                filePath: candidate.configPath,
                kind: 'config',
                source: 'qclaw-lite',
                firstManagedAt: '2026-03-13T08:00:00.000Z',
                lastManagedAt: '2026-03-13T08:00:00.000Z',
              },
            ],
            jsonPaths: [
              {
                filePath: candidate.configPath,
                jsonPath: '$.channels.weixin',
                source: 'qclaw-lite',
                firstManagedAt: '2026-03-13T08:00:00.000Z',
                lastManagedAt: '2026-03-13T08:00:00.000Z',
              },
            ],
            shellBlocks: [],
          },
        ],
      }, null, 2),
      'utf8'
    )

    const migratedEntry = await upsertOwnershipCandidate(candidate)

    expect(migratedEntry?.installFingerprint).toBe(candidate.installFingerprint)
    expect(migratedEntry?.files.map((record) => record.kind)).toEqual(['env', 'config'])
    expect(migratedEntry?.jsonPaths.map((record) => record.jsonPath)).toEqual(['$.channels.weixin'])
    expect(migratedEntry?.shellBlocks.map((record) => record.filePath)).toEqual(['/Users/test/.zshrc'])
    expect(migratedEntry?.firstManagedWriteSnapshot).toMatchObject({
      snapshotId: 'config-snapshot-legacy',
      installFingerprint: candidate.installFingerprint,
    })
  })
})
