//! RunWorld NEP-245 collection.
//!
//! The collection is catalog based: every `catalog_id` has base metadata, a
//! global cap and an optional per-account cap. A mint creates exactly one unit
//! of a new token id `<catalog_id>#<serial>` and stores only
//! `TokenInfo { owner_id, catalog_id, serial }`, so the metadata JSON is not
//! duplicated per token.
//!
//! Transfer semantics are the same as the reference NEP-245 contract. Approval
//! Management is intentionally NOT implemented: the marketplace uses escrow
//! (`mt_transfer_call`), so approvals are not needed.

use near_sdk::json_types::U128;
use near_sdk::store::{IterableMap, LookupMap};
use near_sdk::{
    AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise, env, near, require,
};

pub type TokenId = String;

/// Kept for ABI compatibility with the standard. Approvals are not supported.
pub type Approval = (AccountId, u64);

const GAS_FOR_MT_ON_TRANSFER: Gas = Gas::from_tgas(30);
const GAS_FOR_MT_RESOLVE_TRANSFER: Gas = Gas::from_tgas(20);

/// One NEAR byte of storage, as of protocol 85 (0.00001 NEAR).
const STORAGE_COST_PER_BYTE: NearToken = NearToken::from_yoctonear(10_000_000_000_000_000_000);

#[derive(BorshStorageKey)]
#[near(serializers = [borsh])]
enum StorageKey {
    Tokens,
    Supplies,
    Balances,
    CatalogCaps,
    CatalogMetadata,
    CatalogMinted,
    AccountMinted,
}

/// Metadata for a single token id (NEP-245 Metadata extension).
#[near(serializers = [borsh, json])]
#[derive(Clone, Default)]
pub struct TokenMetadata {
    pub title: Option<String>,
    pub description: Option<String>,
    pub media: Option<String>,
    pub media_hash: Option<String>,
    pub issued_at: Option<String>,
    pub expires_at: Option<String>,
    pub starts_at: Option<String>,
    pub updated_at: Option<String>,
    pub extra: Option<String>,
    pub reference: Option<String>,
    pub reference_hash: Option<String>,
}

/// Base (class level) metadata. One class per catalog item.
#[near(serializers = [json])]
#[derive(Clone)]
pub struct BaseTokenMetadata {
    pub name: String,
    pub id: String,
    pub symbol: Option<String>,
    pub icon: Option<String>,
    pub decimals: Option<String>,
    pub base_uri: Option<String>,
    pub reference: Option<String>,
    pub reference_hash: Option<String>,
    pub copies: Option<u64>,
}

#[near(serializers = [json])]
#[derive(Clone)]
pub struct ContractMetadata {
    pub spec: String,
    pub name: String,
}

/// `MTToken` as returned by `mt_token`, `mt_tokens` and `mt_tokens_for_owner`.
#[near(serializers = [json])]
#[derive(Clone)]
pub struct Token {
    pub token_id: TokenId,
    pub owner_id: Option<AccountId>,
    pub token_metadata: Option<TokenMetadata>,
    pub base_metadata_id: String,
}

#[near(serializers = [json])]
#[derive(Clone)]
pub struct TokenMetadataAll {
    pub base: BaseTokenMetadata,
    pub token: TokenMetadata,
}

/// Emission limits for one catalog item. `per_account_cap == 0` means unlimited.
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct CatalogCap {
    pub catalog_id: String,
    pub cap: u32,
    pub per_account_cap: u32,
}

/// Base metadata stored once per catalog item.
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct CatalogMetadata {
    pub catalog_id: String,
    pub title: String,
    pub description: Option<String>,
    pub media: Option<String>,
    pub reference: Option<String>,
    pub extra: Option<String>,
}

/// Compact per-token storage: no metadata JSON repeated here.
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct TokenInfo {
    pub owner_id: AccountId,
    pub catalog_id: String,
    pub serial: u32,
}

#[near(serializers = [json])]
#[derive(Clone)]
pub struct CatalogSupply {
    pub catalog_id: String,
    pub cap: u32,
    pub minted: u32,
    pub per_account_cap: u32,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    owner_id: AccountId,
    name: String,
    tokens: IterableMap<TokenId, TokenInfo>,
    supplies: LookupMap<TokenId, u128>,
    balances: IterableMap<(AccountId, TokenId), u128>,
    catalog_caps: IterableMap<String, CatalogCap>,
    catalog_metadata: IterableMap<String, CatalogMetadata>,
    /// Monotonic emission counter per catalog. Burning does not decrease it.
    catalog_minted: LookupMap<String, u32>,
    account_minted: LookupMap<(AccountId, String), u32>,
}

#[near]
impl Contract {
    /// Deploy + init in the same transaction, e.g.
    /// `cargo near deploy <account> with-init-call init json-args '...' ...`
    #[init]
    #[private]
    pub fn init(
        name: String,
        owner_id: Option<AccountId>,
        catalog_caps: Vec<CatalogCap>,
        catalog_metadata: Vec<CatalogMetadata>,
    ) -> Self {
        let mut contract = Self {
            owner_id: owner_id.unwrap_or_else(env::current_account_id),
            name,
            tokens: IterableMap::new(StorageKey::Tokens),
            supplies: LookupMap::new(StorageKey::Supplies),
            balances: IterableMap::new(StorageKey::Balances),
            catalog_caps: IterableMap::new(StorageKey::CatalogCaps),
            catalog_metadata: IterableMap::new(StorageKey::CatalogMetadata),
            catalog_minted: LookupMap::new(StorageKey::CatalogMinted),
            account_minted: LookupMap::new(StorageKey::AccountMinted),
        };

        for cap in catalog_caps {
            require!(
                !cap.catalog_id.contains('#'),
                "Catalog id cannot contain '#'"
            );
            contract
                .catalog_caps
                .insert(cap.catalog_id.clone(), cap);
        }
        for metadata in catalog_metadata {
            require!(
                !metadata.catalog_id.contains('#'),
                "Catalog id cannot contain '#'"
            );
            contract
                .catalog_metadata
                .insert(metadata.catalog_id.clone(), metadata);
        }
        contract.catalog_caps.flush();
        contract.catalog_metadata.flush();
        contract
    }

    /*********************/
    /*    MINT / BURN    */
    /*********************/

    /// Mints one unit of a new serial for `catalog_id` to `owner_id`
    /// (defaults to the caller). The attached deposit must cover the storage
    /// used by the new token; the excess is refunded to the caller.
    #[payable]
    pub fn mint(&mut self, owner_id: Option<AccountId>, catalog_id: String) -> TokenId {
        let initial_storage_usage = env::storage_usage();
        let caller = env::predecessor_account_id();
        let owner_id = owner_id.unwrap_or_else(|| caller.clone());

        let cap = self
            .catalog_caps
            .get(&catalog_id)
            .cloned()
            .unwrap_or_else(|| env::panic_str("Catalog item is not enabled"));
        require!(
            self.catalog_metadata.get(&catalog_id).is_some(),
            "Catalog metadata is missing"
        );

        let minted = self.catalog_minted.get(&catalog_id).copied().unwrap_or(0);
        require!(minted < cap.cap, "Mint limit reached for this item");

        if cap.per_account_cap > 0 {
            let account_minted = self
                .account_minted
                .get(&(owner_id.clone(), catalog_id.clone()))
                .copied()
                .unwrap_or(0);
            require!(
                account_minted < cap.per_account_cap,
                "Account mint limit reached"
            );
            self.account_minted
                .insert((owner_id.clone(), catalog_id.clone()), account_minted + 1);
        }

        let serial = minted + 1;
        let token_id: TokenId = format!("{catalog_id}#{serial}");

        self.catalog_minted.insert(catalog_id.clone(), serial);
        self.tokens.insert(
            token_id.clone(),
            TokenInfo {
                owner_id: owner_id.clone(),
                catalog_id: catalog_id.clone(),
                serial,
            },
        );
        self.supplies.insert(token_id.clone(), 1);
        self.internal_set_balance(&owner_id, &token_id, 1);

        self.catalog_minted.flush();
        self.account_minted.flush();
        self.tokens.flush();
        self.supplies.flush();
        self.balances.flush();

        Self::emit(
            "mt_mint",
            near_sdk::serde_json::json!([{
                "owner_id": owner_id,
                "token_ids": [token_id],
                "amounts": [U128(1)],
            }]),
        );

        Self::refund_storage(initial_storage_usage, caller);
        token_id
    }

    /// Burns `amount` tokens from the caller balance. Emission counters are
    /// monotonic: burning does not free cap and does not reuse serials.
    pub fn burn(&mut self, token_id: TokenId, amount: U128) {
        let account_id = env::predecessor_account_id();
        require!(amount.0 > 0, "Amount must be greater than 0");
        let balance = self.balance_of(&account_id, &token_id);
        require!(balance >= amount.0, "Not enough tokens to burn");

        self.internal_set_balance(&account_id, &token_id, balance - amount.0);
        self.balances.flush();

        if let Some(supply) = self.supplies.get(&token_id) {
            let new_supply = supply.saturating_sub(amount.0);
            self.supplies.insert(token_id.clone(), new_supply);
        }
        self.supplies.flush();

        Self::emit(
            "mt_burn",
            near_sdk::serde_json::json!([{
                "owner_id": account_id,
                "token_ids": [token_id],
                "amounts": [amount],
            }]),
        );
    }

    /*********************/
    /*   CORE TRANSFERS  */
    /*********************/

    /// Simple transfer of `amount` of `token_id` to `receiver_id`.
    /// Requires exactly 1 yoctoNEAR for security.
    #[payable]
    pub fn mt_transfer(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        amount: U128,
        approval: Option<Approval>,
        memo: Option<String>,
    ) {
        Self::require_one_yocto();
        Self::reject_approval(approval.is_some());
        let sender_id = env::predecessor_account_id();
        self.internal_transfer(
            &sender_id,
            &receiver_id,
            &[token_id],
            &[amount],
            memo.as_deref(),
        );
    }

    /// Batch version of `mt_transfer`.
    #[payable]
    pub fn mt_batch_transfer(
        &mut self,
        receiver_id: AccountId,
        token_ids: Vec<TokenId>,
        amounts: Vec<U128>,
        approvals: Option<Vec<Option<Approval>>>,
        memo: Option<String>,
    ) {
        Self::require_one_yocto();
        Self::reject_approval(approvals.is_some());
        let sender_id = env::predecessor_account_id();
        self.internal_transfer(
            &sender_id,
            &receiver_id,
            &token_ids,
            &amounts,
            memo.as_deref(),
        );
    }

    /// Transfers 1 token and calls `mt_on_transfer` on the receiver.
    /// Returns the promise for the resolve step (unused amounts are refunded).
    #[payable]
    pub fn mt_transfer_call(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        amount: U128,
        approval: Option<Approval>,
        memo: Option<String>,
        msg: String,
    ) -> Promise {
        Self::require_one_yocto();
        Self::reject_approval(approval.is_some());
        let sender_id = env::predecessor_account_id();

        self.internal_transfer(
            &sender_id,
            &receiver_id,
            std::slice::from_ref(&token_id),
            &[amount],
            memo.as_deref(),
        );

        self.internal_transfer_call(sender_id, receiver_id, vec![token_id], vec![amount], msg)
    }

    /// Batch version of `mt_transfer_call`.
    #[payable]
    pub fn mt_batch_transfer_call(
        &mut self,
        receiver_id: AccountId,
        token_ids: Vec<TokenId>,
        amounts: Vec<U128>,
        approvals: Option<Vec<Option<Approval>>>,
        memo: Option<String>,
        msg: String,
    ) -> Promise {
        Self::require_one_yocto();
        Self::reject_approval(approvals.is_some());
        let sender_id = env::predecessor_account_id();

        self.internal_transfer(
            &sender_id,
            &receiver_id,
            &token_ids,
            &amounts,
            memo.as_deref(),
        );

        self.internal_transfer_call(sender_id, receiver_id, token_ids, amounts, msg)
    }

    /// Callback of every `*_transfer_call`. Only the contract itself may call it.
    #[private]
    pub fn mt_resolve_transfer(
        &mut self,
        sender_id: AccountId,
        receiver_id: AccountId,
        token_ids: Vec<TokenId>,
        amounts: Vec<U128>,
        approvals: Option<Vec<Option<Approval>>>,
    ) -> Vec<U128> {
        Self::reject_approval(approvals.is_some());
        require!(
            token_ids.len() == amounts.len(),
            "token_ids and amounts length mismatch"
        );

        let requested_amounts: Vec<u128> = amounts.iter().map(|amount| amount.0).collect();

        // `mt_on_transfer` returns the UNUSED amounts. If the receiver promise
        // failed, everything is unused -> refund it all.
        let unused: Vec<u128> = match env::promise_result_checked(0, 10 * 1024) {
            Ok(data) => near_sdk::serde_json::from_slice::<Vec<U128>>(&data)
                .map(|values| values.into_iter().map(|value| value.0).collect())
                .unwrap_or_else(|_| requested_amounts),
            Err(_) => requested_amounts,
        };

        let mut spent = Vec::with_capacity(token_ids.len());
        for (index, token_id) in token_ids.iter().enumerate() {
            let requested = amounts[index].0;
            let unused_amount = unused
                .get(index)
                .copied()
                .unwrap_or(requested)
                .min(requested);
            spent.push(U128(requested - unused_amount));

            if unused_amount > 0 {
                // Only refund what the receiver still owns (it may have moved some).
                let receiver_balance = self.balance_of(&receiver_id, token_id);
                let refundable = unused_amount.min(receiver_balance);
                if refundable > 0 {
                    self.internal_transfer(
                        &receiver_id,
                        &sender_id,
                        std::slice::from_ref(token_id),
                        &[U128(refundable)],
                        None,
                    );
                }
            }
        }
        self.balances.flush();
        spent
    }

    /*********************/
    /*       VIEWS       */
    /*********************/

    pub fn mt_balance_of(&self, account_id: AccountId, token_id: TokenId) -> U128 {
        U128(self.balance_of(&account_id, &token_id))
    }

    pub fn mt_batch_balance_of(&self, account_id: AccountId, token_ids: Vec<TokenId>) -> Vec<U128> {
        token_ids
            .iter()
            .map(|token_id| U128(self.balance_of(&account_id, token_id)))
            .collect()
    }

    pub fn mt_supply(&self, token_id: TokenId) -> Option<U128> {
        self.supplies.get(&token_id).map(|supply| U128(*supply))
    }

    pub fn mt_batch_supply(&self, token_ids: Vec<TokenId>) -> Vec<Option<U128>> {
        token_ids
            .iter()
            .map(|token_id| self.supplies.get(token_id).map(|supply| U128(*supply)))
            .collect()
    }

    pub fn mt_token(&self, token_ids: Vec<TokenId>) -> Vec<Option<Token>> {
        token_ids
            .iter()
            .map(|token_id| self.token_view(token_id))
            .collect()
    }

    /// Enumeration extension: all tokens, paginated.
    pub fn mt_tokens(&self, from_index: Option<U128>, limit: Option<u32>) -> Vec<Token> {
        let from = from_index.map(|index| index.0 as usize).unwrap_or(0);
        let limit = limit.unwrap_or(50) as usize;
        self.tokens
            .keys()
            .skip(from)
            .take(limit)
            .filter_map(|token_id| self.token_view(token_id))
            .collect()
    }

    /// Enumeration extension: tokens owned by an account, paginated.
    ///
    /// This iterates balances, which is fine for a small collection.
    pub fn mt_tokens_for_owner(
        &self,
        account_id: AccountId,
        from_index: Option<U128>,
        limit: Option<u32>,
    ) -> Vec<Token> {
        let from = from_index.map(|index| index.0 as usize).unwrap_or(0);
        let limit = limit.unwrap_or(50) as usize;
        self.balances
            .keys()
            .filter(|(owner, _)| owner == &account_id)
            .map(|(_, token_id)| token_id)
            .skip(from)
            .take(limit)
            .filter_map(|token_id| self.token_view(token_id))
            .collect()
    }

    pub fn mt_metadata_contract(&self) -> ContractMetadata {
        ContractMetadata {
            spec: "mt-1.0.0".to_string(),
            name: self.name.clone(),
        }
    }

    pub fn mt_metadata_token_by_token_id(&self, token_ids: Vec<TokenId>) -> Vec<TokenMetadata> {
        token_ids
            .iter()
            .map(|token_id| {
                let info = self
                    .tokens
                    .get(token_id)
                    .cloned()
                    .unwrap_or_else(|| env::panic_str("Token does not exist"));
                let base = self
                    .catalog_metadata
                    .get(&info.catalog_id)
                    .cloned()
                    .unwrap_or_else(|| env::panic_str("Catalog metadata is missing"));
                Self::token_metadata_from(&info, &base)
            })
            .collect()
    }

    pub fn mt_metadata_base_by_token_id(&self, token_ids: Vec<TokenId>) -> Vec<BaseTokenMetadata> {
        token_ids
            .iter()
            .map(|token_id| {
                let info = self
                    .tokens
                    .get(token_id)
                    .unwrap_or_else(|| env::panic_str("Token does not exist"));
                self.base_metadata(&info.catalog_id)
                    .unwrap_or_else(|| env::panic_str("Catalog metadata is missing"))
            })
            .collect()
    }

    /// In this contract the base metadata id is the `catalog_id`.
    pub fn mt_metadata_base_by_metadata_id(
        &self,
        base_metadata_ids: Vec<String>,
    ) -> Vec<BaseTokenMetadata> {
        base_metadata_ids
            .iter()
            .map(|catalog_id| {
                self.base_metadata(catalog_id)
                    .unwrap_or_else(|| env::panic_str("Catalog metadata is missing"))
            })
            .collect()
    }

    pub fn mt_metadata_token_all(&self, token_ids: Vec<TokenId>) -> Vec<TokenMetadataAll> {
        token_ids
            .iter()
            .map(|token_id| {
                let info = self
                    .tokens
                    .get(token_id)
                    .cloned()
                    .unwrap_or_else(|| env::panic_str("Token does not exist"));
                let base_meta = self
                    .catalog_metadata
                    .get(&info.catalog_id)
                    .cloned()
                    .unwrap_or_else(|| env::panic_str("Catalog metadata is missing"));
                TokenMetadataAll {
                    base: self
                        .base_metadata(&info.catalog_id)
                        .unwrap_or_else(|| env::panic_str("Catalog metadata is missing")),
                    token: Self::token_metadata_from(&info, &base_meta),
                }
            })
            .collect()
    }

    pub fn mt_tokens_base_metadata_all(
        &self,
        from_index: Option<U128>,
        limit: Option<u32>,
    ) -> Vec<BaseTokenMetadata> {
        let from = from_index.map(|index| index.0 as usize).unwrap_or(0);
        let limit = limit.unwrap_or(50) as usize;
        self.catalog_metadata
            .keys()
            .skip(from)
            .take(limit)
            .filter_map(|catalog_id| self.base_metadata(catalog_id))
            .collect()
    }

    pub fn get_owner_id(&self) -> AccountId {
        self.owner_id.clone()
    }

    pub fn get_catalog_metadata(&self, catalog_id: String) -> Option<CatalogMetadata> {
        self.catalog_metadata.get(&catalog_id).cloned()
    }

    pub fn get_catalog_supply(&self, catalog_id: String) -> Option<CatalogSupply> {
        let cap = self.catalog_caps.get(&catalog_id)?;
        let minted = self.catalog_minted.get(&catalog_id).copied().unwrap_or(0);
        Some(CatalogSupply {
            catalog_id,
            cap: cap.cap,
            minted,
            per_account_cap: cap.per_account_cap,
        })
    }

    pub fn get_catalog_supplies(&self, catalog_ids: Vec<String>) -> Vec<CatalogSupply> {
        catalog_ids
            .iter()
            .filter_map(|catalog_id| self.get_catalog_supply(catalog_id.clone()))
            .collect()
    }

    pub fn get_account_minted(&self, account_id: AccountId, catalog_ids: Vec<String>) -> Vec<u32> {
        catalog_ids
            .iter()
            .map(|catalog_id| {
                self.account_minted
                    .get(&(account_id.clone(), catalog_id.clone()))
                    .copied()
                    .unwrap_or(0)
            })
            .collect()
    }

    /*********************/
    /*   ADMIN (OWNER)   */
    /*********************/

    pub fn set_catalog_cap(&mut self, catalog_id: String, cap: u32, per_account_cap: u32) {
        self.assert_owner();
        require!(
            !catalog_id.contains('#'),
            "Catalog id cannot contain '#'"
        );
        let minted = self.catalog_minted.get(&catalog_id).copied().unwrap_or(0);
        require!(cap >= minted, "Cap cannot be lower than minted supply");
        self.catalog_caps.insert(
            catalog_id.clone(),
            CatalogCap {
                catalog_id,
                cap,
                per_account_cap,
            },
        );
        self.catalog_caps.flush();
    }

    pub fn set_catalog_metadata(&mut self, metadata: CatalogMetadata) {
        self.assert_owner();
        require!(
            !metadata.catalog_id.contains('#'),
            "Catalog id cannot contain '#'"
        );
        self.catalog_metadata
            .insert(metadata.catalog_id.clone(), metadata);
        self.catalog_metadata.flush();
    }

    /*********************/
    /*     INTERNALS     */
    /*********************/

    fn balance_of(&self, account_id: &AccountId, token_id: &TokenId) -> u128 {
        self.balances
            .get(&(account_id.clone(), token_id.clone()))
            .copied()
            .unwrap_or(0)
    }

    fn internal_set_balance(&mut self, account_id: &AccountId, token_id: &TokenId, amount: u128) {
        let key = (account_id.clone(), token_id.clone());
        if amount == 0 {
            self.balances.remove(&key);
        } else {
            self.balances.insert(key, amount);
        }
    }

    fn internal_transfer(
        &mut self,
        sender_id: &AccountId,
        receiver_id: &AccountId,
        token_ids: &[TokenId],
        amounts: &[U128],
        memo: Option<&str>,
    ) {
        require!(
            token_ids.len() == amounts.len(),
            "token_ids and amounts length mismatch"
        );
        require!(!token_ids.is_empty(), "Empty transfer");
        require!(sender_id != receiver_id, "Cannot transfer to yourself");

        // Debit/credit sequentially: duplicated token ids are handled correctly.
        for (token_id, amount) in token_ids.iter().zip(amounts) {
            require!(amount.0 > 0, "Amount must be greater than 0");
            let sender_balance = self.balance_of(sender_id, token_id);
            require!(
                sender_balance >= amount.0,
                format!("Not enough balance for token {token_id}")
            );

            self.internal_set_balance(sender_id, token_id, sender_balance - amount.0);
            let receiver_balance = self.balance_of(receiver_id, token_id);
            self.internal_set_balance(receiver_id, token_id, receiver_balance + amount.0);
        }
        self.balances.flush();

        Self::emit(
            "mt_transfer",
            near_sdk::serde_json::json!([{
                "old_owner_id": sender_id,
                "new_owner_id": receiver_id,
                "token_ids": token_ids,
                "amounts": amounts,
                "memo": memo,
            }]),
        );
    }

    fn internal_transfer_call(
        &self,
        sender_id: AccountId,
        receiver_id: AccountId,
        token_ids: Vec<TokenId>,
        amounts: Vec<U128>,
        msg: String,
    ) -> Promise {
        let previous_owner_ids = vec![sender_id.clone(); token_ids.len()];

        ext_mt_receiver::ext(receiver_id.clone())
            .with_static_gas(GAS_FOR_MT_ON_TRANSFER)
            .mt_on_transfer(
                sender_id.clone(),
                previous_owner_ids,
                token_ids.clone(),
                amounts.clone(),
                msg,
            )
            .then(
                ext_self::ext(env::current_account_id())
                    .with_static_gas(GAS_FOR_MT_RESOLVE_TRANSFER)
                    .mt_resolve_transfer(sender_id, receiver_id, token_ids, amounts, None),
            )
    }

    fn token_view(&self, token_id: &TokenId) -> Option<Token> {
        let info = self.tokens.get(token_id)?;
        let base = self.catalog_metadata.get(&info.catalog_id)?;
        Some(Token {
            token_id: token_id.clone(),
            owner_id: self.single_owner(token_id),
            token_metadata: Some(Self::token_metadata_from(info, base)),
            base_metadata_id: info.catalog_id.clone(),
        })
    }

    fn token_metadata_from(info: &TokenInfo, base: &CatalogMetadata) -> TokenMetadata {
        let extra = near_sdk::serde_json::json!({
            "catalogId": info.catalog_id,
            "serial": info.serial,
        })
        .to_string();
        TokenMetadata {
            title: Some(base.title.clone()),
            description: base.description.clone(),
            media: base.media.clone(),
            media_hash: None,
            issued_at: None,
            expires_at: None,
            starts_at: None,
            updated_at: None,
            extra: Some(extra),
            reference: base.reference.clone(),
            reference_hash: None,
        }
    }

    fn single_owner(&self, token_id: &TokenId) -> Option<AccountId> {
        if self.supplies.get(token_id).copied().unwrap_or(0) != 1 {
            return None;
        }
        self.balances
            .keys()
            .find(|(_, id)| id == token_id)
            .map(|(owner, _)| owner.clone())
    }

    fn base_metadata(&self, catalog_id: &str) -> Option<BaseTokenMetadata> {
        let metadata = self.catalog_metadata.get(catalog_id)?;
        let cap = self.catalog_caps.get(catalog_id);
        Some(BaseTokenMetadata {
            name: metadata.title.clone(),
            id: catalog_id.to_string(),
            symbol: Some("RW".to_string()),
            icon: metadata.media.clone(),
            decimals: Some("0".to_string()),
            base_uri: None,
            reference: metadata.reference.clone(),
            reference_hash: None,
            copies: cap.map(|cap| cap.cap as u64),
        })
    }

    fn assert_owner(&self) {
        require!(
            env::predecessor_account_id() == self.owner_id,
            "Only the owner can call this method"
        );
    }

    fn reject_approval(has_approval: bool) {
        require!(
            !has_approval,
            "Approval Management is not supported by this contract"
        );
    }

    fn require_one_yocto() {
        require!(
            env::attached_deposit() == NearToken::from_yoctonear(1),
            "Requires attached deposit of exactly 1 yoctoNEAR"
        );
    }

    fn refund_storage(initial_storage_usage: u64, account_id: AccountId) {
        let used = env::storage_usage().saturating_sub(initial_storage_usage);
        let required = STORAGE_COST_PER_BYTE
            .saturating_mul(used as u128)
            .as_yoctonear();
        let attached = env::attached_deposit().as_yoctonear();
        require!(
            attached >= required,
            format!("Not enough deposit to cover storage: {required} yoctoNEAR required")
        );
        let refund = attached - required;
        if refund > 1 {
            let _ = Promise::new(account_id).transfer(NearToken::from_yoctonear(refund));
        }
    }

    fn emit(event: &str, data: near_sdk::serde_json::Value) {
        let payload = near_sdk::serde_json::json!({
            "standard": "nep245",
            "version": "1.0.0",
            "event": event,
            "data": data,
        });
        env::log_str(&format!("EVENT_JSON:{payload}"));
    }
}

/*********************/
/*  EXT CONTRACTS    */
/*********************/

#[near_sdk::ext_contract(ext_mt_receiver)]
pub trait MtReceiver {
    fn mt_on_transfer(
        &mut self,
        sender_id: AccountId,
        previous_owner_ids: Vec<AccountId>,
        token_ids: Vec<TokenId>,
        amounts: Vec<U128>,
        msg: String,
    ) -> Vec<U128>;
}

#[near_sdk::ext_contract(ext_self)]
pub trait MtResolver {
    fn mt_resolve_transfer(
        &mut self,
        sender_id: AccountId,
        receiver_id: AccountId,
        token_ids: Vec<TokenId>,
        amounts: Vec<U128>,
        approvals: Option<Vec<Option<Approval>>>,
    ) -> Vec<U128>;
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{VMContextBuilder, accounts};
    use near_sdk::{PromiseResult, testing_env};

    fn context(predecessor: AccountId) -> VMContextBuilder {
        let mut builder = VMContextBuilder::new();
        builder
            .current_account_id(accounts(0))
            .signer_account_id(predecessor.clone())
            .predecessor_account_id(predecessor);
        builder
    }

    fn caps() -> Vec<CatalogCap> {
        vec![CatalogCap {
            catalog_id: "pistol-gold".to_string(),
            cap: 2,
            per_account_cap: 1,
        }]
    }

    fn metadata() -> Vec<CatalogMetadata> {
        vec![CatalogMetadata {
            catalog_id: "pistol-gold".to_string(),
            title: "Golden Pistol".to_string(),
            description: Some("A golden pistol".to_string()),
            media: Some("https://example.test/pistol.png".to_string()),
            reference: Some("runworld://catalog/pistol-gold".to_string()),
            extra: Some("{\"accent\":\"#fbbf24\"}".to_string()),
        }]
    }

    fn new_contract() -> Contract {
        Contract::init(
            "RunWorld Collection".to_string(),
            Some(accounts(0)),
            caps(),
            metadata(),
        )
    }

    fn mint_one(contract: &mut Contract, account: AccountId) -> TokenId {
        let mut ctx = context(account);
        ctx.attached_deposit(NearToken::from_millinear(10));
        testing_env!(ctx.build());
        contract.mint(None, "pistol-gold".to_string())
    }

    #[test]
    fn mint_creates_serial_token() {
        let mut contract = new_contract();
        let token_id = mint_one(&mut contract, accounts(1));

        assert_eq!(token_id, "pistol-gold#1");
        assert_eq!(
            contract
                .mt_balance_of(accounts(1), token_id.clone())
                .0,
            1
        );
        assert_eq!(contract.mt_supply(token_id.clone()).unwrap().0, 1);

        let view = contract
            .mt_token(vec![token_id.clone()])
            .into_iter()
            .next()
            .flatten()
            .expect("token exists");
        assert_eq!(view.base_metadata_id, "pistol-gold");
        assert_eq!(view.token_metadata.unwrap().title.unwrap(), "Golden Pistol");

        assert_eq!(contract.mt_tokens(None, None).len(), 1);
        assert_eq!(
            contract
                .mt_tokens_for_owner(accounts(1), None, None)
                .len(),
            1
        );
        assert_eq!(
            contract.get_catalog_supply("pistol-gold".to_string()).unwrap().minted,
            1
        );
    }

    #[test]
    fn mint_requires_deposit() {
        testing_env!(context(accounts(1)).build());
        let mut contract = new_contract();
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            contract.mint(None, "pistol-gold".to_string())
        }));
        assert!(result.is_err());
    }

    #[test]
    #[should_panic(expected = "Catalog item is not enabled")]
    fn mint_unknown_catalog_fails() {
        let mut ctx = context(accounts(1));
        ctx.attached_deposit(NearToken::from_millinear(10));
        testing_env!(ctx.build());
        let mut contract = new_contract();
        contract.mint(None, "unknown".to_string());
    }

    #[test]
    #[should_panic(expected = "Mint limit reached for this item")]
    fn global_cap_is_enforced() {
        let mut contract = new_contract();
        mint_one(&mut contract, accounts(1));
        mint_one(&mut contract, accounts(2));
        mint_one(&mut contract, accounts(3));
    }

    #[test]
    #[should_panic(expected = "Account mint limit reached")]
    fn account_cap_is_enforced() {
        let mut contract = new_contract();
        mint_one(&mut contract, accounts(1));
        mint_one(&mut contract, accounts(1));
    }

    #[test]
    fn burn_does_not_free_cap_or_reuse_serial() {
        let mut contract = new_contract();
        let first = mint_one(&mut contract, accounts(1));

        testing_env!(context(accounts(1)).build());
        contract.burn(first, U128(1));

        assert_eq!(
            contract.get_catalog_supply("pistol-gold".to_string()).unwrap().minted,
            1
        );

        let second = mint_one(&mut contract, accounts(2));
        assert_eq!(second, "pistol-gold#2");
    }

    #[test]
    fn transfer_moves_balance() {
        let mut contract = new_contract();
        let token_id = mint_one(&mut contract, accounts(1));

        let mut ctx = context(accounts(1));
        ctx.attached_deposit(NearToken::from_yoctonear(1));
        testing_env!(ctx.build());
        contract.mt_transfer(accounts(2), token_id.clone(), U128(1), None, None);

        assert_eq!(
            contract
                .mt_balance_of(accounts(1), token_id.clone())
                .0,
            0
        );
        assert_eq!(contract.mt_balance_of(accounts(2), token_id).0, 1);
    }

    #[test]
    fn owner_can_update_cap_but_not_below_minted() {
        let mut contract = new_contract();
        mint_one(&mut contract, accounts(1));

        testing_env!(context(accounts(0)).build());
        contract.set_catalog_cap("pistol-gold".to_string(), 5, 3);
        assert_eq!(
            contract.get_catalog_supply("pistol-gold".to_string()).unwrap().cap,
            5
        );

        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            contract.set_catalog_cap("pistol-gold".to_string(), 0, 3)
        }));
        assert!(result.is_err());
    }

    #[test]
    #[should_panic(expected = "Only the owner can call this method")]
    fn non_owner_cannot_update_cap() {
        let mut contract = new_contract();
        testing_env!(context("eve.testnet".parse().unwrap()).build());
        contract.set_catalog_cap("pistol-gold".to_string(), 5, 3);
    }

    #[test]
    fn account_minted_view_tracks_mints() {
        let mut contract = new_contract();
        mint_one(&mut contract, accounts(1));
        assert_eq!(
            contract.get_account_minted(accounts(1), vec!["pistol-gold".to_string()]),
            vec![1]
        );
        assert_eq!(
            contract.get_account_minted(accounts(2), vec!["pistol-gold".to_string()]),
            vec![0]
        );
    }

    #[test]
    fn resolve_transfer_refunds_unused_amounts() {
        let mut contract = new_contract();
        let token_id = mint_one(&mut contract, accounts(1));

        testing_env!(context(accounts(1)).build());
        contract.internal_transfer(
            &accounts(1),
            &accounts(2),
            std::slice::from_ref(&token_id),
            &[U128(1)],
            None,
        );

        let unused = near_sdk::serde_json::to_vec(&vec![U128(1)]).unwrap();
        testing_env!(
            context(accounts(0)).build(),
            near_sdk::test_vm_config(),
            near_sdk::RuntimeFeesConfig::test(),
            Default::default(),
            vec![PromiseResult::Successful(unused)],
        );
        let spent = contract.mt_resolve_transfer(
            accounts(1),
            accounts(2),
            vec![token_id.clone()],
            vec![U128(1)],
            None,
        );

        assert_eq!(spent[0].0, 0);
        assert_eq!(
            contract
                .mt_balance_of(accounts(1), token_id.clone())
                .0,
            1
        );
        assert_eq!(contract.mt_balance_of(accounts(2), token_id).0, 0);
    }

    #[test]
    fn transfer_call_moves_balance() {
        let mut contract = new_contract();
        let token_id = mint_one(&mut contract, accounts(1));

        let mut ctx = context(accounts(1));
        ctx.attached_deposit(NearToken::from_yoctonear(1));
        testing_env!(ctx.build());
        let _ = contract.mt_transfer_call(
            accounts(2),
            token_id.clone(),
            U128(1),
            None,
            None,
            "{}".to_string(),
        );

        assert_eq!(contract.mt_balance_of(accounts(2), token_id).0, 1);
    }
}
