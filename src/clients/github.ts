import axios from "axios";
import { Err, Ok, Result } from "ts-results-es";

// TODO: Rename repository metadata
type RepositoryContent = {
  type: string;
  name: string;
  path: string;
  download_url: string;
  // TODO: Add more fields as needed.
};

export class GithubClient {
  private authToken: string;

  constructor(authToken: string) {
    this.authToken = authToken;
  }

  async getRepoContentsV2(
    owner: string,
    repo: string,
    path: string,
    ref?: string
  ): Promise<Result<RepositoryContent[], Error>> {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}${
      ref ? `?ref=${ref}` : ""
    }`;

    // Fetch the data from the GitHub API.
    const result = fetch(url, {
      headers: {
        Authorization: `Bearer ${this.authToken}`,
        Accept: "application/vnd.github.v3+json",
      },
    })
      // Parse the response as JSON.
      .then(async (res) => {
        // Handle successful responses.
        if (res.ok) {
          return res
            .json()
            .then((repo: RepositoryContent[]) => new Ok(repo))
            .catch((error) => new Err(error));
        }

        // Handle unsuccessful responses.
        if (res.status === 404) {
          return new Err("Not found");
        }
        return new Err("Unknown API error");
      })

      // Handle any errors.
      .catch((error) => {
        console.error(error);
        return new Err(error);
      });

    return result;
  }

  async getRepoContents(
    owner: string,
    repo: string,
    path: string,
    ref?: string
  ): Promise<any> {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}${
      ref ? `?ref=${ref}` : ""
    }`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.authToken}`,
        Accept: "application/vnd.github.v3+json",
      },
    });
    return await response.json();
  }

  async createBranch(
    owner: string,
    repo: string,
    branchName: string,
    baseBranch: string
  ): Promise<Result<any, Error>> {
    const sha = await this.getBranchLatestCommit(owner, repo, baseBranch);
    const url = `https://api.github.com/repos/${owner}/${repo}/git/refs`;
    const requestBody = JSON.stringify({
      ref: `refs/heads/${branchName}`,
      sha,
    });

    return axios
      .post(url, requestBody, {
        headers: {
          Authorization: `Bearer ${this.authToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      })
      .then((res) => {
        if (res.status === 201) return new Ok(res.data);
        return new Err(new Error("Unknown response status."));
      })
      .catch((error) => {
        return new Err(error);
      });

    const response = await axios.post(url, requestBody, {
      headers: {
        Authorization: `Bearer ${this.authToken}`,
        Accept: "application/vnd.github.v3+json",
      },
    });
    if (response.status !== 201) {
      throw new Error(`Failed to create branch: ${response.statusText}`);
    }
    return response.data;
  }

  async updateFile(
    owner: string,
    repo: string,
    path: string,
    content: string,
    message: string,
    branch: string
  ): Promise<any> {
    const sha = await this.getFileSha(owner, repo, path, branch);
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${this.authToken}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message,
        content: Buffer.from(content).toString("base64"),
        branch,
        sha,
      }),
    });
    return await response.json();
  }

  async createPullRequest(
    owner: string,
    repo: string,
    head: string,
    base: string,
    title: string,
    body: string
  ): Promise<any> {
    const url = `https://api.github.com/repos/${owner}/${repo}/pulls`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.authToken}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title,
        body,
        head,
        base,
      }),
    });
    return await response.json();
  }

  async getBranchLatestCommit(
    owner: string,
    repo: string,
    branch: string
  ): Promise<string> {
    const url = `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branch}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.authToken}`,
        Accept: "application/vnd.github.v3+json",
      },
    });
    const data = await response.json();
    return data.object.sha;
  }

  async getFileSha(
    owner: string,
    repo: string,
    path: string,
    branch: string
  ): Promise<string> {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.authToken}`,
        Accept: "application/vnd.github.v3+json",
      },
    });
    const data = await response.json();
    return data.sha || null; // Returns null if file does not exist, meaning it will be a new file.
  }
}
