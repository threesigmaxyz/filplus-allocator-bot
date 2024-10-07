import { Octokit } from "@octokit/rest";
import { components } from "@octokit/openapi-types";
import { createAppAuth } from "@octokit/auth-app";


export type RepositoryItem = components["schemas"]["content-directory"][number];
export type Branch = components["schemas"]["git-ref"];

class GithubClient {
  private octokit: Octokit;

  constructor(
    private appId: string,
    private privateKey: string,
    private installationId: string
  ) {
    this.octokit = new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId: this.appId,
        privateKey: this.privateKey,
        installationId: this.installationId,
      },
    });
  }

  async getRepoContent(
    owner: string,
    repo: string,
    branch?: string,
    path: string = "",
  ): Promise<RepositoryItem[]> {
    const params: { owner: string; repo: string; path: string; ref?: string } =
      {
        owner: owner,
        repo: repo,
        path: path,
      };

    if (branch) {
      params.ref = branch;
    }

    const { data } = await this.octokit.repos.getContent(params);

    if (!Array.isArray(data)) return [];

    return data;
  }

  async createBranch(
    owner: string,
    repo: string,
    branchName: string,
    baseBranch: string
  ): Promise<Branch> {
    // Get the latest commit SHA of the base branch.
    const sha = await this.getReferenceHash(owner, repo, baseBranch);

    // Create a new branch with the latest commit SHA.
    const { data } = await this.octokit.git.createRef({
      owner: owner,
      repo: repo,
      ref: `refs/heads/${branchName}`,
      sha: sha,
    });

    return data;
  }

  async commitToBranch(
    owner: string,
    repo: string,
    branch: string,
    message: string,
    files: { path: string; content: string }[]
  ): Promise<any> {
    const blobs = await Promise.all(
      files.map((file) => this.createBlob(owner, repo, file.content))
    );

    const base = await this.getReferenceHash(owner, repo, branch);
    const treeHash = await this.createTree(
      owner,
      repo,
      base,
      blobs,
      files.map((file) => file.path)
    );

    const commitHash = await this.createCommit(owner, repo, message, treeHash, [
      base,
    ]);

    await this.octokit.git.updateRef({
      owner,
      repo,
      ref: `heads/${branch}`,
      sha: commitHash,
    });
    return commitHash;
  }

  async createPullRequest(
    owner: string,
    repo: string,
    head: string,  // Branch containing the changes
    base: string,  // Branch to merge the changes into
    title: string,
    body: string
  ): Promise<any> { // TODO: Any -> PullRequest
    const { data } = await this.octokit.pulls.create({
      owner,
      repo,
      title,
      body,
      head,
      base,
    });
    return data;
  }

  async addCommentToPullRequest(
    owner: string,
    repo: string,
    branch: string,
    comment: string
  ): Promise<any> { // TODO: Any -> Comment
    const { data: pullRequests } = await this.octokit.pulls.list({
      owner,
      repo,
      head: `${owner}:${branch}`,
      state: 'open'
    });

    if (!pullRequests) {
      throw new Error(`Pull request not found for branch ${branch}`);
    }

    const { data } = await this.octokit.issues.createComment({
      owner,
      repo,
      issue_number: pullRequests[0].number,
      body: comment,
    });
    return data;
  }

  private async getReferenceHash(
    owner: string,
    repo: string,
    branch: string
  ): Promise<string> {
    const { data } = await this.octokit.git.getRef({
      owner: owner,
      repo: repo,
      ref: `heads/${branch}`,
    });
    return data.object.sha;
  }

  private async createBlob(
    owner: string,
    repo: string,
    content: string
  ): Promise<string> {
    const { data } = await this.octokit.git.createBlob({
      owner: owner,
      repo: repo,
      content: content,
      encoding: "utf-8",
    });
    return data.sha;
  }

  private async createTree(
    owner: string,
    repo: string,
    base: string,
    blobs: string[],
    paths: string[]
  ): Promise<string> {
    const tree: any = blobs.map((blob: any, index: number) => ({
      path: paths[index],
      mode: "100644",
      type: `blob`,
      sha: blob,
    }));

    const { data } = await this.octokit.git.createTree({
      owner: owner,
      repo: repo,
      tree: tree,
      base_tree: base,
    });

    return data.sha;
  }

  private async createCommit(
    owner: string,
    repo: string,
    message: string,
    tree: string,
    parents: string[]
  ): Promise<string> {
    const { data } = await this.octokit.git.createCommit({
      owner: owner,
      repo: repo,
      message: message,
      tree: tree,
      parents: parents,
    });
    return data.sha;
  }
}

export default GithubClient;
