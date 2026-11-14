//! Minimal NEP-245 marketplace.
//!
//! Flow (escrow, no approvals needed):
//! 1. Seller calls `mt_transfer_call` on the NFT contract with
//!    `receiver_id = market`, `msg = {"price": "<yoctoNEAR>"}`.
//! 2. The market implements `mt_on_transfer` and stores the sale. Tokens stay
//!    escrowed in the market account.
//! 3. Buyer calls `buy(token_contract, token_id)` attaching the price in NEAR.
//! 4. The market sends the token to the buyer and, once that succeeds, pays the
//!    seller (or refunds the buyer if the token transfer failed).
//!
//! Only whitelisted token contracts are accepted, so a fake "token contract"
//! cannot create sales it cannot honour.

use near_sdk::json_types::U128;
use near_sdk::store::IterableMap;
use near_sdk::store::IterableSet;
use near_sdk::{
    AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise, env, near, require,
};

pub type TokenId = String;

const GAS_FOR_MT_TRANSFER: Gas = Gas::from_tgas(30);
const GAS_FOR_CALLBACK: Gas = Gas::from_tgas(20);
const DEFAULT_PAGE_SIZE: u32 = 50;

#[derive(BorshStorageKey)]
#[near(serializers = [borsh])]
enum StorageKey {
    Sales,
    TokenContracts,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct SaleKey {
    pub token_contract: AccountId,
    pub token_id: TokenId,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Sale {
    pub seller_id: AccountId,
    pub token_contract: AccountId,
    pub token_id: TokenId,
    pub amount: U128,
    /// Total price in yoctoNEAR.
    pub price: U128,
}

/// `msg` sent with `mt_transfer_call`.
#[near(serializers = [json])]
#[derive(Clone)]
pub struct SaleArgs {
    pub price: U128,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Market {
    owner_id: AccountId,
    token_contracts: IterableSet<AccountId>,
    sales: IterableMap<SaleKey, Sale>,
}

#[near]
impl Market {
    /// `cargo near deploy <account> with-init-call new json-args '{"token_contracts":["nft.testnet"]}' ...`
    #[init]
    #[private]
    pub fn new(owner_id: Option<AccountId>, token_contracts: Vec<AccountId>) -> Self {
        let mut allowed = IterableSet::new(StorageKey::TokenContracts);
        for token_contract in token_contracts {
            allowed.insert(token_contract);
        }
        Self {
            owner_id: owner_id.unwrap_or_else(env::current_account_id),
            token_contracts: allowed,
            sales: IterableMap::new(StorageKey::Sales),
        }
    }

    /*********************/
    /*   ADMIN (OWNER)   */
    /*********************/

    pub fn add_token_contract(&mut self, token_contract: AccountId) {
        self.assert_owner();
        self.token_contracts.insert(token_contract);
        self.token_contracts.flush();
    }

    pub fn remove_token_contract(&mut self, token_contract: AccountId) {
        self.assert_owner();
        self.token_contracts.remove(&token_contract);
        self.token_contracts.flush();
    }

    /*********************/
    /*      LISTING      */
    /*********************/

    /// Called by the NFT contract after a seller escrows a token in the market.
    ///
    /// `msg` must be `{"price": "<yoctoNEAR>"}`. Returns the unused amount, as
    /// required by NEP-245 (this market always uses the whole amount).
    pub fn mt_on_transfer(
        &mut self,
        sender_id: AccountId,
        previous_owner_ids: Vec<AccountId>,
        token_ids: Vec<TokenId>,
        amounts: Vec<U128>,
        msg: String,
    ) -> Vec<U128> {
        let token_contract = env::predecessor_account_id();
        require!(
            self.token_contracts.contains(&token_contract),
            "Token contract is not allowed"
        );
        require!(
            token_ids.len() == 1 && amounts.len() == 1 && previous_owner_ids.len() == 1,
            "Sales must escrow exactly one token id at a time"
        );
        require!(previous_owner_ids[0] == sender_id, "Invalid previous owner");

        let args: SaleArgs = near_sdk::serde_json::from_str(&msg).unwrap_or_else(|_| {
            env::panic_str("Invalid msg, expected {\"price\":\"<yoctoNEAR>\"}")
        });
        require!(args.price.0 > 0, "Price must be greater than 0");

        let key = SaleKey {
            token_contract: token_contract.clone(),
            token_id: token_ids[0].clone(),
        };
        require!(
            self.sales.get(&key).is_none(),
            "This token is already listed"
        );

        let sale = Sale {
            seller_id: sender_id.clone(),
            token_contract: token_contract.clone(),
            token_id: token_ids[0].clone(),
            amount: amounts[0],
            price: args.price,
        };
        self.sales.insert(key, sale.clone());
        self.sales.flush();

        Self::emit("sale_created", near_sdk::serde_json::json!([sale]));

        // 0 unused -> the market keeps all escrowed tokens.
        vec![U128(0)]
    }

    /// Seller removes the listing and gets the escrowed token back.
    pub fn cancel(&mut self, token_contract: AccountId, token_id: TokenId) -> Promise {
        let seller_id = env::predecessor_account_id();
        let key = SaleKey {
            token_contract: token_contract.clone(),
            token_id: token_id.clone(),
        };
        let sale = self
            .sales
            .get(&key)
            .cloned()
            .unwrap_or_else(|| env::panic_str("Sale not found"));
        require!(
            sale.seller_id == seller_id,
            "Only the seller can cancel this sale"
        );

        ext_mt::ext(token_contract.clone())
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .with_static_gas(GAS_FOR_MT_TRANSFER)
            .mt_transfer(seller_id, token_id.clone(), sale.amount, None, None)
            .then(
                ext_self::ext(env::current_account_id())
                    .with_static_gas(GAS_FOR_CALLBACK)
                    .resolve_cancel(token_contract, token_id),
            )
    }

    /// Buys a listed token. Attach at least `price` yoctoNEAR; the excess is
    /// refunded immediately.
    #[payable]
    pub fn buy(&mut self, token_contract: AccountId, token_id: TokenId) -> Promise {
        let buyer_id = env::predecessor_account_id();
        let key = SaleKey {
            token_contract: token_contract.clone(),
            token_id: token_id.clone(),
        };
        let sale = self
            .sales
            .get(&key)
            .cloned()
            .unwrap_or_else(|| env::panic_str("Sale not found"));

        require!(
            buyer_id != sale.seller_id,
            "Seller cannot buy their own token"
        );

        let price = NearToken::from_yoctonear(sale.price.0);
        let deposit = env::attached_deposit();
        require!(
            deposit >= price,
            "Not enough NEAR attached to buy this token"
        );

        // Remove before the cross-contract call (no reentrancy).
        self.sales.remove(&key);
        self.sales.flush();

        let refund = deposit.saturating_sub(price);
        if refund.as_yoctonear() > 0 {
            let _ = Promise::new(buyer_id.clone()).transfer(refund);
        }

        Self::emit(
            "sale_bought",
            near_sdk::serde_json::json!([{
                "buyer_id": buyer_id,
                "token_contract": token_contract,
                "token_id": token_id,
                "price": sale.price,
            }]),
        );

        ext_mt::ext(token_contract)
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .with_static_gas(GAS_FOR_MT_TRANSFER)
            .mt_transfer(buyer_id.clone(), sale.token_id, sale.amount, None, None)
            .then(
                ext_self::ext(env::current_account_id())
                    .with_static_gas(GAS_FOR_CALLBACK)
                    .resolve_buy(sale.seller_id, buyer_id, sale.price),
            )
    }

    /// Pays the seller only if the token transfer to the buyer worked,
    /// otherwise refunds the buyer.
    #[private]
    pub fn resolve_buy(&mut self, seller_id: AccountId, buyer_id: AccountId, price: U128) -> bool {
        let paid = NearToken::from_yoctonear(price.0);
        match env::promise_result_checked(0, 1024) {
            Ok(_) => {
                let _ = Promise::new(seller_id).transfer(paid);
                true
            }
            Err(_) => {
                let _ = Promise::new(buyer_id).transfer(paid);
                false
            }
        }
    }

    /// Removes the sale only if the token really went back to the seller.
    #[private]
    pub fn resolve_cancel(&mut self, token_contract: AccountId, token_id: TokenId) -> bool {
        match env::promise_result_checked(0, 1024) {
            Ok(_) => {
                let key = SaleKey {
                    token_contract,
                    token_id,
                };
                self.sales.remove(&key);
                self.sales.flush();
                true
            }
            Err(_) => false,
        }
    }

    /*********************/
    /*       VIEWS       */
    /*********************/

    pub fn get_owner_id(&self) -> AccountId {
        self.owner_id.clone()
    }

    pub fn get_token_contracts(&self) -> Vec<AccountId> {
        self.token_contracts.iter().cloned().collect()
    }

    pub fn get_sale(&self, token_contract: AccountId, token_id: TokenId) -> Option<Sale> {
        self.sales
            .get(&SaleKey {
                token_contract,
                token_id,
            })
            .cloned()
    }

    pub fn get_sales(&self, from_index: Option<u32>, limit: Option<u32>) -> Vec<Sale> {
        let from = from_index.unwrap_or(0) as usize;
        let limit = limit.unwrap_or(DEFAULT_PAGE_SIZE) as usize;
        self.sales
            .values()
            .skip(from)
            .take(limit)
            .cloned()
            .collect()
    }

    pub fn get_sales_by_seller(
        &self,
        seller_id: AccountId,
        from_index: Option<u32>,
        limit: Option<u32>,
    ) -> Vec<Sale> {
        self.filter_sales(from_index, limit, |sale| sale.seller_id == seller_id)
    }

    pub fn get_sales_by_contract(
        &self,
        token_contract: AccountId,
        from_index: Option<u32>,
        limit: Option<u32>,
    ) -> Vec<Sale> {
        self.filter_sales(from_index, limit, |sale| {
            sale.token_contract == token_contract
        })
    }

    /*********************/
    /*     INTERNALS     */
    /*********************/

    fn assert_owner(&self) {
        require!(
            env::predecessor_account_id() == self.owner_id,
            "Only the owner can call this method"
        );
    }

    fn filter_sales(
        &self,
        from_index: Option<u32>,
        limit: Option<u32>,
        predicate: impl Fn(&Sale) -> bool,
    ) -> Vec<Sale> {
        let from = from_index.unwrap_or(0) as usize;
        let limit = limit.unwrap_or(DEFAULT_PAGE_SIZE) as usize;
        self.sales
            .values()
            .filter(|sale| predicate(sale))
            .skip(from)
            .take(limit)
            .cloned()
            .collect()
    }

    fn emit(event: &str, data: near_sdk::serde_json::Value) {
        let payload = near_sdk::serde_json::json!({
            "standard": "nep245-market",
            "version": "1.0.0",
            "event": event,
            "data": data,
        });
        env::log_str(&format!("EVENT_JSON:{payload}"));
    }
}

#[near_sdk::ext_contract(ext_mt)]
pub trait MultiToken {
    fn mt_transfer(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        amount: U128,
        approval: Option<(AccountId, u64)>,
        memo: Option<String>,
    );
}

#[near_sdk::ext_contract(ext_self)]
pub trait MarketCallbacks {
    fn resolve_buy(&mut self, seller_id: AccountId, buyer_id: AccountId, price: U128) -> bool;

    fn resolve_cancel(&mut self, token_contract: AccountId, token_id: TokenId) -> bool;
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{VMContextBuilder, accounts};
    use near_sdk::testing_env;

    fn token_contract() -> AccountId {
        "nft.testnet".parse().unwrap()
    }

    fn context(predecessor: AccountId) -> VMContextBuilder {
        let mut builder = VMContextBuilder::new();
        builder
            .current_account_id(accounts(0))
            .signer_account_id(predecessor.clone())
            .predecessor_account_id(predecessor);
        builder
    }

    fn new_market() -> Market {
        Market::new(None, vec![token_contract()])
    }

    fn list_token(market: &mut Market, seller: AccountId, price: u128) {
        testing_env!(context(token_contract()).build());
        let used = market.mt_on_transfer(
            seller,
            vec![accounts(1)],
            vec!["pistol-gold#1".to_string()],
            vec![U128(1)],
            format!("{{\"price\":\"{price}\"}}"),
        );
        assert_eq!(used[0].0, 0);
    }

    #[test]
    fn listing_creates_sale() {
        let mut market = new_market();
        list_token(&mut market, accounts(1), 1_000_000_000_000_000_000_000_000);

        let sale = market
            .get_sale(token_contract(), "pistol-gold#1".to_string())
            .expect("sale exists");
        assert_eq!(sale.seller_id, accounts(1));
        assert_eq!(sale.price.0, 1_000_000_000_000_000_000_000_000);
        assert_eq!(market.get_sales(None, None).len(), 1);
        assert_eq!(market.get_sales_by_seller(accounts(1), None, None).len(), 1);
    }

    #[test]
    #[should_panic(expected = "Token contract is not allowed")]
    fn listing_from_unknown_contract_fails() {
        let mut market = new_market();
        testing_env!(context(accounts(5)).build());
        market.mt_on_transfer(
            accounts(1),
            vec![accounts(1)],
            vec!["pistol-gold#1".to_string()],
            vec![U128(1)],
            "{\"price\":\"1000\"}".to_string(),
        );
    }

    #[test]
    #[should_panic(expected = "This token is already listed")]
    fn cannot_list_twice() {
        let mut market = new_market();
        list_token(&mut market, accounts(1), 1000);
        list_token(&mut market, accounts(1), 2000);
    }

    #[test]
    fn buy_removes_sale_and_needs_deposit() {
        let mut market = new_market();
        list_token(&mut market, accounts(1), 1000);

        let mut ctx = context(accounts(2));
        ctx.attached_deposit(NearToken::from_yoctonear(1000));
        testing_env!(ctx.build());
        let _ = market.buy(token_contract(), "pistol-gold#1".to_string());

        assert!(
            market
                .get_sale(token_contract(), "pistol-gold#1".to_string())
                .is_none()
        );
    }

    #[test]
    #[should_panic(expected = "Not enough NEAR")]
    fn buy_without_enough_deposit_fails() {
        let mut market = new_market();
        list_token(&mut market, accounts(1), 1000);

        testing_env!(context(accounts(2)).build());
        let _ = market.buy(token_contract(), "pistol-gold#1".to_string());
    }

    #[test]
    fn seller_can_cancel() {
        let mut market = new_market();
        list_token(&mut market, accounts(1), 1000);

        testing_env!(context(accounts(1)).build());
        let _ = market.cancel(token_contract(), "pistol-gold#1".to_string());
        // The sale is removed by the callback after the transfer succeeds.
        assert!(
            market
                .get_sale(token_contract(), "pistol-gold#1".to_string())
                .is_some()
        );
    }

    #[test]
    #[should_panic(expected = "Only the seller can cancel")]
    fn non_seller_cannot_cancel() {
        let mut market = new_market();
        list_token(&mut market, accounts(1), 1000);

        testing_env!(context(accounts(2)).build());
        let _ = market.cancel(token_contract(), "pistol-gold#1".to_string());
    }

    #[test]
    fn only_owner_manages_token_contracts() {
        testing_env!(context(accounts(0)).build());
        let mut market = new_market();
        market.add_token_contract(accounts(3));
        assert_eq!(market.get_token_contracts().len(), 2);
    }
}
