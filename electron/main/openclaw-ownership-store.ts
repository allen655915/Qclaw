import type { OpenClawInstallCandidate } from '../../src/shared/openclaw-phase1'
import type {
  OpenClawConfigSnapshotRecord,
  OpenClawJsonPathOwnershipRecord,
  OpenClawManagedFileKind,
  OpenClawManagedFileRecord,
  OpenClawOwnershipChangeList,
  OpenClawOwnershipEntry,
  OpenClawOwnershipStore,
  OpenClawOwnershipSummary,
  OpenClawShellManagedBlockRecord,
} from '../../src/shared/openclaw-phase2'
import { atomicWriteJson } from './atomic-write'

const fs = process.getBuiltinModule('node:fs') as typeof import('node:fs')
const os = process.getBuiltinModule('node:os') as typeof import('node:os')
const path = process.getBuiltinModule('node:path') as typeof import('node:path')
const { createHash } = process.getBuiltinModule('node:crypto') as typeof import('node:crypto')
const { readFile } = fs.promises
const { homedir } = os

const STORE_VERSION = 1
const STORE_RELATIVE_PATH = path.join('data-guard', 'ownership-store.json')

function resolveUserDataDirectory(): string {
  return String(process.env.QCLAW_USER_DATA_DIR || path.join(homedir(), '.qclaw-lite')).trim()
}

function resolveStorePath(): string {
  return path.join(resolveUserDataDirectory(), STORE_RELATIVE_PATH)
}

function isManagedFileRecord(value: unknown): value is OpenClawManagedFileRecord {
  return Boolean(value) && typeof value === 'object' && typeof (value as OpenClawManagedFileRecord).filePath === 'string'
}

function isJsonPathRecord(value: unknown): value is OpenClawJsonPathOwnershipRecord {
  return Boolean(value) && typeof value === 'object' && typeof (value as OpenClawJsonPathOwnershipRecord).jsonPath === 'string'
}

function isShellBlockRecord(value: unknown): value is OpenClawShellManagedBlockRecord {
  return Boolean(value) && typeof value === 'object' && typeof (value as OpenClawShellManagedBlockRecord).blockId === 'string'
}

function toCandidateSnapshot(candidate: OpenClawInstallCandidate): OpenClawOwnershipEntry['candidate'] {
  return {
    candidateId: candidate.candidateId,
    version: candidate.version,
    binaryPath: candidate.binaryPath,
    resolvedBinaryPath: candidate.resolvedBinaryPath,
    packageRoot: candidate.packageRoot,
    installSource: candidate.installSource,
    configPath: candidate.configPath,
    stateRoot: candidate.stateRoot,
  }
}

function sanitizeEntry(value: unknown): OpenClawOwnershipEntry | null {
  if (!value || typeof value !== 'object') return null
  const entry = value as Partial<OpenClawOwnershipEntry>
  if (typeof entry.installFingerprint !== 'string' || !entry.installFingerprint.trim()) return null
  if (!entry.candidate || typeof entry.candidate !== 'object') return null

  return {
    installFingerprint: entry.installFingerprint,
    createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : new Date(0).toISOString(),
    updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : new Date(0).toISOString(),
    candidate: {
      candidateId: String(entry.candidate.candidateId || '').trim(),
      version: String(entry.candidate.version || '').trim(),
      binaryPath: String(entry.candidate.binaryPath || '').trim(),
      resolvedBinaryPath: String(entry.candidate.resolvedBinaryPath || '').trim(),
      packageRoot: String(entry.candidate.packageRoot || '').trim(),
      installSource: String(entry.candidate.installSource || '').trim(),
      configPath: String(entry.candidate.configPath || '').trim(),
      stateRoot: String(entry.candidate.stateRoot || '').trim(),
    },
    firstManagedWriteSnapshot:
      entry.firstManagedWriteSnapshot &&
      typeof entry.firstManagedWriteSnapshot === 'object' &&
      typeof entry.firstManagedWriteSnapshot.archivePath === 'string'
        ? (entry.firstManagedWriteSnapshot as OpenClawConfigSnapshotRecord)
        : null,
    files: Array.isArray(entry.files) ? entry.files.filter(isManagedFileRecord) : [],
    jsonPaths: Array.isArray(entry.jsonPaths) ? entry.jsonPaths.filter(isJsonPathRecord) : [],
    shellBlocks: Array.isArray(entry.shellBlocks) ? entry.shellBlocks.filter(isShellBlockRecord) : [],
  }
}

async function loadOwnershipStore(): Promise<OpenClawOwnershipStore> {
  try {
    const raw = await readFile(resolveStorePath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<OpenClawOwnershipStore>
    const installs = Array.isArray(parsed.installs)
      ? parsed.installs
          .map(sanitizeEntry)
          .filter((entry): entry is OpenClawOwnershipEntry => Boolean(entry))
      : []
    return {
      version: STORE_VERSION,
      installs,
    }
  } catch {
    return {
      version: STORE_VERSION,
      installs: [],
    }
  }
}

async function saveOwnershipStore(store: OpenClawOwnershipStore): Promise<void> {
  const storePath = resolveStorePath()
  await atomicWriteJson(storePath, store, {
    description: 'ownership 记录',
  })
}

function sortByPath<T extends { filePath: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => left.filePath.localeCompare(right.filePath))
}

function sortJsonPathRecords(items: OpenClawJsonPathOwnershipRecord[]): OpenClawJsonPathOwnershipRecord[] {
  return [...items].sort((left, right) => left.jsonPath.localeCompare(right.jsonPath))
}

function sortShellBlocks(items: OpenClawShellManagedBlockRecord[]): OpenClawShellManagedBlockRecord[] {
  return [...items].sort((left, right) => left.filePath.localeCompare(right.filePath))
}

function buildLegacyInstallFingerprint(
  resolvedBinaryPath: string,
  packageRoot: string,
  version: string,
  configPath: string,
  stateRoot: string
): string {
  return createHash('sha256')
    .update([resolvedBinaryPath, packageRoot, version, configPath, stateRoot].join('\n'))
    .digest('hex')
}

function buildCanonicalInstallFingerprint(
  packageRoot: string,
  version: string,
  configPath: string,
  stateRoot: string,
  resolvedBinaryPath: string
): string {
  return createHash('sha256')
    .update([String(packageRoot || resolvedBinaryPath || '').trim(), version, configPath, stateRoot].join('\n'))
    .digest('hex')
}

type OwnershipFingerprintAliasInput = Pick<
  OpenClawInstallCandidate,
  'installFingerprint' | 'binaryPath' | 'resolvedBinaryPath' | 'packageRoot' | 'version' | 'configPath' | 'stateRoot'
>

function resolveOwnershipFingerprintAliases(
  candidate: OwnershipFingerprintAliasInput | null | undefined
): string[] {
  if (!candidate) return []

  const aliases = new Set<string>([String(candidate.installFingerprint || '').trim()])
  const packageRoot = String(candidate.packageRoot || '').trim()
  const version = String(candidate.version || '').trim()
  const configPath = String(candidate.configPath || '').trim()
  const stateRoot = String(candidate.stateRoot || '').trim()
  const resolvedBinaryPath = String(candidate.resolvedBinaryPath || '').trim()

  if (!packageRoot || !version || !configPath || !stateRoot) {
    return Array.from(aliases).filter(Boolean)
  }

  aliases.add(
    buildCanonicalInstallFingerprint(packageRoot, version, configPath, stateRoot, resolvedBinaryPath)
  )

  const legacyExecutablePaths = new Set<string>(
    [resolvedBinaryPath]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  )

  if (process.platform === 'win32') {
    const binaryDirs = new Set(
      [candidate.binaryPath, candidate.resolvedBinaryPath]
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .map((value) => path.win32.dirname(value))
    )

    for (const binaryDir of binaryDirs) {
      for (const shimName of ['openclaw', 'openclaw.cmd', 'openclaw.exe', 'openclaw.ps1']) {
        legacyExecutablePaths.add(path.win32.join(binaryDir, shimName))
      }
    }
  }

  for (const legacyExecutablePath of legacyExecutablePaths) {
    aliases.add(
      buildLegacyInstallFingerprint(legacyExecutablePath, packageRoot, version, configPath, stateRoot)
    )
  }

  return Array.from(aliases).filter(Boolean)
}

function pickEarlierTimestamp(left: string, right: string): string {
  if (!left) return right
  if (!right) return left
  return left <= right ? left : right
}

function pickLaterTimestamp(left: string, right: string): string {
  if (!left) return right
  if (!right) return left
  return left >= right ? left : right
}

function mergeManagedFileRecords(entries: OpenClawOwnershipEntry[]): OpenClawManagedFileRecord[] {
  const records = new Map<string, OpenClawManagedFileRecord>()
  for (const entry of entries) {
    for (const record of entry.files) {
      const key = `${record.filePath}\n${record.kind}`
      const existing = records.get(key)
      if (!existing) {
        records.set(key, { ...record })
        continue
      }

      records.set(key, {
        ...existing,
        source: existing.source || record.source,
        firstManagedAt: pickEarlierTimestamp(existing.firstManagedAt, record.firstManagedAt),
        lastManagedAt: pickLaterTimestamp(existing.lastManagedAt, record.lastManagedAt),
      })
    }
  }
  return sortByPath(Array.from(records.values()))
}

function mergeJsonPathRecords(entries: OpenClawOwnershipEntry[]): OpenClawJsonPathOwnershipRecord[] {
  const records = new Map<string, OpenClawJsonPathOwnershipRecord>()
  for (const entry of entries) {
    for (const record of entry.jsonPaths) {
      const key = `${record.filePath}\n${record.jsonPath}`
      const existing = records.get(key)
      if (!existing) {
        records.set(key, { ...record })
        continue
      }

      records.set(key, {
        ...existing,
        source: existing.source || record.source,
        firstManagedAt: pickEarlierTimestamp(existing.firstManagedAt, record.firstManagedAt),
        lastManagedAt: pickLaterTimestamp(existing.lastManagedAt, record.lastManagedAt),
      })
    }
  }
  return sortJsonPathRecords(Array.from(records.values()))
}

function mergeShellBlockRecords(entries: OpenClawOwnershipEntry[]): OpenClawShellManagedBlockRecord[] {
  const records = new Map<string, OpenClawShellManagedBlockRecord>()
  for (const entry of entries) {
    for (const record of entry.shellBlocks) {
      const key = `${record.filePath}\n${record.blockId}`
      const existing = records.get(key)
      if (!existing) {
        records.set(key, { ...record })
        continue
      }

      records.set(key, {
        ...existing,
        source: existing.source || record.source,
        firstManagedAt: pickEarlierTimestamp(existing.firstManagedAt, record.firstManagedAt),
        lastManagedAt: pickLaterTimestamp(existing.lastManagedAt, record.lastManagedAt),
      })
    }
  }
  return sortShellBlocks(Array.from(records.values()))
}

function mergeFirstManagedWriteSnapshot(
  entries: OpenClawOwnershipEntry[],
  installFingerprint: string
): OpenClawConfigSnapshotRecord | null {
  const snapshots = entries
    .map((entry) => entry.firstManagedWriteSnapshot)
    .filter((snapshot): snapshot is OpenClawConfigSnapshotRecord => Boolean(snapshot))

  if (snapshots.length === 0) return null

  const earliestSnapshot = snapshots.reduce((selected, snapshot) =>
    snapshot.createdAt < selected.createdAt ? snapshot : selected
  )

  return {
    ...earliestSnapshot,
    installFingerprint,
  }
}

function mergeOwnershipEntries(
  entries: OpenClawOwnershipEntry[],
  candidate: OpenClawInstallCandidate,
  now: string,
  installFingerprint: string
): OpenClawOwnershipEntry | null {
  if (entries.length === 0) return null

  return {
    installFingerprint,
    createdAt: entries.reduce((earliest, entry) => pickEarlierTimestamp(earliest, entry.createdAt), now),
    updatedAt: entries.reduce((latest, entry) => pickLaterTimestamp(latest, entry.updatedAt), now),
    candidate: toCandidateSnapshot(candidate),
    firstManagedWriteSnapshot: mergeFirstManagedWriteSnapshot(entries, installFingerprint),
    files: mergeManagedFileRecords(entries),
    jsonPaths: mergeJsonPathRecords(entries),
    shellBlocks: mergeShellBlockRecords(entries),
  }
}

function touchManagedFileRecord(
  records: OpenClawManagedFileRecord[],
  filePath: string,
  kind: OpenClawManagedFileKind,
  now: string
): OpenClawManagedFileRecord[] {
  const existing = records.find((record) => record.filePath === filePath && record.kind === kind)
  if (!existing) {
    return sortByPath([
      ...records,
      {
        filePath,
        kind,
        source: 'qclaw-lite',
        firstManagedAt: now,
        lastManagedAt: now,
      },
    ])
  }

  return sortByPath(
    records.map((record) =>
      record.filePath === filePath && record.kind === kind ? { ...record, lastManagedAt: now } : record
    )
  )
}

function touchJsonPathRecords(
  records: OpenClawJsonPathOwnershipRecord[],
  filePath: string,
  jsonPaths: string[],
  now: string
): OpenClawJsonPathOwnershipRecord[] {
  const normalizedPaths = Array.from(new Set(jsonPaths.map((item) => String(item || '').trim()).filter(Boolean)))
  if (normalizedPaths.length === 0) return sortJsonPathRecords(records)

  const nextRecords = [...records]
  for (const jsonPath of normalizedPaths) {
    const existing = nextRecords.find((record) => record.filePath === filePath && record.jsonPath === jsonPath)
    if (existing) {
      existing.lastManagedAt = now
      continue
    }
    nextRecords.push({
      filePath,
      jsonPath,
      source: 'qclaw-lite',
      firstManagedAt: now,
      lastManagedAt: now,
    })
  }

  return sortJsonPathRecords(nextRecords)
}

function touchShellBlockRecords(
  records: OpenClawShellManagedBlockRecord[],
  shellBlocks: OpenClawShellManagedBlockRecord[],
  now: string
): OpenClawShellManagedBlockRecord[] {
  if (shellBlocks.length === 0) return sortShellBlocks(records)
  const nextRecords = [...records]

  for (const shellBlock of shellBlocks) {
    const existing = nextRecords.find(
      (record) => record.filePath === shellBlock.filePath && record.blockId === shellBlock.blockId
    )
    if (existing) {
      existing.lastManagedAt = now
      continue
    }
    nextRecords.push({
      ...shellBlock,
      firstManagedAt: shellBlock.firstManagedAt || now,
      lastManagedAt: now,
      source: 'qclaw-lite',
    })
  }

  return sortShellBlocks(nextRecords)
}

async function mutateOwnershipEntry(
  installFingerprint: string,
  candidate: OpenClawInstallCandidate | null | undefined,
  mutator: (entry: OpenClawOwnershipEntry, now: string) => void
): Promise<OpenClawOwnershipEntry | null> {
  const normalizedFingerprint = String(installFingerprint || '').trim()
  if (!normalizedFingerprint || !candidate) return null

  const now = new Date().toISOString()
  const store = await loadOwnershipStore()
  const ownershipFingerprints = resolveOwnershipFingerprintAliases(candidate)
  const existingEntries = store.installs.filter((entry) =>
    ownershipFingerprints.includes(entry.installFingerprint)
  )

  const nextEntry: OpenClawOwnershipEntry =
    mergeOwnershipEntries(existingEntries, candidate, now, normalizedFingerprint) ||
    {
      installFingerprint: normalizedFingerprint,
      createdAt: now,
      updatedAt: now,
      candidate: toCandidateSnapshot(candidate),
      firstManagedWriteSnapshot: null,
      files: [],
      jsonPaths: [],
      shellBlocks: [],
    }

  mutator(nextEntry, now)
  nextEntry.updatedAt = now

  store.installs = [
    nextEntry,
    ...store.installs.filter((entry) => !ownershipFingerprints.includes(entry.installFingerprint)),
  ]
  await saveOwnershipStore(store)
  return nextEntry
}

export async function getOwnershipEntry(
  installFingerprint: string
): Promise<OpenClawOwnershipEntry | null> {
  const normalizedFingerprint = String(installFingerprint || '').trim()
  if (!normalizedFingerprint) return null
  const store = await loadOwnershipStore()
  const exactEntry = store.installs.find((entry) => entry.installFingerprint === normalizedFingerprint)
  if (exactEntry) return exactEntry

  const aliasedEntry =
    store.installs.find((entry) =>
      resolveOwnershipFingerprintAliases({
        installFingerprint: entry.installFingerprint,
        binaryPath: entry.candidate.binaryPath,
        resolvedBinaryPath: entry.candidate.resolvedBinaryPath,
        packageRoot: entry.candidate.packageRoot,
        version: entry.candidate.version,
        configPath: entry.candidate.configPath,
        stateRoot: entry.candidate.stateRoot,
      }).includes(normalizedFingerprint)
    ) || null

  return aliasedEntry
    ? {
        ...aliasedEntry,
        installFingerprint: normalizedFingerprint,
        firstManagedWriteSnapshot: aliasedEntry.firstManagedWriteSnapshot
          ? {
              ...aliasedEntry.firstManagedWriteSnapshot,
              installFingerprint: normalizedFingerprint,
            }
          : null,
      }
    : null
}

export async function upsertOwnershipCandidate(
  candidate: OpenClawInstallCandidate
): Promise<OpenClawOwnershipEntry | null> {
  return mutateOwnershipEntry(candidate.installFingerprint, candidate, () => {})
}

export async function setFirstManagedWriteSnapshot(
  candidate: OpenClawInstallCandidate,
  snapshot: OpenClawConfigSnapshotRecord
): Promise<OpenClawOwnershipEntry | null> {
  return mutateOwnershipEntry(candidate.installFingerprint, candidate, (entry) => {
    entry.firstManagedWriteSnapshot = snapshot
  })
}

export async function recordManagedConfigWrite(
  candidate: OpenClawInstallCandidate,
  params: {
    filePath: string
    jsonPaths: string[]
  }
): Promise<OpenClawOwnershipEntry | null> {
  return mutateOwnershipEntry(candidate.installFingerprint, candidate, (entry, now) => {
    entry.files = touchManagedFileRecord(entry.files, params.filePath, 'config', now)
    entry.jsonPaths = touchJsonPathRecords(entry.jsonPaths, params.filePath, params.jsonPaths, now)
  })
}

export async function recordManagedEnvWrite(
  candidate: OpenClawInstallCandidate,
  params: {
    filePath: string
  }
): Promise<OpenClawOwnershipEntry | null> {
  return mutateOwnershipEntry(candidate.installFingerprint, candidate, (entry, now) => {
    entry.files = touchManagedFileRecord(entry.files, params.filePath, 'env', now)
  })
}

export async function recordManagedShellBlocks(
  candidate: OpenClawInstallCandidate,
  shellBlocks: OpenClawShellManagedBlockRecord[]
): Promise<OpenClawOwnershipEntry | null> {
  return mutateOwnershipEntry(candidate.installFingerprint, candidate, (entry, now) => {
    entry.shellBlocks = touchShellBlockRecords(entry.shellBlocks, shellBlocks, now)
  })
}

export function summarizeOwnershipEntry(
  entry: OpenClawOwnershipEntry | null | undefined
): OpenClawOwnershipSummary | null {
  if (!entry) return null
  return {
    fileCount: entry.files.length,
    jsonPathCount: entry.jsonPaths.length,
    shellBlockCount: entry.shellBlocks.length,
    managedFiles: entry.files.map((record) => record.filePath),
    managedJsonPaths: entry.jsonPaths.map((record) => record.jsonPath),
    managedShellBlockFiles: entry.shellBlocks.map((record) => record.filePath),
    firstManagedWriteSnapshot: entry.firstManagedWriteSnapshot,
    updatedAt: entry.updatedAt,
  }
}

export async function listOwnershipChanges(
  installFingerprint: string
): Promise<OpenClawOwnershipChangeList | null> {
  const entry = await getOwnershipEntry(installFingerprint)
  if (!entry) return null
  return {
    installFingerprint: entry.installFingerprint,
    filePaths: entry.files.map((record) => record.filePath),
    jsonPaths: entry.jsonPaths.map((record) => record.jsonPath),
    shellBlockFiles: entry.shellBlocks.map((record) => record.filePath),
    updatedAt: entry.updatedAt,
  }
}
