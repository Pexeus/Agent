import { ToolFunction } from "../types.js";
import { z } from "zod";
import { Tool } from "../core/Tool.js";

const MAX_VALUE_LENGTH = 300;

export class KnowledgeBase extends Tool {
    private entries: Record<string, string> = {};

    constructor() {
        super("KnowledgeBase", `
        A persistent key/value store for distilled information you want to retain across actions.

        Rules:
        - Values must be dense and concise. No raw dumps, no copy-pasted content. Max ${MAX_VALUE_LENGTH} chars per entry.
        - Synthesize only what matters: names, IDs, URLs, statuses, decisions, constraints.
        - Use this BEFORE closing any resource (file, page, email, etc.) if it contains anything you may need later.
        - Prefer updating an existing entry over creating redundant ones.
        - Delete entries that are no longer relevant.
        - do NOT use this for task tracking/planning etc. this is simply a store for information
        `);
    }

    getState(): any {
        return this.entries;
    }

    getFunctions(): Record<string, ToolFunction<any>> {
        return {
            set: {
                description: `Create or overwrite an entry. Value must be a concise, information-dense summary (max ${MAX_VALUE_LENGTH} chars). Never dump raw content.`,
                blocking: false,
                parameters: z.object({
                    key: z.string().describe("Namespaced key, e.g. 'resource/property'"),
                    value: z.string().max(MAX_VALUE_LENGTH).describe("Dense summary of the information to retain"),
                }),
                execute: async ({ key, value }) => {
                    const existed = key in this.entries;
                    this.entries[key] = value;
                    return existed ? `Updated "${key}".` : `Stored "${key}".`;
                },
            },
            delete: {
                description: "Remove an entry that is no longer relevant.",
                blocking: false,
                parameters: z.object({
                    key: z.string(),
                }),
                execute: async ({ key }) => {
                    if (!(key in this.entries)) throw new Error(`Key "${key}" not found.`);
                    delete this.entries[key];
                    return `Deleted "${key}".`;
                },
            }
        };
    }
}