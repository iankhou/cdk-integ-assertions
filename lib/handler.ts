/**
 * A resource handler reads a deployed resource back through its service API, one check per property.
 *
 * The expected value of a check is the property's value in the resolved template (at the check's key, a dot path
 * into the resource's Properties). A check names the call that reads it, where the value is in the response, and
 * how to compare. Only read calls (Get*, Describe*, List*, Head*, BatchGet*) are allowed.
 */
import type { Command } from '@smithy/types';

/** What a handler knows about the resource being checked */
export interface Context {
  readonly logicalId: string;
  readonly physicalId: string;
  /** The resource's resolved Properties */
  readonly properties: { [name: string]: any };
  /** Physical id of another resource in the same stack */
  physicalIdOf(logicalId: string): string;
  readonly region: string;
  readonly account: string;
  readonly stackName: string;
  /** Make another read call (e.g. a lookup a check needs); cached like the checks' own calls */
  send<O>(client: new (config: { region: string }) => Client, command: ReadCommand<O>): Promise<O>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ReadCommand<O> = Command<any, any, any, O, any>;

export interface Client {
  send(command: ReadCommand<any>): Promise<any>;
}

export type Comparison =
  /** deep equality; scalars compared as strings (CloudFormation passes most values as strings) */
  | 'equals'
  /** every expected object key / list element is present in the actual value */
  | 'subset'
  /** both sides are JSON documents (strings are parsed, also URL-encoded or backslash-escaped); compared as policies */
  | 'json';

export interface Check<O> {
  /** The read call; for properties read with a client other than the handler's */
  readonly client?: new (config: { region: string }) => Client;
  readonly call: (ctx: Context) => ReadCommand<O>;
  /** The value to compare, from the response */
  readonly actual: (response: O, ctx: Context) => unknown | Promise<unknown>;
  /** Convert the template's value to the API's representation (default: as is) */
  readonly expected?: (templateValue: any, ctx: Context) => unknown | Promise<unknown>;
  /** @default 'equals' */
  readonly compare?: Comparison;
  /** Why this check is written the way it is, if not obvious */
  readonly note?: string;
}

export interface Handler {
  /** CloudFormation resource type, e.g. AWS::S3::Bucket */
  readonly type: string;
  readonly client: new (config: { region: string }) => Client;
  /** A call that succeeds if and only if the resource exists */
  readonly exists: (ctx: Context) => ReadCommand<any>;
  /** Checks, by property path in the template (e.g. `VersioningConfiguration.Status`, or `Tags`) */
  readonly properties: { [path: string]: Check<any> };
  /** Top-level properties that can't be checked, with the reason (e.g. write-only) */
  readonly skip?: { [property: string]: string };
}

/** Identity functions, so handler files get type inference */
export function handler(h: Handler): Handler {
  return h;
}

export function check<O>(c: Check<O>): Check<O> {
  return c;
}
