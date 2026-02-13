#[test_only]
module dark_net::marketplace_tests;

use sui::test_scenario;
use sui::coin;
use sui::sui::SUI;
use sui::clock;
use dark_net::marketplace::{Self, IntelListing, PurchaseReceipt};

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
