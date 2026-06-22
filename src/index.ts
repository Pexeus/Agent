import { Editor } from "./builtin/Editor.js";
import { FileSystem } from "./builtin/FileSystem.js";
import { Agent } from "./core/Agent.js";
import { Workspace } from "./core/Workspace.js";
import { Tool } from "./core/Tool.js";
import { KnowledgeBase } from "./builtin/KnowledgeBase.js";
import dotenv from "dotenv"
dotenv.config()

async function debug() {
    const fsTool = new FileSystem('/home/liam/Documents/agentPlayground/Steamer/manager/client/')
    const editor = new Editor(fsTool)

    const workspace = new Workspace([fsTool, editor])

    const agent = new Agent('early stage development agent', workspace, ['FileSystem.*', 'Editor.*', 'User.*'])

    const result = await agent.invoke(`this is a test. send a message to the user`)

    console.log(result);

    const res2 = await agent.invoke('i got your message back! can you now see this 2nd message of mine? send me back a confirmation')

    console.log(res2);
}

export {
    Agent,
    Tool,
    Editor,
    FileSystem,
    Workspace,
    KnowledgeBase
}

export type * from "./types.js";