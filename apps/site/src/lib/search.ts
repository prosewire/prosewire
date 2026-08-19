import { createFromSource } from "fumadocs-core/search/server";
import { getStructuredData, source } from "./source";

export const searchServer = createFromSource(source, {
  buildIndex(page) {
    return {
      id: page.data._raw.id,
      title: page.data.title,
      description: page.data.description,
      structuredData: getStructuredData(page.data._raw),
      url: page.url,
    };
  },
});
