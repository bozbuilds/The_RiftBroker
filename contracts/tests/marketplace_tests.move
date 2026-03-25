#[test_only]
module rift_broker::marketplace_tests;

use sui::test_scenario;
use sui::coin;
use sui::sui::SUI;
use sui::clock;
use rift_broker::marketplace::{Self, IntelListing, LocationVKey, DistanceVKey, PurchaseReceipt, PresenceVKey, ReputationVKey, ScoutRegistry};

const SCOUT: address = @0xA;
const BUYER: address = @0xB;
const STRANGER: address = @0xC;

// === Listing creation ===

#[test]
fun listing_creation_works() {
    let mut scenario = test_scenario::begin(SCOUT);
    {
        let ctx = scenario.ctx();
        let reg = marketplace::create_registry_for_testing(ctx);
        marketplace::share_registry_for_testing(reg);
    };
    scenario.next_tx(SCOUT);
    let mut registry = scenario.take_shared<ScoutRegistry>();
    let ctx = scenario.ctx();
    let clk = clock::create_for_testing(ctx);

    let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
    marketplace::create_listing(
        &mut registry,
        0, // intel_type: resource
        42, // system_id
        500_000, // individual_price
        24, // decay_hours
        b"walrus_blob_abc",
        stake,
        &clk,
        ctx,
    );

    test_scenario::return_shared(registry);

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
    {
        let ctx = scenario.ctx();
        let reg = marketplace::create_registry_for_testing(ctx);
        marketplace::share_registry_for_testing(reg);
    };
    scenario.next_tx(SCOUT);
    let mut registry = scenario.take_shared<ScoutRegistry>();
    let ctx = scenario.ctx();
    let clk = clock::create_for_testing(ctx);

    let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
    marketplace::create_listing(
        &mut registry,
        0, 42, 500_000, 24, b"blob", stake, &clk, ctx,
    );

    test_scenario::return_shared(registry);

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
    {
        let ctx = scenario.ctx();
        let reg = marketplace::create_registry_for_testing(ctx);
        marketplace::share_registry_for_testing(reg);
    };
    scenario.next_tx(SCOUT);
    let mut registry = scenario.take_shared<ScoutRegistry>();
    let ctx = scenario.ctx();
    let clk = clock::create_for_testing(ctx);

    let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
    marketplace::create_listing(
        &mut registry,
        0, 42, 500_000, 24, b"blob", stake, &clk, ctx,
    );

    test_scenario::return_shared(registry);

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
    {
        let ctx = scenario.ctx();
        let reg = marketplace::create_registry_for_testing(ctx);
        marketplace::share_registry_for_testing(reg);
    };
    scenario.next_tx(SCOUT);
    let mut registry = scenario.take_shared<ScoutRegistry>();
    let ctx = scenario.ctx();
    let clk = clock::create_for_testing(ctx);

    let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
    marketplace::create_listing(
        &mut registry,
        0, 42, 500_000, 24, b"blob", stake, &clk, ctx,
    );

    test_scenario::return_shared(registry);

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
    {
        let ctx = scenario.ctx();
        let reg = marketplace::create_registry_for_testing(ctx);
        marketplace::share_registry_for_testing(reg);
    };
    scenario.next_tx(SCOUT);
    let mut registry = scenario.take_shared<ScoutRegistry>();
    let ctx = scenario.ctx();
    let clk = clock::create_for_testing(ctx);

    let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
    marketplace::create_listing(
        &mut registry,
        0, 42, 500_000, 24, b"blob", stake, &clk, ctx,
    );

    test_scenario::return_shared(registry);

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
    {
        let ctx = scenario.ctx();
        let reg = marketplace::create_registry_for_testing(ctx);
        marketplace::share_registry_for_testing(reg);
    };
    scenario.next_tx(SCOUT);
    let mut registry = scenario.take_shared<ScoutRegistry>();
    let ctx = scenario.ctx();
    let clk = clock::create_for_testing(ctx);

    let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
    marketplace::create_listing(
        &mut registry,
        0, 42, 500_000, 24, b"blob", stake, &clk, ctx,
    );

    test_scenario::return_shared(registry);

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
    {
        let ctx = scenario.ctx();
        let reg = marketplace::create_registry_for_testing(ctx);
        marketplace::share_registry_for_testing(reg);
    };
    scenario.next_tx(SCOUT);
    let mut registry = scenario.take_shared<ScoutRegistry>();
    let ctx = scenario.ctx();
    let mut clk = clock::create_for_testing(ctx);

    let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
    marketplace::create_listing(
        &mut registry,
        0, 42, 500_000, 1, // 1 hour decay
        b"blob", stake, &clk, ctx,
    );

    test_scenario::return_shared(registry);

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
    {
        let ctx = scenario.ctx();
        let reg = marketplace::create_registry_for_testing(ctx);
        marketplace::share_registry_for_testing(reg);
    };
    scenario.next_tx(SCOUT);
    let mut registry = scenario.take_shared<ScoutRegistry>();
    let ctx = scenario.ctx();
    let clk = clock::create_for_testing(ctx);

    let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
    marketplace::create_listing(
        &mut registry,
        0, 42, 500_000, 24, b"blob", stake, &clk, ctx,
    );

    test_scenario::return_shared(registry);

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
    {
        let ctx = scenario.ctx();
        let reg = marketplace::create_registry_for_testing(ctx);
        marketplace::share_registry_for_testing(reg);
    };
    scenario.next_tx(SCOUT);
    let mut registry = scenario.take_shared<ScoutRegistry>();
    let ctx = scenario.ctx();
    let clk = clock::create_for_testing(ctx);

    let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
    marketplace::create_listing(
        &mut registry,
        0, 42, 500_000, 24, b"blob", stake, &clk, ctx,
    );

    test_scenario::return_shared(registry);

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
    {
        let ctx = scenario.ctx();
        let reg = marketplace::create_registry_for_testing(ctx);
        marketplace::share_registry_for_testing(reg);
    };
    scenario.next_tx(SCOUT);
    let mut registry = scenario.take_shared<ScoutRegistry>();
    let ctx = scenario.ctx();
    let clk = clock::create_for_testing(ctx);

    let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
    marketplace::create_listing(
        &mut registry,
        0, 42, 500_000, 24, b"blob", stake, &clk, ctx,
    );

    test_scenario::return_shared(registry);

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
    {
        let ctx = scenario.ctx();
        let reg = marketplace::create_registry_for_testing(ctx);
        marketplace::share_registry_for_testing(reg);
    };
    scenario.next_tx(SCOUT);
    let mut registry = scenario.take_shared<ScoutRegistry>();
    let ctx = scenario.ctx();
    let clk = clock::create_for_testing(ctx);

    let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
    marketplace::create_listing(
        &mut registry,
        0, 42, 500_000, 24, b"blob", stake, &clk, ctx,
    );

    test_scenario::return_shared(registry);

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
    {
        let ctx = scenario.ctx();
        let reg = marketplace::create_registry_for_testing(ctx);
        marketplace::share_registry_for_testing(reg);
    };
    scenario.next_tx(SCOUT);
    let mut registry = scenario.take_shared<ScoutRegistry>();
    let ctx = scenario.ctx();
    let clk = clock::create_for_testing(ctx);

    let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
    marketplace::create_listing(
        &mut registry,
        0, 42, 500_000, 24, b"blob", stake, &clk, ctx,
    );

    test_scenario::return_shared(registry);

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
    {
        let ctx = scenario.ctx();
        let reg = marketplace::create_registry_for_testing(ctx);
        marketplace::share_registry_for_testing(reg);
    };
    scenario.next_tx(SCOUT);
    let mut registry = scenario.take_shared<ScoutRegistry>();
    let ctx = scenario.ctx();
    let clk = clock::create_for_testing(ctx);

    let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
    marketplace::create_listing(
        &mut registry,
        0, 42, 500_000, 24, b"blob", stake, &clk, ctx,
    );

    test_scenario::return_shared(registry);

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
    {
        let ctx = scenario.ctx();
        let reg = marketplace::create_registry_for_testing(ctx);
        marketplace::share_registry_for_testing(reg);
    };
    scenario.next_tx(SCOUT);
    let mut registry = scenario.take_shared<ScoutRegistry>();
    let ctx = scenario.ctx();
    let clk = clock::create_for_testing(ctx);

    let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
    marketplace::create_listing(
        &mut registry,
        0, 42, 500_000, 24, b"blob", stake, &clk, ctx,
    );

    test_scenario::return_shared(registry);

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
    {
        let ctx = scenario.ctx();
        let reg = marketplace::create_registry_for_testing(ctx);
        marketplace::share_registry_for_testing(reg);
    };
    scenario.next_tx(SCOUT);
    let mut registry = scenario.take_shared<ScoutRegistry>();
    let ctx = scenario.ctx();
    let clk = clock::create_for_testing(ctx);

    let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
    marketplace::create_listing(
        &mut registry,
        0, 42, 500_000, 24, b"blob", stake, &clk, ctx,
    );

    test_scenario::return_shared(registry);

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
    {
        let ctx = scenario.ctx();
        let reg = marketplace::create_registry_for_testing(ctx);
        marketplace::share_registry_for_testing(reg);
    };
    scenario.next_tx(SCOUT);
    let mut registry = scenario.take_shared<ScoutRegistry>();
    let ctx = scenario.ctx();
    let clk = clock::create_for_testing(ctx);

    let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
    marketplace::create_listing(
        &mut registry,
        0, 42, 500_000, 24, b"blob", stake, &clk, ctx,
    );

    test_scenario::return_shared(registry);

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
    {
        let ctx = scenario.ctx();
        let reg = marketplace::create_registry_for_testing(ctx);
        marketplace::share_registry_for_testing(reg);
    };
    scenario.next_tx(SCOUT);
    let mut registry = scenario.take_shared<ScoutRegistry>();
    let ctx = scenario.ctx();
    let clk = clock::create_for_testing(ctx);

    // Create listing with empty blob_id
    let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
    marketplace::create_listing(
        &mut registry,
        0, 42, 500_000, 24, b"", stake, &clk, ctx,
    );

    test_scenario::return_shared(registry);

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
    {
        let ctx = scenario.ctx();
        let reg = marketplace::create_registry_for_testing(ctx);
        marketplace::share_registry_for_testing(reg);
    };
    scenario.next_tx(SCOUT);
    let mut registry = scenario.take_shared<ScoutRegistry>();
    let ctx = scenario.ctx();
    let clk = clock::create_for_testing(ctx);

    let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
    marketplace::create_listing(
        &mut registry,
        0, 42, 500_000, 24, b"", stake, &clk, ctx,
    );

    test_scenario::return_shared(registry);

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
    {
        let ctx = scenario.ctx();
        let reg = marketplace::create_registry_for_testing(ctx);
        marketplace::share_registry_for_testing(reg);
    };
    scenario.next_tx(SCOUT);
    let mut registry = scenario.take_shared<ScoutRegistry>();
    let ctx = scenario.ctx();
    let clk = clock::create_for_testing(ctx);

    let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
    marketplace::create_listing(
        &mut registry,
        0, 42, 500_000, 24, b"initial_blob", stake, &clk, ctx,
    );

    test_scenario::return_shared(registry);

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
    {
        let ctx = scenario.ctx();
        let reg = marketplace::create_registry_for_testing(ctx);
        marketplace::share_registry_for_testing(reg);
    };
    scenario.next_tx(SCOUT);
    let mut registry = scenario.take_shared<ScoutRegistry>();
    let ctx = scenario.ctx();
    let clk = clock::create_for_testing(ctx);

    let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
    marketplace::create_listing(
        &mut registry,
        99, // invalid intel_type
        42, 500_000, 24, b"blob", stake, &clk, ctx,
    );

    test_scenario::return_shared(registry);
    clock::destroy_for_testing(clk);
    scenario.end();
}

#[test, expected_failure(abort_code = marketplace::EDecayTooLarge)]
fun create_listing_excessive_decay_aborts() {
    let mut scenario = test_scenario::begin(SCOUT);
    {
        let ctx = scenario.ctx();
        let reg = marketplace::create_registry_for_testing(ctx);
        marketplace::share_registry_for_testing(reg);
    };
    scenario.next_tx(SCOUT);
    let mut registry = scenario.take_shared<ScoutRegistry>();
    let ctx = scenario.ctx();
    let clk = clock::create_for_testing(ctx);

    let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
    marketplace::create_listing(
        &mut registry,
        0, 42, 500_000,
        10_000, // > MAX_DECAY_HOURS (8760 = 1 year)
        b"blob", stake, &clk, ctx,
    );

    test_scenario::return_shared(registry);
    clock::destroy_for_testing(clk);
    scenario.end();
}

#[test, expected_failure(abort_code = marketplace::EDecayTooSmall)]
fun test_create_listing_zero_decay_aborts() {
    let mut scenario = test_scenario::begin(SCOUT);
    {
        let ctx = scenario.ctx();
        let reg = marketplace::create_registry_for_testing(ctx);
        marketplace::share_registry_for_testing(reg);
    };
    scenario.next_tx(SCOUT);
    let mut registry = scenario.take_shared<ScoutRegistry>();
    let ctx = scenario.ctx();
    let clk = clock::create_for_testing(ctx);

    let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
    marketplace::create_listing(
        &mut registry,
        0, 42, 500_000,
        0, // < MIN_DECAY_HOURS (1)
        b"blob", stake, &clk, ctx,
    );

    test_scenario::return_shared(registry);
    clock::destroy_for_testing(clk);
    scenario.end();
}

// === Double-delist guard ===

#[test, expected_failure(abort_code = marketplace::EAlreadyDelisted)]
fun double_delist_aborts() {
    let mut scenario = test_scenario::begin(SCOUT);
    {
        let ctx = scenario.ctx();
        let reg = marketplace::create_registry_for_testing(ctx);
        marketplace::share_registry_for_testing(reg);
    };
    scenario.next_tx(SCOUT);
    let mut registry = scenario.take_shared<ScoutRegistry>();
    let ctx = scenario.ctx();
    let clk = clock::create_for_testing(ctx);

    let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
    marketplace::create_listing(
        &mut registry,
        0, 42, 500_000, 24, b"blob", stake, &clk, ctx,
    );

    test_scenario::return_shared(registry);

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
    {
        let ctx = scenario.ctx();
        let reg = marketplace::create_registry_for_testing(ctx);
        marketplace::share_registry_for_testing(reg);
    };
    scenario.next_tx(SCOUT);
    let mut registry = scenario.take_shared<ScoutRegistry>();
    let ctx = scenario.ctx();
    let mut clk = clock::create_for_testing(ctx);

    let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
    marketplace::create_listing(
        &mut registry,
        0, 42, 500_000, 1, // 1 hour decay
        b"blob", stake, &clk, ctx,
    );

    test_scenario::return_shared(registry);

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
    {
        let ctx = scenario.ctx();
        let reg = marketplace::create_registry_for_testing(ctx);
        marketplace::share_registry_for_testing(reg);
    };
    scenario.next_tx(SCOUT);
    let mut registry = scenario.take_shared<ScoutRegistry>();
    let ctx = scenario.ctx();
    let mut clk = clock::create_for_testing(ctx);

    let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
    marketplace::create_listing(
        &mut registry,
        0, 42, 500_000, 1, b"blob", stake, &clk, ctx,
    );

    test_scenario::return_shared(registry);

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
    {
        let ctx = scenario.ctx();
        let reg = marketplace::create_registry_for_testing(ctx);
        marketplace::share_registry_for_testing(reg);
    };
    scenario.next_tx(SCOUT);
    let mut registry = scenario.take_shared<ScoutRegistry>();
    let ctx = scenario.ctx();
    let clk = clock::create_for_testing(ctx);

    let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
    marketplace::create_listing(
        &mut registry,
        0, 42, 500_000, 24, b"blob", stake, &clk, ctx,
    );

    test_scenario::return_shared(registry);

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
    {
        let ctx = scenario.ctx();
        let reg = marketplace::create_registry_for_testing(ctx);
        marketplace::share_registry_for_testing(reg);
    };
    scenario.next_tx(SCOUT);
    let mut registry = scenario.take_shared<ScoutRegistry>();
    let ctx = scenario.ctx();
    let mut clk = clock::create_for_testing(ctx);

    let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
    marketplace::create_listing(
        &mut registry,
        0, 42, 500_000, 1, b"blob", stake, &clk, ctx,
    );

    test_scenario::return_shared(registry);

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
        let reg = marketplace::create_registry_for_testing(ctx);
        marketplace::share_registry_for_testing(reg);
    };
    test_scenario::next_tx(&mut scenario, @0xA);
    {
        let mut registry = test_scenario::take_shared<ScoutRegistry>(&scenario);
        let ctx = test_scenario::ctx(&mut scenario);
        let clock = clock::create_for_testing(ctx);
        let coin = coin::mint_for_testing<SUI>(1_000_000_000, ctx);
        marketplace::create_listing(
            &mut registry,
            1, 1001, 100, 24, b"blob", coin, &clock, ctx
        );
        test_scenario::return_shared(registry);
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
        let mut registry = test_scenario::take_shared<ScoutRegistry>(&scenario);
        let vkey = test_scenario::take_shared<LocationVKey>(&scenario);
        let ctx = test_scenario::ctx(&mut scenario);
        let clock = clock::create_for_testing(ctx);
        let coin = coin::mint_for_testing<SUI>(1_000_000_000, ctx);
        // Properly-sized garbage: 128 bytes for proof points, 128 bytes for 4 public inputs (4×32).
        // Phase 3: 4 signals = 1 output (timestamp) + 3 inputs.
        // Passes groth16 parsing but fails verification → EInvalidLocationProof.
        let fake_proof = x"0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
        let fake_inputs = x"0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
        marketplace::create_verified_listing(
            &mut registry,
            1, 1001, 100, 24, b"blob", coin,
            &vkey,
            fake_proof,
            fake_inputs,
            &clock, ctx
        );
        clock::destroy_for_testing(clock);
        test_scenario::return_shared(registry);
        test_scenario::return_shared(vkey);
    };
    test_scenario::end(scenario);
}

#[test, expected_failure(abort_code = marketplace::EProfileNotFound)]
fun test_reputation_proof_no_profile() {
    let mut scenario = test_scenario::begin(@0xA);
    {
        let ctx = test_scenario::ctx(&mut scenario);
        marketplace::init_for_testing(ctx);
    };
    test_scenario::next_tx(&mut scenario, @0xA);
    {
        let mut registry = test_scenario::take_shared<ScoutRegistry>(&scenario);
        let vkey = test_scenario::take_shared<ReputationVKey>(&scenario);
        let ctx = test_scenario::ctx(&mut scenario);
        let fake_proof = x"0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
        let fake_inputs = x"0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
        marketplace::attach_reputation_proof(&mut registry, &vkey, fake_proof, fake_inputs, ctx);
        test_scenario::return_shared(registry);
        test_scenario::return_shared(vkey);
    };
    test_scenario::end(scenario);
}

#[test, expected_failure(abort_code = marketplace::EMerkleRootMismatch)]
fun test_reputation_proof_invalid_proof() {
    let mut scenario = test_scenario::begin(@0xA);
    {
        let ctx = test_scenario::ctx(&mut scenario);
        marketplace::init_for_testing(ctx);
    };
    test_scenario::next_tx(&mut scenario, @0xA);
    {
        let mut registry = test_scenario::take_shared<ScoutRegistry>(&scenario);
        let ctx = test_scenario::ctx(&mut scenario);
        let clock = clock::create_for_testing(ctx);
        let coin = coin::mint_for_testing<SUI>(1_000_000_000, ctx);
        marketplace::create_listing(&mut registry, 1, 1001, 100, 24, b"blob", coin, &clock, ctx);
        test_scenario::return_shared(registry);
        clock::destroy_for_testing(clock);
    };
    test_scenario::next_tx(&mut scenario, @0xA);
    {
        let mut registry = test_scenario::take_shared<ScoutRegistry>(&scenario);
        let vkey = test_scenario::take_shared<ReputationVKey>(&scenario);
        let ctx = test_scenario::ctx(&mut scenario);
        let fake_proof = x"0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
        // 3×32 LE: root=0, claimBadgeType=1, claimCount=1 — root mismatch caught before Groth16.
        let mut fake_inputs = vector::empty<u8>();
        let mut zi = 0u64;
        while (zi < 96) {
            vector::push_back(&mut fake_inputs, 0);
            zi = zi + 1;
        };
        *vector::borrow_mut(&mut fake_inputs, 32) = 1;
        *vector::borrow_mut(&mut fake_inputs, 64) = 1;
        marketplace::attach_reputation_proof(&mut registry, &vkey, fake_proof, fake_inputs, ctx);
        test_scenario::return_shared(registry);
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
        let reg = marketplace::create_registry_for_testing(ctx);
        marketplace::share_registry_for_testing(reg);
    };
    test_scenario::next_tx(&mut scenario, @0xA);
    {
        let mut registry = test_scenario::take_shared<ScoutRegistry>(&scenario);
        let ctx = test_scenario::ctx(&mut scenario);
        let clock = clock::create_for_testing(ctx);
        let coin = coin::mint_for_testing<SUI>(1_000_000_000, ctx);
        marketplace::create_listing(&mut registry, 1, 1001, 100, 24, b"blob", coin, &clock, ctx);
        test_scenario::return_shared(registry);
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
    {
        let ctx = scenario.ctx();
        let reg = marketplace::create_registry_for_testing(ctx);
        marketplace::share_registry_for_testing(reg);
    };
    scenario.next_tx(SCOUT);
    let mut registry = scenario.take_shared<ScoutRegistry>();
    let ctx = scenario.ctx();
    let clk = clock::create_for_testing(ctx);

    let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
    marketplace::create_listing(
        &mut registry,
        0, 42, 500_000, 24, b"blob", stake, &clk, ctx,
    );

    test_scenario::return_shared(registry);

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

// === Distance proof ===

#[test, expected_failure(abort_code = marketplace::ENoLocationProof)]
fun test_attach_distance_proof_requires_location_proof() {
    let mut scenario = test_scenario::begin(SCOUT);
    {
        let ctx = scenario.ctx();
        marketplace::init_for_testing(ctx);
    };
    scenario.next_tx(SCOUT);
    {
        let mut registry = scenario.take_shared<ScoutRegistry>();
        let ctx = scenario.ctx();
        let clk = clock::create_for_testing(ctx);
        let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
        marketplace::create_listing(&mut registry, 1, 42, 500_000, 24, b"blob", stake, &clk, ctx);
        test_scenario::return_shared(registry);
        clock::destroy_for_testing(clk);
    };
    scenario.next_tx(SCOUT);
    {
        let mut listing = scenario.take_shared<IntelListing>();
        let dvkey = scenario.take_shared<DistanceVKey>();
        let fake_proof = x"0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
        let fake_inputs = x"000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
        marketplace::attach_distance_proof(
            &mut listing, &dvkey, fake_proof, fake_inputs, scenario.ctx()
        );
        test_scenario::return_shared(listing);
        test_scenario::return_shared(dvkey);
    };
    scenario.end();
}

#[test]
fun test_has_distance_proof_false_on_new_listing() {
    let mut scenario = test_scenario::begin(SCOUT);
    {
        let ctx = scenario.ctx();
        let reg = marketplace::create_registry_for_testing(ctx);
        marketplace::share_registry_for_testing(reg);
    };
    scenario.next_tx(SCOUT);
    {
        let mut registry = scenario.take_shared<ScoutRegistry>();
        let ctx = scenario.ctx();
        let clk = clock::create_for_testing(ctx);
        let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
        marketplace::create_listing(&mut registry, 1, 42, 500_000, 24, b"blob", stake, &clk, ctx);
        test_scenario::return_shared(registry);
        clock::destroy_for_testing(clk);
    };
    scenario.next_tx(SCOUT);
    {
        let listing = scenario.take_shared<IntelListing>();
        assert!(!marketplace::has_distance_proof(&listing));
        assert!(marketplace::distance_proof_hash(&listing) == vector::empty());
        test_scenario::return_shared(listing);
    };
    scenario.end();
}

#[test, expected_failure(abort_code = marketplace::ENotScout)]
fun test_attach_distance_proof_rejects_non_scout() {
    let mut scenario = test_scenario::begin(SCOUT);
    {
        let ctx = scenario.ctx();
        marketplace::init_for_testing(ctx);
    };
    scenario.next_tx(SCOUT);
    {
        let mut registry = scenario.take_shared<ScoutRegistry>();
        let ctx = scenario.ctx();
        let clk = clock::create_for_testing(ctx);
        let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
        marketplace::create_listing(&mut registry, 1, 42, 500_000, 24, b"blob", stake, &clk, ctx);
        test_scenario::return_shared(registry);
        clock::destroy_for_testing(clk);
    };
    scenario.next_tx(SCOUT);
    {
        let mut listing = scenario.take_shared<IntelListing>();
        marketplace::set_location_proof_hash_for_testing(&mut listing, b"fake_location_hash");
        test_scenario::return_shared(listing);
    };
    // BUYER attempts to attach — should fail
    scenario.next_tx(BUYER);
    {
        let mut listing = scenario.take_shared<IntelListing>();
        let dvkey = scenario.take_shared<DistanceVKey>();
        let fake_proof = x"0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
        let fake_inputs = x"000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
        marketplace::attach_distance_proof(
            &mut listing, &dvkey, fake_proof, fake_inputs, scenario.ctx()
        );
        test_scenario::return_shared(listing);
        test_scenario::return_shared(dvkey);
    };
    scenario.end();
}

#[test, expected_failure(abort_code = marketplace::EDistanceProofAlreadySet)]
fun test_attach_distance_proof_rejects_double_attach() {
    let mut scenario = test_scenario::begin(SCOUT);
    {
        let ctx = scenario.ctx();
        marketplace::init_for_testing(ctx);
    };
    scenario.next_tx(SCOUT);
    {
        let mut registry = scenario.take_shared<ScoutRegistry>();
        let ctx = scenario.ctx();
        let clk = clock::create_for_testing(ctx);
        let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
        marketplace::create_listing(&mut registry, 1, 42, 500_000, 24, b"blob", stake, &clk, ctx);
        test_scenario::return_shared(registry);
        clock::destroy_for_testing(clk);
    };
    scenario.next_tx(SCOUT);
    {
        let mut listing = scenario.take_shared<IntelListing>();
        marketplace::set_location_proof_hash_for_testing(&mut listing, b"fake_location_hash");
        marketplace::set_distance_proof_hash_for_testing(&mut listing, b"already_set");
        test_scenario::return_shared(listing);
    };
    scenario.next_tx(SCOUT);
    {
        let mut listing = scenario.take_shared<IntelListing>();
        let dvkey = scenario.take_shared<DistanceVKey>();
        let fake_proof = x"0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
        let fake_inputs = x"000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
        marketplace::attach_distance_proof(
            &mut listing, &dvkey, fake_proof, fake_inputs, scenario.ctx()
        );
        test_scenario::return_shared(listing);
        test_scenario::return_shared(dvkey);
    };
    scenario.end();
}

// === Presence proof (ZK Phase 5) ===

#[test]
fun test_unverified_listing_empty_jump_tx_digest() {
    let mut scenario = test_scenario::begin(SCOUT);
    {
        let ctx = scenario.ctx();
        let reg = marketplace::create_registry_for_testing(ctx);
        marketplace::share_registry_for_testing(reg);
    };
    scenario.next_tx(SCOUT);
    {
        let mut registry = scenario.take_shared<ScoutRegistry>();
        let ctx = scenario.ctx();
        let clk = clock::create_for_testing(ctx);
        let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
        marketplace::create_listing(&mut registry, 1, 42, 500_000, 24, b"blob", stake, &clk, ctx);
        test_scenario::return_shared(registry);
        clock::destroy_for_testing(clk);
    };
    scenario.next_tx(SCOUT);
    {
        let listing = scenario.take_shared<IntelListing>();
        assert!(marketplace::jump_tx_digest(&listing).is_empty());
        test_scenario::return_shared(listing);
    };
    scenario.end();
}

#[test]
fun test_presence_listing_stores_jump_tx_digest() {
    let mut scenario = test_scenario::begin(SCOUT);
    {
        let ctx = scenario.ctx();
        let reg = marketplace::create_registry_for_testing(ctx);
        marketplace::share_registry_for_testing(reg);
    };
    scenario.next_tx(SCOUT);
    {
        let mut registry = scenario.take_shared<ScoutRegistry>();
        let ctx = scenario.ctx();
        let clk = clock::create_for_testing(ctx);
        let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
        marketplace::create_listing(&mut registry, 1, 42, 500_000, 24, b"blob", stake, &clk, ctx);
        test_scenario::return_shared(registry);
        clock::destroy_for_testing(clk);
    };
    scenario.next_tx(SCOUT);
    {
        let mut listing = scenario.take_shared<IntelListing>();
        marketplace::set_jump_tx_digest_for_testing(&mut listing, b"test_digest_abc123");
        assert!(*marketplace::jump_tx_digest(&listing) == b"test_digest_abc123");
        test_scenario::return_shared(listing);
    };
    scenario.end();
}

#[test, expected_failure(abort_code = marketplace::EInvalidPresenceProof)]
fun test_create_presence_verified_listing_invalid_proof() {
    let mut scenario = test_scenario::begin(SCOUT);
    {
        let ctx = scenario.ctx();
        let reg = marketplace::create_registry_for_testing(ctx);
        marketplace::share_registry_for_testing(reg);
        marketplace::init_presence_vkey_for_testing(ctx);
    };
    scenario.next_tx(SCOUT);
    {
        let mut registry = scenario.take_shared<ScoutRegistry>();
        let vkey = scenario.take_shared<PresenceVKey>();
        let ctx = scenario.ctx();
        let clock = clock::create_for_testing(ctx);
        let coin = coin::mint_for_testing<SUI>(1_000_000, ctx);
        // 128-byte garbage proof, 160-byte garbage inputs (5×32)
        let fake_proof = x"0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
        let fake_inputs = x"00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
        marketplace::create_presence_verified_listing(
            &mut registry,
            1, 42, 500_000, 24, b"blob", coin,
            &vkey,
            fake_proof,
            fake_inputs,
            b"fake_tx_digest",
            &clock, ctx,
        );
        clock::destroy_for_testing(clock);
        test_scenario::return_shared(registry);
        test_scenario::return_shared(vkey);
    };
    scenario.end();
}

// === Timestamp freshness (ZK Phase 3) ===

#[test]
fun test_unverified_listing_observed_at_equals_created_at() {
    let mut scenario = test_scenario::begin(SCOUT);
    {
        let ctx = scenario.ctx();
        let reg = marketplace::create_registry_for_testing(ctx);
        marketplace::share_registry_for_testing(reg);
    };
    scenario.next_tx(SCOUT);
    {
        let mut registry = scenario.take_shared<ScoutRegistry>();
        let ctx = scenario.ctx();
        let clk = clock::create_for_testing(ctx);
        let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
        marketplace::create_listing(&mut registry, 1, 42, 500_000, 24, b"blob", stake, &clk, ctx);
        test_scenario::return_shared(registry);
        clock::destroy_for_testing(clk);
    };
    scenario.next_tx(SCOUT);
    {
        let listing = scenario.take_shared<IntelListing>();
        assert!(marketplace::observed_at(&listing) == marketplace::created_at(&listing));
        test_scenario::return_shared(listing);
    };
    scenario.end();
}

#[test]
fun test_expiry_uses_observed_at() {
    let mut scenario = test_scenario::begin(SCOUT);
    // Create listing at time T=172_800_000 (48h)
    {
        let ctx = scenario.ctx();
        let reg = marketplace::create_registry_for_testing(ctx);
        marketplace::share_registry_for_testing(reg);
    };
    scenario.next_tx(SCOUT);
    {
        let mut registry = scenario.take_shared<ScoutRegistry>();
        let ctx = scenario.ctx();
        let mut clk = clock::create_for_testing(ctx);
        clock::set_for_testing(&mut clk, 172_800_000);
        let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
        marketplace::create_listing(&mut registry, 1, 42, 500_000, 24, b"blob", stake, &clk, ctx);
        test_scenario::return_shared(registry);
        clock::destroy_for_testing(clk);
    };
    scenario.next_tx(SCOUT);
    {
        let mut listing = scenario.take_shared<IntelListing>();
        // Override observed_at to 0 (simulating 48h old observation)
        // created_at=172_800_000 would NOT be expired at clock=172_800_000 (same instant),
        // but observed_at=0 + 24h = 86_400_000 < 172_800_000, so listing IS expired
        marketplace::set_observed_at_for_testing(&mut listing, 0);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 172_800_000);
        assert!(marketplace::is_expired(&listing, &clk));
        clock::destroy_for_testing(clk);
        test_scenario::return_shared(listing);
    };
    scenario.end();
}

#[test]
fun test_bytes_to_u64_le() {
    // 1_711_036_800_000 in hex = 0x0000_018E_61BD_9C00
    // LE bytes: [0x00, 0x9C, 0xBD, 0x61, 0x8E, 0x01, 0x00, 0x00]
    let mut bytes = vector[0x00u8, 0x9C, 0xBD, 0x61, 0x8E, 0x01, 0x00, 0x00];
    let mut i: u64 = 0;
    while (i < 24) { bytes.push_back(0); i = i + 1; };
    let result = marketplace::bytes_to_u64_le_for_testing(&bytes, 0);
    assert!(result == 1_711_036_800_000);
}

#[test, expected_failure(abort_code = marketplace::EInvalidDistanceProof)]
fun test_attach_distance_proof_invalid_proof_aborts() {
    let mut scenario = test_scenario::begin(SCOUT);
    {
        let ctx = scenario.ctx();
        marketplace::init_for_testing(ctx);
    };
    scenario.next_tx(SCOUT);
    {
        let mut registry = scenario.take_shared<ScoutRegistry>();
        let ctx = scenario.ctx();
        let clk = clock::create_for_testing(ctx);
        let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
        marketplace::create_listing(&mut registry, 1, 42, 500_000, 24, b"blob", stake, &clk, ctx);
        test_scenario::return_shared(registry);
        clock::destroy_for_testing(clk);
    };
    scenario.next_tx(SCOUT);
    {
        let mut listing = scenario.take_shared<IntelListing>();
        marketplace::set_location_proof_hash_for_testing(&mut listing, b"fake_location_hash");
        let mut dvkey = scenario.take_shared<DistanceVKey>();
        // Use location vkey bytes (valid Arkworks format) so prepare_verifying_key succeeds
        marketplace::set_distance_vkey_bytes_for_testing(
            &mut dvkey,
            x"c7e253d6dbb0b365b15775ae9f8aa0ffcc1c8cde0bd7a4e8c0b376b0d92952a444d2615ebda233e141f4ca0a1270e1269680b20507d55f6872540af6c1bc2424dba1298a9727ff392b6f7f48b3e88e20cf925b7024be9992d3bbfae8820a0907edf692d95cbdde46ddda5ef7d422436779445c5e66006a42761e1f12efde0018c212f3aeb785e49712e7a9353349aaf1255dfb31b7bf60723a480d9293938e196108497b1768853e7bb6bd90424b49d19af63b50d70c31295b66199e91324c27096caacdf821d4d8f50df1766a9198c7d781b5def0984f3357eb5f008ecf351d0400000000000000d020745c5d9aa5e987327c45664f758f99c8b45f183ef9a9d5d8c979d7f9bb870d07303455723d5fda3f261f6173908c341a1f79f49f6ff8e2909cbac64b8682c579be738dd77124d3e60ce22087acfc06f73db1ad2515628826569d687d168a069c3e79b5ddd8ed539a19cf107298105f8d13c9feb3e78fd2c48e5b38995989",
        );
        let fake_proof = x"0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
        let fake_inputs = x"000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
        marketplace::attach_distance_proof(
            &mut listing, &dvkey, fake_proof, fake_inputs, scenario.ctx()
        );
        test_scenario::return_shared(listing);
        test_scenario::return_shared(dvkey);
    };
    scenario.end();
}

// === Event badges (stackable) ===

#[test]
fun test_new_listing_empty_badge_digests() {
    let mut scenario = test_scenario::begin(SCOUT);
    {
        let ctx = scenario.ctx();
        let reg = marketplace::create_registry_for_testing(ctx);
        marketplace::share_registry_for_testing(reg);
    };
    scenario.next_tx(SCOUT);
    {
        let mut registry = scenario.take_shared<ScoutRegistry>();
        let ctx = scenario.ctx();
        let clk = clock::create_for_testing(ctx);
        let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
        marketplace::create_listing(&mut registry, 1, 42, 500_000, 24, b"blob", stake, &clk, ctx);
        test_scenario::return_shared(registry);
        clock::destroy_for_testing(clk);
    };
    scenario.next_tx(SCOUT);
    {
        let listing = scenario.take_shared<IntelListing>();
        assert!(marketplace::killmail_tx_digest(&listing).is_empty());
        assert!(marketplace::deposit_tx_digest(&listing).is_empty());
        assert!(marketplace::reveal_tx_digest(&listing).is_empty());
        test_scenario::return_shared(listing);
    };
    scenario.end();
}

#[test]
fun test_attach_killmail_badge() {
    let mut scenario = test_scenario::begin(SCOUT);
    {
        let ctx = scenario.ctx();
        let reg = marketplace::create_registry_for_testing(ctx);
        marketplace::share_registry_for_testing(reg);
    };
    scenario.next_tx(SCOUT);
    {
        let mut registry = scenario.take_shared<ScoutRegistry>();
        let ctx = scenario.ctx();
        let clk = clock::create_for_testing(ctx);
        let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
        marketplace::create_listing(&mut registry, 1, 42, 500_000, 24, b"blob", stake, &clk, ctx);
        test_scenario::return_shared(registry);
        clock::destroy_for_testing(clk);
    };
    scenario.next_tx(SCOUT);
    {
        let mut registry = scenario.take_shared<ScoutRegistry>();
        let mut listing = scenario.take_shared<IntelListing>();
        let clk = clock::create_for_testing(scenario.ctx());
        marketplace::attach_event_badge(&mut registry, &mut listing, 0, b"killmail_digest_abc", &clk, scenario.ctx());
        clock::destroy_for_testing(clk);
        test_scenario::return_shared(registry);
        assert!(*marketplace::killmail_tx_digest(&listing) == b"killmail_digest_abc");
        assert!(marketplace::deposit_tx_digest(&listing).is_empty());
        assert!(marketplace::reveal_tx_digest(&listing).is_empty());
        test_scenario::return_shared(listing);
    };
    scenario.end();
}

#[test]
fun test_attach_deposit_badge() {
    let mut scenario = test_scenario::begin(SCOUT);
    {
        let ctx = scenario.ctx();
        let reg = marketplace::create_registry_for_testing(ctx);
        marketplace::share_registry_for_testing(reg);
    };
    scenario.next_tx(SCOUT);
    {
        let mut registry = scenario.take_shared<ScoutRegistry>();
        let ctx = scenario.ctx();
        let clk = clock::create_for_testing(ctx);
        let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
        marketplace::create_listing(&mut registry, 1, 42, 500_000, 24, b"blob", stake, &clk, ctx);
        test_scenario::return_shared(registry);
        clock::destroy_for_testing(clk);
    };
    scenario.next_tx(SCOUT);
    {
        let mut registry = scenario.take_shared<ScoutRegistry>();
        let mut listing = scenario.take_shared<IntelListing>();
        let clk = clock::create_for_testing(scenario.ctx());
        marketplace::attach_event_badge(&mut registry, &mut listing, 1, b"deposit_digest_xyz", &clk, scenario.ctx());
        clock::destroy_for_testing(clk);
        test_scenario::return_shared(registry);
        assert!(marketplace::killmail_tx_digest(&listing).is_empty());
        assert!(*marketplace::deposit_tx_digest(&listing) == b"deposit_digest_xyz");
        test_scenario::return_shared(listing);
    };
    scenario.end();
}

#[test]
fun test_attach_reveal_badge() {
    let mut scenario = test_scenario::begin(SCOUT);
    {
        let ctx = scenario.ctx();
        let reg = marketplace::create_registry_for_testing(ctx);
        marketplace::share_registry_for_testing(reg);
    };
    scenario.next_tx(SCOUT);
    {
        let mut registry = scenario.take_shared<ScoutRegistry>();
        let ctx = scenario.ctx();
        let clk = clock::create_for_testing(ctx);
        let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
        marketplace::create_listing(&mut registry, 1, 42, 500_000, 24, b"blob", stake, &clk, ctx);
        test_scenario::return_shared(registry);
        clock::destroy_for_testing(clk);
    };
    scenario.next_tx(SCOUT);
    {
        let mut registry = scenario.take_shared<ScoutRegistry>();
        let mut listing = scenario.take_shared<IntelListing>();
        let clk = clock::create_for_testing(scenario.ctx());
        marketplace::attach_event_badge(&mut registry, &mut listing, 2, b"reveal_digest_123", &clk, scenario.ctx());
        clock::destroy_for_testing(clk);
        test_scenario::return_shared(registry);
        assert!(*marketplace::reveal_tx_digest(&listing) == b"reveal_digest_123");
        test_scenario::return_shared(listing);
    };
    scenario.end();
}

#[test, expected_failure(abort_code = marketplace::EInvalidBadgeType)]
fun test_attach_badge_invalid_type() {
    let mut scenario = test_scenario::begin(SCOUT);
    {
        let ctx = scenario.ctx();
        let reg = marketplace::create_registry_for_testing(ctx);
        marketplace::share_registry_for_testing(reg);
    };
    scenario.next_tx(SCOUT);
    {
        let mut registry = scenario.take_shared<ScoutRegistry>();
        let ctx = scenario.ctx();
        let clk = clock::create_for_testing(ctx);
        let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
        marketplace::create_listing(&mut registry, 1, 42, 500_000, 24, b"blob", stake, &clk, ctx);
        test_scenario::return_shared(registry);
        clock::destroy_for_testing(clk);
    };
    scenario.next_tx(SCOUT);
    {
        let mut registry = scenario.take_shared<ScoutRegistry>();
        let mut listing = scenario.take_shared<IntelListing>();
        let clk = clock::create_for_testing(scenario.ctx());
        marketplace::attach_event_badge(&mut registry, &mut listing, 3, b"bad", &clk, scenario.ctx());
        clock::destroy_for_testing(clk);
        test_scenario::return_shared(registry);
        test_scenario::return_shared(listing);
    };
    scenario.end();
}

#[test, expected_failure(abort_code = marketplace::EBadgeAlreadyAttached)]
fun test_attach_badge_double_attach() {
    let mut scenario = test_scenario::begin(SCOUT);
    {
        let ctx = scenario.ctx();
        let reg = marketplace::create_registry_for_testing(ctx);
        marketplace::share_registry_for_testing(reg);
    };
    scenario.next_tx(SCOUT);
    {
        let mut registry = scenario.take_shared<ScoutRegistry>();
        let ctx = scenario.ctx();
        let clk = clock::create_for_testing(ctx);
        let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
        marketplace::create_listing(&mut registry, 1, 42, 500_000, 24, b"blob", stake, &clk, ctx);
        test_scenario::return_shared(registry);
        clock::destroy_for_testing(clk);
    };
    scenario.next_tx(SCOUT);
    {
        let mut registry = scenario.take_shared<ScoutRegistry>();
        let mut listing = scenario.take_shared<IntelListing>();
        let clk = clock::create_for_testing(scenario.ctx());
        marketplace::attach_event_badge(&mut registry, &mut listing, 0, b"first", &clk, scenario.ctx());
        marketplace::attach_event_badge(&mut registry, &mut listing, 0, b"second", &clk, scenario.ctx());
        clock::destroy_for_testing(clk);
        test_scenario::return_shared(registry);
        test_scenario::return_shared(listing);
    };
    scenario.end();
}

#[test, expected_failure(abort_code = marketplace::ENotScout)]
fun test_attach_badge_not_scout() {
    let mut scenario = test_scenario::begin(SCOUT);
    {
        let ctx = scenario.ctx();
        let reg = marketplace::create_registry_for_testing(ctx);
        marketplace::share_registry_for_testing(reg);
    };
    scenario.next_tx(SCOUT);
    {
        let mut registry = scenario.take_shared<ScoutRegistry>();
        let ctx = scenario.ctx();
        let clk = clock::create_for_testing(ctx);
        let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
        marketplace::create_listing(&mut registry, 1, 42, 500_000, 24, b"blob", stake, &clk, ctx);
        test_scenario::return_shared(registry);
        clock::destroy_for_testing(clk);
    };
    scenario.next_tx(BUYER);
    {
        let mut registry = scenario.take_shared<ScoutRegistry>();
        let mut listing = scenario.take_shared<IntelListing>();
        let clk = clock::create_for_testing(scenario.ctx());
        marketplace::attach_event_badge(&mut registry, &mut listing, 0, b"nope", &clk, scenario.ctx());
        clock::destroy_for_testing(clk);
        test_scenario::return_shared(registry);
        test_scenario::return_shared(listing);
    };
    scenario.end();
}

#[test, expected_failure(abort_code = marketplace::EAlreadyDelisted)]
fun test_attach_badge_on_delisted() {
    let mut scenario = test_scenario::begin(SCOUT);
    {
        let ctx = scenario.ctx();
        let reg = marketplace::create_registry_for_testing(ctx);
        marketplace::share_registry_for_testing(reg);
    };
    scenario.next_tx(SCOUT);
    {
        let mut registry = scenario.take_shared<ScoutRegistry>();
        let ctx = scenario.ctx();
        let clk = clock::create_for_testing(ctx);
        let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
        marketplace::create_listing(&mut registry, 1, 42, 500_000, 24, b"blob", stake, &clk, ctx);
        test_scenario::return_shared(registry);
        clock::destroy_for_testing(clk);
    };
    scenario.next_tx(SCOUT);
    {
        let mut listing = scenario.take_shared<IntelListing>();
        marketplace::delist(&mut listing, scenario.ctx());
        test_scenario::return_shared(listing);
    };
    scenario.next_tx(SCOUT);
    {
        let mut registry = scenario.take_shared<ScoutRegistry>();
        let mut listing = scenario.take_shared<IntelListing>();
        let clk = clock::create_for_testing(scenario.ctx());
        marketplace::attach_event_badge(&mut registry, &mut listing, 0, b"too_late", &clk, scenario.ctx());
        clock::destroy_for_testing(clk);
        test_scenario::return_shared(registry);
        test_scenario::return_shared(listing);
    };
    scenario.end();
}

// === Scout reputation (Phase 4a) ===

#[test]
fun test_profile_created_on_first_listing() {
    let mut scenario = test_scenario::begin(SCOUT);
    {
        let ctx = scenario.ctx();
        let reg = marketplace::create_registry_for_testing(ctx);
        marketplace::share_registry_for_testing(reg);
    };
    scenario.next_tx(SCOUT);
    let mut registry = scenario.take_shared<ScoutRegistry>();
    let ctx = scenario.ctx();
    let clk = clock::create_for_testing(ctx);
    let coin = coin::mint_for_testing<SUI>(1_000_000, ctx);
    marketplace::create_listing(
        &mut registry,
        0, 30006118, 100, 24, vector[], coin, &clk, ctx,
    );
    assert!(marketplace::has_profile(&registry, SCOUT));
    let profile = marketplace::borrow_profile(&registry, SCOUT);
    assert!(marketplace::total_unverified(profile) == 1);
    assert!(marketplace::total_verified(profile) == 0);
    test_scenario::return_shared(registry);
    clock::destroy_for_testing(clk);
    scenario.end();
}

#[test]
fun test_zk_verified_counter_zero_for_unverified_listing() {
    let mut scenario = test_scenario::begin(SCOUT);
    {
        let ctx = scenario.ctx();
        let reg = marketplace::create_registry_for_testing(ctx);
        marketplace::share_registry_for_testing(reg);
    };
    scenario.next_tx(SCOUT);
    let mut registry = scenario.take_shared<ScoutRegistry>();
    let ctx = scenario.ctx();
    let clk = clock::create_for_testing(ctx);
    let coin = coin::mint_for_testing<SUI>(1_000_000, ctx);
    marketplace::create_listing(
        &mut registry,
        0, 42, 100, 24, b"blob", coin, &clk, ctx,
    );
    let profile = marketplace::borrow_profile(&registry, SCOUT);
    assert!(marketplace::total_zk_verified(profile) == 0);
    assert!(marketplace::total_unverified(profile) == 1);
    test_scenario::return_shared(registry);
    clock::destroy_for_testing(clk);
    scenario.end();
}

// === Scout reputation Merkle tree (Phase 4a+) ===

#[test]
fun test_initial_merkle_root_is_empty() {
    let mut scenario = test_scenario::begin(SCOUT);
    {
        let ctx = scenario.ctx();
        let reg = marketplace::create_registry_for_testing(ctx);
        marketplace::share_registry_for_testing(reg);
    };
    scenario.next_tx(SCOUT);
    let mut registry = scenario.take_shared<ScoutRegistry>();
    let ctx = scenario.ctx();
    let clk = clock::create_for_testing(ctx);
    let coin = coin::mint_for_testing<SUI>(1_000_000, ctx);
    marketplace::create_listing(
        &mut registry,
        0, 42, 100, 24, b"blob", coin, &clk, ctx,
    );
    let profile = marketplace::borrow_profile(&registry, SCOUT);
    assert!(marketplace::merkle_root(profile) == marketplace::merkle_empty_root_for_testing());
    assert!(marketplace::leaf_count(profile) == 0);
    test_scenario::return_shared(registry);
    clock::destroy_for_testing(clk);
    scenario.end();
}

/// Mirrors `create_verified_listing` Merkle leaf (badge 0xFE) without an in-tree Groth16 fixture.
#[test]
fun test_verified_listing_inserts_leaf() {
    let mut scenario = test_scenario::begin(SCOUT);
    {
        let ctx = scenario.ctx();
        let reg = marketplace::create_registry_for_testing(ctx);
        marketplace::share_registry_for_testing(reg);
    };
    scenario.next_tx(SCOUT);
    let mut registry = scenario.take_shared<ScoutRegistry>();
    marketplace::insert_test_reputation_leaf(&mut registry, SCOUT, 99, 2, 0xFE, 1_700_000_000_000);
    let profile = marketplace::borrow_profile(&registry, SCOUT);
    assert!(marketplace::leaf_count(profile) == 1);
    assert!(marketplace::merkle_root(profile) != marketplace::merkle_empty_root_for_testing());
    test_scenario::return_shared(registry);
    scenario.end();
}

#[test]
fun test_multiple_leaves_different_roots() {
    let mut scenario = test_scenario::begin(SCOUT);
    {
        let ctx = scenario.ctx();
        let reg = marketplace::create_registry_for_testing(ctx);
        marketplace::share_registry_for_testing(reg);
    };
    scenario.next_tx(SCOUT);
    let mut registry = scenario.take_shared<ScoutRegistry>();
    let ts = 1_700_000_000_000u64;
    marketplace::insert_test_reputation_leaf(&mut registry, SCOUT, 10, 0, 0xFE, ts);
    let root1 = marketplace::merkle_root(marketplace::borrow_profile(&registry, SCOUT));
    marketplace::insert_test_reputation_leaf(&mut registry, SCOUT, 20, 0, 0xFE, ts);
    let profile = marketplace::borrow_profile(&registry, SCOUT);
    assert!(marketplace::leaf_count(profile) == 2);
    assert!(marketplace::merkle_root(profile) != root1);
    test_scenario::return_shared(registry);
    scenario.end();
}

#[test]
fun test_badge_inserts_leaf() {
    let mut scenario = test_scenario::begin(SCOUT);
    {
        let ctx = scenario.ctx();
        let reg = marketplace::create_registry_for_testing(ctx);
        marketplace::share_registry_for_testing(reg);
    };
    scenario.next_tx(SCOUT);
    {
        let mut registry = scenario.take_shared<ScoutRegistry>();
        let ctx = scenario.ctx();
        let clk = clock::create_for_testing(ctx);
        let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
        marketplace::create_listing(&mut registry, 1, 42, 500_000, 24, b"blob", stake, &clk, ctx);
        let p = marketplace::borrow_profile(&registry, SCOUT);
        assert!(marketplace::leaf_count(p) == 0);
        assert!(marketplace::merkle_root(p) == marketplace::merkle_empty_root_for_testing());
        test_scenario::return_shared(registry);
        clock::destroy_for_testing(clk);
    };
    scenario.next_tx(SCOUT);
    {
        let mut registry = scenario.take_shared<ScoutRegistry>();
        let mut listing = scenario.take_shared<IntelListing>();
        let clk = clock::create_for_testing(scenario.ctx());
        marketplace::attach_event_badge(&mut registry, &mut listing, 0, b"km", &clk, scenario.ctx());
        clock::destroy_for_testing(clk);
        test_scenario::return_shared(registry);
        test_scenario::return_shared(listing);
    };
    scenario.next_tx(SCOUT);
    let registry = scenario.take_shared<ScoutRegistry>();
    let profile = marketplace::borrow_profile(&registry, SCOUT);
    assert!(marketplace::leaf_count(profile) == 1);
    assert!(marketplace::merkle_root(profile) != marketplace::merkle_empty_root_for_testing());
    test_scenario::return_shared(registry);
    scenario.end();
}

#[test]
fun test_badge_increments_correct_counter() {
    let mut scenario = test_scenario::begin(SCOUT);
    {
        let ctx = scenario.ctx();
        let reg = marketplace::create_registry_for_testing(ctx);
        marketplace::share_registry_for_testing(reg);
    };
    scenario.next_tx(SCOUT);
    {
        let mut registry = scenario.take_shared<ScoutRegistry>();
        let ctx = scenario.ctx();
        let clk = clock::create_for_testing(ctx);
        let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
        marketplace::create_listing(&mut registry, 1, 42, 500_000, 24, b"blob", stake, &clk, ctx);
        test_scenario::return_shared(registry);
        clock::destroy_for_testing(clk);
    };
    scenario.next_tx(SCOUT);
    {
        let mut registry = scenario.take_shared<ScoutRegistry>();
        let mut listing = scenario.take_shared<IntelListing>();
        let clk = clock::create_for_testing(scenario.ctx());
        marketplace::attach_event_badge(&mut registry, &mut listing, 0, b"km", &clk, scenario.ctx());
        marketplace::attach_event_badge(&mut registry, &mut listing, 1, b"dep", &clk, scenario.ctx());
        clock::destroy_for_testing(clk);
        test_scenario::return_shared(registry);
        test_scenario::return_shared(listing);
    };
    scenario.next_tx(SCOUT);
    let registry = scenario.take_shared<ScoutRegistry>();
    let profile = marketplace::borrow_profile(&registry, SCOUT);
    assert!(marketplace::total_combat_verified(profile) == 1);
    assert!(marketplace::total_activity_verified(profile) == 1);
    assert!(marketplace::total_verified(profile) == 2);
    assert!(marketplace::total_unverified(profile) == 1);
    assert!(marketplace::leaf_count(profile) == 2);
    assert!(marketplace::merkle_root(profile) != marketplace::merkle_empty_root_for_testing());
    test_scenario::return_shared(registry);
    scenario.end();
}

#[test]
fun test_multiple_listings_accumulate() {
    let mut scenario = test_scenario::begin(SCOUT);
    {
        let ctx = scenario.ctx();
        let reg = marketplace::create_registry_for_testing(ctx);
        marketplace::share_registry_for_testing(reg);
    };
    scenario.next_tx(SCOUT);
    let mut registry = scenario.take_shared<ScoutRegistry>();
    let ctx = scenario.ctx();
    let clk = clock::create_for_testing(ctx);
    let stake1 = coin::mint_for_testing<SUI>(1_000_000, ctx);
    marketplace::create_listing(
        &mut registry,
        0, 42, 100, 24, b"blob", stake1, &clk, ctx,
    );
    let stake2 = coin::mint_for_testing<SUI>(1_000_000, ctx);
    marketplace::create_listing(
        &mut registry,
        0, 42, 100, 24, b"blob", stake2, &clk, ctx,
    );
    let stake3 = coin::mint_for_testing<SUI>(1_000_000, ctx);
    marketplace::create_listing(
        &mut registry,
        0, 42, 100, 24, b"blob", stake3, &clk, ctx,
    );
    let profile = marketplace::borrow_profile(&registry, SCOUT);
    assert!(marketplace::total_unverified(profile) == 3);
    test_scenario::return_shared(registry);
    clock::destroy_for_testing(clk);
    scenario.end();
}

#[test]
fun test_separate_profiles_per_scout() {
    let mut scenario = test_scenario::begin(SCOUT);
    {
        let ctx = scenario.ctx();
        let reg = marketplace::create_registry_for_testing(ctx);
        marketplace::share_registry_for_testing(reg);
    };
    scenario.next_tx(SCOUT);
    let mut registry = scenario.take_shared<ScoutRegistry>();
    let ctx = scenario.ctx();
    let clk = clock::create_for_testing(ctx);
    let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
    marketplace::create_listing(
        &mut registry,
        0, 42, 100, 24, b"blob", stake, &clk, ctx,
    );
    test_scenario::return_shared(registry);
    clock::destroy_for_testing(clk);
    scenario.next_tx(BUYER);
    let mut registry = scenario.take_shared<ScoutRegistry>();
    let ctx = scenario.ctx();
    let clk = clock::create_for_testing(ctx);
    let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
    marketplace::create_listing(
        &mut registry,
        0, 43, 100, 24, b"blob", stake, &clk, ctx,
    );
    test_scenario::return_shared(registry);
    clock::destroy_for_testing(clk);
    scenario.next_tx(SCOUT);
    let registry = scenario.take_shared<ScoutRegistry>();
    assert!(marketplace::has_profile(&registry, SCOUT));
    assert!(marketplace::has_profile(&registry, BUYER));
    let ps = marketplace::borrow_profile(&registry, SCOUT);
    let pb = marketplace::borrow_profile(&registry, BUYER);
    assert!(marketplace::total_unverified(ps) == 1);
    assert!(marketplace::total_unverified(pb) == 1);
    test_scenario::return_shared(registry);
    scenario.end();
}

#[test]
fun test_has_profile_false_for_unknown() {
    let mut scenario = test_scenario::begin(SCOUT);
    {
        let ctx = scenario.ctx();
        let reg = marketplace::create_registry_for_testing(ctx);
        marketplace::share_registry_for_testing(reg);
    };
    scenario.next_tx(SCOUT);
    let registry = scenario.take_shared<ScoutRegistry>();
    assert!(!marketplace::has_profile(&registry, SCOUT));
    test_scenario::return_shared(registry);
    scenario.end();
}

#[test, expected_failure(abort_code = marketplace::EProfileNotFound)]
fun test_borrow_profile_aborts_unknown() {
    let mut scenario = test_scenario::begin(SCOUT);
    {
        let ctx = scenario.ctx();
        let reg = marketplace::create_registry_for_testing(ctx);
        marketplace::share_registry_for_testing(reg);
    };
    scenario.next_tx(SCOUT);
    let registry = scenario.take_shared<ScoutRegistry>();
    let _p = marketplace::borrow_profile(&registry, SCOUT);
    test_scenario::return_shared(registry);
    scenario.end();
}
