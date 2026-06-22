import { Editor } from "./builtin/Editor.js";
import { FileSystem } from "./builtin/FileSystem.js";
import { Agent } from "./core/Agent.js";
import { Workspace } from "./core/Workspace.js";
import { Tool } from "./core/Tool.js";
import { KnowledgeBase } from "./builtin/KnowledgeBase.js";
import dotenv from "dotenv"
dotenv.config()

async function example() {
    const fsTool = new FileSystem('./playground')
    const editor = new Editor(fsTool)
    const workspace = new Workspace([fsTool, editor])
    const knowledgeBase = new KnowledgeBase()

    const agent = new Agent('Development Agent', workspace, ['FileSystem.*', 'Editor.*'], { logging: true })
    const result = await agent.invoke(`topic.txt contains a poem topic. use it to write a small poem to poem.txt, then exit`)

    console.log(result);
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