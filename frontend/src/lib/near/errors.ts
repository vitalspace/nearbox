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
export function humanizeError(err: unknown): string {
	const raw = errorMessage(err);

	if (/429|too many requests|rate.?limit/i.test(raw)) {
		return 'The public RPC is rate-limiting requests (429). Wait a few seconds and try again.';
	}

	if (/failed to fetch|networkerror|load failed|network request failed/i.test(raw)) {
		return "Couldn't reach the server. Check your connection and try again.";
	}

	if (/relayer|RELAYER_/i.test(raw)) {
		return `We couldn't prepare your account: ${raw}`;
	}

	if (/popup|window\.open|blocked/i.test(raw)) {
		return 'The browser blocked the Google window. Allow popups for this site and try again.';
	}

	if (/aborted without reason|aborterror|the operation was aborted|user closed/i.test(raw)) {
		return 'You closed the Google window before finishing. Try again and let the popup load completely.';
	}

	if (/invalid_grant|login_required|consent_required|interaction_required/i.test(raw)) {
		return 'Your Google session expired. Sign in again.';
	}

	if (/jwt|token.*expired|401/i.test(raw)) {
		return 'Your Google session expired. Sign in again or use a paid mint.';
	}

	if (/rate.?limit|429|too many requests/i.test(raw)) {
		return 'Too many requests. Wait a minute and try again.';
	}

	if (/mpc.*(signature|firma)|did not return the mpc/i.test(raw)) {
		return 'The MPC did not return a signature. Try again.';
	}

	if (/approved a different transaction|stale signing token|byte mismatch/i.test(raw)) {
		return 'Google approved a different transaction. Close the popup and try again.';
	}

	const first = raw.split('\n')[0].split(' at ')[0];
	return first.length > 240 ? `${first.slice(0, 240)}…` : first;
}
