/* eslint-disable n8n-nodes-base/node-dirname-against-convention */
import {
	type IExecuteFunctions,
	type ILoadOptionsFunctions,
	type INodeExecutionData,
	type INodeType,
	type INodeTypeDescription,
} from 'n8n-workflow';
import set from 'lodash/set';

import { JavaScriptSandbox } from '../Code/JavaScriptSandbox';
import { getSandboxContext } from '../Code/Sandbox';
import { standardizeOutput } from '../Code/utils';

const { CODE_ENABLE_STDOUT } = process.env;

export class AiTransform implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'AI Transform',
		name: 'aiTransform',
		icon: 'file:sparkles.svg',
		group: ['transform'],
		version: 1,
		description: 'Modify data by writing a prompt',
		defaults: {
			name: 'AI Transform',
		},
		inputs: ['main'],
		outputs: ['main'],
		parameterPane: 'wide',
		properties: [
			// {
			// 	displayName: 'Instructions',
			// 	name: 'instructions',
			// 	type: 'string',
			// 	noDataExpression: true,
			// 	default: '',
			// 	placeholder: 'Describe how you want to transform your data and click Generate',
			// 	typeOptions: {
			// 		rows: 5,
			// 	},
			// },
			{
				displayName: 'Instructions',
				name: 'generate',
				type: 'button',
				default: '',
				placeholder: 'Describe how you want to transform your data and click Generate',
				typeOptions: {
					buttonLabel: 'Generate Code',
					buttonHasInputField: true,
					buttonInputFieldMaxLength: 500,
					action: {
						type: 'updateProperty',
						handler: 'generateCodeUsingAiService',
						target: 'jsCode',
					},
				},
			},
			// {
			// 	displayName: 'Code',
			// 	name: 'jsCode',
			// 	type: 'string',
			// 	default: '',
			// 	hint: 'To edit this code, adjust the prompt. Or copy and paste into a code node',
			// 	typeOptions: {
			// 		rows: 5,
			// 	},
			// },
			{
				displayName: 'Code',
				name: 'jsCode',
				type: 'string',
				typeOptions: {
					editor: 'codeNodeEditor',
					editorLanguage: 'javaScript',
					// editor: 'jsEditor',
					editorIsReadOnly: true,
				},
				default: '',
				noDataExpression: true,
				hint: 'To edit this code, adjust the prompt. Or copy and paste into a code node',
			},
		],
	};

	methods = {
		actionHandler: {
			async generateCodeUsingAiService(
				this: ILoadOptionsFunctions,
				payload: string,
				inputData: INodeExecutionData[],
			) {
				const { output } = (await this.helpers.httpRequest({
					method: 'POST',
					url: 'http://localhost:5678/webhook/ai-service',
					headers: {
						'Content-Type': 'application/json',
					},
					body: {
						prompt: payload,
						input: inputData,
					},
				})) as {
					output: string;
				};

				return output;
			},
		},
	};

	async execute(this: IExecuteFunctions) {
		const workflowMode = this.getMode();

		const node = this.getNode();

		const codeParameterName = 'jsCode';

		const getSandbox = (index = 0) => {
			const code = this.getNodeParameter(codeParameterName, index) as string;
			const context = getSandboxContext.call(this, index);

			context.items = context.$input.all();

			const Sandbox = JavaScriptSandbox;
			const sandbox = new Sandbox(context, code, index, this.helpers);
			sandbox.on(
				'output',
				workflowMode === 'manual'
					? this.sendMessageToUI
					: CODE_ENABLE_STDOUT === 'true'
						? (...args) =>
								console.log(`[Workflow "${this.getWorkflow().id}"][Node "${node.name}"]`, ...args)
						: () => {},
			);
			return sandbox;
		};

		const sandbox = getSandbox();
		let items: INodeExecutionData[];
		try {
			items = (await sandbox.runCodeAllItems()) as INodeExecutionData[];
		} catch (error) {
			if (!this.continueOnFail(error)) {
				set(error, 'node', node);
				throw error;
			}
			items = [{ json: { error: error.message } }];
		}

		for (const item of items) {
			standardizeOutput(item.json);
		}

		return [items];
	}
}
