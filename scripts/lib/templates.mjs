import site from "../../src/config/site.mjs";
import {
  dateValue,
  escapeHtml,
  formatDate,
  sectionTitle
} from "./utils.mjs";

function makeTree(documents) {
  const root = { name: "", children: new Map(), documents: [] };

  for (const document of documents) {
    let node = root;
    for (const segment of document.folderSegments) {
      if (!node.children.has(segment)) {
        node.children.set(segment, { name: segment, children: new Map(), documents: [] });
      }
      node = node.children.get(segment);
    }
    node.documents.push(document);
  }

  return root;
}

function nodeContainsUrl(node, currentUrl) {
  if (!currentUrl) return false;
  if (node.documents.some(document => document.url === currentUrl)) return true;
  return [...node.children.values()].some(child => nodeContainsUrl(child, currentUrl));
}

function renderTreeNode(node, currentUrl, depth, compact) {
  const childNodes = [...node.children.values()]
    .sort((a, b) => sectionTitle(a.name).localeCompare(sectionTitle(b.name), site.locale));
  const documents = [...node.documents]
    .sort((a, b) =>
      dateValue(b.date) - dateValue(a.date) ||
      b.sourceRel.localeCompare(a.sourceRel, site.locale, { numeric: true })
    );
  const parts = [];

  for (const child of childNodes) {
    const isCurrentBranch = nodeContainsUrl(child, currentUrl);
    const open = isCurrentBranch || (compact && depth <= 1);
    parts.push(
      '<details class="tree-group"' + (open ? " open" : "") + ">" +
        "<summary>" + escapeHtml(sectionTitle(child.name)) + "</summary>" +
        '<div class="tree-branch">' + renderTreeNode(child, currentUrl, depth + 1, compact) + "</div>" +
      "</details>"
    );
  }

  for (const document of documents) {
    const active = document.url === currentUrl;
    const draftLabel = document.draft ? '<span class="tree-draft">초안</span>' : "";
    parts.push(
      '<a class="tree-link' + (active ? " active" : "") + '" href="' + escapeHtml(document.url) + '" data-tree-text="' + escapeHtml(documentSearchText(document)) + '">' +
        "<span>" + escapeHtml(document.title) + "</span>" + draftLabel +
      "</a>"
    );
  }

  return parts.join("");
}

export function renderDocumentTree(documents, currentUrl, compact = false) {
  return renderTreeNode(makeTree(documents), currentUrl, 0, compact);
}

function documentSearchText(document) {
  return [
    document.title,
    document.description,
    document.category,
    ...document.tags,
    ...document.folderSegments.map(sectionTitle)
  ].filter(Boolean).join(" ").toLocaleLowerCase(site.locale);
}

function renderToc(headings) {
  if (!headings.length) return "";
  return (
    '<nav class="toc-links" aria-label="글 내부 목차">' +
      headings.map(heading =>
        '<a class="toc-level-' + heading.level + '" href="#' + escapeHtml(heading.id) + '">' + escapeHtml(heading.text) + "</a>"
      ).join("") +
    "</nav>"
  );
}

function headHtml({ title, description, canonical, noindex = false }) {
  const fullTitle = title === site.siteTitle ? site.siteTitle : title + " · " + site.siteTitle;
  return (
    "<!doctype html>" +
    '<html lang="ko">' +
    "<head>" +
      '<meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<meta name="color-scheme" content="light dark">' +
      (noindex ? '<meta name="robots" content="noindex,follow">' : "") +
      "<title>" + escapeHtml(fullTitle) + "</title>" +
      '<meta name="description" content="' + escapeHtml(description) + '">' +
      '<link rel="canonical" href="' + escapeHtml(canonical) + '">' +
      '<meta property="og:title" content="' + escapeHtml(fullTitle) + '">' +
      '<meta property="og:description" content="' + escapeHtml(description) + '">' +
      '<meta property="og:type" content="website">' +
      '<meta property="og:url" content="' + escapeHtml(canonical) + '">' +
      '<link rel="icon" href="/favicon.svg" type="image/svg+xml">' +
      '<link rel="stylesheet" href="/assets/site.css">' +
      '<script defer src="/assets/site.js"></script>' +
    "</head>"
  );
}

function headerHtml(active = "") {
  return (
    '<a class="skip-link" href="#main-content">본문으로 건너뛰기</a>' +
    '<header class="top-header">' +
      '<div class="topbar">' +
        '<a class="brand" href="/" aria-label="홈으로 이동"><span class="brand-mark">S</span><span>' + escapeHtml(site.displayName) + "</span></a>" +
        '<nav class="topnav" aria-label="주요 메뉴">' +
          '<a class="' + (active === "home" ? "active" : "") + '" href="/">홈</a>' +
          '<a class="' + (active === "docs" ? "active" : "") + '" href="/docs/">문서</a>' +
          '<a href="https://github.com/' + escapeHtml(site.githubUser) + '" target="_blank" rel="noreferrer">GitHub ↗</a>' +
        "</nav>" +
        '<div class="header-actions">' +
          '<label class="theme-control"><span class="sr-only">색상 모드</span><select id="theme-select" aria-label="색상 모드"><option value="system">시스템</option><option value="light">라이트</option><option value="dark">다크</option></select></label>' +
          '<button class="mobile-menu" id="mobile-menu" type="button" aria-label="문서 목차 열기" aria-expanded="false" aria-controls="docs-sidebar">☰</button>' +
        "</div>" +
      "</div>" +
    "</header>"
  );
}

function footerHtml() {
  const identity = site.realName
    ? "<strong>" + escapeHtml(site.realName) + "</strong>"
    : '<strong aria-label="표시 이름">' + escapeHtml(site.displayName) + "</strong>";

  return (
    '<footer class="site-footer">' +
      '<div class="footer-contact">' + identity + '<a href="mailto:' + escapeHtml(site.email) + '">' + escapeHtml(site.email) + "</a></div>" +

    "</footer>"
  );
}

function analyticsHtml(enabled) {
  if (!enabled || !site.cloudflareWebAnalyticsToken) return "";
  const payload = escapeHtml(JSON.stringify({ token: site.cloudflareWebAnalyticsToken }));
  return (
    '<script type="module" src="https://static.cloudflareinsights.com/beacon.min.js" ' +
    "data-cf-beacon='" + payload + "'></script>"
  );
}

function pageShell({ title, description, canonical, active, content, bodyClass = "", noindex = false, analyticsEnabled = false }) {
  return (
    headHtml({ title, description, canonical, noindex }) +
    '<body class="' + escapeHtml(bodyClass) + '">' +
      headerHtml(active) +
      '<main id="main-content">' + content + "</main>" +
      '<button class="to-top" id="to-top" type="button" aria-label="페이지 위로 이동">↑</button>' +
      '<dialog class="image-dialog" id="image-dialog"><button class="image-dialog-close" type="button" aria-label="닫기">×</button><img alt=""></dialog>' +
      analyticsHtml(analyticsEnabled) +
    "</body></html>"
  );
}

export function homeHtml(documents, pinnedRepositories, noindex = false, analyticsEnabled = false) {
  const recent = [...documents]
    .sort((a, b) =>
      dateValue(b.date) - dateValue(a.date) ||
      b.sourceRel.localeCompare(a.sourceRel, site.locale, { numeric: true })
    )
    .slice(0, 6);

  const repoCards = pinnedRepositories.map(repository =>
    '<a class="repo-card" href="' + escapeHtml(repository.url) + '" target="_blank" rel="noreferrer">' +
      "<strong>" + escapeHtml(repository.name) + "</strong>" +
      '<span class="repo-language">' + escapeHtml(repository.language || "") + "</span>" +
      (repository.description ? "<p>" + escapeHtml(repository.description) + "</p>" : "") +
    "</a>"
  ).join("");

  const recentCards = recent.map(document =>
    '<a class="doc-card" href="' + escapeHtml(document.url) + '">' +
      '<span class="doc-card-type">' + escapeHtml(document.category || "Document") + "</span>" +
      "<h2>" + escapeHtml(document.title) + "</h2>" +
      "<p>" + escapeHtml(document.description) + "</p>" +
      '<span class="doc-card-meta"><span>' + escapeHtml(formatDate(document.updated || document.date)) + '</span><span>' + document.minutes + "분</span></span>" +
    "</a>"
  ).join("");

  const content = (
    '<div class="home-shell">' +
      '<section class="home-profile">' +
        '<div class="profile-identity"><h1>' + escapeHtml(site.displayName) + '</h1>' +
          '<p class="profile-name">' + escapeHtml(site.realName) + '</p>' +
          '<p class="profile-role">' + escapeHtml(site.role) + '</p>' +
          '<div class="profile-links">' +
            '<a href="mailto:' + escapeHtml(site.email) + '">' + escapeHtml(site.email) + '</a>' +
            '<a href="https://github.com/' + escapeHtml(site.githubUser) + '" target="_blank" rel="noreferrer">GitHub ↗</a>' +
            '<a href="' + escapeHtml(site.linkedinUrl) + '" target="_blank" rel="noreferrer">LinkedIn ↗</a>' +
          '</div>' +
        '</div>' +
        (recent[0] ? '<a class="profile-status" href="' + escapeHtml(recent[0].url) + '" title="최근 문서: ' + escapeHtml(recent[0].title) + '">최근 문서 · <span>' + escapeHtml(recent[0].title) + '</span></a>' : "") +
      "</section>" +
      '<section class="home-dashboard">' +
        '<div class="home-outline">' +
          '<div class="outline-head"><strong>문서</strong><a href="/docs/">전체 문서 보기 →</a></div>' +
          '<nav class="home-tree" aria-label="문서 목차">' + renderDocumentTree(documents, "", true) + "</nav>" +
        "</div>" +
        '<div class="repo-panel">' +
          '<div class="repo-panel-head"><strong>Pinned repositories</strong><a href="https://github.com/' + escapeHtml(site.githubUser) + '" target="_blank" rel="noreferrer">GitHub 프로필 ↗</a></div>' +
          '<div class="repo-list">' + repoCards + "</div>" +
        "</div>" +
      "</section>" +
      '<section class="home-section">' +
        '<div class="section-heading"><h2>최근 문서</h2><p>최근 작성하거나 갱신한 문서입니다.</p></div>' +
        '<div class="card-grid">' + recentCards + "</div>" +
      "</section>" +
      footerHtml() +
    "</div>"
  );

  return pageShell({
    title: site.siteTitle,
    description: site.siteDescription,
    canonical: site.siteUrl + "/",
    active: "home",
    content,
    bodyClass: "home-page",
    noindex,
    analyticsEnabled
  });
}

function sidebarHtml(documents, currentUrl) {
  return (
    '<div class="drawer-backdrop" id="drawer-backdrop" aria-hidden="true"></div>' +
    '<aside class="docs-sidebar" id="docs-sidebar" aria-label="전체 문서 목차">' +
      '<div class="sidebar-head"><span>Contents</span><a href="/docs/">전체 보기</a></div>' +
      '<label class="tree-search"><span class="sr-only">문서 검색</span><input id="tree-search" type="search" placeholder="문서 검색"></label>' +
      '<nav class="doc-tree" id="doc-tree">' + renderDocumentTree(documents, currentUrl, false) + "</nav>" +
      '<p class="tree-empty" id="tree-empty" hidden>일치하는 문서가 없습니다.</p>' +
    "</aside>"
  );
}

function topNavigation(previous, next) {
  return (
    '<nav class="article-top-nav" aria-label="이전 글과 다음 글">' +
      (previous ? '<a href="' + escapeHtml(previous.url) + '">← ' + escapeHtml(previous.title) + "</a>" : "<span></span>") +
      (next ? '<a class="next" href="' + escapeHtml(next.url) + '">' + escapeHtml(next.title) + " →</a>" : "<span></span>") +
    "</nav>"
  );
}

function bottomNavigation(previous, next) {
  return (
    '<nav class="bottom-nav" aria-label="이전 글과 다음 글">' +
      (previous
        ? '<a href="' + escapeHtml(previous.url) + '"><small>이전 글</small><strong>← ' + escapeHtml(previous.title) + "</strong></a>"
        : '<span class="nav-placeholder"></span>') +
      (next
        ? '<a class="next" href="' + escapeHtml(next.url) + '"><small>다음 글</small><strong>' + escapeHtml(next.title) + " →</strong></a>"
        : '<span class="nav-placeholder"></span>') +
    "</nav>"
  );
}

export function articleHtml(document, documents, previous, next, analyticsEnabled = false) {
  const headings = document.headings;
  const toc = renderToc(headings);
  const breadcrumbs = document.folderSegments
    .map(segment => "<span>" + escapeHtml(sectionTitle(segment)) + "</span>")
    .join("<b>/</b>");
  const tags = document.tags.map(tag => "<span>" + escapeHtml(tag) + "</span>").join("");
  const draftBanner = document.draft
    ? '<div class="draft-banner">로컬 미리보기에서만 보이는 초안입니다.</div>'
    : "";

  const content = (
    '<div class="docs-layout">' +
      sidebarHtml(documents, document.url) +
      '<article class="article">' +
        topNavigation(previous, next) +
        '<div class="breadcrumbs"><a href="/docs/">문서</a><b>/</b>' + breadcrumbs + "</div>" +
        draftBanner +
        "<h1>" + escapeHtml(document.title) + "</h1>" +
        '<p class="article-lead">' + escapeHtml(document.description) + "</p>" +
        '<div class="article-meta"><span>' + escapeHtml(formatDate(document.updated || document.date)) + '</span><span>읽는 시간 ' + document.minutes + "분</span></div>" +
        (headings.length ? '<details class="top-toc" open><summary>이 글의 목차</summary>' + toc + "</details>" : "") +
        (headings.length ? '<details class="article-toc-mobile"><summary>현재 글 목차</summary>' + toc + "</details>" : "") +
        '<div class="article-body">' + document.html + "</div>" +
        (tags ? '<div class="article-tags">' + tags + "</div>" : "") +
        bottomNavigation(previous, next) +
        footerHtml() +
      "</article>" +
      (headings.length ? '<aside class="article-toc"><p>현재 글</p>' + toc + "</aside>" : '<aside class="article-toc"></aside>') +
    "</div>"
  );

  return pageShell({
    title: document.title,
    description: document.description,
    canonical: site.siteUrl + document.url,
    active: "docs",
    content,
    bodyClass: "document-page",
    analyticsEnabled
  });
}

export function docsIndexHtml(documents, analyticsEnabled = false) {
  const bySection = new Map();
  for (const document of documents) {
    const key = document.folderSegments[0] || "Documents";
    if (!bySection.has(key)) bySection.set(key, []);
    bySection.get(key).push(document);
  }

  const sections = [...bySection.entries()].map(([section, sectionDocuments]) =>
    '<section class="document-group" data-document-group>' +
      "<h2>" + escapeHtml(sectionTitle(section)) + "</h2>" +
      '<div class="document-list">' +
        [...sectionDocuments]
          .sort((a, b) =>
            dateValue(b.date) - dateValue(a.date) ||
            b.sourceRel.localeCompare(a.sourceRel, site.locale, { numeric: true })
          )
          .map(document =>
          '<a class="document-list-item" href="' + escapeHtml(document.url) + '" data-document-search="' + escapeHtml(documentSearchText(document)) + '">' +
            "<div><strong>" + escapeHtml(document.title) + "</strong><p>" + escapeHtml(document.description) + "</p></div>" +
            '<span>' + escapeHtml(document.category) + "</span>" +
          "</a>"
        ).join("") +
      "</div>" +
    "</section>"
  ).join("");

  const content = (
    '<div class="docs-layout index-layout">' +
      sidebarHtml(documents, "") +
      '<article class="article documents-index">' +
        '<div class="breadcrumbs"><a href="/">홈</a><b>/</b><span>문서</span></div>' +
        '<div class="documents-index-header"><h1>전체 문서</h1><span>' + documents.length + '개</span></div>' +

        (documents.length
          ? '<label class="documents-search"><span class="sr-only">문서 검색</span><input id="document-search" type="search" placeholder="제목, 설명, 카테고리, 태그 검색" autocomplete="off"><span id="document-search-count" aria-live="polite">' + documents.length + '개</span></label><div class="document-groups" id="document-groups">' + sections + '</div><p class="documents-empty" id="documents-search-empty" hidden>일치하는 문서가 없습니다.</p>'
          : '<p class="documents-empty">아직 문서가 없습니다.</p>') +
        footerHtml() +
      "</article>" +
      '<aside class="article-toc"></aside>' +
    "</div>"
  );

  return pageShell({
    title: "전체 문서",
    description: site.siteDescription,
    canonical: site.siteUrl + "/docs/",
    active: "docs",
    content,
    bodyClass: "document-page",
    analyticsEnabled
  });
}

export function notFoundHtml(analyticsEnabled = false) {
  const content = (
    '<div class="not-found">' +
      "<span>404</span><h1>페이지를 찾을 수 없습니다.</h1>" +
      "<p>주소가 바뀌었거나 존재하지 않는 문서입니다.</p>" +
      '<a class="primary-button" href="/">홈으로 돌아가기</a>' +
    "</div>"
  );

  return pageShell({
    title: "페이지를 찾을 수 없음",
    description: site.siteDescription,
    canonical: site.siteUrl + "/404.html",
    active: "",
    content,
    bodyClass: "error-page",
    noindex: true,
    analyticsEnabled
  });
}