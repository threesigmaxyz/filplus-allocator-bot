import { GithubClient } from "../clients/github";
import { LotusClient } from "../clients/lotus";
import { REPO_OWNER, REPO_NAME, REPO_BRANCH } from "../config.js";
import { decodeActorEvent } from "../utils/built-in-actor-events.js";
import axios from "axios";

const FILECOIN_EPOCHS_PER_DAY = 2880; // 30 seconds per epoch
const MAX_FILTER_EPOCH_RANGE = Math.floor(FILECOIN_EPOCHS_PER_DAY / 12);
const MAX_FILTER_RESULTS = 10000;

export declare type Allocation = {
  id: number;
  clientId: number;
  providerId: number;
  pieceCid: string;
  pieceSize: number;
  termMin: number;
  termMax: number;
  expiration: number;
  height: number;
};

interface IAllocationService {
  getAllocations(): Promise<Allocation[]>;
  fetchAllocations(
    fromHeight: number,
    confirmations: number
  ): Promise<Allocation[]>;
  addAllocations(allocations: Allocation[]): Promise<void>;
}

export default class AllocationService implements IAllocationService {
  private lotusClient: LotusClient;
  private githubClient: GithubClient;

  constructor(lotusClient: LotusClient, githubClient: GithubClient) {
    this.lotusClient = lotusClient;
    this.githubClient = githubClient;
  }

  async getAllocations(): Promise<Allocation[]> {
    const repoContentsResult = await this.githubClient.getRepoContentsV2(
      REPO_OWNER,
      REPO_NAME,
      "Allocations",
      REPO_BRANCH
    );

    const regex = /^Allocations\/\d+\.json$/;
    const repoContents = repoContentsResult
      .map((result) =>
        result.filter((entry) => entry.type == "file" && regex.test(entry.path))
      )
      .unwrapOr([]);

    const clientAllocations = await Promise.all(
      repoContents.map(async (entry) => {
        const allocationData = await axios
          .get(entry.download_url)
          .then((response) => response.data)
          .catch((error) => {
            console.error(`Error fetching content for ${entry.path}:`, error);
            return null; // Handle errors, potentially return null
          });
        return allocationData;
      })
    );

    return clientAllocations.filter(Boolean).flat();
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
    );

    if (syncToHeight < syncFromHeight) {
      console.error("Debug: Nothing to sync");
      return [];
    }

    console.log(
      "Synching allocations from height",
      syncFromHeight,
      "to height",
      syncToHeight
    );

    let filterToHeight;
    let filterFromHeight = syncFromHeight;
    let filterEpochRange = MAX_FILTER_EPOCH_RANGE;
    const allocations: Allocation[] = [];
    while (filterFromHeight < syncToHeight) {
      filterToHeight = Math.min(
        filterFromHeight + MAX_FILTER_EPOCH_RANGE,
        syncToHeight
      );
      console.log(
        "Fetching actor events from height",
        filterFromHeight,
        "to",
        filterToHeight,
        "with epoch range",
        filterEpochRange
      );

      const actorEventsRaw = await this.lotusClient.getBuiltInActorEvents(
        filterFromHeight,
        filterToHeight,
        ["allocation"] // TODO: add "allocation-removed"
      );

      console.log(
        "Fetched",
        actorEventsRaw.length,
        "actor events from height",
        filterFromHeight,
        "to",
        filterToHeight
      );

      if (actorEventsRaw.length >= MAX_FILTER_RESULTS) {
        filterEpochRange = Math.floor(filterEpochRange / 2);
        if (filterEpochRange < 1) {
          throw new Error("Filter epoch range is too small");
        }
        console.log("Filter epoch range reduced to", filterEpochRange);
        continue;
      }

      const newAllocations = actorEventsRaw.map((actorEvent: any) => {
        const decoded = decodeActorEvent(actorEvent);
        return {
          id: decoded.event.id,
          clientId: decoded.event.client,
          providerId: decoded.event.provider,
          pieceCid: decoded.event.pieceCid,
          pieceSize: decoded.event.pieceSize,
          termMin: decoded.event.termMin,
          termMax: decoded.event.termMax,
          expiration: decoded.event.expiration,
          height: decoded.height,
        };
      });
      allocations.push(...newAllocations);

      filterFromHeight += filterEpochRange;
    }

    return allocations;
  }

  async addAllocations(newAllocations: Allocation[]): Promise<void> {
    // Fetch repository allocations and group by client.
    const allocations = await this.getAllocations();

    // Add new allocations to the existing allocations.
    const updatedAllocationsByClient: Record<string, Allocation[]> = {};
    for (const newAllocation of newAllocations) {
      const clientId = newAllocation.clientId;

      // Copy the existing allocations for the client.
      if (!updatedAllocationsByClient[clientId]) {
        updatedAllocationsByClient[clientId] = allocations.filter(
          (alloc) => alloc.clientId === clientId
        );
      }

      // Check if the allocation already exists.
      if (
        updatedAllocationsByClient[clientId]?.some(
          (alloc) => alloc.id === newAllocation.id
        )
      ) {
        console.log(
          "Duplicate allocation:",
          newAllocation.id,
          newAllocation.height,
          newAllocation.clientId
        );
        continue;
      }

      // Add the new allocation.
      updatedAllocationsByClient[clientId].push(newAllocation);
    }

    // Update the allocation files.
    for (const clientId in updatedAllocationsByClient) {
      const clientAllocations = updatedAllocationsByClient[clientId];
      const clientAllocationsData = JSON.stringify(clientAllocations, null, 4);
      const clientAllocationsPath = `Allocations/${clientId}.json`;
      await this.githubClient.updateFile(
        REPO_OWNER,
        REPO_NAME,
        clientAllocationsPath,
        clientAllocationsData,
        "chore: Update client allocations",
        REPO_BRANCH
      );
    }
  }
}
