import { generateText } from "ai";
import { AgentOptions, ExitSignal, HistoryEntry, ToolCalls, ToolFunction } from "../types.js";
import { toVercelFunctionDefinition, getPromt } from "../util.js";
import { Workspace } from "./Workspace.js";
import { google } from "@ai-sdk/google";
import chalk from "chalk";
import { History } from "./History.js";
import z from "zod";
import { writeFileSync } from "node:fs";
import path from "node:path";

export class Agent {
    private workspace: Workspace;
    private role: string;
    private history: History = new History()
    private options: AgentOptions
    private loadedFunctions: Record<string, ToolFunction<any>>;
    private systemPrompt: string

    constructor(role: string, workspace: Workspace, permittedFunctions: string[], options: AgentOptions = { logging: false }) {
        this.role = role
        this.workspace = workspace
        this.options = options

        this.systemPrompt = this.getSystemPrompt()
        this.loadedFunctions = workspace.getFunctionDefinitions(permittedFunctions)

        //maybe find a better way to do this
        this.loadedFunctions.exit = {
            blocking: true,
            description: 'Use this to exit operations with a message',
            parameters: z.object({
                returnMessage: z.string()
            }),
            execute: async () => { return 'exited operations' }
        }
    }

    async invoke(instructions: string) {
        this.history.add({
            type: 'Instruction',
            instruction: instructions
        })

        //temp
        try {
            while (true) {
                await this.step()
            }
        }
        catch (err) {
            if (err instanceof ExitSignal) return err.message
            throw err
        }
    }

    async step() {
        const state = {
            workspace: this.workspace.getState(),
            history: this.history.getCompressed()
        }

        console.log(path.resolve("./"))

        writeFileSync('./state/history.md', state.history)
        writeFileSync('./state/workspace.json', JSON.stringify(state.workspace, null, 2))

        const result = await generateText({
            system: this.systemPrompt,
            model: google('gemini-3.5-flash'),
            tools: toVercelFunctionDefinition(this.loadedFunctions),
            providerOptions: {
                google: {
                    thinkingConfig: {
                        thinkingLevel: 'medium',
                        includeThoughts: true,
                    },
                },
            },
            prompt: JSON.stringify(state)
        })

        console.log(chalk.gray(result.reasoningText));
        await this.handleToolCalls(result.staticToolCalls)
    }

    private async handleToolCalls(toolCalls: ToolCalls) {
        let exitSignal = false
        let exitMessage

        for (const command of toolCalls) {
            const { reasoning, ...functionParams } = command.input as any;

            this.history.add({
                type: 'ToolCommand',
                function: command.toolName,
                parameters: functionParams,
                reasoning: reasoning
            })

            console.log(chalk.whiteBright(command.toolName) + " | " + chalk.gray(reasoning))

            if (this.loadedFunctions[command.toolName].blocking) exitSignal = true
            if (command.toolName == 'exit') {
                exitMessage = functionParams.returnMessage
                continue
            }

            try {
                const result = await this.loadedFunctions[command.toolName].execute(functionParams)
                if (exitSignal) exitMessage = result

                this.history.add({
                    type: 'ToolOutput',
                    returnValue: result
                })
            }
            catch (err: any) {
                console.log(chalk.red(err));

                this.history.add({
                    type: 'ToolOutput',
                    returnValue: err.message
                })
            }
        }

        if (exitSignal) throw new ExitSignal(exitMessage)
    }

    private getSystemPrompt() {
        const base = getPromt('system')
        const toolDefinitions = this.workspace.getToolDefinitions()

        return `
        ${base}

        # Role
        ${this.role}

        # Tools
        ${toolDefinitions}
        `
    }
}