pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";

template Vote(nLevels) {
    // Private inputs
    signal input voterSecret;
    signal input voterNullifier;
    signal input voteChoice;
    signal input merkleProof[nLevels];
    signal input merkleIndices[nLevels];

    // Public inputs
    signal input merkleRoot;
    signal input nullifierHash;
    signal input encryptedVote;
    signal input pollId;

    // 1. Verify commitment: commitment = Poseidon(2)([voterSecret, voterNullifier])
    component commitmentHasher = Poseidon(2);
    commitmentHasher.inputs[0] <== voterSecret;
    commitmentHasher.inputs[1] <== voterNullifier;
    signal commitment;
    commitment <== commitmentHasher.out;

    // 2. Verify Merkle Path
    signal hashes[nLevels + 1];
    hashes[0] <== commitment;

    component hashers[nLevels];
    for (var i = 0; i < nLevels; i++) {
        hashers[i] = Poseidon(2);

        // Constrain merkleIndices[i] to be 0 or 1
        merkleIndices[i] * (merkleIndices[i] - 1) === 0;

        // If merkleIndices[i] is 0: hashers[i].inputs[0] = hashes[i], hashers[i].inputs[1] = merkleProof[i]
        // If merkleIndices[i] is 1: hashers[i].inputs[0] = merkleProof[i], hashers[i].inputs[1] = hashes[i]
        hashers[i].inputs[0] <== merkleIndices[i] * (merkleProof[i] - hashes[i]) + hashes[i];
        hashers[i].inputs[1] <== merkleIndices[i] * (hashes[i] - merkleProof[i]) + merkleProof[i];

        hashes[i + 1] <== hashers[i].out;
    }

    // Verify computed root matches merkleRoot
    hashes[nLevels] === merkleRoot;

    // 3. Verify nullifierHash: nullifierHash = Poseidon(1)([voterNullifier])
    component nullifierHasher = Poseidon(1);
    nullifierHasher.inputs[0] <== voterNullifier;
    nullifierHash === nullifierHasher.out;

    // 4. Verify voteChoice is a valid binary option (0 or 1)
    voteChoice * (voteChoice - 1) === 0;

    // 5. Pass through/dummy constraints for public inputs to prevent them from being optimized away
    signal dummy1;
    dummy1 <== encryptedVote * pollId;
}

component main { public [ merkleRoot, nullifierHash, encryptedVote, pollId ] } = Vote(16);
