import type { APIRoute } from "astro";
import { searchServer } from "../../../lib/search";

export const prerender = true;
export const GET: APIRoute = () => searchServer.staticGET();
