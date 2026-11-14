/** Formato NEAR/yoctoNEAR sin floats (los precios son u128 on-chain). */

const YOCTO_PER_NEAR = 10n ** 24n;

export function formatNear(yocto: bigint | string, digits = 4): string {
	let value: bigint;

	try {
		value = typeof yocto === 'bigint' ? yocto : BigInt(yocto);
	} catch {
		return '0 NEAR';
	}

	const negative = value < 0n;
	const absolute = negative ? -value : value;
	const whole = absolute / YOCTO_PER_NEAR;
	const fraction = absolute % YOCTO_PER_NEAR;
	const padded = fraction.toString().padStart(24, '0').slice(0, Math.max(0, digits));
	const trimmed = padded.replace(/0+$/, '');
	const sign = negative ? '-' : '';

	return `${sign}${whole.toString()}${trimmed ? `.${trimmed}` : ''} NEAR`;
}

/** "1.25" → 1.25e24 yoctoNEAR. Rechaza negativos y más de 24 decimales. */
export function parseNear(value: string): bigint {
	const normalized = value.trim().replace(',', '.');

	if (!/^\d+(?:\.\d{1,24})?$/.test(normalized)) {
		throw new Error('Enter a positive NEAR amount with up to 24 decimals.');
	}

	const [whole, fraction = ''] = normalized.split('.');
	const padded = fraction.padEnd(24, '0');
	const yocto = BigInt(whole) * YOCTO_PER_NEAR + BigInt(padded || '0');

	if (yocto <= 0n) {
		throw new Error('The price must be greater than 0 NEAR.');
	}

	return yocto;
}

export function shortAccount(accountId: string): string {
	if (!accountId) return '';
	if (accountId.length <= 20) return accountId;
	return `${accountId.slice(0, 8)}…${accountId.slice(-6)}`;
}

export function tokenTitle(title: string | null | undefined, fallback: string): string {
	const value = title?.trim();
	return value && value.length > 0 ? value : fallback;
}
