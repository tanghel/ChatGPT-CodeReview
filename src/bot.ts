import { Address, SignableMessage } from '@multiversx/sdk-core/out';
import { UserPublicKey, UserVerifier } from '@multiversx/sdk-wallet/out';
import { Probot } from 'probot';
import axios from 'axios';

export const robot = (app: Probot) => {
  app.on(
    ['pull_request.opened', 'pull_request.synchronize'],
    async (context) => {
      const repo = context.repo();

      const pull_request = context.payload.pull_request;

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
          console.info('info from master', infoFromMaster);
          return infoFromMaster;
        }
        
        const infoJsonFile = files.find(x => x.filename.endsWith(`/${identity}/info.json`));
        if (!infoJsonFile) {
          console.info('info.json file not found in changed files');
          return undefined;
        }

        const { data: infoFromPullRequest } = await axios.get(infoJsonFile.raw_url);

        console.info('info from pull request', infoFromPullRequest);
        return infoFromPullRequest;
      }


      async function getOwner(files: {filename: string, raw_url: string}[]): Promise<string | undefined> {
        const info = await getInfoContents(files);
        if (!info) {
          console.info('no info returned');
          return undefined;
        }

        const owners = info.owners;
        if (!owners || !Array.isArray(owners) || owners.length === 0) {
          console.info('owners not identified');
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

      if (
        pull_request.state === 'closed' ||
        pull_request.locked ||
        pull_request.draft
      ) {
        return 'invalid event payload';
      }

      const data = await context.octokit.repos. compareCommits({
        owner: repo.owner,
        repo: repo.repo,
        base: context.payload.pull_request.base.sha,
        head: context.payload.pull_request.head.sha,
      });

      let { files: changedFiles, commits } = data.data;

      const lastCommitSha = commits[commits.length - 1].sha;

      console.info('lastCommitSha', lastCommitSha);

      if (!changedFiles?.length) {
        return 'no change';
      }

      const distinctIdentities = getDistinctIdentities(changedFiles.map(x => x.filename));
      if (distinctIdentities.length === 0) {
        console.info('no identity changed');
        return;
      }

      if (distinctIdentities.length > 1) {
        context.log.error(`Only one identity must be edited at a time. Edited identities: ${distinctIdentities}`);
        await createComment('Only one identity must be edited at a time');
        return;
      }

      const identity = distinctIdentities[0];

      let owner = await getOwner(changedFiles);
      console.info('initial owner', owner);
      if (new Address(owner).isContractAddress()) {
        const ownerResult = await axios.get(`https://next-api.multiversx.com/accounts/${owner}?extract=ownerAddress`);
        owner = ownerResult.data;
      }

      console.info('owner', owner);
      
      const body = pull_request.body || '';

      const address = owner;
      const message = lastCommitSha;
      const signature = /[0-9a-fA-F]{128}/.exec(body)?.at(0);

      if (!signature) {
        await createComment(`Please provide a signature for the latest commit sha: ${lastCommitSha} which must be signed with the owner wallet address ${address}`);
        return;
      }

      // const address = 'erd1qnk2vmuqywfqtdnkmauvpm8ls0xh00k8xeupuaf6cm6cd4rx89qqz0ppgl';
      // const message = 'erd1qnk2vmuqywfqtdnkmauvpm8ls0xh00k8xeupuaf6cm6cd4rx89qqz0ppglaHR0cHM6Ly90ZXN0bmV0LXdhbGxldC5tdWx0aXZlcnN4LmNvbQ.6360ab74d66df93189ab5e1e63a16441b88dd7a6372c7a360f62e9a39b362471.86400.e30{}';
      // const signature = 'db82b1dbaf1b14462627dac270a6ba9edb0264510982029aecab338e612cb06df093c2ade20da6caf66805fdbfa4b5957870ecac3d3409b213961ab569a5cb0f';

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
        await createComment(`The provided signature is invalid`);
        return;
      }

      console.info('signable message', signableMessage.serializeForSigning().toString('hex'));
      console.info('valid', valid);

      console.info('successfully reviewed', context.payload.pull_request.html_url);
      return 'success';
    }
  );
};
