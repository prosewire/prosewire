import { getCollection } from "astro:content";

export const legalPages = (await getCollection("legal")).toSorted(
  (left, right) => left.data.order - right.data.order,
);

export function legalPagePath(id: string): string {
  return `/legal/${id}/`;
}
