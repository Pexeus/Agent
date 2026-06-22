> **Important Disclaimer: This is WIP**

# The Idea
I wanted to create an agent system where the agent’s environment and its internal state are not part of the same thing, but instead two separate components that can be plugged in and out. I did this by splitting the context window into two separate parts:

**Workspace:** This represents the agent’s environment it is interacting with. It can contain any kind of data provided by loaded tools: a currently opened file, the current working directory, an open email, or even a webpage. The workspace is re-rendered on each turn and has per-tool separation.

**History:** This resembles the classical ReAct loop agent history. It contains reasoning steps, tool calls, tool call outputs, as well as interactions with the user (or system above). The important part is: tools do not output their data here. The history only represents the agent’s past actions and current state. All data lives in the workspace section.

In doing this, I tried to solve two issues:

- Context bloat from large tool outputs. If a file is edited, I don’t have to dump it into the history again; it is simply updated in the workspace.  
- Allowing both simple and more complex use cases. With the pluggable workspace, multiple agents can interact with it, each with their own tools and objectives. This enables a pipeline where each agent does its job and then hands off the workspace.

### Context Separation Example
If the LLM outputs a tool call to open a file, a notification confirming the action is appended to the history.


```
[Tool Call] Editor.open(file.txt)
[Editor Output] file.txt opened
```

The Workspace is also updated to now provide the requested access. It will be available on the agent's next turn.
So on the next turn the agent will see the view below.

```
{
    workspace: {
        Editor: {
            file.txt: <file contents>
        }
    }
    history: {
        [Tool Call] Editor.open(file.txt)
        [Editor Output] file.txt opened
    }
}
```

# Using the Library
The Library exports 3 classes that together allow working with the library, as well as 3 built-in tools that can be used.

**Tool (Abstract Class):** Tiny abstract class that provides a base to build any tool upon. <br>
**Workspace:** A collection of tools and their states. <br>
**Agent:** LLM wrapper that takes a role description, Workspace and tool permissions. Can then be activated using agent.invoke().

## Minimal Example
```ts
const fsTool = new FileSystem('./playground')
const workspace = new Workspace([fsTool])

const agent = new Agent('Development Agent', workspace, ['FileSystem.*'], { logging: true })
const result = await agent.invoke(`create a test file test.txt, then exit`)
```

## Built-in Tools
Currently there are 3 built-in tools provided by the Library:

```ts
const fsTool = new FileSystem('./playground') // Simple stateful File System interaction
const editor = new Editor(fsTool) // Editor allowing the agent to view and modify up to 8 concurrent files.
const knowledgeBase = new KnowledgeBase() // Simple key-value storage to store facts and information accross agent instances
```

## Permissions
Agents always have read access to the provided workspace data of a tool.
Tool function access can be controlled via the permissions array loaded on instantiation.

`<Tool>.*` Always grants access to all functions provided by a tool. <br>
`<Tool>.<Function Name>` Allows granular access to specified tool functions.

Functions the agent lacks permission for are simply not loaded into its tool call context.
If the agent hallucinates a call to one anyway, it receives an error.

## Sharing The Workspace Across Agents
This is where you can create a workflow that fits your use case.
You can control each agent's tasks via the system prompt and tool permissions,
enforcing a structured workflow.

Below is a heavily simplified example showing how you can make use of this to separate the planning and execution phase of a more complex task.
```ts
const fsTool = new FileSystem('/path/to/codebase')
const editor = new Editor(fsTool)
const ToDo = new ToDo()

const workspace = new Workspace([fsTool, editor, ToDo])

//planner with read-only access, and ToDo-creation access
const planner = new Agent('Create a detailed implementation plan based on the users request. Add ToDos for each milestone. Return the plan in your final output.', workspace, ['FileSystem.*', "Editor.open", "Editor.close", "ToDo.create"], { logging: true }) 

// coder with write access to the codebase and ToDo-completion access
const coder = new Agent('Execute on the given implementation plan. Track progress via the ToDos', workspace, ['FileSystem.*', "Editor.*", "ToDo.complete"], { logging: true })

//create the implementation plan and define the ToDos (Agent.invoke always returns a string the agent can output when exiting)
const implementationPlan = await planner.invoke("Modify the /sales route to take a timestamp based time range.") // example

//execute on the plan
await coder.invoke(implementationPlan)
```

This can be as simple or as complex as you need it to be.

## Creating Tools
The Tool abstract class allows for pretty much any imaginable tool implementation.
You can access external APIs, interact with the host computer or even spin up an agent here.

**getFunctions** returns an array of functions this tool provides. They will be passed to the agent via the
standard tool calling API. Thrown errors will be noted in the agent's history. The agent will always recieve the functions 
name-spaced by the Tools they belong to. So the `add` function in the example below will be given to the Agent as `ToDoList.add`

**getState** is called on each turn. Its return value will be appended to the Workspace under this tool's name.

Below is a minimal example of a To-Do List. If added to the workspace, the agent can read and modify the ToDos based on the given permissions.

``` ts
export class ToDoList extends Tool {
    private items: ToDoItem[] = [];
    private nextId = 1;

    constructor() {
        super("ToDoList","Simple To-Do List");
    }

    async getState(): ToDoItem[] {
        return this.items;
    }

    getFunctions(): Record<string, ToolFunction<any>> {
        return {
            add: {
                description: "Add a new ToDo item to the list.", // function description passed to the agent
                blocking: false, // specifiying "true" here will break the agents reAct loop and return the invoke() promise
                parameters: z.object({ 
                    text: z.string().describe("The ToDo item text"), // use zed to specify params
                }),
                execute: async ({ text }) => {
                    const item: ToDoItem = { id: this.nextId++, text, status: "pending" };
                    this.items.push(item);
                    return `Added item #${item.id}: "${text}"`;
                },
            },
            complete: {
                // mark as complete
            },
            remove: {
                // remove
            },
        };
    }
}
```

# What's Still Missing
- I want to add some kind of customizable middleware to allow operations between turns, such as history compression, self-reflection, etc.  
- Currently, logging and access to the agent’s internal state are very incomplete. I’m planning to add an event-based system for this.  
- Support for any model provider compatible with the Vercel SDK, not just Google.