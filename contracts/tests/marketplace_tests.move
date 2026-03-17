#[test_only]
module rift_broker::marketplace_tests;

use sui::test_scenario;
use sui::coin;
use sui::sui::SUI;
use sui::clock;
use rift_broker::marketplace::{Self, IntelListing, LocationVKey, PurchaseReceipt};

const SCOUT: address = @0xA;
const BUYER: address = @0xB;
const STRANGER: address = @0xC;

// === Listing creation ===

#[test]
fun listing_creation_works() {
    let mut scenario = test_scenario::begin(SCOUT);
    let ctx = scenario.ctx();
    let clk = clock::create_for_testing(ctx);

    let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
    marketplace::create_listing(
        0, // intel_type: resource
        42, // system_id
        500_000, // individual_price
        24, // decay_hours
        b"walrus_blob_abc",
        stake,
        &clk,
        ctx,
    );

    scenario.next_tx(SCOUT);
    let listing = scenario.take_shared<IntelListing>();

    assert!(listing.scout() == SCOUT);
    assert!(listing.intel_type() == 0);
    assert!(listing.system_id() == 42);
    assert!(listing.individual_price() == 500_000);
    assert!(listing.decay_hours() == 24);
    assert!(listing.walrus_blob_id() == b"walrus_blob_abc");
    assert!(listing.delisted() == false);

    test_scenario::return_shared(listing);
    clock::destroy_for_testing(clk);
    scenario.end();
}

#[test]
fun listing_holds_stake() {
    let mut scenario = test_scenario::begin(SCOUT);
    let ctx = scenario.ctx();
    let clk = clock::create_for_testing(ctx);

    let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
    marketplace::create_listing(
        0, 42, 500_000, 24, b"blob", stake, &clk, ctx,
    );

    scenario.next_tx(SCOUT);
    let listing = scenario.take_shared<IntelListing>();

    assert!(listing.stake_value() == 1_000_000);

    test_scenario::return_shared(listing);
    clock::destroy_for_testing(clk);
    scenario.end();
}

// === Delisting ===

#[test]
fun delist_refunds_stake() {
    let mut scenario = test_scenario::begin(SCOUT);
    let ctx = scenario.ctx();
    let clk = clock::create_for_testing(ctx);

    let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
    marketplace::create_listing(
        0, 42, 500_000, 24, b"blob", stake, &clk, ctx,
    );

    scenario.next_tx(SCOUT);
    let mut listing = scenario.take_shared<IntelListing>();

    marketplace::delist(&mut listing, scenario.ctx());

    assert!(listing.delisted() == true);
    assert!(listing.stake_value() == 0);

    test_scenario::return_shared(listing);

    // Verify scout received the refund coin
    scenario.next_tx(SCOUT);
    let refund = scenario.take_from_sender<coin::Coin<SUI>>();
    assert!(refund.value() == 1_000_000);
    refund.burn_for_testing();

    clock::destroy_for_testing(clk);
    scenario.end();
}

#[test, expected_failure(abort_code = marketplace::ENotScout)]
fun delist_by_non_scout_aborts() {
    let mut scenario = test_scenario::begin(SCOUT);
    let ctx = scenario.ctx();
    let clk = clock::create_for_testing(ctx);

    let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
    marketplace::create_listing(
        0, 42, 500_000, 24, b"blob", stake, &clk, ctx,
    );

    // Switch to stranger and try to delist
    scenario.next_tx(STRANGER);
    let mut listing = scenario.take_shared<IntelListing>();

    marketplace::delist(&mut listing, scenario.ctx()); // should abort

    test_scenario::return_shared(listing);
    clock::destroy_for_testing(clk);
    scenario.end();
}

// === Purchasing ===

#[test]
fun purchase_creates_receipt() {
    let mut scenario = test_scenario::begin(SCOUT);
    let ctx = scenario.ctx();
    let clk = clock::create_for_testing(ctx);

    let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
    marketplace::create_listing(
        0, 42, 500_000, 24, b"blob", stake, &clk, ctx,
    );

    // Buyer purchases
    scenario.next_tx(BUYER);
    let mut listing = scenario.take_shared<IntelListing>();
    let listing_id = object::id(&listing);
    let payment = coin::mint_for_testing<SUI>(500_000, scenario.ctx());

    marketplace::purchase(&mut listing, payment, &clk, scenario.ctx());

    test_scenario::return_shared(listing);

    // Verify buyer got a receipt
    scenario.next_tx(BUYER);
    let receipt = scenario.take_from_sender<PurchaseReceipt>();

    assert!(receipt.buyer() == BUYER);
    assert!(receipt.listing_id() == listing_id);

    std::unit_test::destroy(receipt);
    clock::destroy_for_testing(clk);
    scenario.end();
}

#[test]
fun purchase_pays_scout() {
    let mut scenario = test_scenario::begin(SCOUT);
    let ctx = scenario.ctx();
    let clk = clock::create_for_testing(ctx);

    let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
    marketplace::create_listing(
        0, 42, 500_000, 24, b"blob", stake, &clk, ctx,
    );

    // Buyer purchases
    scenario.next_tx(BUYER);
    let mut listing = scenario.take_shared<IntelListing>();
    let payment = coin::mint_for_testing<SUI>(500_000, scenario.ctx());

    marketplace::purchase(&mut listing, payment, &clk, scenario.ctx());

    test_scenario::return_shared(listing);

    // Verify scout received payment
    scenario.next_tx(SCOUT);
    let payment_received = scenario.take_from_sender<coin::Coin<SUI>>();
    assert!(payment_received.value() == 500_000);
    payment_received.burn_for_testing();

    clock::destroy_for_testing(clk);
    scenario.end();
}

#[test, expected_failure(abort_code = marketplace::EListingExpired)]
fun purchase_expired_listing_aborts() {
    let mut scenario = test_scenario::begin(SCOUT);
    let ctx = scenario.ctx();
    let mut clk = clock::create_for_testing(ctx);

    let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
    marketplace::create_listing(
        0, 42, 500_000, 1, // 1 hour decay
        b"blob", stake, &clk, ctx,
    );

    // Advance clock past expiry (2 hours = 7_200_000 ms)
    clock::increment_for_testing(&mut clk, 7_200_000);

    scenario.next_tx(BUYER);
    let mut listing = scenario.take_shared<IntelListing>();
    let payment = coin::mint_for_testing<SUI>(500_000, scenario.ctx());

    marketplace::purchase(&mut listing, payment, &clk, scenario.ctx()); // should abort

    test_scenario::return_shared(listing);
    clock::destroy_for_testing(clk);
    scenario.end();
}

#[test, expected_failure(abort_code = marketplace::EInsufficientPayment)]
fun purchase_underpayment_aborts() {
    let mut scenario = test_scenario::begin(SCOUT);
    let ctx = scenario.ctx();
    let clk = clock::create_for_testing(ctx);

    let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
    marketplace::create_listing(
        0, 42, 500_000, 24, b"blob", stake, &clk, ctx,
    );

    scenario.next_tx(BUYER);
    let mut listing = scenario.take_shared<IntelListing>();
    let payment = coin::mint_for_testing<SUI>(100_000, scenario.ctx()); // too little

    marketplace::purchase(&mut listing, payment, &clk, scenario.ctx()); // should abort

    test_scenario::return_shared(listing);
    clock::destroy_for_testing(clk);
    scenario.end();
}

#[test, expected_failure(abort_code = marketplace::EListingDelisted)]
fun purchase_delisted_listing_aborts() {
    let mut scenario = test_scenario::begin(SCOUT);
    let ctx = scenario.ctx();
    let clk = clock::create_for_testing(ctx);

    let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
    marketplace::create_listing(
        0, 42, 500_000, 24, b"blob", stake, &clk, ctx,
    );

    // Scout delists
    scenario.next_tx(SCOUT);
    let mut listing = scenario.take_shared<IntelListing>();
    marketplace::delist(&mut listing, scenario.ctx());
    test_scenario::return_shared(listing);

    // Buyer tries to purchase delisted listing
    scenario.next_tx(BUYER);
    let mut listing = scenario.take_shared<IntelListing>();
    let payment = coin::mint_for_testing<SUI>(500_000, scenario.ctx());

    marketplace::purchase(&mut listing, payment, &clk, scenario.ctx()); // should abort

    test_scenario::return_shared(listing);
    clock::destroy_for_testing(clk);
    scenario.end();
}

// === Burn receipt ===

#[test]
fun burn_receipt_works() {
    let mut scenario = test_scenario::begin(SCOUT);
    let ctx = scenario.ctx();
    let clk = clock::create_for_testing(ctx);

    let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
    marketplace::create_listing(
        0, 42, 500_000, 24, b"blob", stake, &clk, ctx,
    );

    // Buyer purchases
    scenario.next_tx(BUYER);
    let mut listing = scenario.take_shared<IntelListing>();
    let payment = coin::mint_for_testing<SUI>(500_000, scenario.ctx());
    marketplace::purchase(&mut listing, payment, &clk, scenario.ctx());
    test_scenario::return_shared(listing);

    // Buyer burns their receipt
    scenario.next_tx(BUYER);
    let receipt = scenario.take_from_sender<PurchaseReceipt>();
    marketplace::burn_receipt(receipt, scenario.ctx());

    // Verify receipt no longer exists
    scenario.next_tx(BUYER);
    assert!(!scenario.has_most_recent_for_sender<PurchaseReceipt>());

    clock::destroy_for_testing(clk);
    scenario.end();
}

#[test, expected_failure(abort_code = marketplace::ENotBuyer)]
fun burn_receipt_non_buyer_aborts() {
    let mut scenario = test_scenario::begin(SCOUT);
    let ctx = scenario.ctx();
    let clk = clock::create_for_testing(ctx);

    let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
    marketplace::create_listing(
        0, 42, 500_000, 24, b"blob", stake, &clk, ctx,
    );

    // Buyer purchases
    scenario.next_tx(BUYER);
    let mut listing = scenario.take_shared<IntelListing>();
    let payment = coin::mint_for_testing<SUI>(500_000, scenario.ctx());
    marketplace::purchase(&mut listing, payment, &clk, scenario.ctx());
    test_scenario::return_shared(listing);

    // Transfer receipt to stranger for testing
    scenario.next_tx(BUYER);
    let receipt = scenario.take_from_sender<PurchaseReceipt>();
    marketplace::transfer_receipt_for_testing(receipt, STRANGER);

    // Stranger tries to burn — should abort (receipt.buyer is still BUYER)
    scenario.next_tx(STRANGER);
    let receipt = scenario.take_from_sender<PurchaseReceipt>();
    marketplace::burn_receipt(receipt, scenario.ctx());

    clock::destroy_for_testing(clk);
    scenario.end();
}

// === Seal approve ===

#[test]
fun seal_approve_works() {
    let mut scenario = test_scenario::begin(SCOUT);
    let ctx = scenario.ctx();
    let clk = clock::create_for_testing(ctx);

    let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
    marketplace::create_listing(
        0, 42, 500_000, 24, b"blob", stake, &clk, ctx,
    );

    // Buyer purchases
    scenario.next_tx(BUYER);
    let mut listing = scenario.take_shared<IntelListing>();
    let listing_id = object::id(&listing);
    let payment = coin::mint_for_testing<SUI>(500_000, scenario.ctx());
    marketplace::purchase(&mut listing, payment, &clk, scenario.ctx());
    test_scenario::return_shared(listing);

    // Buyer calls seal_approve with their receipt
    scenario.next_tx(BUYER);
    let receipt = scenario.take_from_sender<PurchaseReceipt>();
    let id_bytes = sui::bcs::to_bytes(&object::id_to_address(&listing_id));

    marketplace::seal_approve(id_bytes, &receipt, scenario.ctx());

    std::unit_test::destroy(receipt);
    clock::destroy_for_testing(clk);
    scenario.end();
}

#[test, expected_failure(abort_code = marketplace::ENotBuyer)]
fun seal_approve_wrong_buyer_aborts() {
    let mut scenario = test_scenario::begin(SCOUT);
    let ctx = scenario.ctx();
    let clk = clock::create_for_testing(ctx);

    let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
    marketplace::create_listing(
        0, 42, 500_000, 24, b"blob", stake, &clk, ctx,
    );

    // Buyer purchases
    scenario.next_tx(BUYER);
    let mut listing = scenario.take_shared<IntelListing>();
    let listing_id = object::id(&listing);
    let payment = coin::mint_for_testing<SUI>(500_000, scenario.ctx());
    marketplace::purchase(&mut listing, payment, &clk, scenario.ctx());
    test_scenario::return_shared(listing);

    // Buyer takes receipt and transfers it to stranger via test-only helper
    // (PurchaseReceipt has key-only, so transfer::transfer is module-restricted)
    scenario.next_tx(BUYER);
    let receipt = scenario.take_from_sender<PurchaseReceipt>();
    marketplace::transfer_receipt_for_testing(receipt, STRANGER);

    // Stranger has the receipt but receipt.buyer is still BUYER
    scenario.next_tx(STRANGER);
    let receipt = scenario.take_from_sender<PurchaseReceipt>();
    let id_bytes = sui::bcs::to_bytes(&object::id_to_address(&listing_id));

    marketplace::seal_approve(id_bytes, &receipt, scenario.ctx()); // should abort

    std::unit_test::destroy(receipt);
    clock::destroy_for_testing(clk);
    scenario.end();
}

#[test, expected_failure(abort_code = marketplace::EWrongListing)]
fun seal_approve_wrong_listing_aborts() {
    let mut scenario = test_scenario::begin(SCOUT);
    let ctx = scenario.ctx();
    let clk = clock::create_for_testing(ctx);

    let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
    marketplace::create_listing(
        0, 42, 500_000, 24, b"blob", stake, &clk, ctx,
    );

    // Buyer purchases
    scenario.next_tx(BUYER);
    let mut listing = scenario.take_shared<IntelListing>();
    let payment = coin::mint_for_testing<SUI>(500_000, scenario.ctx());
    marketplace::purchase(&mut listing, payment, &clk, scenario.ctx());
    test_scenario::return_shared(listing);

    // Buyer tries seal_approve but with a WRONG listing id
    scenario.next_tx(BUYER);
    let receipt = scenario.take_from_sender<PurchaseReceipt>();
    let wrong_addr = @0xDEAD;
    let id_bytes = sui::bcs::to_bytes(&wrong_addr);

    marketplace::seal_approve(id_bytes, &receipt, scenario.ctx()); // should abort

    std::unit_test::destroy(receipt);
    clock::destroy_for_testing(clk);
    scenario.end();
}

#[test]
fun seal_approve_scout_works() {
    let mut scenario = test_scenario::begin(SCOUT);
    let ctx = scenario.ctx();
    let clk = clock::create_for_testing(ctx);

    let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
    marketplace::create_listing(
        0, 42, 500_000, 24, b"blob", stake, &clk, ctx,
    );

    // Scout calls seal_approve_scout on their own listing
    scenario.next_tx(SCOUT);
    let listing = scenario.take_shared<IntelListing>();

    marketplace::seal_approve_scout(b"unused", &listing, scenario.ctx());

    test_scenario::return_shared(listing);
    clock::destroy_for_testing(clk);
    scenario.end();
}

#[test, expected_failure(abort_code = marketplace::ENotScout)]
fun seal_approve_scout_non_scout_aborts() {
    let mut scenario = test_scenario::begin(SCOUT);
    let ctx = scenario.ctx();
    let clk = clock::create_for_testing(ctx);

    let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
    marketplace::create_listing(
        0, 42, 500_000, 24, b"blob", stake, &clk, ctx,
    );

    // Stranger tries seal_approve_scout on someone else's listing
    scenario.next_tx(STRANGER);
    let listing = scenario.take_shared<IntelListing>();

    marketplace::seal_approve_scout(b"unused", &listing, scenario.ctx()); // should abort

    test_scenario::return_shared(listing);
    clock::destroy_for_testing(clk);
    scenario.end();
}

// === set_walrus_blob_id ===

#[test]
fun set_walrus_blob_id_works() {
    let mut scenario = test_scenario::begin(SCOUT);
    let ctx = scenario.ctx();
    let clk = clock::create_for_testing(ctx);

    // Create listing with empty blob_id
    let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
    marketplace::create_listing(
        0, 42, 500_000, 24, b"", stake, &clk, ctx,
    );

    // Scout sets the blob_id
    scenario.next_tx(SCOUT);
    let mut listing = scenario.take_shared<IntelListing>();

    assert!(listing.walrus_blob_id() == b"");
    marketplace::set_walrus_blob_id(&mut listing, b"real_blob_id_abc", scenario.ctx());
    assert!(listing.walrus_blob_id() == b"real_blob_id_abc");

    test_scenario::return_shared(listing);
    clock::destroy_for_testing(clk);
    scenario.end();
}

#[test, expected_failure(abort_code = marketplace::ENotScout)]
fun set_walrus_blob_id_non_scout_aborts() {
    let mut scenario = test_scenario::begin(SCOUT);
    let ctx = scenario.ctx();
    let clk = clock::create_for_testing(ctx);

    let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
    marketplace::create_listing(
        0, 42, 500_000, 24, b"", stake, &clk, ctx,
    );

    // Stranger tries to set blob_id
    scenario.next_tx(STRANGER);
    let mut listing = scenario.take_shared<IntelListing>();

    marketplace::set_walrus_blob_id(&mut listing, b"evil_blob", scenario.ctx()); // should abort

    test_scenario::return_shared(listing);
    clock::destroy_for_testing(clk);
    scenario.end();
}

#[test, expected_failure(abort_code = marketplace::EBlobIdAlreadySet)]
fun set_walrus_blob_id_already_set_aborts() {
    let mut scenario = test_scenario::begin(SCOUT);
    let ctx = scenario.ctx();
    let clk = clock::create_for_testing(ctx);

    let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
    marketplace::create_listing(
        0, 42, 500_000, 24, b"initial_blob", stake, &clk, ctx,
    );

    // Scout tries to change an already-set blob_id
    scenario.next_tx(SCOUT);
    let mut listing = scenario.take_shared<IntelListing>();

    marketplace::set_walrus_blob_id(&mut listing, b"new_blob", scenario.ctx()); // should abort

    test_scenario::return_shared(listing);
    clock::destroy_for_testing(clk);
    scenario.end();
}

// === Input validation ===

#[test, expected_failure(abort_code = marketplace::EInvalidIntelType)]
fun create_listing_invalid_intel_type_aborts() {
    let mut scenario = test_scenario::begin(SCOUT);
    let ctx = scenario.ctx();
    let clk = clock::create_for_testing(ctx);

    let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
    marketplace::create_listing(
        99, // invalid intel_type
        42, 500_000, 24, b"blob", stake, &clk, ctx,
    );

    clock::destroy_for_testing(clk);
    scenario.end();
}

#[test, expected_failure(abort_code = marketplace::EDecayTooLarge)]
fun create_listing_excessive_decay_aborts() {
    let mut scenario = test_scenario::begin(SCOUT);
    let ctx = scenario.ctx();
    let clk = clock::create_for_testing(ctx);

    let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
    marketplace::create_listing(
        0, 42, 500_000,
        10_000, // > MAX_DECAY_HOURS (8760 = 1 year)
        b"blob", stake, &clk, ctx,
    );

    clock::destroy_for_testing(clk);
    scenario.end();
}

// === Double-delist guard ===

#[test, expected_failure(abort_code = marketplace::EAlreadyDelisted)]
fun double_delist_aborts() {
    let mut scenario = test_scenario::begin(SCOUT);
    let ctx = scenario.ctx();
    let clk = clock::create_for_testing(ctx);

    let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
    marketplace::create_listing(
        0, 42, 500_000, 24, b"blob", stake, &clk, ctx,
    );

    // First delist succeeds
    scenario.next_tx(SCOUT);
    let mut listing = scenario.take_shared<IntelListing>();
    marketplace::delist(&mut listing, scenario.ctx());
    test_scenario::return_shared(listing);

    // Second delist should abort
    scenario.next_tx(SCOUT);
    let mut listing = scenario.take_shared<IntelListing>();
    marketplace::delist(&mut listing, scenario.ctx()); // should abort

    test_scenario::return_shared(listing);
    clock::destroy_for_testing(clk);
    scenario.end();
}

// === Claim expired stake ===

#[test]
fun claim_expired_stake_by_scout() {
    let mut scenario = test_scenario::begin(SCOUT);
    let ctx = scenario.ctx();
    let mut clk = clock::create_for_testing(ctx);

    let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
    marketplace::create_listing(
        0, 42, 500_000, 1, // 1 hour decay
        b"blob", stake, &clk, ctx,
    );

    // Advance clock past expiry
    clock::increment_for_testing(&mut clk, 7_200_000);

    scenario.next_tx(SCOUT);
    let mut listing = scenario.take_shared<IntelListing>();

    marketplace::claim_expired_stake(&mut listing, &clk, scenario.ctx());

    assert!(listing.delisted() == true);
    assert!(listing.stake_value() == 0);

    test_scenario::return_shared(listing);

    // Verify scout received the refund
    scenario.next_tx(SCOUT);
    let refund = scenario.take_from_sender<coin::Coin<SUI>>();
    assert!(refund.value() == 1_000_000);
    refund.burn_for_testing();

    clock::destroy_for_testing(clk);
    scenario.end();
}

#[test]
fun claim_expired_stake_by_stranger() {
    let mut scenario = test_scenario::begin(SCOUT);
    let ctx = scenario.ctx();
    let mut clk = clock::create_for_testing(ctx);

    let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
    marketplace::create_listing(
        0, 42, 500_000, 1, b"blob", stake, &clk, ctx,
    );

    // Advance clock past expiry
    clock::increment_for_testing(&mut clk, 7_200_000);

    // Stranger triggers the claim — refund still goes to scout
    scenario.next_tx(STRANGER);
    let mut listing = scenario.take_shared<IntelListing>();

    marketplace::claim_expired_stake(&mut listing, &clk, scenario.ctx());

    assert!(listing.delisted() == true);
    assert!(listing.stake_value() == 0);

    test_scenario::return_shared(listing);

    // Verify SCOUT (not stranger) received the refund
    scenario.next_tx(SCOUT);
    let refund = scenario.take_from_sender<coin::Coin<SUI>>();
    assert!(refund.value() == 1_000_000);
    refund.burn_for_testing();

    clock::destroy_for_testing(clk);
    scenario.end();
}

#[test, expected_failure(abort_code = marketplace::EListingNotExpired)]
fun claim_expired_stake_not_expired_aborts() {
    let mut scenario = test_scenario::begin(SCOUT);
    let ctx = scenario.ctx();
    let clk = clock::create_for_testing(ctx);

    let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
    marketplace::create_listing(
        0, 42, 500_000, 24, b"blob", stake, &clk, ctx,
    );

    // Try to claim before expiry
    scenario.next_tx(SCOUT);
    let mut listing = scenario.take_shared<IntelListing>();

    marketplace::claim_expired_stake(&mut listing, &clk, scenario.ctx()); // should abort

    test_scenario::return_shared(listing);
    clock::destroy_for_testing(clk);
    scenario.end();
}

#[test, expected_failure(abort_code = marketplace::EAlreadyDelisted)]
fun claim_expired_stake_already_delisted_aborts() {
    let mut scenario = test_scenario::begin(SCOUT);
    let ctx = scenario.ctx();
    let mut clk = clock::create_for_testing(ctx);

    let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
    marketplace::create_listing(
        0, 42, 500_000, 1, b"blob", stake, &clk, ctx,
    );

    // Scout delists before expiry
    scenario.next_tx(SCOUT);
    let mut listing = scenario.take_shared<IntelListing>();
    marketplace::delist(&mut listing, scenario.ctx());
    test_scenario::return_shared(listing);

    // Advance past expiry and try claim_expired_stake
    clock::increment_for_testing(&mut clk, 7_200_000);

    scenario.next_tx(SCOUT);
    let mut listing = scenario.take_shared<IntelListing>();
    marketplace::claim_expired_stake(&mut listing, &clk, scenario.ctx()); // should abort

    test_scenario::return_shared(listing);
    clock::destroy_for_testing(clk);
    scenario.end();
}

// === ZK-verified listing ===

#[test]
fun test_create_listing_not_verified() {
    let mut scenario = test_scenario::begin(@0xA);
    {
        let ctx = test_scenario::ctx(&mut scenario);
        let clock = clock::create_for_testing(ctx);
        let coin = coin::mint_for_testing<SUI>(1_000_000_000, ctx);
        marketplace::create_listing(
            1, 1001, 100, 24, b"blob", coin, &clock, ctx
        );
        clock::destroy_for_testing(clock);
    };
    test_scenario::next_tx(&mut scenario, @0xA);
    {
        let listing = test_scenario::take_shared<IntelListing>(&scenario);
        assert!(!marketplace::is_verified(&listing));
        assert!(marketplace::location_proof_hash(&listing).length() == 0);
        test_scenario::return_shared(listing);
    };
    test_scenario::end(scenario);
}

#[test]
#[expected_failure(abort_code = marketplace::EInvalidLocationProof)]
fun test_create_verified_listing_invalid_proof() {
    let mut scenario = test_scenario::begin(@0xA);
    // Create the LocationVKey shared object via init
    {
        let ctx = test_scenario::ctx(&mut scenario);
        marketplace::init_for_testing(ctx);
    };
    test_scenario::next_tx(&mut scenario, @0xA);
    {
        let vkey = test_scenario::take_shared<LocationVKey>(&scenario);
        let ctx = test_scenario::ctx(&mut scenario);
        let clock = clock::create_for_testing(ctx);
        let coin = coin::mint_for_testing<SUI>(1_000_000_000, ctx);
        // Properly-sized garbage: 128 bytes for proof points, 96 bytes for 3 public inputs (3×32).
        // Passes groth16 parsing but fails verification → EInvalidLocationProof.
        let fake_proof = x"0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
        let fake_inputs = x"000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
        marketplace::create_verified_listing(
            1, 1001, 100, 24, b"blob", coin,
            &vkey,
            fake_proof,
            fake_inputs,
            &clock, ctx
        );
        clock::destroy_for_testing(clock);
        test_scenario::return_shared(vkey);
    };
    test_scenario::end(scenario);
}

#[test]
fun test_is_verified_getter() {
    // Test that is_verified reflects location_proof_hash content
    // Create unverified listing, confirm false.
    // (For verified, we'd need a real proof — the invalid proof test covers the abort path)
    let mut scenario = test_scenario::begin(@0xA);
    {
        let ctx = test_scenario::ctx(&mut scenario);
        let clock = clock::create_for_testing(ctx);
        let coin = coin::mint_for_testing<SUI>(1_000_000_000, ctx);
        marketplace::create_listing(1, 1001, 100, 24, b"blob", coin, &clock, ctx);
        clock::destroy_for_testing(clock);
    };
    test_scenario::next_tx(&mut scenario, @0xA);
    {
        let listing = test_scenario::take_shared<IntelListing>(&scenario);
        assert!(!marketplace::is_verified(&listing));
        assert!(marketplace::location_proof_hash(&listing) == vector::empty());
        test_scenario::return_shared(listing);
    };
    test_scenario::end(scenario);
}

#[test]
fun purchase_overpayment_refunds_buyer() {
    let mut scenario = test_scenario::begin(SCOUT);
    let ctx = scenario.ctx();
    let clk = clock::create_for_testing(ctx);

    let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
    marketplace::create_listing(
        0, 42, 500_000, 24, b"blob", stake, &clk, ctx,
    );

    // Buyer pays 2x the price
    scenario.next_tx(BUYER);
    let mut listing = scenario.take_shared<IntelListing>();
    let payment = coin::mint_for_testing<SUI>(1_000_000, scenario.ctx());
    marketplace::purchase(&mut listing, payment, &clk, scenario.ctx());
    test_scenario::return_shared(listing);

    // Verify scout received exactly the listing price
    scenario.next_tx(SCOUT);
    let scout_payment = scenario.take_from_sender<coin::Coin<SUI>>();
    assert!(scout_payment.value() == 500_000);
    scout_payment.burn_for_testing();

    // Verify buyer received refund of excess
    scenario.next_tx(BUYER);
    let refund = scenario.take_from_sender<coin::Coin<SUI>>();
    assert!(refund.value() == 500_000);
    refund.burn_for_testing();

    clock::destroy_for_testing(clk);
    scenario.end();
}
