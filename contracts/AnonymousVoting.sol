// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./Verifier.sol";

contract AnonymousVoting {
    // Verifier contract address
    Groth16Verifier public verifier;

    struct Poll {
        string question;
        bytes32 merkleRoot;
        uint256 endTime;
        uint256 yesVotes;
        uint256 noVotes;
        bytes32[] encryptedVotes;
    }

    // Polls mapping (pollId => Poll)
    mapping(uint256 => Poll) public polls;
    // Total poll count (used as incrementing ID)
    uint256 public pollCount;

    // Mapping to track used nullifiers per poll (pollId => nullifierHash => used)
    mapping(uint256 => mapping(bytes32 => bool)) public usedNullifiers;

    // Events
    event PollCreated(uint256 indexed pollId, string question);
    event VoteCast(uint256 indexed pollId, bytes32 nullifierHash);
    event MerkleRootUpdated(uint256 indexed pollId, bytes32 newRoot);

    constructor(address verifierAddress) {
        verifier = Groth16Verifier(verifierAddress);
    }

    /**
     * @notice Creates a new poll
     * @param question The question for the poll
     * @param merkleRoot The initial Merkle tree root of registered voter commitments
     * @param duration The duration of the poll in seconds
     */
    function createPoll(
        string memory question,
        bytes32 merkleRoot,
        uint256 duration
    ) public returns (uint256) {
        pollCount++;
        uint256 pollId = pollCount;

        Poll storage poll = polls[pollId];
        poll.question = question;
        poll.merkleRoot = merkleRoot;
        poll.endTime = block.timestamp + duration;

        emit PollCreated(pollId, question);
        return pollId;
    }

    /**
     * @notice Updates the Merkle root of a poll
     * @param pollId The ID of the poll
     * @param newRoot The new Merkle root
     */
    function updateMerkleRoot(uint256 pollId, bytes32 newRoot) public {
        Poll storage poll = polls[pollId];
        require(poll.endTime > block.timestamp, "Poll has expired");
        poll.merkleRoot = newRoot;
        emit MerkleRootUpdated(pollId, newRoot);
    }

    /**
     * @notice Casts an anonymous vote by verifying a ZK-SNARK proof
     * @param pollId The ID of the poll
     * @param proof The ABI encoded Groth16 proof: (uint[2] a, uint[2][2] b, uint[2] c)
     * @param nullifierHash The voter's nullifier hash
     * @param encryptedVote The voter's encrypted choice (which is also verified)
     */
    function castVote(
        uint256 pollId,
        bytes calldata proof,
        bytes32 nullifierHash,
        bytes32 encryptedVote
    ) public {
        Poll storage poll = polls[pollId];
        require(poll.endTime > block.timestamp, "Poll is not active");
        require(!usedNullifiers[pollId][nullifierHash], "Nullifier already used");

        // Decode the Groth16 proof
        (
            uint[2] memory a,
            uint[2][2] memory b,
            uint[2] memory c
        ) = abi.decode(proof, (uint[2], uint[2][2], uint[2]));

        // Construct the public signals array
        // Order must match main component's public inputs list:
        // [ merkleRoot, nullifierHash, encryptedVote, pollId ]
        uint[4] memory pubSignals;
        pubSignals[0] = uint256(poll.merkleRoot);
        pubSignals[1] = uint256(nullifierHash);
        pubSignals[2] = uint256(encryptedVote);
        pubSignals[3] = pollId;

        // Verify the proof using the generated Groth16 verifier contract
        require(verifier.verifyProof(a, b, c, pubSignals), "Invalid ZK proof");

        // Record the nullifier to prevent double-voting
        usedNullifiers[pollId][nullifierHash] = true;

        // Record/tally the vote
        poll.encryptedVotes.push(encryptedVote);

        if (encryptedVote == bytes32(uint256(1))) {
            poll.yesVotes++;
        } else if (encryptedVote == bytes32(uint256(0))) {
            poll.noVotes++;
        }

        emit VoteCast(pollId, nullifierHash);
    }

    /**
     * @notice Tallies votes for a poll after it has expired
     * @param pollId The ID of the poll
     * @return yesVotes The number of YES votes
     * @return noVotes The number of NO votes
     */
    function tallyVotes(uint256 pollId) public view returns (uint256 yesVotes, uint256 noVotes) {
        Poll storage poll = polls[pollId];
        require(block.timestamp >= poll.endTime, "Poll is still active");
        return (poll.yesVotes, poll.noVotes);
    }

    /**
     * @notice Helper to get all encrypted votes cast for a poll
     * @param pollId The ID of the poll
     */
    function getEncryptedVotes(uint256 pollId) public view returns (bytes32[] memory) {
        return polls[pollId].encryptedVotes;
    }
}
