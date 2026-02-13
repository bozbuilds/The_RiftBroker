module dark_net::marketplace;

use sui::balance::Balance;
use sui::coin::{Self, Coin};
use sui::clock::Clock;
use sui::event;
use sui::sui::SUI;

// === Error constants (EPascalCase) ===

const ENotScout: u64 = 0;
const EInsufficientPayment: u64 = 1;
const EListingExpired: u64 = 2;
const EListingDelisted: u64 = 3;

// === Regular constants (ALL_CAPS) ===

#[allow(unused_const)]
const INTEL_TYPE_RESOURCE: u8 = 0;
#[allow(unused_const)]
const INTEL_TYPE_FLEET: u8 = 1;
#[allow(unused_const)]
const INTEL_TYPE_BASE: u8 = 2;
#[allow(unused_const)]
const INTEL_TYPE_ROUTE: u8 = 3;

// === Objects ===

/// Core listing. Shared object so multiple buyers can purchase concurrently.
/// Holds actual staked tokens in `stake` field (Balance<SUI>, not u64).
/// `delisted` tracks manual removal; expiry computed from created_at + decay_hours.
public struct IntelListing has key {
    id: UID,
    scout: address,
    intel_type: u8,
    system_id: u64,
    created_at: u64,
    decay_hours: u64,
    walrus_blob_id: vector<u8>,
    individual_price: u64,
    stake: Balance<SUI>,
    delisted: bool,
}

/// Proof of purchase. `key` only (NOT `store`) — non-transferable.
/// Seal policy checks receipt.buyer == requester.
public struct PurchaseReceipt has key {
    id: UID,
    listing_id: ID,
    buyer: address,
    paid_at: u64,
}

// === Events (past tense) ===

public struct IntelListed has copy, drop {
    listing_id: ID,
    scout: address,
    intel_type: u8,
    system_id: u64,
}

public struct IntelPurchased has copy, drop {
    listing_id: ID,
    buyer: address,
    price_paid: u64,
}

public struct IntelDelisted has copy, drop {
    listing_id: ID,
    scout: address,
}

// === Public functions ===

public fun create_listing(
    intel_type: u8,
    system_id: u64,
    individual_price: u64,
    decay_hours: u64,
    walrus_blob_id: vector<u8>,
    stake: Coin<SUI>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let listing = IntelListing {
        id: object::new(ctx),
        scout: ctx.sender(),
        intel_type,
        system_id,
        created_at: clock.timestamp_ms(),
        decay_hours,
        walrus_blob_id,
        individual_price,
        stake: stake.into_balance(),
        delisted: false,
    };

    event::emit(IntelListed {
        listing_id: object::id(&listing),
        scout: ctx.sender(),
        intel_type,
        system_id,
    });

    transfer::share_object(listing);
}

public fun purchase(
    listing: &mut IntelListing,
    payment: Coin<SUI>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(!listing.delisted, EListingDelisted);
    assert!(
        clock.timestamp_ms() < listing.created_at + listing.decay_hours * 3_600_000,
        EListingExpired,
    );
    assert!(payment.value() >= listing.individual_price, EInsufficientPayment);

    transfer::public_transfer(payment, listing.scout);

    let receipt = PurchaseReceipt {
        id: object::new(ctx),
        listing_id: object::id(listing),
        buyer: ctx.sender(),
        paid_at: clock.timestamp_ms(),
    };

    event::emit(IntelPurchased {
        listing_id: object::id(listing),
        buyer: ctx.sender(),
        price_paid: listing.individual_price,
    });

    transfer::transfer(receipt, ctx.sender());
}

public fun delist(
    listing: &mut IntelListing,
    ctx: &mut TxContext,
) {
    assert!(listing.scout == ctx.sender(), ENotScout);

    let refund = coin::from_balance(listing.stake.withdraw_all(), ctx);
    transfer::public_transfer(refund, listing.scout);

    listing.delisted = true;

    event::emit(IntelDelisted {
        listing_id: object::id(listing),
        scout: listing.scout,
    });
}

// === Getters ===

public fun scout(listing: &IntelListing): address { listing.scout }
public fun intel_type(listing: &IntelListing): u8 { listing.intel_type }
public fun system_id(listing: &IntelListing): u64 { listing.system_id }
public fun created_at(listing: &IntelListing): u64 { listing.created_at }
public fun decay_hours(listing: &IntelListing): u64 { listing.decay_hours }
public fun walrus_blob_id(listing: &IntelListing): vector<u8> { listing.walrus_blob_id }
public fun individual_price(listing: &IntelListing): u64 { listing.individual_price }
public fun delisted(listing: &IntelListing): bool { listing.delisted }
public fun stake_value(listing: &IntelListing): u64 { listing.stake.value() }

public fun is_expired(listing: &IntelListing, clock: &Clock): bool {
    clock.timestamp_ms() >= listing.created_at + listing.decay_hours * 3_600_000
}

// Receipt getters

public fun buyer(receipt: &PurchaseReceipt): address { receipt.buyer }
public fun listing_id(receipt: &PurchaseReceipt): ID { receipt.listing_id }
public fun paid_at(receipt: &PurchaseReceipt): u64 { receipt.paid_at }
