import { HistoryEntry } from "../types.js";

export class History {
    entries: HistoryEntry[] = []

    constructor() {

    }

    getCompressed() {
        const compressedEntries: string[] = []

        for (const entry of this.entries) {
            if (entry.type == 'UserMessage') compressedEntries.push(`[${entry.type}] ${entry.content}`)
            if (entry.type == 'ToolCommand') compressedEntries.push(`[${entry.type}] ${entry.function}(${JSON.stringify(this.compressParams(entry.parameters))}) | ${entry.reasoning}`)
            if (entry.type == 'ToolOutput') compressedEntries.push(`[${entry.type}] ${entry.returnValue}`)
            if (entry.type == 'ToolError') compressedEntries.push(`[${entry.type}] ${entry.errorMessage}`)
        }

        return compressedEntries.join('\n')
    }

    add(entry: HistoryEntry) {
        this.entries.push(entry)
    }

    private compressParams(params: Record<string, any>): Record<string, any> {
        const compressed: Record<string, any> = {};
        for (const [key, val] of Object.entries(params)) {
            compressed[key] = typeof val === 'string' && val.length > 30
                ? `${val.slice(0, 30)}... [TRUNCATED ${val.length - 30} chars]`
                : val;
        }
        return compressed;
    }
}