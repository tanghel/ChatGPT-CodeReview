import { Address, SignableMessage } from '@multiversx/sdk-core/out';
import { UserPublicKey, UserVerifier } from '@multiversx/sdk-wallet/out';
import { Probot } from 'probot';

const MAX_PATCH_COUNT = 4000;

import { ISignature } from "@multiversx/sdk-core";

export class NativeAuthSignature implements ISignature {
  constructor(private readonly signature: string) { }

  hex(): string {
    return this.signature;
  }
}


export const robot = (app: Probot) => {
  app.on(
    ['pull_request.opened', 'pull_request.synchronize'],
    async (context) => {
      const repo = context.repo();

      const pull_request = context.payload.pull_request;

      if (
        pull_request.state === 'closed' ||
        pull_request.locked ||
        pull_request.draft
      ) {
        return 'invalid event paylod';
      }

      const data = await context.octokit.repos.compareCommits({
        owner: repo.owner,
        repo: repo.repo,
        base: context.payload.pull_request.base.sha,
        head: context.payload.pull_request.head.sha,
      });

      let { files: changedFiles, commits } = data.data;

      const lastCommitSha = commits[commits.length - 1].sha;

      console.info('lastCommitSha', lastCommitSha);
      console.info('changedFiles', changedFiles);

      if (!changedFiles?.length) {
        return 'no change';
      }

      const regex = /^identities\/(.*?)\//;

      const identities = changedFiles
        .map(x => regex.exec(x.filename)?.at(1))
        .filter(x => x);

      console.info('identities', identities);

      const distinctIdentities = new Set(identities);
      if (distinctIdentities.size === 0) {
        return 'no identity changed';
      }

      console.info('distinctIdentities', distinctIdentities);


      if (distinctIdentities.size > 1) {
        throw new Error('You must only change one identity');
      }

      // extract all files within the identities folder that were edited
      
      // extract distinct identity names
      // must be only one, otherwise error
      // we try to read the contents of the 

      console.time('gpt cost');

      // @ts-ignore
      const description = pull_request.body || '';

      for (let i = 0; i < changedFiles.length; i++) {
        const file = changedFiles[i];
        const patch = file.patch || '';

        if(file.status !== 'modified' && file.status !== 'added') {
          continue;
        }

        if (!patch || patch.length > MAX_PATCH_COUNT) {
          continue;
        }

        // const res = await chat?.codeReview(description, patch);
        // for (const item of res) {
        //   await context.octokit.pulls.createReviewComment({
        //     repo: repo.repo,
        //     owner: repo.owner,
        //     pull_number: context.pullRequest().pull_number,
        //     commit_id: commits[commits.length - 1].sha,
        //     path: file.filename,
        //     body: item.description,
        //     start_line: item.startLine,
        //     line: item.endLine,
        //   });
        // }
      }

      // const res = await chat?.codeReview(description, patches);

      // if (!!res) {

      //   await context.octokit.issues.createComment({
      //     repo: repo.repo,
      //     owner: repo.owner,
      //     issue_number: context.pullRequest().pull_number,
      //     body: res,
      //   });
      // }

      await context.octokit.issues.createComment({
        repo: repo.repo,
        owner: repo.owner,
        issue_number: context.pullRequest().pull_number,
        body: 'Hello World!',
      });

      const address = 'erd1qnk2vmuqywfqtdnkmauvpm8ls0xh00k8xeupuaf6cm6cd4rx89qqz0ppgl';
      const message = 'erd1qnk2vmuqywfqtdnkmauvpm8ls0xh00k8xeupuaf6cm6cd4rx89qqz0ppglaHR0cHM6Ly90ZXN0bmV0LXdhbGxldC5tdWx0aXZlcnN4LmNvbQ.6360ab74d66df93189ab5e1e63a16441b88dd7a6372c7a360f62e9a39b362471.86400.e30{}';
      const signature = 'db82b1dbaf1b14462627dac270a6ba9edb0264510982029aecab338e612cb06df093c2ade20da6caf66805fdbfa4b5957870ecac3d3409b213961ab569a5cb0f';

      const signableMessage = new SignableMessage({
        address: new Address(address),
        message: Buffer.from(message, 'utf8'),
      });

      const publicKey = new UserPublicKey(
        new Address(address).pubkey(),
      );

      const verifier = new UserVerifier(publicKey);
      let valid = verifier.verify(signableMessage.serializeForSigning(), Buffer.from(signature, 'hex'));

      console.info('signable message', signableMessage.serializeForSigning().toString('hex'));
      console.info('valid', valid);

      console.timeEnd('gpt cost');
      console.info('successfully reviewed', context.payload.pull_request.html_url);

      return 'success';
    }
  );
};
