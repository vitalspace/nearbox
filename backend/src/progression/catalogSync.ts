/**
 * Sincronización idempotente del catálogo de recompensas en testnet
 * (SPEC-045, paso 21).
 *
 * `set_catalog_cap` y `set_catalog_metadata` son owner-only: se ejecutan una
 * vez por CLI con las credenciales del owner del contrato, no con el relayer.
 * El backend nunca firma estas llamadas ni arranca con ellas.
 */
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Account, connect, keyStores } from 'near-api-js';
import type { KeyPairString } from 'near-api-js/lib/utils/key_pair';
import { KeyPair } from 'near-api-js';
import { REWARD_CATALOG, type RewardCatalogEntry } from './catalog';

const NETWORK_ID = process.env.NEAR_NETWORK_ID || 'testnet';
const RPC_URL = process.env.NEAR_RPC_URL || 'https://rpc.testnet.fastnear.com';
const DEFAULT_DEPLOYMENT = new URL(
	'../../../contracts/deployments/testnet.json',
	import.meta.url
);
const GAS = 100_000_000_000_000n;

type Deployment = {
	network?: string;
	deployerAccountId?: string;
	nft?: {
		accountId?: string;
		init?: { owner_id?: string };
	};
};

type CatalogSupply = {
	catalog_id: string;
	cap: number;
	minted: number;
	per_account_cap: number;
};

type CatalogMetadata = {
	catalog_id: string;
	title: string;
	description?: string | null;
	media?: string | null;
	reference?: string | null;
	extra?: string | null;
};

export type CatalogSyncOptions = {
	dryRun?: boolean;
	ownerAccountId?: string;
	credentialsDir?: string;
	deploymentPath?: string;
};

export type CatalogSyncResult = {
	ownerAccountId: string;
	nftAccountId: string;
	dryRun: boolean;
	capsUpdated: string[];
	metadataUpdated: string[];
	supplies: CatalogSupply[];
};

function rewardMetadata(entry: RewardCatalogEntry): CatalogMetadata {
	return {
		catalog_id: entry.catalogId,
		title: entry.title,
		description: entry.description,
		media: '',
		reference: `runworld://catalog/${entry.catalogId}`,
		extra: JSON.stringify({
			catalogId: entry.catalogId,
			model: null,
			accent: entry.accent,
			badge:
				entry.icon === 'weapon'
					? 'Weapon'
					: entry.icon === 'vehicle'
						? 'Vehicle'
						: entry.icon === 'skin'
							? 'Skin'
							: 'Cosmetic',
			hot: false,
			kind:
				entry.icon === 'skin'
					? 'skins'
					: entry.icon === 'weapon'
						? 'weapons'
						: entry.icon === 'vehicle'
							? 'vehicles'
							: 'assets'
		})
	};
}

async function viewFunction<T>(
	method: string,
	args: Record<string, unknown>,
	contractId: string
): Promise<T> {
	let response: Response;

	try {
		response = await fetch(RPC_URL, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				jsonrpc: '2.0',
				id: 'runworld-rewards-sync',
				method: 'query',
				params: {
					request_type: 'call_function',
					finality: 'final',
					account_id: contractId,
					method_name: method,
					args_base64: Buffer.from(JSON.stringify(args)).toString('base64')
				}
			})
		});
	} catch (cause) {
		throw new Error(
			`Could not reach the NEAR RPC: ${
				cause instanceof Error ? cause.message : String(cause)
			}`
		);
	}

	if (!response.ok) {
		throw new Error(`The NEAR RPC responded with HTTP ${response.status}`);
	}

	const payload = (await response.json()) as {
		result?: { result?: number[] };
		error?: { message?: string };
	};

	if (payload.error || !payload.result?.result) {
		throw new Error(
			payload.error?.message ?? 'The NFT contract returned an empty response'
		);
	}

	return JSON.parse(
		Buffer.from(payload.result.result).toString('utf8')
	) as T;
}

async function keyStoreFor(
	owner: string,
	networkId: string,
	credentialsDir?: string
): Promise<keyStores.KeyStore> {
	if (process.env.OWNER_PRIVATE_KEY) {
		const keyStore = new keyStores.InMemoryKeyStore();
		await keyStore.setKey(
			networkId,
			owner,
			KeyPair.fromString(process.env.OWNER_PRIVATE_KEY as KeyPairString)
		);
		return keyStore;
	}

	return new keyStores.UnencryptedFileSystemKeyStore(
		credentialsDir || join(homedir(), '.near-credentials', networkId)
	);
}

/**
 * Verifica los catálogos cosméticos usados como recompensa. Todos existen ya
 * on-chain (skins, armas, assets y vehículos), así que este script no debería
 * cambiar nada: solo crea un catálogo si faltara y nunca reescribe metadata
 * existente para no romper la tienda.
 */
export async function syncRewardCatalog(
	options: CatalogSyncOptions = {}
): Promise<CatalogSyncResult> {
	const deploymentPath = options.deploymentPath ?? DEFAULT_DEPLOYMENT.pathname;
	const deployment = JSON.parse(
		await readFile(deploymentPath, 'utf8')
	) as Deployment;
	const networkId = deployment.network || NETWORK_ID;
	const nftAccountId =
		process.env.NFT_CONTRACT_ID || deployment.nft?.accountId || '';

	if (!nftAccountId) {
		throw new Error(
			'Missing NFT contract id. Set NFT_CONTRACT_ID or add nft.accountId to the deployment file.'
		);
	}

	const ownerAccountId =
		options.ownerAccountId ||
		process.env.OWNER_ACCOUNT_ID ||
		deployment.nft?.init?.owner_id ||
		deployment.deployerAccountId ||
		'';

	if (!ownerAccountId) {
		throw new Error(
			'Missing owner account. Set OWNER_ACCOUNT_ID or add owner_id to the deployment file.'
		);
	}

	const catalogIds = REWARD_CATALOG.map((entry) => entry.catalogId);
	const before = await viewFunction<CatalogSupply[]>(
		'get_catalog_supplies',
		{ catalog_ids: catalogIds },
		nftAccountId
	);
	const supplyById = new Map(before.map((entry) => [entry.catalog_id, entry]));

	const capsToSet: RewardCatalogEntry[] = [];
	const metadataToSet: { entry: RewardCatalogEntry; metadata: CatalogMetadata }[] = [];

	for (const entry of REWARD_CATALOG) {
		const supply = supplyById.get(entry.catalogId);

		// Los cosméticos de recompensa ya existen on-chain: no se tocan sus
		// topes ni su metadata. Solo se prepara un catálogo ausente.
		if (supply) continue;

		capsToSet.push(entry);
		metadataToSet.push({ entry, metadata: rewardMetadata(entry) });
	}

	const result: CatalogSyncResult = {
		ownerAccountId,
		nftAccountId,
		dryRun: options.dryRun ?? false,
		capsUpdated: capsToSet.map((entry) => entry.catalogId),
		metadataUpdated: metadataToSet.map(({ entry }) => entry.catalogId),
		supplies: before
	};

	if (result.dryRun) {
		return result;
	}

	if (capsToSet.length === 0 && metadataToSet.length === 0) {
		return result;
	}

	const keyStore = await keyStoreFor(ownerAccountId, networkId, options.credentialsDir);
	const near = await connect({
		networkId,
		nodeUrl: RPC_URL,
		keyStore
	});
	const account = new Account(near.connection, ownerAccountId);

	for (const entry of capsToSet) {
		await account.functionCall({
			contractId: nftAccountId,
			methodName: 'set_catalog_cap',
			args: {
				catalog_id: entry.catalogId,
				cap: entry.cap,
				per_account_cap: entry.perAccountCap
			},
			gas: GAS,
			attachedDeposit: 0n
		});
		console.log(`[rewards:sync] cap ${entry.catalogId} → ${entry.cap}/${entry.perAccountCap}`);
	}

	for (const { entry, metadata } of metadataToSet) {
		await account.functionCall({
			contractId: nftAccountId,
			methodName: 'set_catalog_metadata',
			args: { metadata },
			gas: GAS,
			attachedDeposit: 0n
		});
		console.log(`[rewards:sync] metadata ${entry.catalogId} → ${entry.title}`);
	}

	result.supplies = await viewFunction<CatalogSupply[]>(
		'get_catalog_supplies',
		{ catalog_ids: catalogIds },
		nftAccountId
	);

	return result;
}
