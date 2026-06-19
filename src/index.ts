import { Editor } from "./builtin/Editor.js";
import { FileSystem } from "./builtin/FileSystem.js";
import { User } from "./builtin/User.js";
import { Agent } from "./core/Agent.js";
import { Workspace } from "./core/Workspace.js";
import dotenv from "dotenv"
dotenv.config()

const fsTool = new FileSystem('/home/liam/Documents/agentPlayground/Steamer/manager/client/')
const editor = new Editor(fsTool)
const user = new User()

const workspace = new Workspace([fsTool, editor, user])
const agent = new Agent('early stage development agent', workspace, ['FileSystem.*', 'Editor.*', 'User.*'])

const result = await agent.invoke(`
this is a test. send a message to the user
`)


console.log(result);
