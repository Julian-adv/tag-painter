import type { RequestHandler } from '@sveltejs/kit'
import { handleGetDownloads, handlePostDownloads } from '$lib/server/downloads/manager'

export const GET: RequestHandler = async ({ url }) => handleGetDownloads(url)

export const POST: RequestHandler = async ({ request }) => handlePostDownloads(request)
