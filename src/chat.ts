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
    Please review a pull request with the following description:
    ${description}

    code:
    ${patch}

    Please provide one paragraph describing whether the changes respect the description of the pull request.
    If you find any changes that should be made to the source code, provide them in the format of a json array with the following attributes: filePath, startLine, endLine, description.
    `;
  };

  public codeReview = async (description: string, patch: string) => {
    if (!patch) {
      return '';
    }

    console.time('code-review cost');
    const prompt = this.generatePrompt(description, patch);

    console.info('prompt', prompt);

    const res = await this.chatAPI.sendMessage(prompt);

    console.timeEnd('code-review cost');
    return 'Review from ChatGPT: \n' + res.text;
  };
}
