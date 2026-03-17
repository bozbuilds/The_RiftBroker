module rift_broker::marketplace;

use sui::balance::Balance;
use sui::coin::{Self, Coin};
use sui::clock::Clock;
use sui::event;
use sui::sui::SUI;
use sui::bcs;
use sui::groth16;

// === Error constants (EPascalCase) ===

const ENotScout: u64 = 0;
const EInsufficientPayment: u64 = 1;
const EListingExpired: u64 = 2;
const EListingDelisted: u64 = 3;
const ENotBuyer: u64 = 4;
const EWrongListing: u64 = 5;
const EBlobIdAlreadySet: u64 = 6;
const EInvalidIntelType: u64 = 7;
const EDecayTooLarge: u64 = 8;
const EInvalidLocationProof: u64 = 9;
const EDecayTooSmall: u64 = 10;
const EStakeTooLow: u64 = 11;
const EPriceTooLow: u64 = 12;
const EAlreadyDelisted: u64 = 13;
const EListingNotExpired: u64 = 14;

// === Regular constants (ALL_CAPS) ===

const MAX_DECAY_HOURS: u64 = 8760; // 1 year
const MIN_DECAY_HOURS: u64 = 1;
const MIN_PRICE: u64 = 1;
const MIN_STAKE: u64 = 1;

#[allow(unused_const)]
const INTEL_TYPE_RESOURCE: u8 = 0;
#[allow(unused_const)]
const INTEL_TYPE_FLEET: u8 = 1;
#[allow(unused_const)]
const INTEL_TYPE_BASE: u8 = 2;
#[allow(unused_const)]
const INTEL_TYPE_ROUTE: u8 = 3;

// === One-Time Witness ===

public struct MARKETPLACE has drop {}

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
    location_proof_hash: vector<u8>,  // empty = unverified; non-empty = valid proof was verified at creation
}

/// Shared object holding the Groth16 verification key for the location attestation circuit.
/// Created once at package publish via init(). Object ID stored in frontend constants.
public struct LocationVKey has key {
    id: UID,
    vkey_bytes: vector<u8>,
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

public struct StakeReclaimed has copy, drop {
    listing_id: ID,
    scout: address,
    amount: u64,
}

public struct VerifiedIntelListed has copy, drop {
    listing_id: ID,
    scout: address,
}

// === Init ===

fun init(_otw: MARKETPLACE, ctx: &mut TxContext) {
    let vkey = LocationVKey {
        id: object::new(ctx),
        vkey_bytes: x"c7e253d6dbb0b365b15775ae9f8aa0ffcc1c8cde0bd7a4e8c0b376b0d92952a444d2615ebda233e141f4ca0a1270e1269680b20507d55f6872540af6c1bc2424dba1298a9727ff392b6f7f48b3e88e20cf925b7024be9992d3bbfae8820a0907edf692d95cbdde46ddda5ef7d422436779445c5e66006a42761e1f12efde0018c212f3aeb785e49712e7a9353349aaf1255dfb31b7bf60723a480d9293938e196108497b1768853e7bb6bd90424b49d19af63b50d70c31295b66199e91324c27096caacdf821d4d8f50df1766a9198c7d781b5def0984f3357eb5f008ecf351d0400000000000000d020745c5d9aa5e987327c45664f758f99c8b45f183ef9a9d5d8c979d7f9bb870d07303455723d5fda3f261f6173908c341a1f79f49f6ff8e2909cbac64b8682c579be738dd77124d3e60ce22087acfc06f73db1ad2515628826569d687d168a069c3e79b5ddd8ed539a19cf107298105f8d13c9feb3e78fd2c48e5b38995989",
    };
    transfer::share_object(vkey);
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
    assert!(intel_type <= INTEL_TYPE_ROUTE, EInvalidIntelType);
    assert!(decay_hours >= MIN_DECAY_HOURS, EDecayTooSmall);
    assert!(decay_hours <= MAX_DECAY_HOURS, EDecayTooLarge);
    assert!(individual_price >= MIN_PRICE, EPriceTooLow);
    assert!(coin::value(&stake) >= MIN_STAKE, EStakeTooLow);

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
        location_proof_hash: vector::empty(),
    };

    event::emit(IntelListed {
        listing_id: object::id(&listing),
        scout: ctx.sender(),
        intel_type,
        system_id,
    });

    transfer::share_object(listing);
}

#[allow(lint(self_transfer))]
public fun purchase(
    listing: &mut IntelListing,
    mut payment: Coin<SUI>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(!listing.delisted, EListingDelisted);
    assert!(
        clock.timestamp_ms() < listing.created_at + listing.decay_hours * 3_600_000,
        EListingExpired,
    );
    assert!(payment.value() >= listing.individual_price, EInsufficientPayment);

    // Split exact price for scout; refund any excess to buyer
    let paid = payment.split(listing.individual_price, ctx);
    transfer::public_transfer(paid, listing.scout);
    if (payment.value() > 0) {
        transfer::public_transfer(payment, ctx.sender());
    } else {
        payment.destroy_zero();
    };

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
    assert!(!listing.delisted, EAlreadyDelisted);

    let amount = listing.stake.value();
    let refund = coin::from_balance(listing.stake.withdraw_all(), ctx);
    transfer::public_transfer(refund, listing.scout);

    listing.delisted = true;

    event::emit(IntelDelisted {
        listing_id: object::id(listing),
        scout: listing.scout,
    });
    event::emit(StakeReclaimed {
        listing_id: object::id(listing),
        scout: listing.scout,
        amount,
    });
}

/// Permissionless stake recovery for expired listings. Anyone can call this
/// (enabling keeper bots), but the refund always goes to the original scout.
public fun claim_expired_stake(
    listing: &mut IntelListing,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(!listing.delisted, EAlreadyDelisted);
    assert!(
        clock.timestamp_ms() >= listing.created_at + listing.decay_hours * 3_600_000,
        EListingNotExpired,
    );

    let amount = listing.stake.value();
    let refund = coin::from_balance(listing.stake.withdraw_all(), ctx);
    transfer::public_transfer(refund, listing.scout);

    listing.delisted = true;

    event::emit(StakeReclaimed {
        listing_id: object::id(listing),
        scout: listing.scout,
        amount,
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

public fun set_walrus_blob_id(
    listing: &mut IntelListing,
    walrus_blob_id: vector<u8>,
    ctx: &TxContext,
) {
    assert!(listing.scout == ctx.sender(), ENotScout);
    assert!(listing.walrus_blob_id.is_empty(), EBlobIdAlreadySet);
    listing.walrus_blob_id = walrus_blob_id;
}

public fun create_verified_listing(
    intel_type: u8,
    system_id: u64,
    individual_price: u64,
    decay_hours: u64,
    walrus_blob_id: vector<u8>,
    stake: Coin<SUI>,
    vkey: &LocationVKey,
    proof_points_bytes: vector<u8>,
    public_inputs_bytes: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(intel_type <= INTEL_TYPE_ROUTE, EInvalidIntelType);
    assert!(decay_hours >= MIN_DECAY_HOURS, EDecayTooSmall);
    assert!(decay_hours <= MAX_DECAY_HOURS, EDecayTooLarge);
    assert!(individual_price >= MIN_PRICE, EPriceTooLow);
    assert!(coin::value(&stake) >= MIN_STAKE, EStakeTooLow);

    // Verify Groth16 proof on-chain
    let pvk = groth16::prepare_verifying_key(&groth16::bn254(), &vkey.vkey_bytes);
    let public_inputs = groth16::public_proof_inputs_from_bytes(public_inputs_bytes);
    let proof_points = groth16::proof_points_from_bytes(proof_points_bytes);
    assert!(
        groth16::verify_groth16_proof(&groth16::bn254(), &pvk, &public_inputs, &proof_points),
        EInvalidLocationProof,
    );

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
        location_proof_hash: public_inputs_bytes,
    };
    let listing_id_val = object::id(&listing);
    event::emit(IntelListed {
        listing_id: listing_id_val,
        scout: ctx.sender(),
        intel_type,
        system_id,
    });
    event::emit(VerifiedIntelListed {
        listing_id: listing_id_val,
        scout: ctx.sender(),
    });
    transfer::share_object(listing);
}

public fun location_proof_hash(listing: &IntelListing): vector<u8> {
    listing.location_proof_hash
}

public fun is_verified(listing: &IntelListing): bool {
    !listing.location_proof_hash.is_empty()
}

// === Receipt management ===

/// Buyer can permanently delete their own receipt (cleanup expired/unwanted intel).
public fun burn_receipt(receipt: PurchaseReceipt, ctx: &TxContext) {
    assert!(receipt.buyer == ctx.sender(), ENotBuyer);
    let PurchaseReceipt { id, listing_id: _, buyer: _, paid_at: _ } = receipt;
    id.delete();
}

// === Seal policies (side-effect free, entry for key server simulation) ===

/// Seal policy: approve decryption if caller owns a valid PurchaseReceipt.
/// `id` is the BCS-serialized listing address (inner identity for Seal).
entry fun seal_approve(
    id: vector<u8>,
    receipt: &PurchaseReceipt,
    ctx: &TxContext,
) {
    assert!(receipt.buyer == ctx.sender(), ENotBuyer);

    let mut bcs_id = bcs::new(id);
    let listing_addr = bcs_id.peel_address();
    assert!(object::id_to_address(&receipt.listing_id) == listing_addr, EWrongListing);
}

/// Seal policy: scout can always decrypt their own intel.
entry fun seal_approve_scout(
    _id: vector<u8>,
    listing: &IntelListing,
    ctx: &TxContext,
) {
    assert!(listing.scout == ctx.sender(), ENotScout);
}

// === Test-only helpers ===

#[test_only]
public fun transfer_receipt_for_testing(receipt: PurchaseReceipt, to: address) {
    transfer::transfer(receipt, to);
}

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) {
    init(MARKETPLACE {}, ctx);
}
