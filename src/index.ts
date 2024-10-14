import GithubClient from "./clients/github.js";
import LotusClient from "./clients/lotus.js";
import config from "./config.js";
import MultisigService from "./services/multisig.js";
import AllocatorService from "./services/allocator.js";
import AllocationService, { Allocation } from "./services/allocation.js";
import logger from "./logger.js";
import { areArraysEqualSets } from "./utils/index.js";
import FilfoxClient from "./clients/filfox.js";

const lotusClient = new LotusClient(config.lotus.url, config.lotus.token);
const githubClient = new GithubClient(
  config.github.appId,
  config.github.privateKey,
  config.github.installationId
);
const filfoxClient = new FilfoxClient();

(async () => {
  logger.info("Starting the Filecoin Allocator Registry Bot...");

  const allocatorService = new AllocatorService(githubClient);
  const allocationService = new AllocationService(lotusClient, githubClient, filfoxClient);
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
        .filter((allocator) => allocator.address && allocator.address.startsWith("f2")) // Ignore non-f2 (actor) addresses.
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

  const fetchedAllocations = await allocationService.fetchAllocations(fromHeight);
  logger.debug(`Fetched ${fetchedAllocations.length} new allocation events.`);

  const newAllocations: Record<number, Allocation[]> = {};
  for (const fetchedAllocation of fetchedAllocations) {
    // Check if the allocation already exists.
    const verifierId = fetchedAllocation.verifierId;
    if (
      allocations.some(
        (alloc) => alloc.msgCid === fetchedAllocation.msgCid
      )
    ) {
      logger.debug(
        `Allocation already exists for provider: ${verifierId}, allocation: ${fetchedAllocation.msgCid}`
      );
      continue;
    }

    // Add the new allocation.
    if (!newAllocations[verifierId]) {
      newAllocations[verifierId] = [];
    }
    newAllocations[verifierId].push(fetchedAllocation);
  }

  const updatedAllocatorFiles = updatedAllocators.map((allocator: any) => ({
    path: `Allocators/${allocator.application_number}.json`,
    content: JSON.stringify(allocator, null, 2),
  }));
  const updatedAllocationFiles = Object.entries(newAllocations).map(
    ([providerId, providerAllocations]) => {
      const existingAllocations = allocations.filter(alloc => alloc.verifierId === Number(providerId))
      return {
        path: `Allocations/${providerId}.json`,
        content: JSON.stringify([...providerAllocations, ...existingAllocations], null, 2),
      }
    }
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
    'bot: Automated Update',
    updatedFiles
  );
  logger.info("Files updated successfully.");

  const generateChangelogTable = (title: string, data: any[], columns: string[]) => {
    if (data.length === 0) return '';
    return `
  ### ${title}
  
  | ${columns.join(' | ')} |
  |${columns.map(() => ':---').join('|')}|
  ${data.map(item => `| ${columns.map(col => item[col] || '').join(' | ')} |`).join('\n')}
  `;
  };
  
  const updatedAllocatorsTable = generateChangelogTable(
    'Updated Multisig Signers',
    updatedAllocators.map((allocator: any) => ({
      'Application Number': allocator.application_number,
      'Address': allocator.address,
      'Signers': allocator.pathway_addresses.signer.join(', ')
    })),
    ['Application Number', 'Address', 'Signers']
  );
  
  const newAllocationsTable = generateChangelogTable(
    'New Allocations',
    Object.entries(newAllocations).flatMap(([verifierId, allocations]) => 
      allocations.map(allocation => ({
        'Verifier ID': verifierId,
        'Client': allocation.clientAddress,
        'Allowance': allocation.clientAllowance,
      }))
    ),
    ['Verifier ID', 'Client', 'Allowance']
  );
    
  const changelog = `# Automated Update
    
  ${updatedAllocatorsTable}
  ${newAllocationsTable}
  `.trim();

  const existingPullRequest = await githubClient.getPullRequestForBranch(
    config.github.repoOwner,
    config.github.repoName,
    config.github.repoBranch
  );

  if (existingPullRequest) {
    logger.info(`Pull request already exists: ${existingPullRequest.html_url}`);
    await githubClient.addCommentToPullRequest(
      config.github.repoOwner,
      config.github.repoName,
      config.github.repoBranch,
      changelog,
    );
    logger.info(`Comment added to pull request for branch: ${config.github.repoBranch}`);
  }

  const pullRequest = existingPullRequest || await githubClient.createPullRequest(
    config.github.repoOwner,
    config.github.repoName,
    config.github.repoBranch,
    "main",
    'bot: Automated Update',
    changelog
  )
  logger.info(`Pull request created: ${pullRequest.html_url}`);

  try {
    await githubClient.mergePullRequest(
      config.github.repoOwner,
      config.github.repoName,
      pullRequest.number,
      "bot: Automated Update",
    );
    logger.info(`Pull request merged: ${pullRequest.html_url}`);
    
    await githubClient.deleteBranch(
      config.github.repoOwner,
      config.github.repoName,
      config.github.repoBranch
    );
    logger.info(`Branch deleted: ${config.github.repoBranch}`);

  } catch (error: any) {
    logger.error(`Failed to merge pull request: ${error.message}`);
  }
})();
