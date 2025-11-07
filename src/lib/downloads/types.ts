export type CustomNodeItem = {
  label: string
  filename: string
  urls: string[]
  dest: string
  branch: string | null
}

export type DownloadItem = {
  label: string
  filename: string
  urls: string[]
  dest: string
  category: string | null
}

export type DownloadResultItem = {
  filename: string
  url: string | null
}

export type DownloadFailedItem = {
  filename: string
  error: string | null
}

export type DownloadSummary = {
  success: boolean
  ok: DownloadResultItem[]
  failed: DownloadFailedItem[]
}

export type ProgressState = {
  total: number
  completed: number
  current: string
}

export type DownloadProgressState = {
  total: number
  completed: number
  current: string
  currentLabel: string
}

export type FileProgressState = {
  filename: string
  label: string
  received: number
  total: number
}

export type SkipState = {
  customNodes: boolean
  downloadsCore: boolean
  downloadsModels: boolean
}
