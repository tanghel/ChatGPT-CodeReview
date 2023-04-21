import { Probot } from 'probot';

const MAX_PATCH_COUNT = 4000;

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

      if (context.payload.action === 'synchronize' && commits.length >= 2) {
        const {
          data: { files },
        } = await context.octokit.repos.compareCommits({
          owner: repo.owner,
          repo: repo.repo,
          base: commits[commits.length - 2].sha,
          head: commits[commits.length - 1].sha,
        });

        const filesNames = files?.map((file) => file.filename) || [];
        changedFiles = changedFiles?.filter((file) =>
          filesNames.includes(file.filename)
        );
      }

      if (!changedFiles?.length) {
        return 'no change';
      }

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

      console.timeEnd('gpt cost');
      console.info('successfully reviewed', context.payload.pull_request.html_url);

      return 'success';
    }
  );
};
