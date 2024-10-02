import axios from "axios";

import GithubClient from "../clients/github";
import LotusClient from "../clients/lotus";
import logger from "../logger.js";
import { decodeActorEvent } from "../utils/built-in-actor-events.js";
import config from "../config.js";
import FilfoxClient from "../clients/filfox";

const FILECOIN_EPOCHS_PER_DAY = 2880; // 30 seconds per epoch
const MAX_FILTER_EPOCH_RANGE = Math.floor(FILECOIN_EPOCHS_PER_DAY / 12);
const MAX_FILTER_RESULTS = 10000;

export declare type Allocation = {
  verifierId: number;
  clientAddress: number;
  clientAllowance: bigint;
  msgCid: string;
  height: number;
};

interface IAllocationService {
  getAllocations(): Promise<Allocation[]>;
  fetchAllocations(
    fromHeight: number,
    confirmations: number
  ): Promise<Allocation[]>;
}

export default class AllocationService implements IAllocationService {
  private lotusClient: LotusClient;
  private githubClient: GithubClient;
  private filfoxClient: FilfoxClient;

  constructor(lotusClient: LotusClient, githubClient: GithubClient, filfoxClient: FilfoxClient) {
    this.lotusClient = lotusClient;
    this.githubClient = githubClient;
    this.filfoxClient = filfoxClient;
  }

  async getAllocations(): Promise<Allocation[]> {
    try {
      // Load repository contents
      const repoContents = await this.githubClient.getRepoContent(
        config.github.repoOwner,
        config.github.repoName,
        config.github.repoBranch,
        "Allocations"
      );

      // Define the file matching pattern
      const regex = /^Allocations\/\d+\.json$/;

      // Process each eligible file entry concurrently
      const clientAllocations = await Promise.all(
        repoContents
          .filter(entry => entry.type === "file" && regex.test(entry.path))
          .map(entry => this.downloadAllocations(entry.download_url! + "?token=" + new Date().getTime()))
      );

      // Filter out null entries and flatten the results if needed
      return clientAllocations.filter(Boolean).flat();
    } catch (error) {
      logger.warn('Failed to fetch allocations from GitHub.');
      return []; // Return an empty array on failure
    }
  }

  async fetchAllocations(
    fromHeight: number,
    confirmations: number = 0
  ): Promise<Allocation[]> {
    const chainHeight = await this.lotusClient.getChainHead();

    // Error: bad tipset height: look backs of more than 16h40m0s are disallowed
    let syncToHeight = chainHeight - confirmations;
    let syncFromHeight = Math.max(
      fromHeight,
      syncToHeight - FILECOIN_EPOCHS_PER_DAY / 3
    )

    if (syncToHeight < syncFromHeight) {
      logger.warn("Nothing to sync");
      return [];
    }

    logger.debug(
      `Synching allocations from height ${syncFromHeight} to height ${syncToHeight}`
    );

    let filterToHeight;
    let filterFromHeight = syncFromHeight;
    let filterEpochRange = MAX_FILTER_EPOCH_RANGE;
    const allocations: Allocation[] = [];
    while (filterFromHeight < syncToHeight) {
      filterToHeight = Math.min(
        filterFromHeight + filterEpochRange,
        syncToHeight
      );
      logger.debug(
        `Fetching actor events from height ${filterFromHeight} to ${filterToHeight} with epoch range ${filterEpochRange}`
      );



      let actorEventsRaw;
      try {
        actorEventsRaw = await this.lotusClient.getBuiltInActorEvents(
          filterFromHeight,
          filterToHeight,
          ["verifier-balance"]
        );

        logger.debug(
          `Fetched ${actorEventsRaw.length} actor events from height ${filterFromHeight} to ${filterToHeight}`
        );

        if (actorEventsRaw.length >= MAX_FILTER_RESULTS) {
          throw new Error("MAX_FILTER_RESULTS exceeded");
        }
      } catch (error: any) {
        if (error.message === "MAX_FILTER_RESULTS exceeded" || (error.message.includes("Response is too big"))) {
          filterEpochRange = Math.floor(filterEpochRange / 2);
          if (filterEpochRange < 1) {
            throw new Error("Filter epoch range is too small");
          }
          logger.debug(
            `Filter epoch range too large, reducing to ${filterEpochRange}`
          );
          continue;
        }
        throw error;
      }
      
      const newAllocations = await Promise.all(actorEventsRaw.map(async (actorEvent: any) => {
        const decodedEvent = decodeActorEvent(actorEvent);
        if (decodedEvent.reverted ?? decodedEvent.emitter !== "f06") {
          return null
        }

        const decodedMessage = await this.filfoxClient.getDecodedMessage(decodedEvent.msgCid['/']);

        return {
          id: decodedEvent.id,
          verifierId: decodedEvent.event.verifier,
          clientAddress: decodedMessage.decodedParams?.Address ?? "",
          clientAllowance:  decodedMessage.decodedParams?.Allowance ?? "",
          msgCid: decodedEvent.msgCid['/'],
          height: decodedEvent.height,
        };
      }).filter(Boolean))
      
      allocations.push(...newAllocations);
      filterFromHeight += filterEpochRange;
    }

    return allocations;
  }

   // Helper function to fetch allocation data
   private async downloadAllocations(url: string): Promise<Allocation[]> {
    try {
      const response = await axios.get(url);
      return response.data;
    } catch (error) {
      console.error(`Error fetching content from ${url}:`, error);
      return []
    }
  }
}
