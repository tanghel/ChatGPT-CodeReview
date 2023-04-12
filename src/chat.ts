import { ChatGPTAPI } from 'chatgpt';
export class Chat {
  private chatAPI: ChatGPTAPI;

  constructor(apikey: string) {
    this.chatAPI = new ChatGPTAPI({
      apiKey: apikey,
      completionParams: {
        model: process.env.MODEL || 'gpt-3.5-turbo',
        temperature: +(process.env.temperature || 0) || 1,
        top_p: +(process.env.top_p || 0) || 1,
      },
    });
  }

  private generatePrompt = (description: string, patch: string) => {
    return `
    Please review a pull request file with the following description:
    ${description}

    code:
    ${patch}

    If you find any changes that should be made to the source code, provide them in the format of a json array with the following attributes: startLine, endLine, description.
    `;
  };

  public codeReview = async (description: string, patch: string): Promise<{ startLine: number, endLine: number, description: string }[]> => {
    if (!patch) {
      return [];
    }

    console.time('code-review cost');
    const prompt = this.generatePrompt(description, patch);

    console.info('prompt', prompt);

    const res = await this.chatAPI.sendMessage(prompt);

    console.timeEnd('code-review cost');
    
    const text = res.text;
    if (!text) {
      return [];
    }

    console.info('response', text);

    const pos = patch.indexOf('[');
    if (pos < 0) {
      return [];
    }

    const jsonString = patch.substring(pos, patch.length);
    const jsonArray = JSON.parse(jsonString);
    
    return jsonArray;
  };
}
