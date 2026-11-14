/** Conversiones base64/utf8 sin depender de Node. */

export function utf8ToBase64(text: string): string {
	return bytesToBase64(new TextEncoder().encode(text));
}

export function bytesToBase64(bytes: Uint8Array): string {
	let binary = '';
	const chunkSize = 0x8000;

	for (let index = 0; index < bytes.length; index += chunkSize) {
		binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
	}

	return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
	const binary = atob(value);
	const bytes = new Uint8Array(binary.length);

	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}

	return bytes;
}

export function base64ToUtf8(value: string): string {
	return new TextDecoder().decode(base64ToBytes(value));
}

export function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
	if (left.length !== right.length) return false;

	let diff = 0;

	for (let index = 0; index < left.length; index += 1) {
		diff |= left[index] ^ right[index];
	}

	return diff === 0;
}
