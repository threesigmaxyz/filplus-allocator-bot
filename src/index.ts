import GithubClient from "./clients/github.js";
import LotusClient from "./clients/lotus.js";
import config from "./config.js";
import MultisigService from "./services/multisig.js";
import AllocatorService from "./services/allocator.js";
import AllocationService, { Allocation } from "./services/allocation.js";
import logger from "./logger.js";
import { areArraysEqualSets } from "./utils/index.js";

const lotusClient = new LotusClient(config.lotus.url, config.lotus.token);
const githubClient = new GithubClient(config.github.token);

(async () => {
  logger.info("Starting the Filecoin Allocator Registry Bot...");

  const allocatorService = new AllocatorService(githubClient);
  const allocationService = new AllocationService(lotusClient, githubClient);
  const multisigService = new MultisigService(lotusClient);

  // Create the branch.
  try {
    logger.debug(`Creating branch: ${config.github.repoBranch}`);
    await githubClient.createBranch(
      config.github.repoOwner,
      config.github.repoName,
      config.github.repoBranch,
      "main"
    );
  } catch (error) {
    logger.warn("Failed to create branch.");
  }
  logger.debug("Branch created successfully.");

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
              logger.debug(
                `Multisig signers for allocator: ${allocator.address} have changed.`
              );
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
  logger.debug(`Found ${allocations.length} allocation events.`);

  const fromHeight = allocations.reduce(
    (maxHeight, allocation) => Math.max(maxHeight, allocation.height + 1),
    0
  );
  logger.debug(
    fromHeight === 0
      ? "No allocations found, synching from the genesis block."
      : `Synching from block height: ${fromHeight}`
  );

  const newAllocations = await allocationService.fetchAllocations(fromHeight);
  logger.debug(`Fetched ${newAllocations.length} new allocation events.`);

  const updatedAllocations: Record<string, Allocation[]> = {};
  for (const newAllocation of newAllocations) {
    const providerId = newAllocation.providerId;

    // Copy the existing allocations for the client.
    if (!updatedAllocations[providerId]) {
      updatedAllocations[providerId] = allocations.filter(
        (alloc) => alloc.providerId === providerId
      );
    }

    // Check if the allocation already exists.
    if (
      updatedAllocations[providerId]?.some(
        (alloc) => alloc.id === newAllocation.id
      )
    ) {
      logger.debug(
        `Allocation already exists for provider: ${providerId}, allocation: ${newAllocation.id}`
      );
      continue;
    }

    // Add the new allocation.
    updatedAllocations[providerId].push(newAllocation);
  }

  const updatedAllocatorFiles = updatedAllocators.map((allocator: any) => ({
    path: `Allocators/${allocator.application_number}.json`,
    content: JSON.stringify(allocator, null, 2),
  }));
  const updatedAllocationFiles = Object.entries(updatedAllocations).map(
    ([providerId, providerAllocations]) => ({
      path: `Allocations/${providerId}.json`,
      content: JSON.stringify(providerAllocations, null, 2),
    })
  );

  const updatedFiles = updatedAllocatorFiles.concat(updatedAllocationFiles);
  if (updatedFiles.length === 0) {
    logger.debug("No files to update.");
    return;
  }

  logger.info("Updating files...");
  await githubClient.commitToBranch(
    config.github.repoOwner,
    config.github.repoName,
    config.github.repoBranch,
    "Automated Update",
    updatedFiles
  );
  logger.info("Files updated successfully.");

  // Create PR or add a comment to the existing PR.
  const changelog = `This PR updates the multisig signers for the following allocators:\n- ${updatedAllocators
    .map((allocator: any) => `Allocator: ${allocator.application_number}`)
    .join(
      "\n- "
    )}\n\nUpdated allocations for the following allocators:\n- ${Object.entries(
    updatedAllocations
  )
    .map(([allocatorId]) => `Allocator: ${allocatorId}`)
    .join("\n- ")}`;
  
  try {
    const pullRequest = await githubClient.createPullRequest(
      config.github.repoOwner,
      config.github.repoName,
      config.github.repoBranch,
      "main",
      "Automated Update",
      changelog
    );
    logger.info(`Pull request created: ${pullRequest.html_url}`);

    // If the PR already exists, add a comment instead.
  } catch (error) {
    await githubClient.addCommentToPullRequest(
      config.github.repoOwner,
      config.github.repoName,
      config.github.repoBranch,
      changelog,
    );
    logger.info(`Comment added to pull request for branch: ${config.github.repoBranch}`);
  }
})();
