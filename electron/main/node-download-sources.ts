const DEFAULT_NODE_DIST_BASE_URL = 'https://nodejs.org/dist'
const NODE_DIST_MIRROR_BASE_URLS = [
  'https://npmmirror.com/mirrors/node',
] as const

function trimTrailingSlash(value: string): string {
  return String(value || '').trim().replace(/\/+$/, '')
}

function uniqueNonEmpty(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)))
}

export function buildNodeDownloadUrlCandidates(url: string): string[] {
  const normalizedUrl = String(url || '').trim()
  if (!normalizedUrl) return []

  const normalizedPrimaryBaseUrl = trimTrailingSlash(DEFAULT_NODE_DIST_BASE_URL)
  const primaryPrefix = `${normalizedPrimaryBaseUrl}/`
  if (!normalizedUrl.startsWith(primaryPrefix)) {
    return [normalizedUrl]
  }

  const relativePath = normalizedUrl.slice(normalizedPrimaryBaseUrl.length)
  return uniqueNonEmpty([
    normalizedUrl,
    ...NODE_DIST_MIRROR_BASE_URLS.map((baseUrl) => `${trimTrailingSlash(baseUrl)}${relativePath}`),
  ])
}
