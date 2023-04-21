import { Address, SignableMessage } from '@multiversx/sdk-core/out';
import { UserPublicKey, UserVerifier } from '@multiversx/sdk-wallet/out';
import { Probot } from 'probot';
import axios from 'axios';

export const robot = (app: Probot) => {
  app.on(
    ['pull_request.opened', 'pull_request.synchronize', 'issue_comment.created'],
    async (context) => {
      const repo = context.repo();

      async function createComment(body: string) {
        await context.octokit.issues.createComment({
          repo: context.repo().repo,
          owner: context.repo().owner,
          issue_number: context.pullRequest().pull_number,
          body,
        });
      }

      async function getInfoContents(files: {filename: string, raw_url: string}[]): Promise<{owners: string[]} | undefined> {
        // we try to read the contents of the info.json file
        const { data: infoFromMaster } = await axios.get(`https://raw.githubusercontent.com/multiversx/mx-assets/master/identities/${identity}/info.json`, { validateStatus: status => [200, 404].includes(status) });

        if (infoFromMaster && typeof infoFromMaster === 'object' && infoFromMaster['owners']) {
          return infoFromMaster;
        }
        
        const infoJsonFile = files.find(x => x.filename.endsWith(`/${identity}/info.json`));
        if (!infoJsonFile) {
          return undefined;
        }

        const { data: infoFromPullRequest } = await axios.get(infoJsonFile.raw_url);

        return infoFromPullRequest;
      }


      async function getOwner(files: {filename: string, raw_url: string}[]): Promise<string | undefined> {
        const info = await getInfoContents(files);
        if (!info) {
          return undefined;
        }

        const owners = info.owners;
        if (!owners || !Array.isArray(owners) || owners.length === 0) {
          return undefined;
        }

        const owner = owners[0];

        return owner;
      }

      function getDistinctIdentities(fileNames: string[]) {
        const regex = /^identities\/(.*?)\//;

        const identities = fileNames
          .map(x => regex.exec(x)?.at(1))
          .filter(x => x);
  
        return [...new Set(identities)];
      }

      async function fail(reason: string) {
        await createComment(reason);
        console.error(reason);
        process.exit(1);
      }

      const { data: pullRequest } = await axios.get(`https://api.github.com/repos/multiversx/mx-assets/pulls/${context.pullRequest().pull_number}`);
      const state = pullRequest.state;

      if (state === 'closed' || state === 'locked' || state === 'draft') {
        return 'invalid event payload';
      }

      const data = await context.octokit.repos. compareCommits({
        owner: repo.owner,
        repo: repo.repo,
        base: pullRequest.base.sha,
        head: pullRequest.head.sha,
      });

      let { files: changedFiles, commits } = data.data;

      const lastCommitSha = commits[commits.length - 1].sha;

      if (!changedFiles?.length) {
        return 'no change';
      }

      const distinctIdentities = getDistinctIdentities(changedFiles.map(x => x.filename));
      if (distinctIdentities.length === 0) {
        return;
      }

      if (distinctIdentities.length > 1) {
        await fail('Only one identity must be edited at a time');
        return;
      }

      const identity = distinctIdentities[0];

      let owner = await getOwner(changedFiles);
      if (new Address(owner).isContractAddress()) {
        const ownerResult = await axios.get(`https://next-api.multiversx.com/accounts/${owner}?extract=ownerAddress`);
        owner = ownerResult.data;
      }

      const body = pullRequest.body || '';

      const address = owner;
      const message = lastCommitSha;
      const signature = /[0-9a-fA-F]{128}/.exec(body)?.at(0);

      if (!signature) {
        await fail(`Please provide a signature for the latest commit sha: \`${lastCommitSha}\` which must be signed with the owner wallet address \`${address}\``);
        return;
      }

      const signableMessage = new SignableMessage({
        address: new Address(address),
        message: Buffer.from(message, 'utf8'),
      });

      const publicKey = new UserPublicKey(
        new Address(address).pubkey(),
      );

      const verifier = new UserVerifier(publicKey);
      let valid = verifier.verify(signableMessage.serializeForSigning(), Buffer.from(signature, 'hex'));
      if (!valid) {
        await fail(`The provided signature is invalid. Please provide a signature for the latest commit sha: \`${lastCommitSha}\` which must be signed with the owner wallet address \`${address}\``);
        return;
      } else {
        await createComment(`Signature OK. Verified that the latest commit hash \`${lastCommitSha}\` was signed using the wallet address \`${address}\` using the signature \`${signature}\``);
      }

      console.info('successfully reviewed', pullRequest.html_url);
      return 'success';
    }
  );
};
