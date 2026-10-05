import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import site from "../src/config/site.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputFile = path.join(root, "src", "data", "pinned-repos.json");
const query = [
  "query PinnedRepositories($login: String!) {",
  "  user(login: $login) {",
  "    pinnedItems(first: 6, types: REPOSITORY) {",
  "      nodes {",
  "        ... on Repository {",
  "          name",
  "          url",
  "          description",
  "          isPrivate",
  "          primaryLanguage { name }",
  "        }",
  "      }",
  "    }",
  "  }",
  "}"
].join("\n");

export async function fetchPinnedRepositories(login, token, request = fetch) {
  if (!token) throw new Error("GITHUB_TOKEN 환경 변수가 필요합니다.");
  const response = await request("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + token,
      "Content-Type": "application/json",
      "User-Agent": "seobkim-site-build"
    },
    body: JSON.stringify({ query, variables: { login } }),
    signal: AbortSignal.timeout(15000)
  });

  if (!response.ok) {
    throw new Error("GitHub GraphQL 요청 실패: " + response.status);
  }

  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error(payload.errors.map(error => error.message).join(", "));
  }

  const nodes = payload.data?.user?.pinnedItems?.nodes;
  if (!Array.isArray(nodes)) throw new Error("GitHub 고정 저장소 목록을 조회하지 못했습니다.");
  return nodes.filter(repository => repository && repository.isPrivate === false).map(repository => ({
    name: repository.name,
    url: repository.url,
    description: repository.description || "",
    language: repository.primaryLanguage?.name || ""
  }));
}

const invokedDirectly = process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) {
  const token = process.env.GITHUB_TOKEN;
  try {
    const repositories = await fetchPinnedRepositories(site.githubUser, token);
    await fs.writeFile(outputFile, JSON.stringify(repositories, null, 2) + "\n", "utf8");
    console.log("Updated " + repositories.length + " pinned repositories.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(token ? message.replaceAll(token, "[REDACTED]") : message);
    process.exitCode = 1;
  }
}
