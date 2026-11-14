import mongoose from 'mongoose';

const DEFAULT_URI = 'mongodb://127.0.0.1:27017/nearbox';
const RETRY_AFTER_MS = 5_000;

// Fail fast with 503 instead of buffering commands for 10s when Mongo is down.
mongoose.set('bufferCommands', false);

let connectionPromise: Promise<boolean> | null = null;
let lastFailureAt = 0;

export function mongoUri(): string {
	return process.env.MONGODB_URI?.trim() || DEFAULT_URI;
}

/** Redacted connection target, safe to log. */
export function mongoTarget(): string {
	const uri = mongoUri();
	return uri.replace(/\/\/[^@/]+@/, '//***@');
}

export function isMongoReady(): boolean {
	return mongoose.connection.readyState === 1;
}

export function mongoStateName(): string {
	switch (mongoose.connection.readyState) {
		case 0:
			return 'disconnected';
		case 1:
			return 'connected';
		case 2:
			return 'connecting';
		case 3:
			return 'disconnecting';
		default:
			return 'unknown';
	}
}

/**
 * Lazily connects to MongoDB. Never throws: callers get `false` so the rest of
 * the backend (WebSocket, lobbies, minigames) keeps working without a database.
 */
export async function ensureMongo(): Promise<boolean> {
	if (isMongoReady()) {
		return true;
	}

	if (Date.now() - lastFailureAt < RETRY_AFTER_MS) {
		return false;
	}

	if (!connectionPromise) {
		connectionPromise = mongoose
			.connect(mongoUri(), {
				serverSelectionTimeoutMS: 3_000,
				maxPoolSize: 10
			})
			.then(() => {
				console.log(`[mongo] connected to ${mongoTarget()}`);
				return true;
			})
			.catch((cause) => {
				lastFailureAt = Date.now();
				console.warn('[mongo] connection failed:', cause instanceof Error ? cause.message : cause);
				return false;
			})
			.finally(() => {
				connectionPromise = null;
			});
	}

	return connectionPromise;
}

export async function closeMongo(): Promise<void> {
	if (mongoose.connection.readyState === 0) {
		return;
	}

	try {
		await mongoose.disconnect();
		console.log('[mongo] disconnected');
	} catch (cause) {
		console.warn('[mongo] could not disconnect:', cause instanceof Error ? cause.message : cause);
	}
}
