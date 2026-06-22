import { ToolFunction } from "../types.js"

export abstract class Tool {
    name: string
    description: string

    constructor(name: string, description: string) {
        this.name = name
        this.description = description
    }

    abstract getState(): Promise<any>
    abstract getFunctions(): Record<string, ToolFunction<any>>;
}