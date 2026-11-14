/**
 * CLI: `bun run rewards:sync [--dry-run]`.
 *
 * Usa las credenciales del owner del contrato (por defecto
 * `~/.near-credentials/testnet/`) y nunca imprime claves.
 */
import { syncRewardCatalog } from '../src/progression/catalogSync';

const dryRun = process.argv.includes('--dry-run');

try {
	const result = await syncRewardCatalog({ dryRun });

	console.log(
		`[rewards:sync] ${dryRun ? 'DRY RUN' : 'sync'} · owner ${result.ownerAccountId} · NFT ${result.nftAccountId}`
	);
	console.log(
		`[rewards:sync] caps: ${result.capsUpdated.length} · metadata: ${result.metadataUpdated.length}`
	);

	if (result.capsUpdated.length > 0) {
		console.log(`[rewards:sync] caps pending/applied: ${result.capsUpdated.join(', ')}`);
	}

	if (result.metadataUpdated.length > 0) {
		console.log(
			`[rewards:sync] metadata pending/applied: ${result.metadataUpdated.join(', ')}`
		);
	}

	for (const supply of result.supplies) {
		console.log(
			`[rewards:sync] ${supply.catalog_id}: cap=${supply.cap} minted=${supply.minted} per_account=${supply.per_account_cap}`
		);
	}
} catch (cause) {
	console.error(
		`[rewards:sync] failed: ${cause instanceof Error ? cause.message : String(cause)}`
	);
	process.exitCode = 1;
}
