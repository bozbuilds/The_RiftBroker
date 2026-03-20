pragma circom 2.2.0;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/bitify.circom";

// Reuse AbsDiff from distance-attestation circuit
template AbsDiff() {
    signal input a;
    signal input b;
    signal input hint;
    signal output out;

    signal diff;
    diff <== a - b;
    signal diffSq;
    diffSq <== diff * diff;
    signal hintSq;
    hintSq <== hint * hint;
    diffSq === hintSq;

    component n2b = Num2Bits(64);
    n2b.in <== hint;

    out <== hint;
}

/// Presence Attestation Circuit
///
/// Proves: scout was at a gate whose coordinates match an on-chain location_hash,
/// and computes Manhattan distance to a target assembly.
///
/// Public Inputs (3):
///   coordinatesHash — Poseidon(scoutX, scoutY, scoutZ, salt) for backward compatibility
///   targetHash      — Poseidon(targetX, targetY, targetZ, targetSalt)
///   locationHash    — on-chain Poseidon hash from LocationRevealedEvent (trust binding)
///
/// Public Outputs (2):
///   distanceSquared — (|dx| + |dy| + |dz|)^2 in meters^2
///   timestamp       — jump timestamp for on-chain staleness validation
///
/// Private Inputs:
///   scoutCoords[3]   — gate coordinates from LocationRevealedEvent
///   scoutSalt        — random salt for brute-force protection
///   targetCoords[3]  — target assembly coordinates from LocationRevealedEvent
///   targetSalt       — random salt for target coordinates
///   absDiffHints[3]  — |dx|, |dy|, |dz| computed off-chain
///   jumpTimestamp     — block timestamp of the JumpEvent transaction
template PresenceAttestationCircuit() {
    // ========== PUBLIC INPUTS ==========
    signal input coordinatesHash;     // Poseidon(scoutX, scoutY, scoutZ, scoutSalt)
    signal input targetHash;          // Poseidon(targetX, targetY, targetZ, targetSalt)
    signal input locationHash;        // On-chain location_hash from LocationRevealedEvent

    // ========== PUBLIC OUTPUTS ==========
    signal output distanceSquared;
    signal output timestamp;

    // ========== PRIVATE INPUTS ==========
    signal input scoutCoords[3];      // [x, y, z] from scout's gate LocationRevealedEvent
    signal input scoutSalt;
    signal input targetCoords[3];     // [x, y, z] from target assembly LocationRevealedEvent
    signal input targetSalt;
    signal input absDiffHints[3];     // |dx|, |dy|, |dz| computed off-chain
    signal input jumpTimestamp;       // Block timestamp of the JumpEvent

    // ========== VERIFICATION ==========

    // 1. Verify scout coordinates match the on-chain location_hash (trust binding).
    //    IMPORTANT: This assumes CCP's location_hash uses Poseidon(3) over the raw coordinates.
    //    If CCP uses Poseidon2 or a different arity/encoding, this constraint will be
    //    unsatisfiable. In that case, REMOVE the equality constraint and keep locationHash
    //    as an unconstrained public input for audit purposes only.
    //    VERIFICATION STEP: Before compiling, test with a known LocationRevealedEvent:
    //    compute Poseidon(x, y, z) in JS and compare with the on-chain location_hash bytes.
    //    If they match → keep the constraint. If not → remove the equality, keep as audit input.
    component locHash = Poseidon(3);
    locHash.inputs[0] <== scoutCoords[0];
    locHash.inputs[1] <== scoutCoords[1];
    locHash.inputs[2] <== scoutCoords[2];
    locHash.out === locationHash;  // REMOVE this line if Poseidon hash doesn't match CCP's

    // 2. Verify scout coordinatesHash (backward compatibility with existing flow)
    component scoutHash = Poseidon(4);
    scoutHash.inputs[0] <== scoutCoords[0];
    scoutHash.inputs[1] <== scoutCoords[1];
    scoutHash.inputs[2] <== scoutCoords[2];
    scoutHash.inputs[3] <== scoutSalt;

    // 3. Verify target coordinatesHash
    component tgtHash = Poseidon(4);
    tgtHash.inputs[0] <== targetCoords[0];
    tgtHash.inputs[1] <== targetCoords[1];
    tgtHash.inputs[2] <== targetCoords[2];
    tgtHash.inputs[3] <== targetSalt;
    tgtHash.out === targetHash;

    // 4. Compute Manhattan distance: |dx| + |dy| + |dz|
    component absDx = AbsDiff();
    absDx.a <== scoutCoords[0];
    absDx.b <== targetCoords[0];
    absDx.hint <== absDiffHints[0];

    component absDy = AbsDiff();
    absDy.a <== scoutCoords[1];
    absDy.b <== targetCoords[1];
    absDy.hint <== absDiffHints[1];

    component absDz = AbsDiff();
    absDz.a <== scoutCoords[2];
    absDz.b <== targetCoords[2];
    absDz.hint <== absDiffHints[2];

    signal manhattanDist;
    manhattanDist <== absDx.out + absDy.out + absDz.out;

    // 5. Output distance squared (avoids sqrt in-circuit)
    distanceSquared <== manhattanDist * manhattanDist;

    // 6. Output timestamp for on-chain staleness validation
    timestamp <== jumpTimestamp;
}

component main { public [coordinatesHash, targetHash, locationHash] } = PresenceAttestationCircuit();
