import { generateText } from "ai";
import { AgentOptions, ExitSignal, HistoryEntry, StepResult, ToolCalls, ToolFunction } from "../types.js";
import { toVercelFunctionDefinition, getPromt } from "../util.js";
import { Workspace } from "./Workspace.js";
import { google } from "@ai-sdk/google";
import chalk from "chalk";
import { History } from "./History.js";
import z from "zod";
import { writeFileSync } from "node:fs";

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

        //TODO find a better way to do this
        this.loadedFunctions.exit = {
            blocking: true,
            description: 'Use this to exit operations with a message',
            parameters: z.object({
                returnMessage: z.string(),
                reasoning: z.string().describe('Short, concise reasoning behind this tool call')
            }),
            execute: async () => { return 'exited operations' }
        }
    }

    async invoke(message: string) {
        this.history.add({
            type: 'UserMessage',
            content: message
        })

        while (true) {
            const stepResult = await this.step()

            if (stepResult.status == 'block') {
                return stepResult.output
            }
        }
    }

    async step(): Promise<StepResult> {
        const state = {
            workspace: await this.workspace.getState(),
            history: this.history.getCompressed(),
        }

        writeFileSync('/home/liam/code/agentV3/state/history.md', state.history)
        writeFileSync('/home/liam/code/agentV3/state/workspace.json', JSON.stringify(state.workspace, null, 2))

        const result = await generateText({
            system: this.systemPrompt,
            model: google('gemini-3.5-flash'),
            tools: toVercelFunctionDefinition(this.loadedFunctions),
            providerOptions: {
                google: {
                    thinkingConfig: {
                        thinkingLevel: 'minimal',
                        includeThoughts: true,
                    },
                },
            },
            prompt: JSON.stringify(state)
        })

        if (result.reasoningText != undefined) {
            this.log(chalk.gray(result.reasoningText));
        }

        if (result.text != '') {
            this.history.add({ type: 'Reasoning', content: result.text })
            console.log(chalk.bold(result.text) + '\n\n');
        }

        //execute tool calls
        await this.executeToolCalls(result.staticToolCalls)

        //return step result
        return this.getStepStatusResult(result.staticToolCalls)
    }

    private async getStepStatusResult(toolCalls: ToolCalls): Promise<StepResult> {
        for (const command of toolCalls) {
            const { reasoning, ...functionParams } = command.input as any;

            if (command.toolName == 'exit') {
                return {
                    status: 'block',
                    output: functionParams.returnMessage
                }
            }

            if (this.loadedFunctions[command.toolName].blocking) {
                return {
                    status: 'block',
                    output: `Blocking Tool ${command.toolName} called`
                }
            }
        }

        return {
            status: 'continue'
        }
    }

    private async executeToolCalls(toolCalls: ToolCalls) {
        for (const command of toolCalls) {
            const { reasoning, ...functionParams } = command.input as any;

            this.history.add({
                type: 'ToolCommand',
                function: command.toolName,
                parameters: functionParams,
                reasoning: reasoning
            })

            this.log(chalk.whiteBright(command.toolName) + " | " + chalk.gray(reasoning))

            try {
                const result = await this.loadedFunctions[command.toolName].execute(functionParams)
                this.history.add({
                    type: 'ToolOutput',
                    returnValue: result
                })
            }
            catch (err: any) {
                this.log(chalk.red(err));

                this.history.add({
                    type: 'ToolOutput',
                    returnValue: err.message
                })
            }
        }
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

    private log(message: string) {
        if (this.options.logging) console.log(message)
    }
}