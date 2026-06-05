"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const ethers_1 = require("ethers");
const snarkjs = __importStar(require("snarkjs"));
const dotenv_1 = __importDefault(require("dotenv"));
const merkle_1 = require("./merkle");
dotenv_1.default.config({ path: path.join(__dirname, '../../../.env') });
dotenv_1.default.config(); // fallback
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
const PORT = process.env.PORT || 8000;
// Path variables
const POLLS_FILE = path.join(__dirname, '../../data/polls.json');
const VOTERS_FILE = path.join(__dirname, '../../data/voters.json');
const DEPLOYMENT_FILE = path.join(__dirname, '../../../deployment.json');
const WASM_PATH = path.join(__dirname, '../../../circuits/vote_js/vote.wasm');
const ZKEY_PATH = path.join(__dirname, '../../../circuits/vote_final.zkey');
// In-memory mapping of Merkle Trees per pollId
const merkleTrees = {};
let provider;
let wallet;
let votingContract;
let currentNonce = -1;
async function getNextNonce() {
    const onChainNonce = await provider.getTransactionCount(wallet.address, 'latest');
    const oldNonce = currentNonce;
    if (currentNonce < onChainNonce) {
        currentNonce = onChainNonce;
    }
    const nonce = currentNonce;
    currentNonce++;
    console.log(`getNextNonce: onChainNonce=${onChainNonce}, oldNonce=${oldNonce}, returnedNonce=${nonce}, nextLocalNonce=${currentNonce}`);
    return nonce;
}
// Helper to ensure data files exist
function ensureDataFiles() {
    const dataDir = path.dirname(POLLS_FILE);
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
    if (!fs.existsSync(POLLS_FILE)) {
        fs.writeFileSync(POLLS_FILE, JSON.stringify([]));
    }
    if (!fs.existsSync(VOTERS_FILE)) {
        fs.writeFileSync(VOTERS_FILE, JSON.stringify([]));
    }
}
// Read/Write helpers
function readPolls() {
    ensureDataFiles();
    try {
        return JSON.parse(fs.readFileSync(POLLS_FILE, 'utf8'));
    }
    catch {
        return [];
    }
}
function writePolls(polls) {
    ensureDataFiles();
    fs.writeFileSync(POLLS_FILE, JSON.stringify(polls, null, 2));
}
function readVoters() {
    ensureDataFiles();
    try {
        return JSON.parse(fs.readFileSync(VOTERS_FILE, 'utf8'));
    }
    catch {
        return [];
    }
}
function writeVoters(voters) {
    ensureDataFiles();
    fs.writeFileSync(VOTERS_FILE, JSON.stringify(voters, null, 2));
}
// Blockchain connection
async function initBlockchain() {
    const rpcUrl = process.env.SEPOLIA_RPC_URL || 'http://127.0.0.1:8545';
    provider = new ethers_1.ethers.JsonRpcProvider(rpcUrl);
    const privateKey = process.env.ADMIN_PRIVATE_KEY;
    if (!privateKey || privateKey.startsWith('your_')) {
        console.warn('Warning: ADMIN_PRIVATE_KEY is not set. Generating a random wallet.');
        wallet = ethers_1.ethers.Wallet.createRandom().connect(provider);
    }
    else {
        wallet = new ethers_1.ethers.Wallet(privateKey, provider);
    }
    let contractAddress = process.env.CONTRACT_ADDRESS;
    let abi = [];
    // Attempt to load from deployment.json if exists
    if (fs.existsSync(DEPLOYMENT_FILE)) {
        try {
            const deployment = JSON.parse(fs.readFileSync(DEPLOYMENT_FILE, 'utf8'));
            contractAddress = deployment.address;
            abi = deployment.abi;
            console.log(`Loaded deployment contract address from deployment.json: ${contractAddress}`);
        }
        catch (err) {
            console.error('Error reading deployment.json:', err);
        }
    }
    // Auto-deploy if on localhost and contract is missing
    if ((!contractAddress || contractAddress.startsWith('your_')) && (rpcUrl.includes('127.0.0.1') || rpcUrl.includes('localhost') || rpcUrl.includes('hardhat'))) {
        console.log('Detecting local network. Attempting to auto-deploy contract...');
        try {
            // Read artifacts from hardhat compile
            const artifactsPath = path.join(__dirname, '../../../artifacts/contracts');
            const verifierArtifact = JSON.parse(fs.readFileSync(path.join(artifactsPath, 'Verifier.sol/Groth16Verifier.json'), 'utf8'));
            const votingArtifact = JSON.parse(fs.readFileSync(path.join(artifactsPath, 'AnonymousVoting.sol/AnonymousVoting.json'), 'utf8'));
            // Deploy Verifier
            let currentNonce = await provider.getTransactionCount(wallet.address);
            console.log(`Initial nonce fetched for auto-deploy: ${currentNonce}`);
            const VerifierFactory = new ethers_1.ethers.ContractFactory(verifierArtifact.abi, verifierArtifact.bytecode, wallet);
            const verifier = await VerifierFactory.deploy({ nonce: currentNonce });
            await verifier.waitForDeployment();
            const verifierAddress = await verifier.getAddress();
            console.log(`Auto-deployed Groth16Verifier to: ${verifierAddress}`);
            currentNonce++;
            // Deploy AnonymousVoting
            const VotingFactory = new ethers_1.ethers.ContractFactory(votingArtifact.abi, votingArtifact.bytecode, wallet);
            const voting = await VotingFactory.deploy(verifierAddress, { nonce: currentNonce });
            await voting.waitForDeployment();
            contractAddress = await voting.getAddress();
            abi = votingArtifact.abi;
            console.log(`Auto-deployed AnonymousVoting to: ${contractAddress}`);
            // Write deployment.json
            fs.writeFileSync(DEPLOYMENT_FILE, JSON.stringify({
                address: contractAddress,
                abi: abi
            }, null, 2));
        }
        catch (err) {
            console.error('Failed to auto-deploy contracts:', err);
        }
    }
    if (contractAddress && abi.length > 0) {
        votingContract = new ethers_1.ethers.Contract(contractAddress, abi, wallet);
        console.log(`Connected to AnonymousVoting contract at: ${contractAddress}`);
        currentNonce = await provider.getTransactionCount(wallet.address, 'latest');
        console.log(`Initialized global nonce tracking: ${currentNonce}`);
    }
    else {
        console.error('CRITICAL: Smart contract not deployed, and auto-deployment failed.');
    }
}
// Reconstruct Merkle Trees from local voters.json
function reconstructMerkleTrees() {
    const polls = readPolls();
    const voters = readVoters();
    for (const poll of polls) {
        const tree = new merkle_1.MerkleTree(16);
        const pollVoters = voters.filter(v => v.pollId === poll.pollId);
        // Sort voters by registration index to ensure identical tree structure
        pollVoters.sort((a, b) => (a.voterIndex ?? 0) - (b.voterIndex ?? 0));
        for (const voter of pollVoters) {
            tree.insert(BigInt(voter.commitment));
        }
        merkleTrees[poll.pollId] = tree;
        console.log(`Reconstructed Merkle Tree for Poll ${poll.pollId} with ${pollVoters.length} commitments. Root: ${(0, merkle_1.toHex)(tree.getRoot())}`);
    }
}
// Health Endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK' });
});
// GET /api/polls
app.get('/api/polls', (req, res) => {
    const polls = readPolls();
    res.status(200).json(polls);
});
// POST /api/polls
app.post('/api/polls', async (req, res) => {
    const { question, options, duration } = req.body;
    if (!question || !options || !duration) {
        return res.status(400).json({ error: 'Missing question, options, or duration' });
    }
    try {
        const polls = readPolls();
        const pollId = polls.length + 1;
        // Initialize an empty Merkle Tree
        const tree = new merkle_1.MerkleTree(16);
        const initialRoot = tree.getRoot();
        const initialRootHex = (0, merkle_1.toHex)(initialRoot);
        console.log(`Creating poll on-chain. Root: ${initialRootHex}`);
        // Call createPoll on contract
        const nonce = await getNextNonce();
        const tx = await votingContract.createPoll(question, initialRootHex, duration, { nonce });
        const receipt = await tx.wait();
        const endTime = Math.floor(Date.now() / 1000) + duration;
        const newPoll = {
            pollId,
            question,
            options,
            duration,
            endTime,
            merkleRoot: initialRootHex,
            txHash: receipt.hash,
            isActive: true
        };
        polls.push(newPoll);
        writePolls(polls);
        merkleTrees[pollId] = tree;
        return res.status(201).json({
            pollId,
            question,
            merkleRoot: initialRootHex,
            txHash: receipt.hash
        });
    }
    catch (err) {
        console.error('Error creating poll:', err);
        return res.status(500).json({ error: 'Failed to create poll', details: err.message });
    }
});
// POST /api/polls/:pollId/register
app.post('/api/polls/:pollId/register', async (req, res) => {
    const pollId = Number(req.params.pollId);
    const polls = readPolls();
    const poll = polls.find(p => p.pollId === pollId);
    if (!poll) {
        return res.status(404).json({ error: 'Poll not found' });
    }
    try {
        // Generate new secret and nullifier
        // We generate 253-bit numbers to fit easily within the Bn254 scalar field
        const secret = BigInt(ethers_1.ethers.hexlify(ethers_1.ethers.randomBytes(31)));
        const nullifier = BigInt(ethers_1.ethers.hexlify(ethers_1.ethers.randomBytes(31)));
        // Compute commitment: Poseidon(2)([secret, nullifier])
        const commitment = (0, merkle_1.hash2)(secret, nullifier);
        const commitmentHex = (0, merkle_1.toHex)(commitment);
        // Get/Create tree
        let tree = merkleTrees[pollId];
        if (!tree) {
            tree = new merkle_1.MerkleTree(16);
            merkleTrees[pollId] = tree;
        }
        const voterIndex = tree.leaves.length;
        tree.insert(commitment);
        // Update on-chain Merkle root
        const newRootHex = (0, merkle_1.toHex)(tree.getRoot());
        console.log(`Updating Merkle root on-chain for poll ${pollId} to ${newRootHex}`);
        const nonce = await getNextNonce();
        const tx = await votingContract.updateMerkleRoot(pollId, newRootHex, { nonce });
        await tx.wait();
        // Update poll root locally
        poll.merkleRoot = newRootHex;
        writePolls(polls);
        // Store voter credentials
        const voters = readVoters();
        voters.push({
            pollId,
            voterSecret: (0, merkle_1.toHex)(secret),
            voterNullifier: (0, merkle_1.toHex)(nullifier),
            commitment: commitmentHex,
            voterIndex,
            hasVoted: false
        });
        writeVoters(voters);
        return res.status(201).json({
            commitment: commitmentHex,
            voterIndex
        });
    }
    catch (err) {
        console.error('Error registering voter:', err);
        return res.status(500).json({ error: 'Failed to register voter', details: err.message });
    }
});
// POST /api/polls/:pollId/vote
app.post('/api/polls/:pollId/vote', async (req, res) => {
    const pollId = Number(req.params.pollId);
    const { voterCommitment, voteChoice } = req.body;
    if (voterCommitment === undefined || voteChoice === undefined) {
        return res.status(400).json({ error: 'Missing voterCommitment or voteChoice' });
    }
    if (voteChoice !== 0 && voteChoice !== 1) {
        return res.status(400).json({ error: 'voteChoice must be 0 or 1' });
    }
    const voters = readVoters();
    const voter = voters.find(v => v.pollId === pollId && v.commitment === voterCommitment);
    if (!voter) {
        return res.status(404).json({ error: 'Voter registration not found for this poll' });
    }
    if (voter.hasVoted) {
        return res.status(400).json({ error: 'Voter has already voted' });
    }
    const tree = merkleTrees[pollId];
    if (!tree) {
        return res.status(500).json({ error: 'Merkle tree not initialized for this poll' });
    }
    try {
        // Generate Merkle proof
        const { proof: merkleProof, indices: merkleIndices } = tree.getProof(voter.voterIndex);
        // Prepare public input parameters
        const voterSecretBig = BigInt(voter.voterSecret);
        const voterNullifierBig = BigInt(voter.voterNullifier);
        // Calculate nullifier hash off-chain to submit/verify: Poseidon(1)([voterNullifier])
        const nullifierHashBig = (0, merkle_1.hash1)(voterNullifierBig);
        const nullifierHashHex = (0, merkle_1.toHex)(nullifierHashBig);
        // The requirement says:
        // "It must increment the vote count based on the (decrypted) encryptedVote or store the encrypted vote."
        // We will pass the voteChoice directly as encryptedVote (0 or 1) for the tally on-chain,
        // or a mock encryption (for example, choice padded/represented as 0x00..01).
        const encryptedVoteHex = (0, merkle_1.toHex)(BigInt(voteChoice));
        const inputs = {
            voterSecret: voterSecretBig.toString(10),
            voterNullifier: voterNullifierBig.toString(10),
            voteChoice: voteChoice.toString(10),
            merkleProof: merkleProof.map(p => p.toString(10)),
            merkleIndices: merkleIndices.map(i => i.toString(10)),
            merkleRoot: tree.getRoot().toString(10),
            nullifierHash: nullifierHashBig.toString(10),
            encryptedVote: BigInt(encryptedVoteHex).toString(10),
            pollId: pollId.toString(10)
        };
        console.log('Generating proof with SnarkJS...');
        const { proof, publicSignals } = await snarkjs.groth16.fullProve(inputs, WASM_PATH, ZKEY_PATH);
        // Encode proof for Solidity call
        const abiCoder = ethers_1.ethers.AbiCoder.defaultAbiCoder();
        const proofEncoded = abiCoder.encode(['uint256[2]', 'uint256[2][2]', 'uint256[2]'], [
            [proof.pi_a[0], proof.pi_a[1]],
            [
                [proof.pi_b[0][1], proof.pi_b[0][0]],
                [proof.pi_b[1][1], proof.pi_b[1][0]]
            ],
            [proof.pi_c[0], proof.pi_c[1]]
        ]);
        console.log(`Submitting vote on-chain. NullifierHash: ${nullifierHashHex}`);
        // Call contract
        const nonce = await getNextNonce();
        const tx = await votingContract.castVote(pollId, proofEncoded, nullifierHashHex, encryptedVoteHex, { nonce });
        const receipt = await tx.wait();
        // Mark voter as hasVoted
        voter.hasVoted = true;
        writeVoters(voters);
        return res.status(200).json({
            txHash: receipt.hash,
            nullifierHash: nullifierHashHex
        });
    }
    catch (err) {
        console.error('Error casting vote:', err);
        return res.status(500).json({ error: 'Failed to cast vote', details: err.message });
    }
});
// GET /api/polls/:pollId/results
app.get('/api/polls/:pollId/results', async (req, res) => {
    const pollId = Number(req.params.pollId);
    const polls = readPolls();
    const poll = polls.find(p => p.pollId === pollId);
    if (!poll) {
        return res.status(404).json({ error: 'Poll not found' });
    }
    try {
        const currentTime = Math.floor(Date.now() / 1000);
        const isActive = currentTime < poll.endTime;
        if (isActive) {
            return res.status(400).json({ error: 'Poll is still active. Results cannot be revealed yet.' });
        }
        // Fetch vote tally from contract
        console.log(`Fetching tally from contract for poll ${pollId}`);
        const [yesVotes, noVotes] = await votingContract.tallyVotes(pollId);
        const results = {
            [poll.options[1]]: Number(yesVotes), // Option 1 corresponds to YES/choice 1
            [poll.options[0]]: Number(noVotes) // Option 0 corresponds to NO/choice 0
        };
        return res.status(200).json({
            pollId,
            question: poll.question,
            results,
            isActive: false
        });
    }
    catch (err) {
        console.error('Error fetching results:', err);
        return res.status(500).json({ error: 'Failed to fetch results', details: err.message });
    }
});
// Start Server
async function start() {
    await (0, merkle_1.initPoseidon)();
    await initBlockchain();
    reconstructMerkleTrees();
    app.listen(PORT, () => {
        console.log(`API Server listening on port ${PORT}`);
    });
}
start().catch(console.error);
