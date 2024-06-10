import axios from "axios";

import { GithubClient } from "../clients/github.js";
import { REPO_OWNER, REPO_NAME, REPO_PATH, REPO_BRANCH } from "../config.js";

type ApplicationInfo = {
  allocations: {
    standardized: string;
  };
  target_clients: string[];
  required_sps: string;
  required_replicas: string;
  tooling: string[];
  data_types: string[];
  "12m_requested": number;
  github_handles: string[];
  allocation_bookkeeping: string;
};

type PocInfo = {
  slack: string;
  github_user: string;
};

type PathwayAddresses = {
  msig: string;
  signer: string[];
};

type Allocator = {
  application_number: number;
  address: string;
  name: string;
  organization: string;
  location: string;
  status: string;
  metapathway_type: string;
  associated_org_addresses: string;
  application: ApplicationInfo;
  poc: PocInfo;
  pathway_addresses: PathwayAddresses;
};

interface IAllocatorService {
  getAllocators(): Promise<Allocator[]>;
  updateAllocator(allocator: Allocator): Promise<void>;
}

export default class AllocatorService implements IAllocatorService {
  private githubClient: GithubClient;

  constructor(githubClient: GithubClient) {
    this.githubClient = githubClient;
  }

  async getAllocators(): Promise<Allocator[]> {
    const repoContents = await this.githubClient.getRepoContents(
      REPO_OWNER,
      REPO_NAME,
      REPO_PATH,
      REPO_BRANCH
    );

    const regex = /^Allocators\/\d+\.json$/;
    const allocatorsMetadata = repoContents.filter(
      (entry: { type: string; path: string }) =>
        entry.type == "file" && regex.test(entry.path)
    );

    const allocatorPromises = allocatorsMetadata.map(
      async (allocatorMetadata: { path: string; download_url: string }) => {
        return axios
          .get(allocatorMetadata.download_url)
          .then((response) => response.data)
          .catch((error) => {
            console.error(
              `Error fetching content for ${allocatorMetadata.path}:`,
              error
            );
            return null; // Handle errors, potentially return null
          });
      }
    );

    return (await Promise.all(allocatorPromises))
      .filter(Boolean)
      .map((allocatorData) => allocatorData as Allocator);
  }

  async updateAllocator(allocator: Partial<Allocator>): Promise<void> {
    const downloadUrl = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${REPO_BRANCH}/Allocators/${allocator.application_number}.json`;
    const remoteAllocator = await axios
      .get(downloadUrl)
      .then((response) => response.data)
      .catch((error) => {
        console.error(
          `Error fetching content for allocator: ${allocator.application_number}`,
          error
        );
        return null; // Handle errors, potentially return null
      });

    const updatedAllocator = {
      ...remoteAllocator,
      ...allocator,
    };

    //// 2. Update the allocator file.
    const updateFile = await this.githubClient.updateFile(
      REPO_OWNER,
      REPO_NAME,
      `Allocators/${allocator.application_number}.json`,
      JSON.stringify(updatedAllocator, null, 4),
      "chore: Update allocator multisig signers",
      REPO_BRANCH
    );
    console.log("Update file:", updateFile);
  }
}
