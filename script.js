// ============================================================
// OPENROOT HH SCRIPT — PRODUCTION VERSION (ES2023+)
// VERSION: 1.3.3 — FIX: STAR TOGGLE RELIABILITY + DEBUG
// ============================================================

/* ============================================================
   STEP 1 — IDENTIFY USER (VIA ?uid=XYZ OR SITE STORAGE)
   ============================================================ */

let USER_UID = null;

const urlParams = new URLSearchParams(window.location.search);
const uidFromUrl = urlParams.get("uid") || urlParams.get("user") || null;

const uidFromMainSite =
  (typeof window !== "undefined" && (localStorage.getItem("openrootUserUID") || sessionStorage.getItem("openrootUserUID"))) ||
  null;

const cachedUid = (typeof window !== "undefined" && localStorage.getItem("openroot_current_uid")) || null;

// Resolve UID priority: URL -> main-site -> cached -> guest
if (uidFromUrl) {
  USER_UID = decodeURIComponent(uidFromUrl);
} else if (uidFromMainSite) {
  USER_UID = uidFromMainSite;
} else if (cachedUid) {
  USER_UID = cachedUid;
} else {
  USER_UID = "guest_user";
}

try {
  if (USER_UID && USER_UID !== cachedUid) {
    localStorage.setItem("openroot_current_uid", USER_UID);
  }
} catch (e) {
  console.warn("UID persist failed:", e);
}

// Listen for storage changes of UID and reload to sync state
window.addEventListener("storage", (ev) => {
  try {
    if (ev.key === "openrootUserUID" || ev.key === "openroot_current_uid") {
      const newUid = ev.newValue;
      if (!newUid) return;
      if (newUid !== USER_UID) {
        console.log("🔁 Detected UID change via storage. Reloading subsite for UID:", newUid);
        localStorage.setItem("openroot_current_uid", newUid);
        setTimeout(() => window.location.reload(), 80);
      }
    }
  } catch (err) {
    console.warn("Storage event handler error:", err);
  }
});

/* ============================================================
   STEP 2 — DEFINE STORAGE KEY (UNIQUE PER USER)
   ============================================================ */

const MAX_STARS = 5;
const getStorageKey = () => `starredCards_${USER_UID}`;

console.log("✅ OPENROOT APP INITIALIZED FOR UID:", USER_UID);

/* ============================================================
   STEP 3 — STORAGE HANDLER (SAFE LOCAL STORAGE ACCESS)
   ============================================================ */

const Storage = {
  async get(fallback = {}) {
    try {
      const key = getStorageKey();
      const raw = localStorage.getItem(key);
      console.debug("Storage.get key=", key, "raw=", raw);
      return raw ? JSON.parse(raw) : fallback;
    } catch (err) {
      console.warn("STORAGE.GET ERROR:", err);
      return fallback;
    }
  },
  async set(value) {
    try {
      const key = getStorageKey();
      localStorage.setItem(key, JSON.stringify(value));
      console.debug("Storage.set key=", key, "value=", value);
    } catch (err) {
      console.warn("STORAGE.SET ERROR:", err);
    }
  },
};

/* ============================================================
   STEP 4 — MAIN APP CLASS (with defensive fixes)
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

    // LOAD USER-STORED STARRED DATA (per-user key)
    const saved = await Storage.get({});
    if (saved && typeof saved === "object") {
      for (const [segId, ids] of Object.entries(saved)) {
        try {
          this.starredMap.set(segId, new Set(ids));
        } catch (e) {
          console.warn("Failed to restore segment set for", segId, e);
        }
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
      if (!seg.dataset.segId) {
        const label = seg.getAttribute("id") || seg.className || "segment";
        seg.dataset.segId = label.replace(/\s+/g, "_").toLowerCase();
      }

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
    // Debug: show what was clicked
    try {
      const clicked = ev.target;
      console.debug("onContainerClick target:", clicked);
    } catch {}

    const starBtn = ev.target.closest(".star-btn");
    if (starBtn) {
      ev.stopPropagation();
      try {
        console.debug("Star button clicked:", starBtn);
        // call toggle with defensive try/catch
        this.toggleStar(starBtn).catch((err) => console.error("TOGGLE STAR ERROR", err));
      } catch (err) {
        console.error("Error running toggleStar:", err);
      }
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
    try {
      const card = starBtn.closest(".card, .job-card");
      if (!card) {
        console.warn("toggleStar: no card container found for starBtn");
        return;
      }
      const id = card.dataset.id;
      if (!id) {
        console.warn("toggleStar: card has no dataset.id");
        return;
      }

      const seg = this.cardSegmentMap.get(id);
      if (!seg) {
        console.warn("toggleStar: no segment found for card id", id);
        return;
      }
      const segId = seg.dataset.segId;

      // Ensure segment's Set exists
      if (!this.starredMap.has(segId)) this.starredMap.set(segId, new Set());
      const segSet = this.starredMap.get(segId);

      // Enforce max / remove oldest if needed
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

      // Save (defensive)
      try {
        await Storage.set(toSave);
      } catch (err) {
        console.warn("Failed to save starredMap:", err);
      }

      this.repositionCard(card);
    } catch (err) {
      console.error("toggleStar top-level error:", err);
    }
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
  } catch (err) {
    console.error("APP INIT ERROR", err);
  }
})();
