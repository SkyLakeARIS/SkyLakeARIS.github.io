import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import site from "../src/config/site.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputFile = path.join(root, "src", "data", "pinned-repos.json");
const token = process.env.GITHUB_TOKEN;

if (!token) {
  console.error("GITHUB_TOKEN 환경 변수가 필요합니다.");
  process.exit(1);
}

const query = [
  "query PinnedRepositories($login: String!) {",
  "  user(login: $login) {",
  "    pinnedItems(first: 6, types: REPOSITORY) {",
  "      nodes {",
  "        ... on Repository {",
  "          name",
  "          url",
  "          description",
  "          primaryLanguage { name }",
  "        }",
  "      }",
  "    }",
  "  }",
  "}"
].join("\n");

const response = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: {
    "Authorization": "Bearer " + token,
    "Content-Type": "application/json",
    "User-Agent": "seobkim-site-build"
  },
  body: JSON.stringify({
    query,
    variables: { login: site.githubUser }
  })
});

if (!response.ok) {
  throw new Error("GitHub GraphQL 요청 실패: " + response.status);
}

const payload = await response.json();
if (payload.errors?.length) {
  throw new Error(payload.errors.map(error => error.message).join(", "));
}

const repositories = (payload.data?.user?.pinnedItems?.nodes || []).map(repository => ({
  name: repository.name,
  url: repository.url,
  description: repository.description || "",
  language: repository.primaryLanguage?.name || ""
}));

await fs.writeFile(outputFile, JSON.stringify(repositories, null, 2) + "\n", "utf8");
console.log("Updated " + repositories.length + " pinned repositories.");