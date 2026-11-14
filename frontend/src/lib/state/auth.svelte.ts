import type { Onboarding } from '../near/auth.ts';
import { loadAuthModule } from '../near/auth-loader.ts';
import { humanizeError } from '../near/errors.ts';

/**
 * Estado reactivo de la sesión FastAuth.
 *
 * `init()` se llama una sola vez al arrancar la app. Si Auth0 tiene una sesión
 * persistida, la restaura y prepara la cuenta on-chain sin volver a mostrar el
 * login. Si no hay sesión, `Guardian` toma el control.
 */
class AuthSession {
	loggedIn = $state(false);
	publicKey = $state('');
	/** Cuenta on-chain del usuario (`t-<handle>.testnet`). Vacía hasta el onboarding. */
	accountId = $state('');
	loading = $state(true);
	/** `true` mientras se crea/verifica la cuenta en cadena. */
	accountCreating = $state(false);
	/** Hay sesión pero el jugador todavía no eligió un handle. */
	needsHandle = $state(false);
	error = $state('');

	private started = false;

	get ready(): boolean {
		return !this.loading;
	}

	/** Hay sesión y cuenta lista: el juego puede montar la escena y el lobby. */
	get canPlay(): boolean {
		return this.loggedIn && this.accountId !== '';
	}

	/** Restaura la sesión persistida una sola vez, del lado del cliente. */
	async init(): Promise<void> {
		if (this.started) return;

		this.started = true;

		try {
			const auth = await loadAuthModule();
			this.loggedIn = await auth.isLoggedIn();

			if (this.loggedIn) {
				await this.loadAccount();
			}
		} catch (cause) {
			this.error = humanizeError(cause);
			this.loggedIn = false;
		} finally {
			this.loading = false;
		}
	}

	async login(): Promise<void> {
		const auth = await loadAuthModule();
		await auth.login();
		this.loggedIn = true;
		this.error = '';
		await this.loadAccount();
	}

	async logout(): Promise<void> {
		try {
			const auth = await loadAuthModule();
			await auth.logout();
		} catch {
			// Auth0 puede fallar si la sesión ya expiró; igual limpiamos el estado.
		} finally {
			this.loggedIn = false;
			this.publicKey = '';
			this.accountId = '';
			this.accountCreating = false;
			this.needsHandle = false;
			this.error = '';
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
}

export const authSession = new AuthSession();
