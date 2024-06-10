import { GithubClient } from "./clients/github.js";
import { LotusClient } from "./clients/lotus.js";

import MultisigService from "./services/multisig.js";
import AllocatorService from "./services/allocator.js";
import AllocationService, { Allocation } from "./services/allocation.js";
import { GITHUB_TOKEN, REPO_BRANCH, REPO_NAME, REPO_OWNER } from "./config.js";
import { areArraysEqualSets } from "./utils/index.js";
import logger from "./logger.js";
import { Octokit } from "@octokit/rest";

const lotusClient = new LotusClient(
  "https://api.node.glif.io/rpc/v1",
  "UXggx8DyJeaIIIe1cJZdnDk4sIiTc0uF3vYJXlRsZEQ="
);
const githubClient = new GithubClient(GITHUB_TOKEN);

const octokit = new Octokit({
  auth: GITHUB_TOKEN,
});

// Define interfaces for better type checking
interface Blob {
  path: string;
  content: string;
}

interface CommitFile extends Blob {
  sha: string;
}

async function createBlob(
  octokit: Octokit,
  owner: string,
  repo: string,
  content: string
) {
  const response = await octokit.git.createBlob({
    owner,
    repo,
    content,
    encoding: "utf-8", // or 'base64' for binary content
  });
  return response.data;
}

async function createTree(
  octokit: Octokit,
  owner: string,
  repo: string,
  blobs: any,
  paths: string[],
  base_tree: string
): Promise<any> {
  const tree: any = blobs.map((blob: any, index: number) => ({
    path: paths[index],
    mode: "100644",
    type: `blob`,
    sha: blob.sha,
  }));

  const response = await octokit.git.createTree({
    owner,
    repo,
    tree,
    base_tree,
  });
  return response.data;
}

// Function to create a commit
async function createCommit(
  octokit: Octokit,
  owner: string,
  repo: string,
  message: string,
  current_tree: string,
  parents: string[]
): Promise<string> {
  const response = await octokit.git.createCommit({
    owner,
    repo,
    message,
    tree: current_tree,
    parents,
  });
  return response.data.sha;
}

// Function to update reference to point to the new commit
async function updateRef(
  octokit: Octokit,
  owner: string,
  repo: string,
  commit_sha: string,
  branch: string = "heads/main"
): Promise<void> {
  await octokit.git.updateRef({
    owner,
    repo,
    ref: branch,
    sha: commit_sha,
  });
}

// Combined function to upload multiple files and commit them
async function commitFiles(
  octokit: Octokit,
  owner: string,
  repo: string,
  files: Blob[],
  branch: string,
  message: string
): Promise<void> {
  const blobs = await Promise.all(
    files.map((file) => createBlob(octokit, owner, repo, file.content))
  );
  const paths = files.map((file) => file.path);

  const base_tree = await octokit.git
    .getRef({
      owner,
      repo,
      ref: `heads/${branch}`,
    })
    .then((response) => response.data.object.sha);

  const newTree = await createTree(
    octokit,
    owner,
    repo,
    blobs,
    paths,
    base_tree
  );

  const commit_sha = await createCommit(
    octokit,
    owner,
    repo,
    message,
    newTree.sha,
    [base_tree]
  );
  await updateRef(octokit, owner, repo, commit_sha, `heads/${branch}`);
}

(async () => {
  logger.info("Starting the Filecoin Allocator Registry Bot...");

  const allocatorService = new AllocatorService(githubClient);
  const allocationService = new AllocationService(lotusClient, githubClient);
  const multisigService = new MultisigService(lotusClient);

  // Create the branch.
  // TODO: What is the branch gets deleted or modified (eg. merged).
  const createBranchResult = await githubClient.createBranch(
    REPO_OWNER,
    REPO_NAME,
    REPO_BRANCH,
    "main"
  );
  if (createBranchResult.isErr()) {
    logger.warn("Failed to create branch: " + REPO_BRANCH);
  }

  while (true) {
    logger.debug("Fetching allocators data from remote registry...");
    const allocators = await allocatorService.getAllocators();
    logger.debug(`Found ${allocators.length} allocators.`);

    // For each allocator, fetch the on chain multisig data.
    const updatedAllocators = (
      await Promise.all(
        allocators
          .filter((allocator) => allocator.address.startsWith("f2")) // Ignore non-f2 (actor) addresses.
          .map(async (allocator) => {
            try {
              // Fetch on chain multisig data.
              logger.debug(
                `Fetching multisig data for allocator: ${allocator.address}`
              );
              const multisig = await multisigService.getMultisig(
                allocator.address
              );

              // Compare signers content to check if they have changed.
              if (
                !areArraysEqualSets(
                  allocator.pathway_addresses.signer,
                  multisig.signers
                )
              ) {
                // Return an allocator with the updated multisig signers.
                return {
                  ...allocator,
                  pathway_addresses: {
                    ...allocator.pathway_addresses,
                    signer: multisig.signers,
                  },
                };
              } else {
                logger.debug(
                  `Multisig signers for allocator: ${allocator.address} are up to date.`
                );
              }
            } catch (error) {
              logger.error(
                `Unable to fetch multisig data for: ${allocator.address}`,
                error
              );
            }
          })
      )
    ).filter(Boolean);

    if (updatedAllocators.length === 0) {
      logger.debug("No allocators to update.");
    }

    // Fetch all built-in actor events since the last fetch block height.
    logger.debug("Fetching allocation data from remote registry...");
    const allocations = await allocationService.getAllocations();
    for (const allocation of allocations) {
      const a = await lotusClient.getActor(`f0${allocation.providerId}`);
      console.log(a);

      // Fetch allocation info from the chain.
    }

    const fromHeight = allocations.reduce(
      (maxHeight, allocation) => Math.max(maxHeight, allocation.height + 1),
      0
    );
    logger.debug(
      fromHeight === 0
        ? "No allocations found, fetching from the genesis block."
        : `Fetching allocation events from block height: ${fromHeight}`
    );

    const newAllocations = await allocationService.fetchAllocations(fromHeight);
    logger.debug(`Fetched ${newAllocations.length} new allocation events.`);

    const updatedAllocations: Record<string, Allocation[]> = {};
    for (const newAllocation of newAllocations) {
      const clientId = newAllocation.clientId;

      // Copy the existing allocations for the client.
      if (!updatedAllocations[clientId]) {
        updatedAllocations[clientId] = allocations.filter(
          (alloc) => alloc.clientId === clientId
        );
      }

      // Check if the allocation already exists.
      // TODO: This does not work and is inefficient...
      if (
        updatedAllocations[clientId]?.some(
          (alloc) => alloc.id === newAllocation.id
        )
      ) {
        logger.debug(
          `Allocation already exists for client: ${clientId}, allocation: ${newAllocation.id}`
        );
        continue;
      }

      // Add the new allocation.
      updatedAllocations[clientId].push(newAllocation);
    }

    // await allocationService.addAllocations(newAllocations);
    // console.log("Allocations added.");

    const updatedAllocatorFiles = updatedAllocators.map((allocator: any) => ({
      path: `Allocators/${allocator.application_number}.json`,
      content: JSON.stringify(allocator, null, 4),
    }));
    const updatedAllocationFiles = Object.entries(updatedAllocations).map(
      ([clientId, clientAllocations]) => ({
        path: `Allocations/${clientId}.json`,
        content: JSON.stringify(clientAllocations, null, 4),
      })
    );

    const updatedFiles = updatedAllocatorFiles.concat(updatedAllocationFiles);
    if (updatedFiles.length === 0) {
      logger.debug("No files to update.");
      continue;
    }

    logger.info("Updating files...");
    await commitFiles(
      octokit,
      REPO_OWNER,
      REPO_NAME,
      updatedFiles,
      REPO_BRANCH,
      `Automated Update\n\nThis update modifies the multisig signers for the following allocators:\n- ${updatedAllocators
        .map((allocator: any) => `Allocator: ${allocator.application_number}`)
        .join(
          "\n- "
        )}\n\nUpdated allocations for the following clients:\n- ${Object.entries(
        updatedAllocations
      )
        .map(([clientId]) => `Client: ${clientId}`)
        .join("\n- ")}`
    );
    logger.info("Files updated successfully.");

    // Run the script every hours.
    console.log("Sleeping for 1 hour...");
    await new Promise((resolve) => setTimeout(resolve, 60 * 60 * 1000));
  }
})();
