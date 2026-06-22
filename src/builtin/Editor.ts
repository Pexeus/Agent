import { ToolFunction } from "../types.js";
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import { FileSystem } from "./FileSystem.js";
import { Tool } from "../core/Tool.js";

export class Editor extends Tool {
    private fsTool: FileSystem;
    private openFiles: Record<string, string> = {};

    constructor(fsTool: FileSystem) {
        super("Editor", `
        This is your primary file editor. Features:
        - Line endings in the target texts are automatically normalized to match the file's style.
        - File Contents are always shown in the workspace.
        - File Contents include line numbers prepended
        `);
        this.fsTool = fsTool;
    }

    getState(): any {
        return this.openFiles;
    }

    // --- HELPER METHODS --- //

    private resolvePath(filePathParam: string) {
        // Casting to access properties that might be marked private in FileSystem.
        // It's recommended to make resolveSafePath and root public in FileSystem!
        const fsTool = this.fsTool as any;
        const absolutePath = fsTool.resolveSafePath(filePathParam);
        const relativePath = path.relative(fsTool.root, absolutePath);
        return { absolutePath, relativePath };
    }

    private getOpenFileInfo(filePathParam: string) {
        const { absolutePath, relativePath } = this.resolvePath(filePathParam);
        if (this.openFiles[relativePath] === undefined) {
            throw new Error(`File is not open. You must open it first using the 'open' command.`);
        }
        return { absolutePath, relativePath };
    }

    private matchLineEndings(text: string, targetContent: string): string {
        const isWindows = targetContent.includes("\r\n");
        const normalized = text.replaceAll("\r\n", "\n");
        return isWindows ? normalized.replaceAll("\n", "\r\n") : normalized;
    }

    private generateDiffPreview(text: string, prefix: "+" | "-"): string[] {
        const lines = text.replaceAll("\r\n", "\n").split("\n");
        const shown = lines.slice(0, 3).map(line =>
            `${prefix}${line.length > 120 ? line.slice(0, 120) + "..." : line}`
        );
        if (lines.length > shown.length) shown.push(`${prefix}...`);
        return shown;
    }

    private async saveAndUpdateState(absolutePath: string, relativePath: string, content: string): Promise<void> {
        const lines = content.split(/\r?\n/);
        const totalLines = content === "" ? 0 : lines.length;

        if (totalLines > 2000) {
            throw new Error(`File has ${totalLines} lines, which exceeds the 2000-line limit.`);
        }

        await fs.writeFile(absolutePath, content, 'utf-8');

        const formattedLines = content === "" ? [] : lines.map((line, idx) => `${idx + 1}: ${line}`);
        this.openFiles[relativePath] = formattedLines.join("\n");
    }

    // --- TOOL FUNCTIONS --- //

    getFunctions(): Record<string, ToolFunction<any>> {
        return {
            open: {
                description: `Open a File. Always shows the full file content. Files over 2000 lines cannot be opened.`,
                blocking: false,
                parameters: z.object({
                    path: z.string().describe('File Path relative to your current CWD')
                }),
                execute: async ({ path: filePathParam }) => {
                    const { absolutePath, relativePath } = this.resolvePath(filePathParam);

                    if (this.openFiles[relativePath] !== undefined) return "File is already open.";

                    if (Object.keys(this.openFiles).length >= 8) {
                        throw new Error("Maximum of 8 files can be open at once. Close all files that are not needed before opening a new one.");
                    }

                    let content: string;
                    try {
                        content = await fs.readFile(absolutePath, 'utf-8');
                    } catch (error: any) {
                        if (error.code === 'ENOENT') {
                            const parentDir = path.dirname(absolutePath);
                            try {
                                const parentStat = await fs.stat(parentDir);
                                if (!parentStat.isDirectory()) throw new Error();
                            } catch {
                                throw new Error(`Unable to create file: Target directory ${parentDir} does not exist.`);
                            }
                            content = ""; // Prepare to initialize empty file
                        } else {
                            throw new Error(`Unable to read file: ${error.message}`);
                        }
                    }

                    await this.saveAndUpdateState(absolutePath, relativePath, content);
                    return `Opened file ${relativePath}. Currently opened Files: ${Object.keys(this.openFiles).length}/8`;
                }
            },

            replace: {
                description: `Replace all exact occurrences of oldString with newString.`,
                blocking: false,
                parameters: z.object({
                    path: z.string().describe('Virtual path of the file'),
                    oldString: z.string().describe('Exact block of text to replace'),
                    newString: z.string().describe('Replacement text block')
                }),
                execute: async ({ path: filePathParam, oldString, newString }) => {
                    const { absolutePath, relativePath } = this.getOpenFileInfo(filePathParam);

                    if (oldString === newString) throw new Error("No changes to apply: oldString and newString are identical.");
                    if (!oldString) throw new Error("oldString must not be empty.");

                    const content = await fs.readFile(absolutePath, 'utf-8');
                    const normalizedOld = this.matchLineEndings(oldString, content);
                    const normalizedNew = this.matchLineEndings(newString, content);

                    if (!content.includes(normalizedOld)) {
                        throw new Error("Could not find oldString in the file. It must match exactly, including whitespace and indentation.");
                    }

                    const newContent = content.replaceAll(normalizedOld, normalizedNew);
                    await this.saveAndUpdateState(absolutePath, relativePath, newContent);

                    return [
                        "Replaced occurrences in file successfully.",
                        "```diff",
                        ...this.generateDiffPreview(oldString, "-"),
                        ...this.generateDiffPreview(newString, "+"),
                        "```"
                    ].join("\n");
                }
            },

            insert: {
                description: `Insert a block of text before or after a unique anchor string in the file.
                Line endings in both the anchor and the inserted text are automatically normalized to match the file's style.
                The anchor must be completely unique within the file to avoid ambiguous edits.
                If the file is completely empty, use an empty string as the anchor (anchor: "") to initialize the file with the text.`,
                blocking: false,
                parameters: z.object({
                    path: z.string().describe('Virtual path of the file'),
                    anchor: z.string().describe('Exact unique substring/block of code to locate the edit. Must be empty string ("") only if the file is empty.'),
                    position: z.enum(['before', 'after']).describe('Whether to insert the text before or after the anchor'),
                    text: z.string().describe('Text block to insert')
                }),
                execute: async ({ path: filePathParam, anchor, position, text }) => {
                    const { absolutePath, relativePath } = this.getOpenFileInfo(filePathParam);

                    if (!text) throw new Error("No text to insert: text is empty.");

                    const content = await fs.readFile(absolutePath, 'utf-8');
                    const normalizedText = this.matchLineEndings(text, content);
                    let newContent: string;

                    if (content === "") {
                        if (anchor !== "") throw new Error("The file is completely empty. To initialize this file with content, call 'insert' with an empty anchor (anchor: \"\").");
                        newContent = normalizedText;
                    } else {
                        if (anchor === "") throw new Error("Anchor must not be empty for non-empty files.");

                        const normalizedAnchor = this.matchLineEndings(anchor, content);
                        const occurrences = content.split(normalizedAnchor).length - 1;

                        if (occurrences === 0) throw new Error("Could not find anchor in the file. It must match exactly, including whitespace and indentation.");
                        if (occurrences > 1) throw new Error(`Anchor is not unique. Found ${occurrences} occurrences in the file. Please provide a more specific or longer anchor.`);

                        const index = content.indexOf(normalizedAnchor);
                        if (position === "after") {
                            const insertIndex = index + normalizedAnchor.length;
                            newContent = content.slice(0, insertIndex) + normalizedText + content.slice(insertIndex);
                        } else {
                            newContent = content.slice(0, index) + normalizedText + content.slice(index);
                        }
                    }

                    await this.saveAndUpdateState(absolutePath, relativePath, newContent);

                    return [
                        `Inserted text ${position} anchor successfully.`,
                        "```diff",
                        ...this.generateDiffPreview(text, "+"),
                        "```"
                    ].join("\n");
                }
            },

            delete: {
                description: `Delete everything between a unique start anchor and end anchor, inclusive. Both anchors must occur exactly once in the file.`,
                blocking: false,
                parameters: z.object({
                    path: z.string().describe('Virtual path of the file'),
                    startAnchor: z.string().describe('Exact unique start anchor'),
                    endAnchor: z.string().describe('Exact unique end anchor')
                }),
                execute: async ({ path: filePathParam, startAnchor, endAnchor }) => {
                    const { absolutePath, relativePath } = this.getOpenFileInfo(filePathParam);

                    if (!startAnchor || !endAnchor) throw new Error("Anchors must not be empty.");

                    const content = await fs.readFile(absolutePath, 'utf-8');

                    const normalizedStart = this.matchLineEndings(startAnchor, content);
                    const normalizedEnd = this.matchLineEndings(endAnchor, content);

                    const startOccurrences = content.split(normalizedStart).length - 1;
                    const endOccurrences = content.split(normalizedEnd).length - 1;

                    if (startOccurrences === 0) throw new Error("Start anchor not found.");
                    if (startOccurrences > 1) throw new Error(`Start anchor is not unique. Found ${startOccurrences} occurrences.`);
                    if (endOccurrences === 0) throw new Error("End anchor not found.");
                    if (endOccurrences > 1) throw new Error(`End anchor is not unique. Found ${endOccurrences} occurrences.`);

                    const startIndex = content.indexOf(normalizedStart);
                    const endIndex = content.indexOf(normalizedEnd);

                    if (endIndex < startIndex) throw new Error("End anchor occurs before start anchor.");

                    const deleteEndIndex = endIndex + normalizedEnd.length;
                    const deletedBlock = content.slice(startIndex, deleteEndIndex);
                    const newContent = content.slice(0, startIndex) + content.slice(deleteEndIndex);

                    await this.saveAndUpdateState(absolutePath, relativePath, newContent);

                    return [
                        "Deleted block between anchors successfully.",
                        "```diff",
                        ...this.generateDiffPreview(deletedBlock, "-"),
                        "```"
                    ].join("\n");
                }
            },

            close: {
                description: 'Close an opened file and free up Editor memory.',
                blocking: false,
                parameters: z.object({
                    path: z.string().describe('Virtual path of the file')
                }),
                execute: async ({ path: filePathParam }) => {
                    const { relativePath } = this.getOpenFileInfo(filePathParam);
                    delete this.openFiles[relativePath];
                    return "Closed file successfully.";
                }
            }
        };
    }
}