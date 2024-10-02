import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const LOTUS_BASE_PATH = "~/Documents/phase2/filecoin/lotus/";
const LOTUS_ENV = {
  LOTUS_PATH: "~/.lotus-local-net",
  LOTUS_MINER_PATH: "~/.lotus-miner-local-net",
  LOTUS_SKIP_GENESIS_CHECK: "_yes_",
  CGO_CFLAGS_ALLOW: "-D__BLST_PORTABLE__",
  CGO_CFLAGS: "-D__BLST_PORTABLE__",
};

const rootKey1 = {
  id: "t0100",
  address:
    "t3vi5mijtbimhg2hbhwngklrvpbz3j6va6xw4gikmjc24zhpzx5vz2mjq6nhlmguyfl46o4mhv6b2fd3gfc4tq",
};
const rootKey2 = {
  id: "t0101",
  address:
    "t3wy6hl4mlkdfcsv4urbelf7wtbbhkopkod7m2zbm3yyfhdvvdts2tmsolj3cwqjoivbo4cp5b47ox3xi6v4xa",
};

/**
 * Executes a CLI command and returns the parsed result.
 * @param command The CLI command to execute.
 * @returns A promise that resolves to the parsed result of the command.
 */
async function runCommand(command: string): Promise<any> {
  const env = {
    ...process.env,
    ...LOTUS_ENV,
  };

  try {
    const { stdout, stderr } = await execAsync(command, { env });
    if (stderr) {
      throw new Error(`Error executing command: ${stderr}`);
    }
    return stdout;
  } catch (error) {
    console.error(`Failed to execute command: ${error}`);
    throw error;
  }
}

export async function registerAllocator(allocation: number = 10000000) {
  const allocatorAddress = (
    await runCommand(LOTUS_BASE_PATH + "lotus wallet new secp256k1")
  ).trim();

  const result = await runCommand(
    LOTUS_BASE_PATH +
      `lotus-shed verifreg add-verifier ${rootKey1.address} ${allocatorAddress} ${allocation}`
  );
}

export async function grantDatacap(
  allocator: string,
  client: string,
  datacap: number
) {
  const result = await runCommand(
    LOTUS_BASE_PATH +
      `lotus filplus grant-datacap --from=${allocator} ${client} ${datacap}`
  );
}
