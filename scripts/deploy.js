const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("Deploying contracts...");

  // 1. Deploy Verifier
  const Groth16Verifier = await hre.ethers.getContractFactory("Groth16Verifier");
  const verifier = await Groth16Verifier.deploy();
  await verifier.waitForDeployment();
  const verifierAddress = await verifier.getAddress();
  console.log(`Groth16Verifier deployed to: ${verifierAddress}`);

  // 2. Deploy AnonymousVoting
  const AnonymousVoting = await hre.ethers.getContractFactory("AnonymousVoting");
  const voting = await AnonymousVoting.deploy(verifierAddress);
  await voting.waitForDeployment();
  const votingAddress = await voting.getAddress();
  console.log(`AnonymousVoting deployed to: ${votingAddress}`);

  // 3. Write deployment.json
  const AnonymousVotingArtifact = await hre.artifacts.readArtifact("AnonymousVoting");
  const deploymentData = {
    address: votingAddress,
    abi: AnonymousVotingArtifact.abi,
  };

  fs.writeFileSync(
    path.join(__dirname, "../deployment.json"),
    JSON.stringify(deploymentData, null, 2)
  );
  console.log("deployment.json updated successfully!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
