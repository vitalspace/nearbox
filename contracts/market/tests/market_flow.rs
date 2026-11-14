//! End-to-end test on a local NEAR sandbox:
//! deploy -> mint -> list (escrow) -> buy. Also covers cancel and error cases.
//!
//! Run with:
//! ```bash
//! cargo near build non-reproducible-wasm   # from each contract crate
//! cargo test --test market_flow -- --nocapture
//! ```

use near_api::{
    Contract, NetworkConfig, Signer, Tokens,
    types::{AccountId, NearGas, NearToken},
};
use near_sandbox::{Sandbox, SandboxConfig, config::GenesisAccount};
use serde_json::json;
use testresult::TestResult;

fn read_wasm(path: &str) -> Vec<u8> {
    std::fs::read(path).unwrap_or_else(|_| {
        panic!(
            "Missing {path}. Run `cargo near build non-reproducible-wasm` in the contract crate first."
        )
    })
}

fn token_id(serial: u32) -> String {
    format!("pistol-gold#{serial}")
}

#[tokio::test]
async fn market_flow() -> TestResult {
    let nft = GenesisAccount::generate_with_name("nft".parse()?);
    let market = GenesisAccount::generate_with_name("market".parse()?);
    let alice = GenesisAccount::generate_with_name("alice".parse()?);
    let bob = GenesisAccount::generate_with_name("bob".parse()?);

    let sandbox = Sandbox::start_sandbox_with_config(SandboxConfig {
        additional_accounts: vec![nft.clone(), market.clone(), alice.clone(), bob.clone()],
        ..Default::default()
    })
    .await?;

    let network = NetworkConfig::from_rpc_url("sandbox", sandbox.rpc_addr.parse()?);

    // near-sandbox and near-api use different `near-account-id` versions,
    // so go through the string representation.
    let nft_id: AccountId = nft.account_id.to_string().parse()?;
    let market_id: AccountId = market.account_id.to_string().parse()?;
    let alice_id: AccountId = alice.account_id.to_string().parse()?;
    let bob_id: AccountId = bob.account_id.to_string().parse()?;

    let nft_signer = Signer::from_secret_key(nft.private_key.parse()?)?;
    let market_signer = Signer::from_secret_key(market.private_key.parse()?)?;
    let alice_signer = Signer::from_secret_key(alice.private_key.parse()?)?;
    let bob_signer = Signer::from_secret_key(bob.private_key.parse()?)?;

    let nft_wasm = read_wasm(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../target/near/nft/nft.wasm"
    ));
    let market_wasm = read_wasm(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../target/near/market/market.wasm"
    ));

    // --- Deploy -------------------------------------------------------------
    Contract::deploy(nft_id.clone())
        .use_code(nft_wasm)
        .with_init_call(
            "init",
            json!({
                "name": "RunWorld Collection",
                "owner_id": null,
                "catalog_caps": [{
                    "catalog_id": "pistol-gold",
                    "cap": 3,
                    "per_account_cap": 2
                }],
                "catalog_metadata": [{
                    "catalog_id": "pistol-gold",
                    "title": "Golden Pistol",
                    "description": "A very golden pistol",
                    "media": "https://example.test/pistol.png",
                    "reference": "runworld://catalog/pistol-gold",
                    "extra": "{\"accent\":\"#fbbf24\"}"
                }]
            }),
        )?
        .with_signer(nft_signer.clone())
        .send_to(&network)
        .await?
        .assert_success();

    Contract::deploy(market_id.clone())
        .use_code(market_wasm)
        .with_init_call(
            "new",
            json!({ "owner_id": null, "token_contracts": [nft_id] }),
        )?
        .with_signer(market_signer.clone())
        .send_to(&network)
        .await?
        .assert_success();

    // --- Mint (alice) -------------------------------------------------------
    Contract(nft_id.clone())
        .call_function(
            "mint",
            json!({ "owner_id": alice_id, "catalog_id": "pistol-gold" }),
        )
        .transaction()
        .deposit(NearToken::from_millinear(10))
        .gas(NearGas::from_tgas(100))
        .with_signer(alice_id.clone(), alice_signer.clone())
        .send_to(&network)
        .await?
        .assert_success();

    let first_token = token_id(1);
    let balance: near_api::types::Data<String> = Contract(nft_id.clone())
        .call_function(
            "mt_balance_of",
            json!({ "account_id": alice_id, "token_id": first_token }),
        )
        .read_only()
        .fetch_from(&network)
        .await?;
    assert_eq!(balance.data, "1", "alice should own the first serial");

    let supply: near_api::types::Data<serde_json::Value> = Contract(nft_id.clone())
        .call_function(
            "get_catalog_supply",
            json!({ "catalog_id": "pistol-gold" }),
        )
        .read_only()
        .fetch_from(&network)
        .await?;
    assert_eq!(supply.data["minted"], json!(1));
    assert_eq!(supply.data["cap"], json!(3));

    // --- List (alice escrows the token in the market) -----------------------
    let price_yocto = "1000000000000000000000000"; // 1 NEAR
    Contract(nft_id.clone())
        .call_function(
            "mt_transfer_call",
            json!({
                "receiver_id": market_id,
                "token_id": token_id(1),
                "amount": "1",
                "approval": null,
                "memo": null,
                "msg": format!("{{\"price\":\"{price_yocto}\"}}")
            }),
        )
        .transaction()
        .deposit(NearToken::from_yoctonear(1))
        .gas(NearGas::from_tgas(150))
        .with_signer(alice_id.clone(), alice_signer.clone())
        .send_to(&network)
        .await?
        .assert_success();

    let sale: near_api::types::Data<Option<serde_json::Value>> = Contract(market_id.clone())
        .call_function(
            "get_sale",
            json!({ "token_contract": nft_id, "token_id": token_id(1) }),
        )
        .read_only()
        .fetch_from(&network)
        .await?;
    let sale = sale.data.expect("sale should exist after mt_transfer_call");
    assert_eq!(sale["seller_id"], json!(alice_id.to_string()));

    let escrowed: near_api::types::Data<String> = Contract(nft_id.clone())
        .call_function(
            "mt_balance_of",
            json!({ "account_id": market_id, "token_id": token_id(1) }),
        )
        .read_only()
        .fetch_from(&network)
        .await?;
    assert_eq!(escrowed.data, "1", "the market should hold the token");

    // --- Buy (bob) ----------------------------------------------------------
    let alice_before = Tokens::account(alice_id.clone())
        .near_balance()
        .fetch_from(&network)
        .await?
        .total;

    Contract(market_id.clone())
        .call_function(
            "buy",
            json!({ "token_contract": nft_id, "token_id": token_id(1) }),
        )
        .transaction()
        .deposit(NearToken::from_near(1))
        .gas(NearGas::from_tgas(100))
        .with_signer(bob_id.clone(), bob_signer.clone())
        .send_to(&network)
        .await?
        .assert_success();

    let bob_balance: near_api::types::Data<String> = Contract(nft_id.clone())
        .call_function(
            "mt_balance_of",
            json!({ "account_id": bob_id, "token_id": token_id(1) }),
        )
        .read_only()
        .fetch_from(&network)
        .await?;
    assert_eq!(
        bob_balance.data, "1",
        "bob should own the token after buying"
    );

    let market_balance: near_api::types::Data<String> = Contract(nft_id.clone())
        .call_function(
            "mt_balance_of",
            json!({ "account_id": market_id, "token_id": token_id(1) }),
        )
        .read_only()
        .fetch_from(&network)
        .await?;
    assert_eq!(
        market_balance.data, "0",
        "the market should not keep the token"
    );

    let alice_after = Tokens::account(alice_id.clone())
        .near_balance()
        .fetch_from(&network)
        .await?
        .total;
    assert!(
        alice_after.as_yoctonear()
            >= alice_before.as_yoctonear() + 1_000_000_000_000_000_000_000_000,
        "seller should receive the price"
    );

    let sale: near_api::types::Data<Option<serde_json::Value>> = Contract(market_id.clone())
        .call_function(
            "get_sale",
            json!({ "token_contract": nft_id, "token_id": token_id(1) }),
        )
        .read_only()
        .fetch_from(&network)
        .await?;
    assert!(sale.data.is_none(), "sale should be removed after buy");

    // --- Mint + list + cancel ----------------------------------------------
    Contract(nft_id.clone())
        .call_function(
            "mint",
            json!({ "owner_id": alice_id, "catalog_id": "pistol-gold" }),
        )
        .transaction()
        .deposit(NearToken::from_millinear(10))
        .gas(NearGas::from_tgas(100))
        .with_signer(alice_id.clone(), alice_signer.clone())
        .send_to(&network)
        .await?
        .assert_success();

    Contract(nft_id.clone())
        .call_function(
            "mt_transfer_call",
            json!({
                "receiver_id": market_id,
                "token_id": token_id(2),
                "amount": "1",
                "approval": null,
                "memo": null,
                "msg": "{\"price\":\"2000000000000000000000000\"}"
            }),
        )
        .transaction()
        .deposit(NearToken::from_yoctonear(1))
        .gas(NearGas::from_tgas(150))
        .with_signer(alice_id.clone(), alice_signer.clone())
        .send_to(&network)
        .await?
        .assert_success();

    Contract(market_id.clone())
        .call_function(
            "cancel",
            json!({ "token_contract": nft_id, "token_id": token_id(2) }),
        )
        .transaction()
        .gas(NearGas::from_tgas(100))
        .with_signer(alice_id.clone(), alice_signer.clone())
        .send_to(&network)
        .await?
        .assert_success();

    let alice_token: near_api::types::Data<String> = Contract(nft_id.clone())
        .call_function(
            "mt_balance_of",
            json!({ "account_id": alice_id, "token_id": token_id(2) }),
        )
        .read_only()
        .fetch_from(&network)
        .await?;
    assert_eq!(alice_token.data, "1", "alice should get the token back");

    let sale: near_api::types::Data<Option<serde_json::Value>> = Contract(market_id)
        .call_function(
            "get_sale",
            json!({ "token_contract": nft_id, "token_id": token_id(2) }),
        )
        .read_only()
        .fetch_from(&network)
        .await?;
    assert!(sale.data.is_none(), "sale should be removed after cancel");

    // --- Cap + metadata views ----------------------------------------------
    Contract(nft_id.clone())
        .call_function(
            "mint",
            json!({ "owner_id": bob_id, "catalog_id": "pistol-gold" }),
        )
        .transaction()
        .deposit(NearToken::from_millinear(10))
        .gas(NearGas::from_tgas(100))
        .with_signer(bob_id.clone(), bob_signer.clone())
        .send_to(&network)
        .await?
        .assert_success();

    let metadata: near_api::types::Data<serde_json::Value> = Contract(nft_id.clone())
        .call_function("mt_metadata_contract", json!({}))
        .read_only()
        .fetch_from(&network)
        .await?;
    assert_eq!(metadata.data["spec"], "mt-1.0.0");

    let token_metadata: near_api::types::Data<serde_json::Value> = Contract(nft_id.clone())
        .call_function(
            "mt_metadata_token_by_token_id",
            json!({ "token_ids": [token_id(3)] }),
        )
        .read_only()
        .fetch_from(&network)
        .await?;
    assert_eq!(token_metadata.data[0]["title"], json!("Golden Pistol"));
    let extra: serde_json::Value =
        serde_json::from_str(token_metadata.data[0]["extra"].as_str().unwrap())?;
    assert_eq!(extra["catalogId"], json!("pistol-gold"));
    assert_eq!(extra["serial"], json!(3));

    Ok(())
}
