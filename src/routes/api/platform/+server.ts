import { json } from '@sveltejs/kit'

export async function GET() {
	const platform = process.platform
	const isWindows = platform === 'win32'

	return json({
		platform,
		isWindows,
		separator: isWindows ? '\\' : '/'
	})
}
