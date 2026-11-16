import type { Onboarding } from '../near/auth.ts';
import { loadAuthModule } from '../near/auth-loader.ts';
import { humanizeError } from '../near/errors.ts';
import {
	cachedWalletSession,
	connectWallet,
	createWalletSession,
	disconnectWallet,
	forgetWalletSession,
	restoreWallet,
	type WalletModuleId
} from '../near/wallet.ts';
import { browser } from '$app/env';

/**
 * Estado reactivo de la sesión.
 *
 * Tres modos, misma escena y mismo loop:
 *  - `fastauth`: Google → cuenta NEAR con clave MPC (login invisible).
 *  - `wallet`:   wallet NEAR propia (Meteor) verificada con NEP-413; los NFT
 *                de misión llegan a esa cuenta.
 *  - `guest`:    sin cuenta; progreso local y servidor por UUID. Los NFT
 *                requieren iniciar sesión, pero el mundo funciona completo.
 *
 * `init()` se llama una sola vez al arrancar la app. Si hay una sesión
 * persistida, la restaura sin volver a mostrar el login.
 */

export type AuthMode = 'fastauth' | 'wallet' | 'guest';

const MODE_STORAGE_KEY = 'nearbox:auth:mode';

function readMode(): AuthMode | null {
	if (!browser) return null;

	try {
		const value = localStorage.getItem(MODE_STORAGE_KEY);
		return value === 'fastauth' || value === 'wallet' || value === 'guest' ? value : null;
	} catch {
		return null;
	}
}

function writeMode(mode: AuthMode | null): void {
	if (!browser) return;

	try {
		if (mode) localStorage.setItem(MODE_STORAGE_KEY, mode);
		else localStorage.removeItem(MODE_STORAGE_KEY);
	} catch {
		// Sin storage la sesión dura la pestaña; el login sigue funcionando.
	}
}

class AuthSession {
	mode = $state<AuthMode | null>(null);
	loggedIn = $state(false);
	publicKey = $state('');
	/** Cuenta on-chain del usuario. Vacía en modo invitado. */
	accountId = $state('');
	loading = $state(true);
	/** `true` mientras se crea/verifica la cuenta en cadena. */
	accountCreating = $state(false);
	/** Hay sesión pero el jugador todavía no eligió un handle (solo FastAuth). */
	needsHandle = $state(false);
	error = $state('');
	/** Wallet elegida en el último login (para reconectar sin preguntar). */
	walletModule = $state<WalletModuleId>('meteor-wallet');

	private started = false;

	get ready(): boolean {
		return !this.loading;
	}

	get isGuest(): boolean {
		return this.mode === 'guest';
	}

	get isWallet(): boolean {
		return this.mode === 'wallet';
	}

	get isFastAuth(): boolean {
		return this.mode === 'fastauth';
	}

	/** Identidad de progresión: la cuenta, o `''` si el jugador es invitado. */
	get playerId(): string {
		return this.isGuest ? '' : this.accountId;
	}

	/** Hay sesión y cuenta lista: el juego puede montar la escena y el lobby. */
	get canPlay(): boolean {
		if (!this.loggedIn) return false;
		if (this.mode === 'guest') return true;

		return this.accountId !== '';
	}

	/** Restaura la sesión persistida una sola vez, del lado del cliente. */
	async init(): Promise<void> {
		if (this.started) return;

		this.started = true;

		const stored = readMode();

		try {
			if (stored === 'guest') {
				this.activateGuest();
				return;
			}

			// La wallet también se restaura si el modo aún no está guardado: la
			// extensión puede reconectar antes de que `loginWithWallet` termine y
			// guarde el modo.
			if (stored === 'wallet' || stored === null) {
				const account = await restoreWallet();

				if (account) {
					writeMode('wallet');
					this.activateWallet(account.accountId, account.publicKey);
					this.walletModule = account.moduleId;
					return;
				}

				// Si la wallet no responde, se muestra el login: no se entra con
				// Google a una cuenta que el jugador eligió wallet.
				if (stored === 'wallet') return;
			}

			const auth = await loadAuthModule();
			this.loggedIn = await auth.isLoggedIn();

			if (this.loggedIn) {
				this.mode = 'fastauth';
				writeMode('fastauth');
				await this.loadAccount();
			}
		} catch (cause) {
			this.error = humanizeError(cause);
			this.loggedIn = false;
			this.mode = null;
		} finally {
			this.loading = false;
		}
	}

	/** Entrada con Google (FastAuth): cuenta NEAR creada al primer mint. */
	async login(): Promise<void> {
		const auth = await loadAuthModule();
		await auth.login();
		this.mode = 'fastauth';
		this.loggedIn = true;
		this.error = '';
		writeMode('fastauth');
		await this.loadAccount();
	}

	/**
	 * Entrada con una wallet NEAR propia. Conecta, firma el mensaje NEP-413 y
	 * guarda el token de sesión del backend en el mismo paso.
	 */
	async loginWithWallet(moduleId: WalletModuleId): Promise<void> {
		const account = await connectWallet(moduleId);
		const token = await createWalletSession(account.accountId);

		if (!token) throw new Error('The wallet session could not be created');

		writeMode('wallet');
		this.activateWallet(account.accountId, account.publicKey);
		this.walletModule = account.moduleId;
	}

	/** Entrada como invitado: mundo completo, progreso local. */
	continueAsGuest(): void {
		writeMode('guest');
		this.activateGuest();
	}

	/**
	 * Renueva la sesión sin cambiar de modo: en wallet vuelve a firmar el
	 * NEP-413; en FastAuth reabre el popup de Google.
	 */
	async reconnect(): Promise<void> {
		if (this.mode === 'wallet') {
			const token = await this.refreshWalletSession();

			if (!token) throw new Error('The wallet did not sign the session. Try again.');

			return;
		}

		await this.login();
	}

	async logout(): Promise<void> {
		const previous = this.mode;

		try {
			if (previous === 'fastauth') {
				const auth = await loadAuthModule();
				await auth.logout();
			} else if (previous === 'wallet') {
				if (this.accountId) forgetWalletSession(this.accountId);
				await disconnectWallet();
			}
		} catch {
			// Auth0 o la wallet pueden fallar si la sesión ya expiró; igual limpiamos.
		} finally {
			writeMode(null);
			this.mode = null;
			this.loggedIn = false;
			this.publicKey = '';
			this.accountId = '';
			this.accountCreating = false;
			this.needsHandle = false;
			this.error = '';
		}
	}

	/**
	 * Token para los endpoints autenticados (stats, progresión, recompensas).
	 *
	 * En wallet reutiliza el token guardado y, si caducó, vuelve a firmar el
	 * mensaje (una interacción). Nunca lanza: los stores degradan a caché.
	 */
	async apiToken(): Promise<string | null> {
		if (this.mode === 'fastauth') {
			try {
				const { getIdentityToken } = await import('../near/auth.ts');
				return await getIdentityToken();
			} catch {
				return null;
			}
		}

		if (this.mode === 'wallet') {
			if (!this.accountId) return null;

			const cached = cachedWalletSession(this.accountId);

			if (cached) return cached;

			return await this.refreshWalletSession();
		}

		return null;
	}

	/** Firma de nuevo el NEP-413 (solo wallet). Devuelve `null` si falla. */
	async refreshWalletSession(): Promise<string | null> {
		if (this.mode !== 'wallet' || !this.accountId) return null;

		try {
			return await createWalletSession(this.accountId);
		} catch (cause) {
			this.error = humanizeError(cause, 'wallet');
			return null;
		}
	}

	/** Verifica/crea la cuenta on-chain y guarda `accountId` + `publicKey`. */
	async loadAccount(): Promise<Onboarding | null> {
		this.accountCreating = true;
		this.error = '';

		try {
			const auth = await loadAuthModule();
			const resolution = await auth.resolveAccount();

			this.publicKey =
				resolution.status === 'ready' ? resolution.account.publicKey : resolution.publicKey;

			if (resolution.status === 'needs-handle') {
				this.accountId = '';
				this.needsHandle = true;
				return null;
			}

			this.accountId = resolution.account.accountId;
			this.needsHandle = false;
			return resolution.account;
		} catch (cause) {
			this.error = humanizeError(cause);
			return null;
		} finally {
			this.accountCreating = false;
		}
	}

	/** Crea (o recupera) la cuenta con el handle elegido por el jugador. */
	async claimHandle(handle: string): Promise<Onboarding | null> {
		if (this.accountCreating) return null;

		this.accountCreating = true;
		this.error = '';

		try {
			const auth = await loadAuthModule();
			const account = await auth.createAccountWithHandle(handle);

			this.accountId = account.accountId;
			this.publicKey = account.publicKey;
			this.needsHandle = false;
			return account;
		} catch (cause) {
			this.error = humanizeError(cause);
			return null;
		} finally {
			this.accountCreating = false;
		}
	}

	private activateGuest(): void {
		this.mode = 'guest';
		this.loggedIn = true;
		this.accountId = '';
		this.publicKey = '';
		this.needsHandle = false;
		this.accountCreating = false;
		this.error = '';
	}

	private activateWallet(accountId: string, publicKey: string): void {
		this.mode = 'wallet';
		this.loggedIn = true;
		this.accountId = accountId;
		this.publicKey = publicKey;
		this.needsHandle = false;
		this.accountCreating = false;
		this.error = '';
	}
}

export const authSession = new AuthSession();
