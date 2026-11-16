/** Returns a readable message for any thrown value. */
export function errorMessage(err: unknown): string {
	if (err instanceof Error) return err.message;
	if (err === null || err === undefined) return '';
	if (typeof err === 'string') return err;
	try {
		return JSON.stringify(err);
	} catch {
		return String(err);
	}
}

/** User-friendly messages for the login / onboarding UI. */
export type AuthErrorContext = 'google' | 'wallet';

export function humanizeError(err: unknown, context: AuthErrorContext = 'google'): string {
	const raw = errorMessage(err);
	const wallet = context === 'wallet';

	if (/429|too many requests|rate.?limit/i.test(raw)) {
		return 'The public RPC is rate-limiting requests (429). Wait a few seconds and try again.';
	}

	if (/failed to fetch|networkerror|load failed|network request failed/i.test(raw)) {
		return "Couldn't reach the server. Check your connection and try again.";
	}

	if (/relayer|RELAYER_/i.test(raw)) {
		return `We couldn't prepare your account: ${raw}`;
	}

	if (/aborted without reason|aborterror|the operation was aborted|user closed|closed the (wallet|popup|window)/i.test(raw)) {
		return wallet
			? 'You closed the wallet before finishing. Try again and approve the connection.'
			: 'You closed the Google window before finishing. Try again and let the popup load completely.';
	}

	if (/popup|window\.open|blocked/i.test(raw)) {
		return wallet
			? 'Your browser blocked the wallet window. Allow popups for this site and try again.'
			: 'The browser blocked the Google window. Allow popups for this site and try again.';
	}

	if (/user (rejected|denied|cancell?ed)|rejected by user|denied by user|declined/i.test(raw)) {
		return wallet
			? 'You rejected the connection in the wallet. Try again and approve it.'
			: 'You cancelled the Google sign-in. Try again.';
	}

	if (/invalid_grant|login_required|consent_required|interaction_required/i.test(raw)) {
		return wallet
			? 'The wallet session expired. Connect again.'
			: 'Your Google session expired. Sign in again.';
	}

	if (/jwt|token.*expired|401/i.test(raw)) {
		return wallet
			? 'Your wallet session expired. Sign the message again.'
			: 'Your Google session expired. Sign in again or use a paid mint.';
	}

	if (/mpc.*(signature|firma)|did not return the mpc/i.test(raw)) {
		return wallet
			? 'The wallet did not return a signature. Try again.'
			: 'The MPC did not return a signature. Try again.';
	}

	if (/approved a different transaction|stale signing token|byte mismatch/i.test(raw)) {
		return wallet
			? 'The wallet approved a different transaction. Close it and try again.'
			: 'Google approved a different transaction. Close the popup and try again.';
	}

	const first = raw.split('\n')[0].split(' at ')[0];
	return first.length > 240 ? `${first.slice(0, 240)}…` : first;
}
