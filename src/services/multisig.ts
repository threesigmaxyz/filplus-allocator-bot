import { LotusClient } from "../clients/lotus.js";

declare type Multisig = {
  address: string;
  threshold: number;
  signers: string[];
};

interface IMultisigService {
  getMultisig(address: string): Promise<Multisig>;
}

export default class MultisigService implements IMultisigService {
  private lotusClient: LotusClient;

  constructor(lotusClient: LotusClient) {
    this.lotusClient = lotusClient;
  }

  async getMultisig(address: string): Promise<Multisig> {
    const multisigState = await this.lotusClient.getState(address);
    const signersIds = multisigState.State.Signers;

    const signers = await Promise.all(
      signersIds.map(async (signerId: string) => {
        return await this.lotusClient.getState(signerId);
      })
    );

    return {
      address,
      threshold: multisigState.State.NumApprovalsThreshold,
      signers: signers.map((signer) => signer.State.Address),
    };
  }
}
