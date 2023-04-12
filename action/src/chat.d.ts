export declare class Chat {
    private chatAPI;
    constructor(apikey: string);
    private generatePrompt;
    codeReview: (description: string, patch: string) => Promise<string>;
}
