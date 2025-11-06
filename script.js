// ============================================================
// OPENROOT HH SCRIPT — PRODUCTION VERSION (ES2023+)
// VERSION: 1.3.0 — UID-BASED LOCAL STORAGE (NO SERVER DEPENDENCY)
// ============================================================

/* ============================================================
   STEP 1 — IDENTIFY USER (VIA ?uid=XYZ OR LOCAL CACHE)
   ============================================================ */

let USER_UID = null;

// GET UID FROM URL PARAMETER (IF PROVIDED BY MAIN SITE)
const urlParams = new URLSearchParams(window.location.search);
USER_UID = urlParams.get("uid");

// AUTO-FALLBACK IF USER LOGGED OUT ON MAIN SITE
if (!localStorage.getItem("openrootUserUID")) {
  USER_UID = "guest_user";
  localStorage.removeItem("openroot_current_uid");
}

// IF UID FOUND IN URL, STORE LOCALLY FOR FUTURE VISITS
if (USER_UID) {
  localStorage.setItem("openroot_current_uid", USER_UID);
} else {
  // OTHERWISE LOAD FROM PREVIOUSLY SAVED UID
  USER_UID = localStorage.getItem("openroot_current_uid");
}

// IF NO UID, ASSIGN A TEMPORARY GUEST ID
if (!USER_UID) USER_UID = "guest_user";

/* ============================================================
   STEP 2 — DEFINE STORAGE KEY (UNIQUE PER USER)
   ============================================================ */

const MAX_STARS = 5; // LIMIT STARS PER SECTION
const STORAGE_KEY = `starredCards_${USER_UID}`; // EACH USER GETS UNIQUE STORAGE

/* ============================================================
   STEP 3 — STORAGE HANDLER (SAFE LOCAL STORAGE ACCESS)
   ============================================================ */

const Storage = {
  async get(fallback = {}) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : fallback;
    } catch (err) {
      console.warn("STORAGE.GET ERROR:", err);
      return fallback;
    }
  },
  async set(value) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    } catch (err) {
      console.warn("STORAGE.SET ERROR:", err);
    }
  },
};

/* ============================================================
   STEP 4 — MAIN APP CLASS
   ============================================================ */

class OpenrootApp {
  constructor(root = document) {
    this.root = root;
    this.container = root.querySelector("main.container") ?? document.body;
    this.starredMap = new Map();
    this.cardSegmentMap = new Map();

    this.initialized = false;
    this.onContainerClick = this.onContainerClick.bind(this);
    this.onContainerKeydown = this.onContainerKeydown.bind(this);
  }

  async init() {
    if (this.initialized) return;
    this.initialized = true;

    // LOAD USER-STORED STARRED DATA
    const saved = await Storage.get({});
    if (saved && typeof saved === "object") {
      for (const [segId, ids] of Object.entries(saved)) {
        this.starredMap.set(segId, new Set(ids));
      }
    }

    this.setupCards();
    this.applyInitialStarState();

    this.container.addEventListener("click", this.onContainerClick, { passive: true });
    this.container.addEventListener("keydown", this.onContainerKeydown, { passive: true });

    this.initJobFilters();
    this.initMenu();

    requestAnimationFrame(() => {
      const segments = Array.from(new Set(this.cardSegmentMap.values()));
      segments.forEach((seg) => this.reorderSegment(seg));
    });
  }

  setupCards() {
    const cards = Array.from(this.root.querySelectorAll(".card, .job-card"));
    let autoId = 0;
    const segments = Array.from(this.root.querySelectorAll(".card-grid, .job-grid"));

    for (const seg of segments) {
      if (!seg.dataset.segId) seg.dataset.segId = `seg-${Math.random().toString(36).slice(2, 8)}`;

      const segCards = Array.from(seg.querySelectorAll(".card, .job-card"));
      segCards.forEach((card, idx) => {
        if (!card.dataset.id) card.dataset.id = `card-${++autoId}`;
        card.dataset.origIndex = idx.toString();
        this.cardSegmentMap.set(card.dataset.id, seg);
      });

      if (!this.starredMap.has(seg.dataset.segId)) {
        this.starredMap.set(seg.dataset.segId, new Set());
      }
    }
  }

  applyInitialStarState() {
    const allCards = Array.from(this.root.querySelectorAll(".card, .job-card"));
    for (const card of allCards) {
      const id = card.dataset.id;
      const seg = this.cardSegmentMap.get(id);
      const segId = seg?.dataset.segId;
      const btn = card.querySelector(".star-btn");
      if (!btn || !id || !segId) continue;
      const isStarred = this.starredMap.get(segId)?.has(id);
      this.updateStarAttr(btn, isStarred);
    }
  }

  updateStarAttr(btn, isStarred) {
    btn.classList.toggle("starred", Boolean(isStarred));
    btn.setAttribute("aria-pressed", isStarred ? "true" : "false");
    btn.setAttribute("aria-label", isStarred ? "Unstar card" : "Star card");
  }

  onContainerClick(ev) {
    const starBtn = ev.target.closest(".star-btn");
    if (starBtn) {
      ev.stopPropagation();
      this.toggleStar(starBtn).catch((err) => console.error("TOGGLE STAR ERROR", err));
      return;
    }

    const card = ev.target.closest(".card, .job-card");
    if (card) {
      const url = (card.dataset.url || "").trim();
      if (url) {
        try {
          window.open(url, "_blank", "noopener");
        } catch (err) {
          console.warn("OPEN URL ERROR", err);
        }
      }
    }
  }

  onContainerKeydown(ev) {
    const key = ev.key;
    if (key !== "Enter" && key !== " ") return;
    const el = ev.target;
    if (el.classList.contains("star-btn")) {
      el.click();
      ev.preventDefault();
      return;
    }

    const card = el.closest?.(".card, .job-card");
    if (card && !el.classList.contains("star-btn")) {
      const url = (card.dataset.url || "").trim();
      if (url) {
        try {
          window.open(url, "_blank", "noopener");
          ev.preventDefault();
        } catch (err) {
          console.warn("OPEN URL VIA KEY ERROR", err);
        }
      }
    }
  }

  async toggleStar(starBtn) {
    const card = starBtn.closest(".card, .job-card");
    if (!card) return;
    const id = card.dataset.id;
    if (!id) return;

    const seg = this.cardSegmentMap.get(id);
    if (!seg) return;
    const segId = seg.dataset.segId;
    const segSet = this.starredMap.get(segId) || new Set();

    if (!segSet.has(id) && segSet.size >= MAX_STARS) {
      const confirmRemove = window.confirm(
        `YOU CAN ONLY STAR UP TO ${MAX_STARS} CARDS IN THIS SECTION. REMOVE ONE TO ADD A NEW ONE!`
      );
      if (!confirmRemove) return;
      const oldest = segSet.values().next().value;
      if (oldest) segSet.delete(oldest);
    }

    if (segSet.has(id)) {
      segSet.delete(id);
      this.updateStarAttr(starBtn, false);
    } else {
      segSet.add(id);
      this.updateStarAttr(starBtn, true);
    }

    this.starredMap.set(segId, segSet);

    const toSave = {};
    for (const [k, set] of this.starredMap.entries()) {
      toSave[k] = Array.from(set);
    }
    await Storage.set(toSave);

    this.repositionCard(card);
  }

  reorderSegment(segmentEl) {
    if (!segmentEl) return;
    const cards = Array.from(segmentEl.querySelectorAll(".card, .job-card"));
    if (cards.length <= 1) return;

    const segId = segmentEl.dataset.segId;
    const segSet = this.starredMap.get(segId) || new Set();

    const starred = [];
    const unstarred = [];

    for (const c of cards) {
      const id = c.dataset.id;
      if (id && segSet.has(id)) starred.push(c);
      else unstarred.push(c);
    }

    unstarred.sort((a, b) => (Number(a.dataset.origIndex) || 0) - (Number(b.dataset.origIndex) || 0));

    const frag = document.createDocumentFragment();
    for (const item of starred) frag.appendChild(item);
    for (const item of unstarred) frag.appendChild(item);

    requestAnimationFrame(() => {
      try {
        segmentEl.appendChild(frag);
      } catch (err) {
        console.warn("REORDER SEGMENT ERROR", err);
      }
    });
  }

  repositionCard(card) {
    requestAnimationFrame(() => {
      try {
        const id = card.dataset.id;
        const segment = this.cardSegmentMap.get(id);
        if (!segment) return;
        const segId = segment.dataset.segId;
        const segSet = this.starredMap.get(segId) || new Set();

        const cards = Array.from(segment.querySelectorAll(".card, .job-card"));
        const isStarred = segSet.has(id);

        if (isStarred) {
          const firstUn = cards.find((c) => !segSet.has(c.dataset.id));
          firstUn ? segment.insertBefore(card, firstUn) : segment.appendChild(card);
        } else {
          const lastStarIdx = cards.reduce((acc, c, idx) => (segSet.has(c.dataset.id) ? idx : acc), -1);
          const origIndex = Number(card.dataset.origIndex) || 0;

          let beforeNode = null;
          for (let i = lastStarIdx + 1; i < cards.length; i++) {
            const cur = cards[i];
            if ((Number(cur.dataset.origIndex) || 0) > origIndex) {
              beforeNode = cur;
              break;
            }
          }

          beforeNode ? segment.insertBefore(card, beforeNode) : segment.appendChild(card);
        }
      } catch (err) {
        console.warn("REPOSITION CARD ERROR", err);
      }
    });
  }

  initJobFilters() {
    const filterContainer = document.querySelector(".job-filters");
    if (!filterContainer) return;

    const filterButtons = Array.from(filterContainer.querySelectorAll(".filter-btn"));
    const jobCards = Array.from(document.querySelectorAll(".job-card"));

    filterContainer.addEventListener(
      "click",
      (ev) => {
        const btn = ev.target.closest(".filter-btn");
        if (!btn) return;
        const filter = btn.dataset.filter ?? "all";

        filterButtons.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");

        for (const card of jobCards) {
          const type = card.dataset.type || "";
          const hide = !(filter === "all" || type === filter);
          card.classList.toggle("hidden", hide);
        }
      },
      { passive: true }
    );
  }

  initMenu() {
    const buttons = Array.from(document.querySelectorAll(".menu-btn"));
    const sections = Array.from(document.querySelectorAll(".section-container"));
    const menuSection = document.getElementById("mainSectionMenu");

    for (const btn of buttons) {
      btn.addEventListener("click", () => {
        const targetId = btn.dataset.target;
        const target = document.getElementById(targetId);
        if (!target) return;

        menuSection.classList.add("hidden");
        sections.forEach((sec) => sec.classList.add("hidden"));
        target.classList.remove("hidden");
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    }

    document.querySelectorAll(".back-btn").forEach((btn) =>
      btn.addEventListener("click", () => {
        document.querySelectorAll(".section-container").forEach((sec) => sec.classList.add("hidden"));
        menuSection.classList.remove("hidden");
        window.scrollTo({ top: 0, behavior: "smooth" });
      })
    );
  }

  destroy() {
    this.container.removeEventListener("click", this.onContainerClick);
    this.container.removeEventListener("keydown", this.onContainerKeydown);
    this.initialized = false;
  }
}

/* ============================================================
   STEP 5 — BOOTSTRAP APPLICATION
   ============================================================ */

(async function bootstrap() {
  try {
    const app = new OpenrootApp(document);
    await app.init();
    window.__openrootApp = app;
    console.log("✅ OPENROOT APP INITIALIZED FOR UID:", USER_UID);
  } catch (err) {
    console.error("APP INIT ERROR", err);
  }
})();
