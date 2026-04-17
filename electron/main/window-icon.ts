interface ResolveRuntimeAppIconPathOptions {
  appRoot: string
  isPackaged: boolean
  resourcesPath: string
}

interface ResolveMainWindowIconPathOptions extends ResolveRuntimeAppIconPathOptions {
  platform: NodeJS.Platform
  publicPath: string
}

function joinPath(root: string, ...segments: string[]) {
  const separator = root.includes('\\') ? '\\' : '/'
  const normalizedRoot = root.replace(/[\\/]+$/, '')

  return [normalizedRoot, ...segments].join(separator)
}

export function resolveRuntimeAppIconPath({
  appRoot,
  isPackaged,
  resourcesPath,
}: ResolveRuntimeAppIconPathOptions) {
  return isPackaged
    ? joinPath(resourcesPath, 'app-icon.png')
    : joinPath(appRoot, 'src', 'assets', 'logo.png')
}

export function resolveMainWindowIconPath(options: ResolveMainWindowIconPathOptions) {
  if (options.platform === 'win32') {
    return resolveRuntimeAppIconPath(options)
  }

  return joinPath(options.publicPath, 'tray@2x.png')
}
