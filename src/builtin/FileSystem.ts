import { Tool } from "../core/Tool.js";
import fs from "fs";
import { ToolFunction } from "../types.js";
import z from "zod";
import path from "path";
import { promisify } from "util";
import { execFile } from "child_process";

const execFileAsync = promisify(execFile);

export class FileSystem extends Tool {
    private readonly root: string;
    private cwd: string;

    constructor(virtualRoot: string) {
        super("FileSystem", "File System Access (Explorer)");
        this.root = path.resolve(virtualRoot);
        this.cwd = "/";
    }

    private resolveSafePath(targetPath: string): string {
        const virtualPath = path.resolve(this.cwd, targetPath);

        const realPath = path.resolve(
            this.root,
            virtualPath.replace(/^\//, "")
        );

        if (!realPath.startsWith(this.root)) {
            throw new Error("Permission denied");
        }

        return realPath;
    }

    private list(realPath: string) {
        const entries = fs.readdirSync(realPath, { withFileTypes: true });

        return entries.map(e => ({
            name: e.name,
            type: e.isDirectory() ? "dir" : "file"
        }));
    }

    async getState() {
        return {
            cwd: this.cwd,
            contents: this.list(this.resolveSafePath("."))
        };
    }

    getFunctions(): Record<string, ToolFunction<any>> {
        return {
            cd: {
                description: "change directory",
                blocking: false,
                parameters: z.object({
                    targetPath: z.string()
                }),
                execute: async ({ targetPath }) => {
                    const realPath = this.resolveSafePath(targetPath);

                    const stat = fs.statSync(realPath);
                    if (!stat.isDirectory()) {
                        throw new Error("Not a directory");
                    }

                    this.cwd = path.resolve(this.cwd, targetPath);

                    return `changed directory to ${this.cwd}`;
                }
            },
            ls: {
                description: "list directory => only use this for directories outside your current cwd, as cwd is already listed.",
                blocking: false,
                parameters: z.object({
                    dirPath: z.string().optional().default(".")
                }),
                execute: async ({ dirPath }) => {
                    const realPath = this.resolveSafePath(dirPath);

                    const stat = fs.statSync(realPath);
                    if (!stat.isDirectory()) {
                        throw new Error("Not a directory");
                    }

                    return JSON.stringify(this.list(realPath));
                }
            },

            mkdir: {
                description: "create directory",
                blocking: false,
                parameters: z.object({
                    dirPath: z.string()
                }),
                execute: async ({ dirPath }) => {
                    const realPath = this.resolveSafePath(dirPath);

                    fs.mkdirSync(realPath, { recursive: false });

                    return `created directory ${dirPath}`;
                }
            },
            search: {
                description: 'Search for a string in files under the current directory.',
                blocking: false,
                parameters: z.object({
                    query: z.string()
                }),
                execute: async ({ query }) => {
                    try {
                        const searchRoot = this.resolveSafePath(".");

                        const { stdout } = await execFileAsync("rg", [
                            "-l",
                            "-F",
                            query,
                            searchRoot
                        ]);

                        if (!stdout.trim()) {
                            return "No matches found.";
                        }

                        const results = stdout
                            .trim()
                            .split("\n")
                            .map((realPath: string) => {
                                const relative = path.relative(this.root, realPath);
                                return `${relative.replaceAll("\\", "/")}\n`;
                            })
                            .join("\n");

                        return `Matched Files for Query: ${query}: ${results}`
                    }
                    catch (err: any) {
                        if (err.code == 1) return 'No matches found'

                        throw new Error(`Search Failed: ${err}`)
                    }
                }
            },
        };
    }
}