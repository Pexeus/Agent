import z from "zod";
import { Tool } from "../core/Tool.js";
import { ToolFunction } from "../types.js";

export class User extends Tool {
    constructor() {
        super('User', 'Interact with the user')
    }

    getState() {
        //has no workspace contents
    }

    getFunctions(): Record<string, ToolFunction<any>> {
        return {
            message: {
                blocking: true,
                description: 'Send a message to the user, and pause operations',
                parameters: z.object({
                    message: z.string().describe('message to user')
                }),
                execute: async ({ message }) => {
                    return message
                }
            }
        }
    }
}