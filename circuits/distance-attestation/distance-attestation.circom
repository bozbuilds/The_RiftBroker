pragma circom 2.2.0;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/bitify.circom";

// Absolute difference: |a - b| for arbitrary field elements representing signed i64 values.
//
// EVE coordinates can be negative (e.g., -5103797186450162000), which become large BN254
// field elements. LessThan(64) fails on these because Num2Bits(65) can't decompose ~254-bit values.
//
// Instead, the absolute difference is passed as a witness hint and verified algebraically:
//   1. hint^2 === (a - b)^2  — proves hint = |a - b| (either diff or p - diff)
//   2. Num2Bits(64)(hint)    — ensures hint is the small positive solution (fits in 64 bits)
template AbsDiff() {
    signal input a;
    signal input b;
    signal input hint;  // |a - b| computed off-chain by the witness generator
    signal output out;

    // Verify hint^2 == (a - b)^2
    signal diff;
    diff <== a - b;
    signal diffSq;
    diffSq <== diff * diff;
    signal hintSq;
    hintSq <== hint * hint;
    diffSq === hintSq;

    // Verify hint fits in 64 bits (selects the small positive solution)
    component n2b = Num2Bits(64);
    n2b.in <== hint;

    out <== hint;
}

/// Distance Attestation Circuit
///
/// Proves the Manhattan distance between two coordinate sets without revealing the coordinates.
/// Both coordinate sets are bound to Poseidon hashes (from Phase 1 location proofs).
///
/// Public Inputs (2):
///   coordinatesHash1 — Poseidon(x1, y1, z1, salt1) from scout's location proof
///   coordinatesHash2 — Poseidon(x2, y2, z2, salt2) from observed entity's location proof
///
/// Public Output (1):
///   distanceSquared — (|dx| + |dy| + |dz|)^2 in meters^2
///
/// Private Inputs (Witness):
///   coordinates1[3] — [x1, y1, z1] scout's coordinates (may be negative i64)
///   salt1 — salt from scout's location proof
///   coordinates2[3] — [x2, y2, z2] observed entity's coordinates (may be negative i64)
///   salt2 — salt from observed entity's location proof
///   absDiffHints[3] — |dx|, |dy|, |dz| computed off-chain (always non-negative, fits u64)
template DistanceAttestationCircuit() {
    // ========== PUBLIC INPUTS ==========
    signal input coordinatesHash1;
    signal input coordinatesHash2;

    // ========== PUBLIC OUTPUT ==========
    signal output distanceSquared;

    // ========== PRIVATE INPUTS ==========
    signal input coordinates1[3];
    signal input salt1;
    signal input coordinates2[3];
    signal input salt2;
    signal input absDiffHints[3];

    // ========== VERIFICATION ==========

    // 1. Verify coordinate hash #1 matches private coordinates
    component hash1 = Poseidon(4);
    hash1.inputs[0] <== coordinates1[0];
    hash1.inputs[1] <== coordinates1[1];
    hash1.inputs[2] <== coordinates1[2];
    hash1.inputs[3] <== salt1;
    coordinatesHash1 === hash1.out;

    // 2. Verify coordinate hash #2 matches private coordinates
    component hash2 = Poseidon(4);
    hash2.inputs[0] <== coordinates2[0];
    hash2.inputs[1] <== coordinates2[1];
    hash2.inputs[2] <== coordinates2[2];
    hash2.inputs[3] <== salt2;
    coordinatesHash2 === hash2.out;

    // 3. Compute Manhattan distance: |dx| + |dy| + |dz|
    component absDx = AbsDiff();
    absDx.a <== coordinates1[0];
    absDx.b <== coordinates2[0];
    absDx.hint <== absDiffHints[0];

    component absDy = AbsDiff();
    absDy.a <== coordinates1[1];
    absDy.b <== coordinates2[1];
    absDy.hint <== absDiffHints[1];

    component absDz = AbsDiff();
    absDz.a <== coordinates1[2];
    absDz.b <== coordinates2[2];
    absDz.hint <== absDiffHints[2];

    signal manhattanDist;
    manhattanDist <== absDx.out + absDy.out + absDz.out;

    // 4. Output distance squared (avoids sqrt in-circuit)
    distanceSquared <== manhattanDist * manhattanDist;
}

component main { public [coordinatesHash1, coordinatesHash2] } = DistanceAttestationCircuit();
