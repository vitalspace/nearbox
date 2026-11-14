/** Devuelve un mensaje legible para cualquier valor lanzado. */
export function errorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (error === null || error === undefined) return '';
	if (typeof error === 'string') return error;

	try {
		return JSON.stringify(error);
	} catch {
		return String(error);
	}
}