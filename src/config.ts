import dotenv from "dotenv";

// Load environment variables
dotenv.config();

export const DEFAULT_REPO_OWNER = "asynctomatic"; //"filecoin-project";
export const DEFAULT_REPO_NAME = "Allocator-Registry";
export const DEFAULT_REPO_BRANCH = "filecoin-registry-bot";
export const DEFAULT_LOG_LEVEL = "debug";
export const DEFAULT_LOTUS_URL = "https://api.node.glif.io/rpc/v1";

const config = {
  environment: process.env.NODE_ENV || "development",
  logging: {
    level: process.env.LOG_LEVEL || DEFAULT_LOG_LEVEL,
  },
  github: {
    repoOwner: process.env.REPO_OWNER || DEFAULT_REPO_OWNER,
    repoName: process.env.REPO_NAME || DEFAULT_REPO_NAME,
    repoBranch: process.env.REPO_BRANCH || DEFAULT_REPO_BRANCH,
    token: process.env.GITHUB_TOKEN!,
  },
  lotus: {
    url: process.env.LOTUS_URL || DEFAULT_LOTUS_URL,
    token: process.env.LOTUS_TOKEN!,
  },
};

export default config;
