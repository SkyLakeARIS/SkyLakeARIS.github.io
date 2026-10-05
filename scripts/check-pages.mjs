import path from "node:path";
import { pathToFileURL } from "node:url";

export async function verifyPagesSource(repository, token, request = fetch) {
  if (!repository || !token) throw new Error("GitHub Actions의 저장소 정보와 GITHUB_TOKEN이 필요합니다.");
  const response = await request("https://api.github.com/repos/" + repository + "/pages", {
    headers: {
      "Authorization": "Bearer " + token,
      "Accept": "application/vnd.github+json",
      "User-Agent": "seobkim-site-build"
    },
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error("GitHub Pages 설정 조회 실패 (" + response.status + "). Pages를 활성화하고 Source를 GitHub Actions로 지정해 주세요.");
  const pages = await response.json();
  if (pages.build_type !== "workflow") {
    throw new Error("배포 중단: Settings → Pages → Build and deployment → Source를 GitHub Actions로 변경해 주세요. 현재 설정은 저장소 원본을 Jekyll로 배포합니다.");
  }
}

const invokedDirectly = process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) {
  try {
    await verifyPagesSource(process.env.GITHUB_REPOSITORY, process.env.GITHUB_TOKEN);
    console.log("Verified GitHub Pages publishes the workflow artifact.");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
