import axios from "axios";

interface DecodedMessage {
  from: string;
  fromId: string;
  fromActor: string;
  to: string;
  toId: string;
  toActor: string;
  value: string;
  method: string;
  methodNumber: number;
  params: string;
  receipt: {
    exitCode: number;
    return: string;
  };
  decodedParams?: {
    Address?: string;
    Allowance?: string;
    [key: string]: string | undefined;
  };
  decodedReturnValue: any;
  subcalls: DecodedMessage[];
}

class FilfoxClient {
  private baseUrl = "https://filfox.info/api/v1";

  async getDecodedMessage(messageCid: string): Promise<DecodedMessage> {
    try {
      const response = await axios.get<DecodedMessage[]>(`${this.baseUrl}/message/${messageCid}/subcalls`);
      return response.data[0];
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Failed to fetch decoded message: ${error.message}`);
      }
      throw error;
    }
  }
}

export default FilfoxClient;