#!/bin/bash
set -e

echo "=== Compiling Circom Circuit ==="
mkdir -p circuits contracts

# 1. Compile Circom circuit to r1cs and wasm
./bin/circom circuits/vote.circom --r1cs --wasm --sym -o circuits/

echo "=== Running Powers of Tau Setup ==="
# 2. Start new powersoftau
npx snarkjs powersoftau new bn128 14 circuits/pot14_0000.ptau

# 3. Contribute to powersoftau
npx snarkjs powersoftau contribute circuits/pot14_0000.ptau circuits/pot14_0001.ptau --name="Contributor 1" -v -e="random text"

# 4. Prepare phase 2
npx snarkjs powersoftau prepare phase2 circuits/pot14_0001.ptau circuits/pot14_final.ptau -v

echo "=== Setup Groth16 Prover Key ==="
# 5. Setup Groth16
npx snarkjs groth16 setup circuits/vote.r1cs circuits/pot14_final.ptau circuits/vote_0000.zkey

# 6. Contribute to zkey
npx snarkjs zkey contribute circuits/vote_0000.zkey circuits/vote_final.zkey --name="Contributor 2" -v -e="more random text"

# 7. Export verification key
npx snarkjs zkey export verificationkey circuits/vote_final.zkey circuits/verification_key.json

echo "=== Exporting Solidity Verifier ==="
# 8. Export solidity verifier contract
npx snarkjs zkey export solidityverifier circuits/vote_final.zkey contracts/Verifier.sol

echo "=== Cleaning up temporary ptau files ==="
rm circuits/pot14_0000.ptau circuits/pot14_0001.ptau circuits/pot14_final.ptau circuits/vote_0000.zkey

echo "=== Compilation and Setup Complete! ==="
