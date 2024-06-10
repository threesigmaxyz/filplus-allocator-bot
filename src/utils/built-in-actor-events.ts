import { decode as cborDecode } from "@ipld/dag-cbor";
import { base64pad } from "multiformats/bases/base64";

declare type BuiltInActorEventEntry = {
  Flags: number;
  Codec: 81;
  Key: string;
  Value: string;
};

declare type BuiltInActorEvent = {
  entries: BuiltInActorEventEntry[];
};

const eventValidators = {};

function decodeCborInBase64(data: string): string {
  return cborDecode(base64pad.baseDecode(data));
}

/**
 * Convert an array of raw entries to an event object and its type. Performs base64pad and CBOR
 * decoding on values and converts keys to camelCase.
 * This method expects builtin actor event types, so they should be CBOR encoded and have a "$type"
 *
 * @param {BuiltInActorEventEntry[]} entries - An array of entries
 * @returns {{type: string, event: Object}} - The event object and its type
 */
function entriesToEvent(entries: BuiltInActorEventEntry[]): {
  type: string;
  event: Object;
} {
  if (!Array.isArray(entries)) {
    throw new Error("Expected entries to be an array");
  }
  if (entries.length === 0) {
    throw new Error("Expected at least one entry");
  }
  if (entries[0].Key !== "$type") {
    throw new Error("Expected $type as first entry");
  }

  const type = decodeCborInBase64(entries[0].Value);

  const event: any = {}; // TODO: any
  for (const { Key, Value } of entries.slice(1)) {
    const value = decodeCborInBase64(Value);
    const key = Key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (event[key] !== undefined) {
      throw new Error(`Unexpected duplicate key ${key} in event`);
    }
    event[key] = value;
  }
  return { type, event };
}

export function decodeActorEvent(eventData: any) {
  //if (Object.keys(eventValidators).length === 0) {
  //  throw new Error("init() must be called before transform");
  //}
  const { entries, ...rest } = eventData;
  const { type, event } = entriesToEvent(entries);
  // eventValidators is indexed by TitleCase type from title-case original name with "Event" suffix
  const typeName = `${type.charAt(0).toUpperCase()}${type
    .substring(1)
    .replace(/-([a-z])/g, (_, c) => c.toUpperCase())}Event`;
  // const validator = eventValidators[typeName];
  // if (!validator) {
  //   throw new Error(`Unknown event type ${type}, no schema for ${typeName}`);
  // }
  // const typedEvent = validator.toTyped(event);
  // if (typedEvent === undefined) {
  //   throw new Error(
  //     `Invalid event data format, ${type} event doesn't conform to ${typeName} schema`
  //   );
  // }
  // TODO: return { type, event: typedEvent, ...rest };
  return { type, event, ...rest };
}
