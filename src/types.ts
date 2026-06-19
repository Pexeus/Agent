import { GenerateTextResult } from 'ai';
import { z } from 'zod';

export interface Workspace { [key: string]: any }

export interface ToolCommand {
    type: 'ToolCommand'
    function: string
    parameters: Record<string, string>
    reasoning: string
}

export interface UserMessage {
    type: 'UserMessage'
    content: string
}

export interface ToolOutput {
    type: 'ToolOutput'
    returnValue: string
}

export interface ToolError {
    type: 'ToolError'
    errorMessage: string
}

export interface AgentOptions {
    logging: boolean
}

export type HistoryEntry =
    ToolCommand |
    UserMessage |
    ToolOutput |
    ToolError

export interface State {
    system: string
    role: string
    tools: Record<string, string>
    functions: Record<string, any>
    workspace: Workspace
    history: HistoryEntry[]
}

export type StepResult =
    StepContinue |
    StepBlock

export interface StepContinue {
    status: 'continue'
}

export interface StepBlock {
    status: 'block'
    output: string
}

export interface ToolFunction<T extends z.ZodTypeAny> {
    blocking: boolean
    description: string;
    parameters: T;
    execute: (args: z.infer<T>) => Promise<string>;
}

export type ToolCalls = GenerateTextResult<
    Record<string, any>,
    any
>["staticToolCalls"];


export class ExitSignal {
    constructor(public readonly message: string) { }
}