pragma circom 2.2.0;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/bitify.circom";

// Prove N leaves exist in a Merkle tree with matching badge_type (Phase 4b).
template ReputationAttestation(MAX_CLAIM, DEPTH) {
    signal input merkleRoot;
    signal input claimBadgeType;
    signal input claimCount;

    signal input leaves[MAX_CLAIM][4];
    signal input siblings[MAX_CLAIM][DEPTH];
    signal input leafIndices[MAX_CLAIM];
    signal input active[MAX_CLAIM];

    component leafHash[MAX_CLAIM];
    component indexBits[MAX_CLAIM];
    signal path[MAX_CLAIM][DEPTH + 1];
    component merkleHashers[MAX_CLAIM][DEPTH];
    signal leftSel0[MAX_CLAIM][DEPTH];
    signal leftSel1[MAX_CLAIM][DEPTH];
    signal rightSel0[MAX_CLAIM][DEPTH];
    signal rightSel1[MAX_CLAIM][DEPTH];
    signal leftSel[MAX_CLAIM][DEPTH];
    signal rightSel[MAX_CLAIM][DEPTH];
    signal rootDiff[MAX_CLAIM];
    signal typeDiff[MAX_CLAIM];

    signal activeSum[MAX_CLAIM + 1];
    activeSum[0] <== 0;

    for (var i = 0; i < MAX_CLAIM; i++) {
        active[i] * (1 - active[i]) === 0;
        activeSum[i + 1] <== activeSum[i] + active[i];

        leafHash[i] = Poseidon(4);
        leafHash[i].inputs[0] <== leaves[i][0];
        leafHash[i].inputs[1] <== leaves[i][1];
        leafHash[i].inputs[2] <== leaves[i][2];
        leafHash[i].inputs[3] <== leaves[i][3];

        indexBits[i] = Num2Bits(DEPTH);
        indexBits[i].in <== leafIndices[i];

        path[i][0] <== leafHash[i].out;

        for (var level = 0; level < DEPTH; level++) {
            merkleHashers[i][level] = Poseidon(2);

            leftSel0[i][level] <== path[i][level] * (1 - indexBits[i].out[level]);
            leftSel1[i][level] <== siblings[i][level] * indexBits[i].out[level];
            leftSel[i][level] <== leftSel0[i][level] + leftSel1[i][level];

            rightSel0[i][level] <== siblings[i][level] * (1 - indexBits[i].out[level]);
            rightSel1[i][level] <== path[i][level] * indexBits[i].out[level];
            rightSel[i][level] <== rightSel0[i][level] + rightSel1[i][level];

            merkleHashers[i][level].inputs[0] <== leftSel[i][level];
            merkleHashers[i][level].inputs[1] <== rightSel[i][level];
            path[i][level + 1] <== merkleHashers[i][level].out;
        }

        rootDiff[i] <== (path[i][DEPTH] - merkleRoot) * active[i];
        rootDiff[i] === 0;

        typeDiff[i] <== (leaves[i][2] - claimBadgeType) * active[i];
        typeDiff[i] === 0;
    }

    component gte = GreaterEqThan(32);
    gte.in[0] <== activeSum[MAX_CLAIM];
    gte.in[1] <== claimCount;
    gte.out === 1;
}

component main { public [merkleRoot, claimBadgeType, claimCount] } = ReputationAttestation(10, 10);
