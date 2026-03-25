module rift_broker::marketplace;

use sui::balance::Balance;
use sui::coin::{Self, Coin};
use sui::clock::Clock;
use sui::dynamic_field;
use sui::event;
use sui::sui::SUI;
use sui::bcs;
use sui::groth16;
use sui::poseidon;

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
// Codes 20-21 reserved: future EInvalidLocationHash and EJumpTooOld if granular errors needed
const EInvalidPresenceProof: u64 = 22;
const EInvalidBadgeType: u64 = 23;
const EBadgeAlreadyAttached: u64 = 24;
const EProfileNotFound: u64 = 25;
const EInvalidMerkleLevel: u64 = 26;
const EMerkleTreeFull: u64 = 27;
const EInvalidReputationProof: u64 = 28;
const EMerkleRootMismatch: u64 = 29;
const EInvalidReputationPublicInput: u64 = 30;

// === Regular constants (ALL_CAPS) ===

const MAX_DECAY_HOURS: u64 = 8760; // 1 year — also bounds overflow: 8760 * 3_600_000 + max_timestamp << u64::MAX
const MIN_DECAY_HOURS: u64 = 1;
const MIN_PRICE: u64 = 1;
const MIN_STAKE: u64 = 1;
const MAX_OBSERVATION_AGE_MS: u64 = 86_400_000; // 24 hours

/// Incremental Merkle tree depth (2^10 = 1024 leaves per scout).
const MERKLE_DEPTH: u64 = 10;
const MERKLE_MAX_LEAVES: u64 = 1024;

// Precomputed Poseidon BN254 hashes of empty subtrees (circomlibjs — circuits/scripts/compute-zero-hashes.mjs).
// ZERO_HASH[i] = root of empty perfect tree of height i; ZERO_HASH[0] = 0.
const ZERO_HASH_0: u256 = 0;
const ZERO_HASH_1: u256 = 14744269619966411208579211824598458697587494354926760081771325075741142829156;
const ZERO_HASH_2: u256 = 7423237065226347324353380772367382631490014989348495481811164164159255474657;
const ZERO_HASH_3: u256 = 11286972368698509976183087595462810875513684078608517520839298933882497716792;
const ZERO_HASH_4: u256 = 3607627140608796879659380071776844901612302623152076817094415224584923813162;
const ZERO_HASH_5: u256 = 19712377064642672829441595136074946683621277828620209496774504837737984048981;
const ZERO_HASH_6: u256 = 20775607673010627194014556968476266066927294572720319469184847051418138353016;
const ZERO_HASH_7: u256 = 3396914609616007258851405644437304192397291162432396347162513310381425243293;
const ZERO_HASH_8: u256 = 21551820661461729022865262380882070649935529853313286572328683688269863701601;
const ZERO_HASH_9: u256 = 6573136701248752079028194407151022595060682063033565181951145966236778420039;
const ZERO_HASH_10: u256 = 12413880268183407374852357075976609371175688755676981206018884971008854919922;

#[allow(unused_const)]
const INTEL_TYPE_RESOURCE: u8 = 0;
#[allow(unused_const)]
const INTEL_TYPE_FLEET: u8 = 1;
#[allow(unused_const)]
const INTEL_TYPE_BASE: u8 = 2;
#[allow(unused_const)]
const INTEL_TYPE_ROUTE: u8 = 3;

#[allow(unused_const)]
const BADGE_TYPE_KILLMAIL: u8 = 0;
#[allow(unused_const)]
const BADGE_TYPE_DEPOSIT: u8 = 1;
#[allow(unused_const)]
const BADGE_TYPE_REVEAL: u8 = 2;

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
    jump_tx_digest: vector<u8>,     // SUI tx digest of JumpEvent (audit trail, empty for unverified)
    killmail_tx_digest: vector<u8>,  // KillmailCreatedEvent tx digest (empty for none)
    deposit_tx_digest: vector<u8>,   // ItemDepositedEvent tx digest (empty for none)
    reveal_tx_digest: vector<u8>,    // LocationRevealedEvent tx digest (empty for none)
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

/// Verification key for the unified presence-attestation circuit (Phase 5).
/// Created once at package publish via init(). Object ID stored in frontend constants.
public struct PresenceVKey has key {
    id: UID,
    vkey_bytes: vector<u8>,
}

/// Verification key for the reputation-attestation Groth16 circuit (Phase 4b).
public struct ReputationVKey has key {
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

/// Per-scout reputation counters, stored as dynamic field on ScoutRegistry.
/// Keyed by scout address. Only updated by listing creation / badge functions.
public struct ScoutProfileData has store, drop {
    total_zk_verified: u64,
    total_presence_verified: u64,
    total_combat_verified: u64,
    total_activity_verified: u64,
    total_structure_verified: u64,
    total_unverified: u64,
    first_verified_at: u64,
    last_verified_at: u64,
    merkle_root: u256,
    leaf_count: u64,
    frontier: vector<u256>,
    /// ZK-proven minimum counts per badge_type (parallel vectors).
    reputation_claim_types: vector<u8>,
    reputation_claim_counts: vector<u64>,
}

/// Global registry holding all scout profiles as dynamic fields.
/// Created once in init(), shared for concurrent access.
public struct ScoutRegistry has key {
    id: UID,
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

public struct BadgeAttached has copy, drop {
    listing_id: ID,
    scout: address,
    badge_type: u8,
}

public struct ScoutProfileCreated has copy, drop {
    scout: address,
    registry_id: ID,
}

public struct ScoutReputationUpdated has copy, drop {
    scout: address,
    badge_type: u8,
    new_total: u64,
    system_id: u64,
    intel_type: u8,
    timestamp: u64,
}

public struct ReputationClaimVerified has copy, drop {
    scout: address,
    badge_type: u8,
    proven_count: u64,
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

    let presence_vkey = PresenceVKey {
        id: object::new(ctx),
        vkey_bytes: x"c7e253d6dbb0b365b15775ae9f8aa0ffcc1c8cde0bd7a4e8c0b376b0d92952a444d2615ebda233e141f4ca0a1270e1269680b20507d55f6872540af6c1bc2424dba1298a9727ff392b6f7f48b3e88e20cf925b7024be9992d3bbfae8820a0907edf692d95cbdde46ddda5ef7d422436779445c5e66006a42761e1f12efde0018c212f3aeb785e49712e7a9353349aaf1255dfb31b7bf60723a480d9293938e19d1879380c865b9f6f598a728228405733098af0a4681fb74ee467ba2db1dc4201e34cde94d7289dd2c03f1edbbe59540d66e8e49ae9657df55d7799a9503b41f0600000000000000d80ad3de93b4a2f7e127c4f197ea601c1d03a27867fc154f99fc12024c6c36a8ce423b2c395c7faa9c3f710b35c2e3e1bd3ebfd67ffd514de6d10840761ab02eb81fc88cf2e4fb815f0a085eec5e68afecb68a78de47e1f51e944cf7d7c4e4a5721dc2b6c197f32542d06500296ed2571fb0feb018ff51dbdba1a5b16aed30a8e0da57c4a89e049135f8aae6655b8f0454d6f5bcc8a38af061cf535b5ce2a111ff8a8ab1c087f4d01a10aed8464f03b8df8d87e2500341eb38a32936655a259b",
    };
    transfer::share_object(presence_vkey);

    let reputation_vkey = ReputationVKey {
        id: object::new(ctx),
        vkey_bytes: x"c7e253d6dbb0b365b15775ae9f8aa0ffcc1c8cde0bd7a4e8c0b376b0d92952a444d2615ebda233e141f4ca0a1270e1269680b20507d55f6872540af6c1bc2424dba1298a9727ff392b6f7f48b3e88e20cf925b7024be9992d3bbfae8820a0907edf692d95cbdde46ddda5ef7d422436779445c5e66006a42761e1f12efde0018c212f3aeb785e49712e7a9353349aaf1255dfb31b7bf60723a480d9293938e19a2f63275e605132714970371fec906fa9b32c1318d50f7ae10dfd581327e25178e7d0b0479942ff71213b8ec72efdfa4eaf5812fb759e6bd3d69f5f923552f00040000000000000092f2cfb450d44d9d36eada58897b3d566ce6f7ba4a79e60a351de585385dc48f5bd1bacb0a30f3a63f10bdcfc98525c287eda702884e7063c303efdd7991a21eda84a56bf54fb2b8e01e12acb522ac669a70c4504a2add5265e0159d9b710ca1dc118b86bc9aeedc3ba05f76840598d0df25c260514de886acb4340b0351cd18",
    };
    transfer::share_object(reputation_vkey);

    let registry = ScoutRegistry { id: object::new(ctx) };
    transfer::share_object(registry);
}

// === Private helpers ===

/// Look up or create a scout's profile in the registry.
/// Returns a mutable reference to the profile data.
fun get_or_create_profile(
    registry: &mut ScoutRegistry,
    scout: address,
): &mut ScoutProfileData {
    if (!dynamic_field::exists_with_type<address, ScoutProfileData>(&registry.id, scout)) {
        dynamic_field::add<address, ScoutProfileData>(
            &mut registry.id,
            scout,
            ScoutProfileData {
                total_zk_verified: 0,
                total_presence_verified: 0,
                total_combat_verified: 0,
                total_activity_verified: 0,
                total_structure_verified: 0,
                total_unverified: 0,
                first_verified_at: 0,
                last_verified_at: 0,
                merkle_root: ZERO_HASH_10,
                leaf_count: 0,
                frontier: vector[
                    0u256, 0u256, 0u256, 0u256, 0u256,
                    0u256, 0u256, 0u256, 0u256, 0u256,
                ],
                reputation_claim_types: vector::empty(),
                reputation_claim_counts: vector::empty(),
            },
        );
        event::emit(ScoutProfileCreated {
            scout,
            registry_id: object::id(registry),
        });
    };
    dynamic_field::borrow_mut<address, ScoutProfileData>(&mut registry.id, scout)
}

// ── ScoutProfileData getters ─────────────────────────────────────────

public fun total_zk_verified(profile: &ScoutProfileData): u64 { profile.total_zk_verified }
public fun total_presence_verified(profile: &ScoutProfileData): u64 { profile.total_presence_verified }
public fun total_combat_verified(profile: &ScoutProfileData): u64 { profile.total_combat_verified }
public fun total_activity_verified(profile: &ScoutProfileData): u64 { profile.total_activity_verified }
public fun total_structure_verified(profile: &ScoutProfileData): u64 { profile.total_structure_verified }
public fun total_unverified(profile: &ScoutProfileData): u64 { profile.total_unverified }
public fun first_verified_at(profile: &ScoutProfileData): u64 { profile.first_verified_at }
public fun last_verified_at(profile: &ScoutProfileData): u64 { profile.last_verified_at }

public fun merkle_root(profile: &ScoutProfileData): u256 { profile.merkle_root }

public fun leaf_count(profile: &ScoutProfileData): u64 { profile.leaf_count }

public fun reputation_claims(profile: &ScoutProfileData): (&vector<u8>, &vector<u64>) {
    (&profile.reputation_claim_types, &profile.reputation_claim_counts)
}

/// Total verified listings across all badge-type counters (excludes unverified-only).
public fun total_verified(profile: &ScoutProfileData): u64 {
    profile.total_zk_verified
        + profile.total_presence_verified
        + profile.total_combat_verified
        + profile.total_activity_verified
        + profile.total_structure_verified
}

/// Look up a scout's profile from the registry. Aborts if not found.
public fun borrow_profile(registry: &ScoutRegistry, scout: address): &ScoutProfileData {
    assert!(dynamic_field::exists_with_type<address, ScoutProfileData>(&registry.id, scout), EProfileNotFound);
    dynamic_field::borrow<address, ScoutProfileData>(&registry.id, scout)
}

/// Check whether a scout has a profile in the registry.
public fun has_profile(registry: &ScoutRegistry, scout: address): bool {
    dynamic_field::exists_with_type<address, ScoutProfileData>(&registry.id, scout)
}

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

/// Read 32 bytes at `offset` as little-endian u256 (Groth16 public signal encoding).
fun bytes_to_u256_le(bytes: &vector<u8>, offset: u64): u256 {
    let mut val: u256 = 0;
    let mut i: u64 = 31;
    loop {
        val = (val << 8) | (*bytes.borrow(offset + i) as u256);
        if (i == 0) {
            break
        };
        i = i - 1;
    };
    val
}

/// Hash a verified event into a Merkle leaf (Phase 4a+).
fun compute_leaf_hash(
    system_id: u64,
    intel_type: u8,
    badge_type: u8,
    timestamp: u64,
): u256 {
    let inputs = vector[
        (system_id as u256),
        (intel_type as u256),
        (badge_type as u256),
        (timestamp as u256),
    ];
    poseidon::poseidon_bn254(&inputs)
}

fun zero_hash_at(level: u64): u256 {
    if (level == 0) {
        ZERO_HASH_0
    } else if (level == 1) {
        ZERO_HASH_1
    } else if (level == 2) {
        ZERO_HASH_2
    } else if (level == 3) {
        ZERO_HASH_3
    } else if (level == 4) {
        ZERO_HASH_4
    } else if (level == 5) {
        ZERO_HASH_5
    } else if (level == 6) {
        ZERO_HASH_6
    } else if (level == 7) {
        ZERO_HASH_7
    } else if (level == 8) {
        ZERO_HASH_8
    } else if (level == 9) {
        ZERO_HASH_9
    } else {
        abort EInvalidMerkleLevel
    }
}

/// Append a leaf to the scout's incremental Merkle tree (O(depth) Poseidon hashes).
fun insert_leaf(profile: &mut ScoutProfileData, leaf: u256) {
    assert!(profile.leaf_count < MERKLE_MAX_LEAVES, EMerkleTreeFull);

    let index = profile.leaf_count;
    let mut current = leaf;
    let mut level: u64 = 0;

    while (level < MERKLE_DEPTH) {
        if (((index >> (level as u8)) & 1) == 0) {
            *vector::borrow_mut(&mut profile.frontier, level) = current;
            current = poseidon::poseidon_bn254(&vector[current, zero_hash_at(level)]);
        } else {
            let left = *vector::borrow(&profile.frontier, level);
            current = poseidon::poseidon_bn254(&vector[left, current]);
        };
        level = level + 1;
    };

    profile.merkle_root = current;
    profile.leaf_count = profile.leaf_count + 1;
}

// === Public functions ===

public fun create_listing(
    registry: &mut ScoutRegistry,
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
        jump_tx_digest: vector::empty(),
        killmail_tx_digest: vector::empty(),
        deposit_tx_digest: vector::empty(),
        reveal_tx_digest: vector::empty(),
    };

    event::emit(IntelListed {
        listing_id: object::id(&listing),
        scout: ctx.sender(),
        intel_type,
        system_id,
    });

    let profile = get_or_create_profile(registry, ctx.sender());
    profile.total_unverified = profile.total_unverified + 1;
    event::emit(ScoutReputationUpdated {
        scout: ctx.sender(),
        badge_type: 0xFF,
        new_total: profile.total_unverified,
        system_id,
        intel_type,
        timestamp: clock.timestamp_ms(),
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
public fun jump_tx_digest(listing: &IntelListing): &vector<u8> { &listing.jump_tx_digest }
public fun killmail_tx_digest(listing: &IntelListing): &vector<u8> { &listing.killmail_tx_digest }
public fun deposit_tx_digest(listing: &IntelListing): &vector<u8> { &listing.deposit_tx_digest }
public fun reveal_tx_digest(listing: &IntelListing): &vector<u8> { &listing.reveal_tx_digest }

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
    registry: &mut ScoutRegistry,
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
        jump_tx_digest: vector::empty(),
        killmail_tx_digest: vector::empty(),
        deposit_tx_digest: vector::empty(),
        reveal_tx_digest: vector::empty(),
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

    let profile = get_or_create_profile(registry, ctx.sender());
    profile.total_zk_verified = profile.total_zk_verified + 1;
    if (profile.first_verified_at == 0) {
        profile.first_verified_at = observed_at;
    };
    profile.last_verified_at = observed_at;
    let leaf = compute_leaf_hash(system_id, intel_type, 0xFE, observed_at);
    insert_leaf(profile, leaf);
    event::emit(ScoutReputationUpdated {
        scout: ctx.sender(),
        badge_type: 0xFE,
        new_total: profile.total_zk_verified,
        system_id,
        intel_type,
        timestamp: observed_at,
    });

    transfer::share_object(listing);
}

/// Create a listing verified by the unified presence-attestation circuit (Phase 5).
/// Proof embeds: distance to target, jump timestamp, coordinate hashes, location_hash binding.
/// public_inputs_bytes: 160 bytes (5 × 32), snarkjs output order:
///   [0]: distanceSquared (32 bytes LE) — output
///   [1]: timestamp (32 bytes LE) — output
///   [2]: coordinatesHash (32 bytes LE) — input
///   [3]: targetHash (32 bytes LE) — input
///   [4]: locationHash (32 bytes LE) — input
public fun create_presence_verified_listing(
    registry: &mut ScoutRegistry,
    intel_type: u8,
    system_id: u64,
    individual_price: u64,
    decay_hours: u64,
    walrus_blob_id: vector<u8>,
    stake: Coin<SUI>,
    vkey: &PresenceVKey,
    proof_points_bytes: vector<u8>,
    public_inputs_bytes: vector<u8>,
    jump_tx_digest: vector<u8>,
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
        EInvalidPresenceProof,
    );

    // Extract timestamp from second public signal (bytes [32..40])
    // snarkjs output order: [distanceSquared, timestamp, ...]
    let observed_at = bytes_to_u64_le(&public_inputs_bytes, 32);
    let now = clock.timestamp_ms();

    // Reject future timestamps
    assert!(observed_at <= now, ETimestampInFuture);

    // Reject stale observations (24h cap)
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
        jump_tx_digest,
        killmail_tx_digest: vector::empty(),
        deposit_tx_digest: vector::empty(),
        reveal_tx_digest: vector::empty(),
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

    let profile = get_or_create_profile(registry, ctx.sender());
    profile.total_presence_verified = profile.total_presence_verified + 1;
    if (profile.first_verified_at == 0) {
        profile.first_verified_at = observed_at;
    };
    profile.last_verified_at = observed_at;
    let leaf = compute_leaf_hash(system_id, intel_type, 0xFD, observed_at);
    insert_leaf(profile, leaf);
    event::emit(ScoutReputationUpdated {
        scout: ctx.sender(),
        badge_type: 0xFD,
        new_total: profile.total_presence_verified,
        system_id,
        intel_type,
        timestamp: observed_at,
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

/// Attach an on-chain event badge to an existing listing.
/// badge_type: 0 = killmail, 1 = deposit, 2 = structure discovery
/// tx_digest: the SUI transaction digest containing the relevant event.
/// No on-chain event verification — the contract stores the digest as an audit trail.
/// The frontend verifies the digest against the actual transaction.
public fun attach_event_badge(
    registry: &mut ScoutRegistry,
    listing: &mut IntelListing,
    badge_type: u8,
    tx_digest: vector<u8>,
    clock: &Clock,
    ctx: &TxContext,
) {
    assert!(listing.scout == ctx.sender(), ENotScout);
    assert!(!listing.delisted, EAlreadyDelisted);
    assert!(badge_type <= BADGE_TYPE_REVEAL, EInvalidBadgeType);

    if (badge_type == BADGE_TYPE_KILLMAIL) {
        assert!(listing.killmail_tx_digest.is_empty(), EBadgeAlreadyAttached);
        listing.killmail_tx_digest = tx_digest;
    } else if (badge_type == BADGE_TYPE_DEPOSIT) {
        assert!(listing.deposit_tx_digest.is_empty(), EBadgeAlreadyAttached);
        listing.deposit_tx_digest = tx_digest;
    } else {
        assert!(listing.reveal_tx_digest.is_empty(), EBadgeAlreadyAttached);
        listing.reveal_tx_digest = tx_digest;
    };

    let ts = clock.timestamp_ms();
    let profile = get_or_create_profile(registry, ctx.sender());
    let new_total = if (badge_type == BADGE_TYPE_KILLMAIL) {
        profile.total_combat_verified = profile.total_combat_verified + 1;
        profile.total_combat_verified
    } else if (badge_type == BADGE_TYPE_DEPOSIT) {
        profile.total_activity_verified = profile.total_activity_verified + 1;
        profile.total_activity_verified
    } else {
        profile.total_structure_verified = profile.total_structure_verified + 1;
        profile.total_structure_verified
    };
    if (profile.first_verified_at == 0) {
        profile.first_verified_at = ts;
    };
    profile.last_verified_at = ts;
    let leaf = compute_leaf_hash(listing.system_id, listing.intel_type, badge_type, ts);
    insert_leaf(profile, leaf);
    event::emit(ScoutReputationUpdated {
        scout: ctx.sender(),
        badge_type,
        new_total,
        system_id: listing.system_id,
        intel_type: listing.intel_type,
        timestamp: ts,
    });

    event::emit(BadgeAttached {
        listing_id: object::id(listing),
        scout: listing.scout,
        badge_type,
    });
}

/// Verify a Groth16 reputation claim: at least `claimCount` Merkle leaves of `claimBadgeType`
/// under the scout's current `merkle_root`. Public inputs: 3×32 bytes LE (root, badge type, count).
public fun attach_reputation_proof(
    registry: &mut ScoutRegistry,
    vkey: &ReputationVKey,
    proof_points_bytes: vector<u8>,
    public_inputs_bytes: vector<u8>,
    ctx: &TxContext,
) {
    let scout = ctx.sender();
    assert!(has_profile(registry, scout), EProfileNotFound);

    assert!(vector::length(&public_inputs_bytes) == 96, EInvalidReputationPublicInput);
    let proof_root = bytes_to_u256_le(&public_inputs_bytes, 0);
    let badge_u64 = bytes_to_u64_le(&public_inputs_bytes, 32);
    let proven_count = bytes_to_u64_le(&public_inputs_bytes, 64);
    assert!(badge_u64 <= 255, EInvalidReputationPublicInput);
    assert!(proven_count > 0 && proven_count <= MERKLE_MAX_LEAVES, EInvalidReputationPublicInput);
    let badge_type = badge_u64 as u8;

    // Check root match BEFORE expensive Groth16 verification to save gas on stale proofs
    let profile = dynamic_field::borrow_mut<address, ScoutProfileData>(&mut registry.id, scout);
    assert!(proof_root == profile.merkle_root, EMerkleRootMismatch);

    let pvk = groth16::prepare_verifying_key(&groth16::bn254(), &vkey.vkey_bytes);
    let public_inputs = groth16::public_proof_inputs_from_bytes(public_inputs_bytes);
    let proof_points = groth16::proof_points_from_bytes(proof_points_bytes);
    assert!(
        groth16::verify_groth16_proof(&groth16::bn254(), &pvk, &public_inputs, &proof_points),
        EInvalidReputationProof,
    );

    let len = vector::length(&profile.reputation_claim_types);
    let mut i = 0u64;
    let mut found = false;
    while (i < len) {
        if (*vector::borrow(&profile.reputation_claim_types, i) == badge_type) {
            let cur = *vector::borrow(&profile.reputation_claim_counts, i);
            if (proven_count > cur) {
                *vector::borrow_mut(&mut profile.reputation_claim_counts, i) = proven_count;
            };
            found = true;
            break
        };
        i = i + 1;
    };
    if (!found) {
        vector::push_back(&mut profile.reputation_claim_types, badge_type);
        vector::push_back(&mut profile.reputation_claim_counts, proven_count);
    };

    event::emit(ReputationClaimVerified {
        scout,
        badge_type,
        proven_count,
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
public fun create_registry_for_testing(ctx: &mut TxContext): ScoutRegistry {
    ScoutRegistry { id: object::new(ctx) }
}

#[test_only]
public fun share_registry_for_testing(registry: ScoutRegistry) {
    transfer::share_object(registry);
}

#[test_only]
public fun destroy_registry_for_testing(registry: ScoutRegistry) {
    let ScoutRegistry { id } = registry;
    id.delete();
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

#[test_only]
public fun init_presence_vkey_for_testing(ctx: &mut TxContext) {
    // Use the real presence-attestation VKey so prepare_verifying_key succeeds.
    // The garbage proof bytes will then fail verify_groth16_proof → EInvalidPresenceProof.
    let presence_vkey = PresenceVKey {
        id: object::new(ctx),
        vkey_bytes: x"c7e253d6dbb0b365b15775ae9f8aa0ffcc1c8cde0bd7a4e8c0b376b0d92952a444d2615ebda233e141f4ca0a1270e1269680b20507d55f6872540af6c1bc2424dba1298a9727ff392b6f7f48b3e88e20cf925b7024be9992d3bbfae8820a0907edf692d95cbdde46ddda5ef7d422436779445c5e66006a42761e1f12efde0018c212f3aeb785e49712e7a9353349aaf1255dfb31b7bf60723a480d9293938e19d1879380c865b9f6f598a728228405733098af0a4681fb74ee467ba2db1dc4201e34cde94d7289dd2c03f1edbbe59540d66e8e49ae9657df55d7799a9503b41f0600000000000000d80ad3de93b4a2f7e127c4f197ea601c1d03a27867fc154f99fc12024c6c36a8ce423b2c395c7faa9c3f710b35c2e3e1bd3ebfd67ffd514de6d10840761ab02eb81fc88cf2e4fb815f0a085eec5e68afecb68a78de47e1f51e944cf7d7c4e4a5721dc2b6c197f32542d06500296ed2571fb0feb018ff51dbdba1a5b16aed30a8e0da57c4a89e049135f8aae6655b8f0454d6f5bcc8a38af061cf535b5ce2a111ff8a8ab1c087f4d01a10aed8464f03b8df8d87e2500341eb38a32936655a259b",
    };
    transfer::share_object(presence_vkey);
}

#[test_only]
public fun set_jump_tx_digest_for_testing(listing: &mut IntelListing, digest: vector<u8>) {
    listing.jump_tx_digest = digest;
}

#[test_only]
public fun set_killmail_tx_digest_for_testing(listing: &mut IntelListing, digest: vector<u8>) {
    listing.killmail_tx_digest = digest;
}

#[test_only]
public fun set_merkle_root_for_testing(
    registry: &mut ScoutRegistry,
    scout: address,
    root: u256,
) {
    let profile = dynamic_field::borrow_mut<address, ScoutProfileData>(&mut registry.id, scout);
    profile.merkle_root = root;
}

#[test_only]
public fun merkle_empty_root_for_testing(): u256 {
    ZERO_HASH_10
}

/// Same leaf hash + insert as production verified paths (no Groth16); for Merkle unit tests.
#[test_only]
public fun insert_test_reputation_leaf(
    registry: &mut ScoutRegistry,
    scout: address,
    system_id: u64,
    intel_type: u8,
    badge_type: u8,
    timestamp: u64,
) {
    let profile = get_or_create_profile(registry, scout);
    insert_leaf(profile, compute_leaf_hash(system_id, intel_type, badge_type, timestamp));
}
