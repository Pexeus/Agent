import z from "zod";
import { Tool } from "./Tool.js";
import { tool as vercelTool } from 'ai';
import { ToolFunction } from "../types.js";

export class Workspace {
    tools: Record<string, Tool> = {}
    functions: Record<string, Function> = {}

    constructor(tools: Tool[]) {
        for (const tool of tools) {
            if (this.tools[tool.name]) throw 'duplicate tool name'
            this.tools[tool.name] = tool

            for (const [name, func] of Object.entries(tool.getFunctions())) {
                this.functions[`${tool.name}.${name}`] = func.execute
            }
        }
    }

    getToolDefinitions() {
        let definitions = ''

        for (const tool of Object.values(this.tools)) {
            definitions += `## ${tool.name}\n${tool.description}`
        }

        return definitions
    }

    getFunctionDefinitions(permitted: string[]) {
        const tools: Record<string, ToolFunction<any>> = {};

        for (const tool of Object.values(this.tools)) {
            const functions = tool.getFunctions()

            for (const [functionName, definition] of Object.entries(functions)) {
                if (!permitted.includes(`${tool.name}.*`)) {
                    if (!permitted.includes(`${tool.name}.${functionName}`)) continue
                }

                //add always included reasoning parameter
                definition.parameters = definition.parameters.extend({
                    reasoning: z.string().describe('Short, concise reasoning behind this tool call')
                });

                tools[`${tool.name}.${functionName}`] = definition
            }
        }

        return tools
    }

    getState() {
        const state: Record<string, string> = {}

        for (const name of Object.keys(this.tools)) {
            const toolState = this.tools[name].getState()
            if (toolState) state[name] = this.tools[name].getState()
        }

        return state
    }
}