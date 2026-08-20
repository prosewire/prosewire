export const acceptance = {
  password: "acceptance-password-123",
  apiKey: "pw_acceptance_read_write_key_123456",
  readOnlyApiKey: "pw_acceptance_read_only_key_1234567",
  otherApiKey: "pw_acceptance_other_tenant_key_12345",
  owner: {
    id: "acceptance-owner",
    email: "owner@acceptance.test",
  },
  viewer: {
    id: "acceptance-viewer",
    email: "viewer@acceptance.test",
  },
  otherOwner: {
    id: "acceptance-other-owner",
    email: "other-owner@acceptance.test",
  },
  organization: {
    id: "acceptance-organization",
    slug: "acceptance-workspace",
  },
  otherOrganization: {
    id: "acceptance-other-organization",
    slug: "acceptance-other-workspace",
  },
  blog: {
    id: "11111111-1111-4111-8111-111111111111",
    slug: "acceptance-fieldnotes",
  },
  otherBlog: {
    id: "22222222-2222-4222-8222-222222222222",
    slug: "acceptance-other-blog",
  },
  author: {
    id: "33333333-3333-4333-8333-333333333333",
    slug: "ada-editor",
  },
  otherAuthor: {
    id: "44444444-4444-4444-8444-444444444444",
  },
  category: {
    id: "55555555-5555-4555-8555-555555555555",
    slug: "engineering",
  },
  posts: {
    draft: "60000000-0000-4000-8000-000000000001",
    scheduled: "60000000-0000-4000-8000-000000000002",
    published: "60000000-0000-4000-8000-000000000003",
    archived: "60000000-0000-4000-8000-000000000004",
    futurePublished: "60000000-0000-4000-8000-000000000005",
    otherTenant: "60000000-0000-4000-8000-000000000006",
  },
} as const;
