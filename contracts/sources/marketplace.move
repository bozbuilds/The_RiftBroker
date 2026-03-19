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
const ENoLocationProof: u64 = 15;
const EDistanceProofAlreadySet: u64 = 16;
const EInvalidDistanceProof: u64 = 17;
const EObservationTooStale: u64 = 18;
const ETimestampInFuture: u64 = 19;

// === Regular constants (ALL_CAPS) ===

const MAX_DECAY_HOURS: u64 = 8760; // 1 year — also bounds overflow: 8760 * 3_600_000 + max_timestamp << u64::MAX
const MIN_DECAY_HOURS: u64 = 1;
const MIN_PRICE: u64 = 1;
const MIN_STAKE: u64 = 1;
const MAX_OBSERVATION_AGE_MS: u64 = 86_400_000; // 24 hours

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
/// `delisted` tracks manual removal; expiry computed from observed_at + decay_hours.
public struct IntelListing has key {
    id: UID,
    scout: address,
    intel_type: u8,
    system_id: u64,
    created_at: u64,
    observed_at: u64,           // ZK-verified observation time (= created_at for unverified)
    decay_hours: u64,
    walrus_blob_id: vector<u8>,
    individual_price: u64,
    stake: Balance<SUI>,
    delisted: bool,
    location_proof_hash: vector<u8>,  // empty = unverified; non-empty = valid proof was verified at creation
    distance_proof_hash: vector<u8>,  // empty = no distance proof; non-empty = valid proof was verified
}

/// Shared object holding the Groth16 verification key for the location attestation circuit.
/// Created once at package publish via init(). Object ID stored in frontend constants.
public struct LocationVKey has key {
    id: UID,
    vkey_bytes: vector<u8>,
}

/// Verification key for the distance attestation Groth16 circuit.
/// Created once at package publish via init(). Object ID stored in frontend constants.
public struct DistanceVKey has key {
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

public struct DistanceProofAttached has copy, drop {
    listing_id: ID,
    scout: address,
}

// === Init ===

fun init(_otw: MARKETPLACE, ctx: &mut TxContext) {
    let location_vkey = LocationVKey {
        id: object::new(ctx),
        vkey_bytes: x"c7e253d6dbb0b365b15775ae9f8aa0ffcc1c8cde0bd7a4e8c0b376b0d92952a444d2615ebda233e141f4ca0a1270e1269680b20507d55f6872540af6c1bc2424dba1298a9727ff392b6f7f48b3e88e20cf925b7024be9992d3bbfae8820a0907edf692d95cbdde46ddda5ef7d422436779445c5e66006a42761e1f12efde0018c212f3aeb785e49712e7a9353349aaf1255dfb31b7bf60723a480d9293938e1922f4807d90f7579c0681a7c4326ed9cd492392529908d1a5e1be4fc1d40b74279e93eb8cf729fd0be9150e6e59c43b66e5dd5030b568dda6cc970539fafefe2a0500000000000000d020745c5d9aa5e987327c45664f758f99c8b45f183ef9a9d5d8c979d7f9bb87136e391188eccb9532949c42958e4593b1a0b94a812c9d1841ea3ac5e5970f2e18eccea780b7b38b85d4e098a22d6bf736fb236671d22f66b89d7a0b0ac0cb8fc625336c215d095d3d0aa8173592150c7751f4474d1709a8cb94a5981008d8abb2abb84835430836dd82b373f5f032575f094831ccb5ac870d30943780a4c393",
    };
    transfer::share_object(location_vkey);

    let distance_vkey = DistanceVKey {
        id: object::new(ctx),
        vkey_bytes: x"c7e253d6dbb0b365b15775ae9f8aa0ffcc1c8cde0bd7a4e8c0b376b0d92952a444d2615ebda233e141f4ca0a1270e1269680b20507d55f6872540af6c1bc2424dba1298a9727ff392b6f7f48b3e88e20cf925b7024be9992d3bbfae8820a0907edf692d95cbdde46ddda5ef7d422436779445c5e66006a42761e1f12efde0018c212f3aeb785e49712e7a9353349aaf1255dfb31b7bf60723a480d9293938e1999b02f020468a6c6711b99af7d9b3587f6c99f0d991fa21ba68d7fc88763fb08ec860e72d093efb7b3dabe6b70a52abd46b2f4fe7ce87f4decb3cc772bb21eac0400000000000000746c4b7fb00e5edca937f3133b8ef153d173950c07a9fb415a6272e0f11fb983c3cbb6b96dc9e277429c79e4929dbb4952d56371a2b0d1f1e60d99ceee81442ffcfe5a369bd08a5bbf14d485fb22b6982a27c9df0b81bc01e612200cc21d6f96a9bc217de435b89c8956a94e44bb4e8efc66616df9d7fd6c51935dedaa47db81",
    };
    transfer::share_object(distance_vkey);
}

// === Private helpers ===

/// Read 8 bytes starting at `offset` as a little-endian u64.
/// Used to extract the timestamp field element from proof public signals.
fun bytes_to_u64_le(bytes: &vector<u8>, offset: u64): u64 {
    (*bytes.borrow(offset) as u64)
        | ((*bytes.borrow(offset + 1) as u64) << 8)
        | ((*bytes.borrow(offset + 2) as u64) << 16)
        | ((*bytes.borrow(offset + 3) as u64) << 24)
        | ((*bytes.borrow(offset + 4) as u64) << 32)
        | ((*bytes.borrow(offset + 5) as u64) << 40)
        | ((*bytes.borrow(offset + 6) as u64) << 48)
        | ((*bytes.borrow(offset + 7) as u64) << 56)
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

    let now = clock.timestamp_ms();
    let listing = IntelListing {
        id: object::new(ctx),
        scout: ctx.sender(),
        intel_type,
        system_id,
        created_at: now,
        observed_at: now,
        decay_hours,
        walrus_blob_id,
        individual_price,
        stake: stake.into_balance(),
        delisted: false,
        location_proof_hash: vector::empty(),
        distance_proof_hash: vector::empty(),
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
        clock.timestamp_ms() < listing.observed_at + listing.decay_hours * 3_600_000,
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
        clock.timestamp_ms() >= listing.observed_at + listing.decay_hours * 3_600_000,
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
    clock.timestamp_ms() >= listing.observed_at + listing.decay_hours * 3_600_000
}

public fun observed_at(listing: &IntelListing): u64 { listing.observed_at }

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

    // Extract observation timestamp from proof's first public signal (32-byte LE field element).
    // snarkjs orders: outputs first → timestamp is bytes [0..8] of public_inputs_bytes.
    let observed_at = bytes_to_u64_le(&public_inputs_bytes, 0);
    let now = clock.timestamp_ms();

    // Reject future timestamps (prevents gaming freshness)
    assert!(observed_at <= now, ETimestampInFuture);

    // Reject stale observations (scout has 24h to monetize)
    assert!(
        now - observed_at <= MAX_OBSERVATION_AGE_MS,
        EObservationTooStale,
    );
    let listing = IntelListing {
        id: object::new(ctx),
        scout: ctx.sender(),
        intel_type,
        system_id,
        created_at: now,
        observed_at,
        decay_hours,
        walrus_blob_id,
        individual_price,
        stake: stake.into_balance(),
        delisted: false,
        location_proof_hash: public_inputs_bytes,
        distance_proof_hash: vector::empty(),
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

/// Attach a ZK distance proof to an existing listing.
/// Requires: caller is scout, listing has location proof, no distance proof yet.
public fun attach_distance_proof(
    listing: &mut IntelListing,
    vkey: &DistanceVKey,
    proof_points_bytes: vector<u8>,
    public_inputs_bytes: vector<u8>,
    ctx: &TxContext,
) {
    assert!(listing.scout == ctx.sender(), ENotScout);
    assert!(!listing.location_proof_hash.is_empty(), ENoLocationProof);
    assert!(listing.distance_proof_hash.is_empty(), EDistanceProofAlreadySet);

    let pvk = groth16::prepare_verifying_key(&groth16::bn254(), &vkey.vkey_bytes);
    let public_inputs = groth16::public_proof_inputs_from_bytes(public_inputs_bytes);
    let proof_points = groth16::proof_points_from_bytes(proof_points_bytes);
    assert!(
        groth16::verify_groth16_proof(&groth16::bn254(), &pvk, &public_inputs, &proof_points),
        EInvalidDistanceProof,
    );

    listing.distance_proof_hash = public_inputs_bytes;

    event::emit(DistanceProofAttached {
        listing_id: object::id(listing),
        scout: listing.scout,
    });
}

public fun location_proof_hash(listing: &IntelListing): vector<u8> {
    listing.location_proof_hash
}

public fun is_verified(listing: &IntelListing): bool {
    !listing.location_proof_hash.is_empty()
}

public fun distance_proof_hash(listing: &IntelListing): vector<u8> {
    listing.distance_proof_hash
}

public fun has_distance_proof(listing: &IntelListing): bool {
    !listing.distance_proof_hash.is_empty()
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

#[test_only]
public fun set_location_proof_hash_for_testing(
    listing: &mut IntelListing,
    hash: vector<u8>,
) {
    listing.location_proof_hash = hash;
}

#[test_only]
public fun set_distance_proof_hash_for_testing(
    listing: &mut IntelListing,
    hash: vector<u8>,
) {
    listing.distance_proof_hash = hash;
}

#[test_only]
public fun set_distance_vkey_bytes_for_testing(
    vkey: &mut DistanceVKey,
    bytes: vector<u8>,
) {
    vkey.vkey_bytes = bytes;
}

#[test_only]
public fun set_observed_at_for_testing(listing: &mut IntelListing, ts: u64) {
    listing.observed_at = ts;
}

#[test_only]
public fun bytes_to_u64_le_for_testing(bytes: &vector<u8>, offset: u64): u64 {
    bytes_to_u64_le(bytes, offset)
}
