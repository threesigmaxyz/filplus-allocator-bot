import axios from "axios";

import { encode as cborEncode } from "@ipld/dag-cbor";
import { base64pad } from "multiformats/bases/base64";
import { v4 as uuid } from "uuid";

declare type BuiltInActorEventType =
  | "verifier-balance"
  | "allocation"
  | "allocation-removed";

export class LotusClient {
  private httpRpcUrl: string;
  private httpRpcToken: string;
  private maxFilters: number;

  constructor(
    httpRpcUrl: string,
    httpRpcToken: string = "",
    maxFilters: number = 1000
  ) {
    this.httpRpcUrl = httpRpcUrl;
    this.httpRpcToken = httpRpcToken;
    this.maxFilters = maxFilters;
  }

  async getActor(actor: string): Promise<any> {
    const result = await this.request("Filecoin.StateGetActor", [actor, null]);
    return result;
  }

  async getState(address: string): Promise<any> {
    const result = await this.request("Filecoin.StateReadState", [
      address,
      null,
    ]);
    return result;
  }

  async getChainHead(): Promise<number> {
    const result = await this.request("Filecoin.ChainHead", []);
    return result.Height;
  }

  async getBuiltInActorEvents(
    fromHeight: number,
    toHeight: number,
    eventTypes: BuiltInActorEventType[]
  ): Promise<any> {
    // Validate inputs.
    if (fromHeight < 0) {
      throw new Error("fromHeight must be greater than or equal to 0");
    }
    if (toHeight < 0 || toHeight < fromHeight) {
      throw new Error(
        "toHeight must be greater than or equal to 0 and greater than fromHeight"
      );
    }
    if (eventTypes.length === 0) {
      throw new Error("eventTypes must not be empty");
    }

    // Compute the JSON-RPC request parameters for the Filecoin.GetActorEventsRaw method.
    const params = [
      {
        fromHeight,
        toHeight,
        fields: {
          $type: eventTypes.map((eventTypeString) => {
            // string must be encoded as CBOR and then presented as a base64 encoded string
            const eventTypeEncoded = base64pad.baseEncode(
              cborEncode(eventTypeString)
            );
            // Codec 81 is CBOR and will only give us builtin-actor events, FEVM events are all RAW
            return { Codec: 81, Value: eventTypeEncoded };
          }),
        },
      },
    ];

    const result = await this.request("Filecoin.GetActorEventsRaw", params);
    if (result != null && result.length === this.maxFilters) {
      throw new Error("Max results reached for GetActorEventsRaw");
    }

    return result;
  }

  private async request(method: string, params: any[]) {
    const requestBody = JSON.stringify({
      method,
      params,
      id: uuid(),
      jsonrpc: "2.0",
    });

    const response = await axios.post(this.httpRpcUrl, requestBody, {
      headers: {
        Authorization: `Bearer ${this.httpRpcToken}`,
        "content-type": "application/json",
      },
    });

    const responseData = response.data;
    if (responseData.error) {
      throw new Error(responseData.error.message);
    }
    if (responseData.result === undefined) {
      throw new Error("Missing result");
    }

    return responseData.result;
  }
}
