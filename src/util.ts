import { readFileSync } from "node:fs"
import { ToolFunction } from "./types.js"
import { tool as vercelTool } from 'ai';

export function getPromt(prompt: string) {
    try {
        let content = readFileSync(`./src/prompts/${prompt}.md`, 'utf-8')

        return content
    }
    catch (err) {
        throw new Error(`Failed to get Prompt ${prompt}: ${err}`)
    }
}

export function toVercelFunctionDefinition(tools: Record<string, ToolFunction<any>>) {
    const vercelTools: { [key: string]: any } = {}

    for (const [name, definition] of Object.entries(tools)) {
        let description = definition.description
        if (definition.blocking) description += ` | This is a Blocking tool call`

        vercelTools[name] = vercelTool({
            description: definition.description,
            inputSchema: definition.parameters
        });
    }

    return vercelTools
}