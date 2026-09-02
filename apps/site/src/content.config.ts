import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const docs = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./content/docs" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    section: z.enum(["Start here", "Integrate", "Operate", "Reference"]),
    order: z.number(),
  }),
});

const meta = defineCollection({
  loader: glob({ pattern: "**/*.{json,yaml}", base: "./content/docs" }),
  schema: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    pages: z.array(z.string()).optional(),
  }),
});

const legal = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./content/legal" }),
  schema: z.object({
    title: z.string(),
    shortTitle: z.string(),
    description: z.string(),
    summary: z.string(),
    order: z.number(),
    effectiveDate: z.string(),
  }),
});

export const collections = { docs, legal, meta };
