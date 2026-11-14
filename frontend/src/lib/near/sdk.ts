/**
 * Punto único de carga de los SDKs pesados.
 *
 * Los imports son perezosos a propósito:
 *  - `@fast-auth-near/*` y `@auth0/auth0-spa-js` son solo-browser y no deben
 *    evaluarse durante SSR.
 *  - `near-api-js` es grande; no conviene meterlo en el chunk inicial.
 */
export async function loadAuthSdk() {
	const [{ FastAuthClient }, { JavascriptProvider }, { Auth0Client }, { connect }] =
		await Promise.all([
			import('@fast-auth-near/browser-sdk'),
			import('@fast-auth-near/javascript-provider'),
			import('@auth0/auth0-spa-js'),
			import('near-api-js')
		]);

	return { FastAuthClient, JavascriptProvider, Auth0Client, connect };
}

/** Subconjunto de `near-api-js/lib/transaction` que usa el flujo de firma. */
export async function loadTransactionSdk() {
	const transaction = await import('near-api-js/lib/transaction');

	return {
		functionCall: transaction.functionCall,
		createTransaction: transaction.createTransaction,
		encodeTransaction: transaction.encodeTransaction,
		Signature: transaction.Signature,
		SignedTransaction: transaction.SignedTransaction,
		Transaction: transaction.Transaction
	};
}

export async function loadSigningSdk() {
	const [{ FastAuthSignature }, transaction, { utils }, { PublicKey }, { KeyType }] =
		await Promise.all([
			import('@fast-auth-near/browser-sdk'),
			import('near-api-js/lib/transaction'),
			import('near-api-js'),
			import('near-api-js/lib/utils'),
			import('near-api-js/lib/utils/key_pair')
		]);

	return {
		FastAuthSignature,
		createTransaction: transaction.createTransaction,
		encodeTransaction: transaction.encodeTransaction,
		Signature: transaction.Signature,
		SignedTransaction: transaction.SignedTransaction,
		Transaction: transaction.Transaction,
		utils,
		PublicKey,
		KeyType
	};
}
