/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { createStackTraceForConsoleMessage, createStackTrace, } from '../DevtoolsUtils.js';
export class ConsoleFormatter {
    #msg;
    #resolvedArgs = [];
    #resolvedStackTrace;
    #id;
    constructor(msg, options) {
        this.#msg = msg;
        this.#id = options?.id;
        this.#resolvedStackTrace = options?.resolvedStackTraceForTesting;
    }
    static async from(msg, options) {
        const formatter = new ConsoleFormatter(msg, options);
        if (options?.fetchDetailedData) {
            await formatter.#loadDetailedData(options?.devTools);
        }
        return formatter;
    }
    #isConsoleMessage(msg) {
        // No `instanceof` as tests mock `ConsoleMessage`.
        return 'args' in msg && typeof msg.args === 'function';
    }
    async #loadDetailedData(devTools) {
        if (this.#msg instanceof Error) {
            return;
        }
        if (this.#isConsoleMessage(this.#msg)) {
            this.#resolvedArgs = await Promise.all(this.#msg.args().map(async (arg, i) => {
                try {
                    return await arg.jsonValue();
                }
                catch {
                    return `<error: Argument ${i} is no longer available>`;
                }
            }));
        }
        if (devTools) {
            try {
                if (this.#isConsoleMessage(this.#msg)) {
                    this.#resolvedStackTrace = await createStackTraceForConsoleMessage(devTools, this.#msg);
                }
                else if (this.#msg.stackTrace) {
                    this.#resolvedStackTrace = await createStackTrace(devTools, this.#msg.stackTrace, this.#msg.targetId);
                }
            }
            catch {
                // ignore
            }
        }
    }
    // The short format for a console message.
    toString() {
        const type = this.#getType();
        const text = this.#getText();
        const argsCount = this.#getArgsCount();
        const idPart = this.#id !== undefined ? `msgid=${this.#id} ` : '';
        return `${idPart}[${type}] ${text} (${argsCount} args)`;
    }
    // The verbose format for a console message, including all details.
    toStringDetailed() {
        const result = [
            this.#id !== undefined ? `ID: ${this.#id}` : '',
            `Message: ${this.#getType()}> ${this.#getText()}`,
            this.#formatArgs(),
            this.#formatStackTrace(this.#resolvedStackTrace),
        ].filter(line => !!line);
        return result.join('\n');
    }
    #getType() {
        if (!this.#isConsoleMessage(this.#msg)) {
            return 'error';
        }
        return this.#msg.type();
    }
    #getText() {
        if (!this.#isConsoleMessage(this.#msg)) {
            return this.#msg.message;
        }
        return this.#msg.text();
    }
    #getArgs() {
        if (!this.#isConsoleMessage(this.#msg)) {
            return [];
        }
        if (this.#resolvedArgs.length > 0) {
            const args = [...this.#resolvedArgs];
            // If there is no text, the first argument serves as text (see formatMessage).
            if (!this.#msg.text()) {
                args.shift();
            }
            return args;
        }
        return [];
    }
    #getArgsCount() {
        if (!this.#isConsoleMessage(this.#msg)) {
            return 0;
        }
        return this.#resolvedArgs.length || this.#msg.args().length;
    }
    #formatArg(arg) {
        return typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
    }
    #formatArgs() {
        const args = this.#getArgs();
        if (!args.length) {
            return '';
        }
        const result = ['### Arguments'];
        for (const [key, arg] of args.entries()) {
            result.push(`Arg #${key}: ${this.#formatArg(arg)}`);
        }
        return result.join('\n');
    }
    #formatStackTrace(stackTrace) {
        if (!stackTrace) {
            return '';
        }
        return [
            '### Stack trace',
            this.#formatFragment(stackTrace.syncFragment),
            ...stackTrace.asyncFragments.map(this.#formatAsyncFragment.bind(this)),
            'Note: line and column numbers use 1-based indexing',
        ].join('\n');
    }
    #formatFragment(fragment) {
        return fragment.frames.map(this.#formatFrame.bind(this)).join('\n');
    }
    #formatAsyncFragment(fragment) {
        const separatorLineLength = 40;
        const prefix = `--- ${fragment.description || 'async'} `;
        const separator = prefix + '-'.repeat(separatorLineLength - prefix.length);
        return separator + '\n' + this.#formatFragment(fragment);
    }
    #formatFrame(frame) {
        let result = `at ${frame.name ?? '<anonymous>'}`;
        if (frame.uiSourceCode) {
            const location = frame.uiSourceCode.uiLocation(frame.line, frame.column);
            result += ` (${location.linkText(/* skipTrim */ false, /* showColumnNumber */ true)})`;
        }
        else if (frame.url) {
            result += ` (${frame.url}:${frame.line}:${frame.column})`;
        }
        return result;
    }
    toJSON() {
        return {
            type: this.#getType(),
            text: this.#getText(),
            argsCount: this.#getArgsCount(),
            id: this.#id,
        };
    }
    toJSONDetailed() {
        return {
            id: this.#id,
            type: this.#getType(),
            text: this.#getText(),
            args: this.#getArgs().map(arg => typeof arg === 'object' ? arg : String(arg)),
            stackTrace: this.#resolvedStackTrace,
        };
    }
}
