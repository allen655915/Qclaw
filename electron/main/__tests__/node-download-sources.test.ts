import { describe, expect, it } from 'vitest'
import { buildNodeDownloadUrlCandidates } from '../node-download-sources'

describe('buildNodeDownloadUrlCandidates', () => {
  it('adds the npmmirror fallback for official nodejs.org downloads', () => {
    expect(
      buildNodeDownloadUrlCandidates('https://nodejs.org/dist/v24.14.1/node-v24.14.1-win-x64.zip')
    ).toEqual([
      'https://nodejs.org/dist/v24.14.1/node-v24.14.1-win-x64.zip',
      'https://npmmirror.com/mirrors/node/v24.14.1/node-v24.14.1-win-x64.zip',
    ])
  })

  it('keeps custom download urls unchanged', () => {
    expect(
      buildNodeDownloadUrlCandidates('https://mirror.example.com/node/v24.14.1/node-v24.14.1-win-x64.zip')
    ).toEqual([
      'https://mirror.example.com/node/v24.14.1/node-v24.14.1-win-x64.zip',
    ])
  })
})
