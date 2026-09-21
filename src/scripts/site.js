(() => {
  const root = document.documentElement;
  const body = document.body;
  const themeSelect = document.getElementById("theme-select");
  const savedTheme = localStorage.getItem("seobkim-theme") || "system";

  function applyTheme(theme) {
    root.removeAttribute("data-theme");
    if (theme !== "system") root.dataset.theme = theme;
    if (themeSelect) themeSelect.value = theme;
    localStorage.setItem("seobkim-theme", theme);
  }

  applyTheme(savedTheme);
  themeSelect?.addEventListener("change", event => applyTheme(event.target.value));

  const sidebar = document.getElementById("docs-sidebar");
  const mobileMenu = document.getElementById("mobile-menu");
  const backdrop = document.getElementById("drawer-backdrop");
  const drawerBackground = sidebar?.parentElement
    ? [...sidebar.parentElement.children].filter(element => element !== sidebar && element !== backdrop)
    : [];

  if (!sidebar && mobileMenu) mobileMenu.hidden = true;

  function setDrawer(open) {
    const wasOpen = body.classList.contains("drawer-open");
    body.classList.toggle("drawer-open", open);
    mobileMenu?.setAttribute("aria-expanded", String(open));
    mobileMenu?.setAttribute("aria-label", open ? "문서 목차 닫기" : "문서 목차 열기");
    drawerBackground.forEach(element => {
      element.inert = open;
    });

    if (open) {
      sidebar?.querySelector("#tree-search")?.focus();
    } else if (wasOpen) {
      mobileMenu?.focus();
    }
  }

  mobileMenu?.addEventListener("click", () => setDrawer(!body.classList.contains("drawer-open")));
  backdrop?.addEventListener("click", () => setDrawer(false));
  sidebar?.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", () => setDrawer(false));
  });

  const treeSearch = document.getElementById("tree-search");
  const docTree = document.getElementById("doc-tree");
  const treeEmpty = document.getElementById("tree-empty");

  if (treeSearch && docTree) {
    docTree.querySelectorAll("details").forEach(details => {
      details.dataset.initialOpen = details.open ? "true" : "false";
    });

    treeSearch.addEventListener("input", () => {
      const query = treeSearch.value.trim().toLocaleLowerCase("ko");
      const links = [...docTree.querySelectorAll(".tree-link")];
      let visibleCount = 0;

      links.forEach(link => {
        const text = link.dataset.treeText || link.textContent.toLocaleLowerCase("ko");
        const visible = !query || text.includes(query);
        link.hidden = !visible;
        if (visible) visibleCount += 1;
      });

      const detailsList = [...docTree.querySelectorAll("details")].reverse();
      detailsList.forEach(details => {
        const hasVisibleLink = [...details.querySelectorAll(".tree-link")].some(link => !link.hidden);
        details.hidden = !hasVisibleLink;
        if (query && hasVisibleLink) details.open = true;
        if (!query) details.open = details.dataset.initialOpen === "true";
      });

      if (treeEmpty) treeEmpty.hidden = visibleCount > 0;
    });
  }

  const documentSearch = document.getElementById("document-search");
  const documentSearchCount = document.getElementById("document-search-count");
  const documentSearchEmpty = document.getElementById("documents-search-empty");

  if (documentSearch) {
    const documentItems = [...document.querySelectorAll(".document-list-item")];
    const documentGroups = [...document.querySelectorAll("[data-document-group]")];

    function filterDocuments() {
      const terms = documentSearch.value
        .trim()
        .toLocaleLowerCase("ko")
        .split(/\s+/)
        .filter(Boolean);
      let visibleCount = 0;

      documentItems.forEach(item => {
        const text = item.dataset.documentSearch || item.textContent.toLocaleLowerCase("ko");
        const visible = terms.every(term => text.includes(term));
        item.hidden = !visible;
        if (visible) visibleCount += 1;
      });

      documentGroups.forEach(group => {
        group.hidden = ![...group.querySelectorAll(".document-list-item")].some(item => !item.hidden);
      });

      if (documentSearchCount) documentSearchCount.textContent = visibleCount + "개";
      if (documentSearchEmpty) documentSearchEmpty.hidden = visibleCount > 0 || terms.length === 0;
    }

    documentSearch.addEventListener("input", filterDocuments);
  }

  document.querySelectorAll(".copy-code").forEach(button => {
    button.addEventListener("click", async () => {
      const code = button.closest(".code-block")?.querySelector("code")?.innerText || "";
      try {
        await navigator.clipboard.writeText(code);
        button.textContent = "복사됨";
      } catch {
        button.textContent = "복사 실패";
      }
      window.setTimeout(() => {
        button.textContent = "복사";
      }, 1500);
    });
  });

  const toTop = document.getElementById("to-top");
  function updateToTop() {
    toTop?.classList.toggle("visible", window.scrollY > 480);
  }

  window.addEventListener("scroll", updateToTop, { passive: true });
  updateToTop();
  toTop?.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

  const tocLinks = [...document.querySelectorAll(".article-toc .toc-links a")];
  const headingIds = [...new Set(tocLinks.map(link => decodeURIComponent(link.hash.slice(1))))];
  const headings = headingIds.map(id => document.getElementById(id)).filter(Boolean);

  if (headings.length && "IntersectionObserver" in window) {
    const linkGroups = new Map();
    document.querySelectorAll(".toc-links a").forEach(link => {
      const id = decodeURIComponent(link.hash.slice(1));
      if (!linkGroups.has(id)) linkGroups.set(id, []);
      linkGroups.get(id).push(link);
    });

    function setActiveToc(id) {
      document.querySelectorAll(".toc-links a.active").forEach(link => link.classList.remove("active"));
      (linkGroups.get(id) || []).forEach(link => link.classList.add("active"));
    }

    const observer = new IntersectionObserver(entries => {
      const visible = entries
        .filter(entry => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]) setActiveToc(visible[0].target.id);
    }, {
      rootMargin: "-90px 0px -65% 0px",
      threshold: [0, 1]
    });

    headings.forEach(heading => observer.observe(heading));
    setActiveToc(headings[0].id);
  }

  const dialog = document.getElementById("image-dialog");
  const dialogImage = dialog?.querySelector("img");

  document.querySelectorAll(".image-open").forEach(button => {
    button.addEventListener("click", () => {
      const image = button.querySelector("img");
      if (!dialog || !dialogImage || !image) return;
      dialogImage.src = image.currentSrc || image.src;
      dialogImage.alt = image.alt;
      dialog.showModal();
    });
  });

  dialog?.querySelector(".image-dialog-close")?.addEventListener("click", () => dialog.close());
  dialog?.addEventListener("click", event => {
    if (event.target === dialog) dialog.close();
  });

  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    setDrawer(false);
    if (dialog?.open) dialog.close();
  });

  if ((location.hostname === "127.0.0.1" || location.hostname === "localhost") && "EventSource" in window) {
    const events = new EventSource("/__events");
    events.addEventListener("message", event => {
      if (event.data === "reload") location.reload();
    });
  }
})();