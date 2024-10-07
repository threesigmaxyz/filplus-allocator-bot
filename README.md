# Filecoin Plus Tracker Bot
[![Github Actions][gha-badge]][gha] [![License: MIT][license-badge]][license]

[gha]: https://github.com/threesigmaxyz/filplus-allocator-bot/actions
[gha-badge]: https://github.com/threesigmaxyz/filplus-allocator-bot/actions/workflows/github-actions.yml/badge.svg
[license]: LICENSE.md
[license-badge]: https://img.shields.io/badge/License-MIT-blue.svg

![banner](./img/banner.png)

> 💡 **Deployment:** Currently the bot is running via Github actions [here](https://github.com/threesigmaxyz/filplus-allocator-bot).

This repository contains the source code for the Filecoin Plus Tracker Bot. The program is responsible for monitoring the Filecoin blockchain and tracking the state and events for the Filecoin Plus program. Tracked data is stored in a GitHub repository acting as public registry.

## Getting Started
This section provides instructions on how to install and configure the bot.

### Prerequisites
- Node.js v16 or higher
- NPM

### Installation
To install the project, clone the repository and install the dependencies:

```bash
git clone https://github.com/threesigmaxyz/filplus-allocator-bot.git
npm install
```

### Configuration
Set the following environment variables below according to the specified requirements.

| Environment Variable | Description    | Example Values         |
|---------------------|-----------------|-----------------------------------------|
| REPO_OWNER | The name of the owner account of the repository  | `filecoin-project` |
| REPO_NAME    | The repository identifier where we want to persist the data           |   `Allocator-Registry`    |
| REPO_BRANCH        | The path of the location of the allocators    |    `filecoin-registry-bot`   |
| GH_APP_ID | The ID of the GitHub App | `246226` |
| GH_APP_PRIVATE_KEY | The private key of the GitHub App | `-----BEGIN PRIVATE KEY-----\n...` |
| GH_APP_INSTALLATION_ID | The installation ID of the GitHub App | `123456` |
| LOTUS_URL        | The URL of the Lotus node to connect to    |    `https://api.node.glif.io/rpc/v1` |
| LOTUS_TOKEN        | The token of the Lotus node to connect to    | `*******************`  |

### Usage
To run the bot, execute the following command:

```bash
npm run start
```

#### Run in GitHub Actions
To run the bot in GitHub Actions, follow the steps below:

- Copy the contents of the [example workflow file](.github/workflows/github-actions.yml) to your repository.
- Set the `REPO_OWNER`, `REPO_NAME`, `REPO_BRANCH` in your repository variables.
- Set the `GH_APP_ID`, `GH_APP_PRIVATE_KEY` and `GH_APP_INSTALLATION_ID` in your repository secrets.
- Set the `LOTUS_URL` and `LOTUS_TOKEN` in your repository secrets.

This will setup an hourly schedule to run the bot, additionally, you can manually trigger the workflow to run.

# About Us

[Three Sigma](https://threesigma.xyz/) is a venture builder firm focused on blockchain engineering, research, and investment. Our mission is to advance the adoption of blockchain technology and contribute towards the healthy development of the Web3 space. If you are interested in joining our team, please contact us
[here](mailto:info@threesigma.xyz).