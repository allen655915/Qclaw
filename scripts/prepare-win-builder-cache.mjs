import { cp, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const WIN_CODE_SIGN_VERSION = '2.6.0'
const WIN_CODE_SIGN_DIR_NAME = `winCodeSign-${WIN_CODE_SIGN_VERSION}`
const RCEDIT_X64_FILE_NAME = 'rcedit-x64.exe'
const WIN_CODE_SIGN_URL =
  `https://github.com/electron-userland/electron-builder-binaries/releases/download/${WIN_CODE_SIGN_DIR_NAME}/${WIN_CODE_SIGN_DIR_NAME}.7z`

function resolveLocalAppDataDir() {
  const localAppData = String(process.env.LOCALAPPDATA || '').trim()
  if (localAppData) return localAppData

  return path.join(os.homedir(), 'AppData', 'Local')
}

function resolveWinCodeSignCacheRoot() {
  return path.join(resolveLocalAppDataDir(), 'electron-builder', 'Cache', 'winCodeSign')
}

function resolvePreparedWinCodeSignDir(cacheRoot) {
  return path.join(cacheRoot, WIN_CODE_SIGN_DIR_NAME)
}

async function pathExists(targetPath) {
  try {
    await stat(targetPath)
    return true
  } catch {
    return false
  }
}

async function hasPreparedWinCodeSignArtifacts(targetDir) {
  return (
    await pathExists(path.join(targetDir, RCEDIT_X64_FILE_NAME))
  ) && (
    await pathExists(path.join(targetDir, 'windows-10', 'x64'))
  )
}

async function findReusableExtractedWinCodeSignDir(cacheRoot) {
  const entries = await readdir(cacheRoot, { withFileTypes: true })

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (entry.name === WIN_CODE_SIGN_DIR_NAME) continue

    const entryPath = path.join(cacheRoot, entry.name)
    if (await hasPreparedWinCodeSignArtifacts(entryPath)) {
      return entryPath
    }
  }

  return null
}

async function downloadWinCodeSignArchive(archivePath) {
  const response = await fetch(WIN_CODE_SIGN_URL)
  if (!response.ok) {
    throw new Error(`Failed to download ${WIN_CODE_SIGN_URL}: ${response.status} ${response.statusText}`)
  }

  const archiveBuffer = Buffer.from(await response.arrayBuffer())
  await writeFile(archivePath, archiveBuffer)
}

async function extractWinCodeSignArchive(archivePath, targetDir) {
  await rm(targetDir, { recursive: true, force: true })
  await mkdir(targetDir, { recursive: true })

  let stderr = ''

  try {
    const result = await execFileAsync('tar.exe', ['-xf', archivePath, '-C', targetDir], {
      windowsHide: true,
    })
    stderr = String(result.stderr || '').trim()
  } catch (error) {
    const commandError = error
    stderr = String(commandError?.stderr || '').trim()
  }

  if (!(await hasPreparedWinCodeSignArtifacts(targetDir))) {
    const detail = stderr ? ` tar stderr: ${stderr}` : ''
    throw new Error(`Failed to prepare ${WIN_CODE_SIGN_DIR_NAME}.${detail}`.trim())
  }

  if (stderr) {
    console.warn(`[prepare-win-builder-cache] tar reported non-fatal extraction warnings: ${stderr}`)
  }
}

export async function prepareWinBuilderCache({
  cacheRoot = resolveWinCodeSignCacheRoot(),
} = {}) {
  if (process.platform !== 'win32') {
    console.log('[prepare-win-builder-cache] Skipping: Windows-only cache preparation.')
    return
  }

  await mkdir(cacheRoot, { recursive: true })

  const preparedDir = resolvePreparedWinCodeSignDir(cacheRoot)
  if (await hasPreparedWinCodeSignArtifacts(preparedDir)) {
    console.log(`[prepare-win-builder-cache] Reusing prepared cache: ${preparedDir}`)
    return
  }

  const reusableDir = await findReusableExtractedWinCodeSignDir(cacheRoot)
  if (reusableDir) {
    await rm(preparedDir, { recursive: true, force: true })
    await cp(reusableDir, preparedDir, { recursive: true, force: true })

    if (!(await hasPreparedWinCodeSignArtifacts(preparedDir))) {
      throw new Error(`Copied ${reusableDir}, but ${preparedDir} is still incomplete.`)
    }

    console.log(`[prepare-win-builder-cache] Prepared cache from existing extraction: ${reusableDir}`)
    return
  }

  const archivePath = path.join(cacheRoot, `${WIN_CODE_SIGN_DIR_NAME}.7z`)
  if (!(await pathExists(archivePath))) {
    console.log(`[prepare-win-builder-cache] Downloading ${WIN_CODE_SIGN_DIR_NAME}.7z`)
    await downloadWinCodeSignArchive(archivePath)
  } else {
    console.log(`[prepare-win-builder-cache] Reusing cached archive: ${archivePath}`)
  }

  await extractWinCodeSignArchive(archivePath, preparedDir)
  console.log(`[prepare-win-builder-cache] Prepared cache from archive: ${preparedDir}`)
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  await prepareWinBuilderCache()
}
