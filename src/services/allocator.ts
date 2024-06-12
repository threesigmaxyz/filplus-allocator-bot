import axios from "axios";

import GithubClient, { RepositoryItem } from "../clients/github.js";
import config from "../config.js";

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
}

export default class AllocatorService implements IAllocatorService {
  private githubClient: GithubClient;

  constructor(githubClient: GithubClient) {
    this.githubClient = githubClient;
  }

  async getAllocators(): Promise<Allocator[]> {
    const repoContents = await this.githubClient.getRepoContent(
      config.github.repoOwner,
      config.github.repoName,
      config.github.repoBranch,
      "Allocators"
    );

    const regex = /^Allocators\/\d+\.json$/;
    const allocatorsMetadata = repoContents.filter(
      (entry: { type: string; path: string }) =>
        entry.type == "file" && regex.test(entry.path)
    );

    const allocatorPromises = allocatorsMetadata.map(
      async (allocatorMetadata: RepositoryItem) => {
        return axios
          .get(allocatorMetadata.download_url!)
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
}
