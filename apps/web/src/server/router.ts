import { implement } from "@orpc/server";
import { contract } from "@prosewire/contract/router";
import {
  archivePost,
  createPost,
  getPost,
  health,
  listBlogs,
  listPosts,
  updatePost,
} from "./api-entrypoints.ts";

interface RequestContext {
  readonly request: Request;
}

const os = implement(contract).$context<RequestContext>();

export const router = os.router({
  health: os.health.handler(({ context }) => health(context.request)),
  blogs: {
    list: os.blogs.list.handler(({ context }) => listBlogs(context.request)),
  },
  posts: {
    list: os.posts.list.handler(({ input, context }) =>
      listPosts(context.request, input),
    ),
    get: os.posts.get.handler(({ input, context }) =>
      getPost(context.request, input.params.id),
    ),
    create: os.posts.create.handler(({ input, context }) =>
      createPost(context.request, input),
    ),
    update: os.posts.update.handler(({ input, context }) =>
      updatePost(context.request, input.params.id, input.body),
    ),
    archive: os.posts.archive.handler(({ input, context }) =>
      archivePost(context.request, input.params.id),
    ),
  },
});
