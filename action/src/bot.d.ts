import { Probot } from 'probot';
import { ISignature } from "@multiversx/sdk-core";
export declare class NativeAuthSignature implements ISignature {
    private readonly signature;
    constructor(signature: string);
    hex(): string;
}
export declare const robot: (app: Probot) => void;
