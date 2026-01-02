/* =========================================================
   TENYEARS_ONEDAY - Products Page app.js (D FIX)
   - Fetch products from Google Apps Script JSON
   - Render category pills + product cards
   - Image modal supports multiple images + next/prev
   - Safe guards: no null crashes
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {
  const API_URL = "https://script.google.com/macros/s/AKfycbzTQDS9uZ67YPC3yu9B71Ba3WLwe6_4cL3tTe2ZhBcqi_SIjSbEqEbpB6pd2JpVg-hM/exec";

  // --- helpers ---
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const escapeHtml = (s) =>
    String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const ntd = (n) => {
    const num = Number(n);
    return Number.isFinite(num) ? num.toLocaleString("zh-TW") : "";
  };

  const normalizeImages = (images) => {
    if (!images) return [];
    if (Array.isArray(images)) return images.filter(Boolean).map(String);
    if (typeof images === "string") {
      const parts = images
        .split(/[,|\n]/g)
        .map((s) => s.trim())
        .filter(Boolean);
      return parts.length ? parts : [images.trim()];
    }
    return [];
  };

  const normalizeStyles = (styles) => {
    if (!styles) return [];
    if (Array.isArray(styles)) return styles.filter(Boolean).map(String);
    if (typeof styles === "string") {
      return styles
        .split(/\n|,|、/g)
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return [];
  };

  // --- state ---
  let ALL_PRODUCTS = [];
  let CURRENT_CAT = "全部";

  // --- elements (must exist in HTML) ---
  const categoryBar = document.getElementById("categoryBar");
  const productsGrid = document.getElementById("productsGrid");
  const imgModal = document.getElementById("imgModal");

  if (!productsGrid) {
    console.warn("Missing #productsGrid in HTML");
    return;
  }

  // --- modal (create inner) ---
  const ensureModalInner = () => {
    if (!imgModal) return null;

    if (imgModal.dataset.ready === "1") return imgModal;

    imgModal.style.display = "none";
    imgModal.style.position = "fixed";
    imgModal.style.inset = "0";
    imgModal.style.zIndex = "9999";
    imgModal.style.background = "rgba(0,0,0,0.45)";
    imgModal.style.padding = "16px";
    imgModal.style.alignItems = "center";
    imgModal.style.justifyContent = "center";

    imgModal.innerHTML = `
      <div class="tym-modal" style="width:min(920px,96vw); max-height:90vh; overflow:auto;
        border-radius:18px; background:rgba(255,255,255,0.95); border:1px solid rgba(0,0,0,0.10);
        box-shadow:0 26px 70px rgba(0,0,0,0.28);">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;
          padding:14px 16px; border-bottom:1px solid rgba(0,0,0,0.08);">
          <div id="imgTitle" style="font-weight:700; font-size:14px;">商品圖片</div>
          <button id="closeImg" style="border:0; background:transparent; font-size:22px; cursor:pointer;">×</button>
        </div>

        <div style="padding:14px 16px;">
          <div style="display:grid; grid-template-columns: 1fr; gap:12px;">
            <div style="position:relative;">
              <button id="imgPrev" aria-label="上一張"
                style="position:absolute; left:10px; top:50%; transform:translateY(-50%);
                  width:40px; height:40px; border-radius:999px; border:0; cursor:pointer;
                  background:rgba(255,255,255,0.75); backdrop-filter: blur(6px); display:none;">‹</button>
              <button id="imgNext" aria-label="下一張"
                style="position:absolute; right:10px; top:50%; transform:translateY(-50%);
                  width:40px; height:40px; border-radius:999px; border:0; cursor:pointer;
                  background:rgba(255,255,255,0.75); backdrop-filter: blur(6px); display:none;">›</button>

              <a id="imgLink" href="#" target="_blank" rel="noreferrer"
                style="display:block; border-radius:16px; overflow:hidden; border:1px solid rgba(0,0,0,0.10); background:#fff;">
                <img id="imgMain" alt="" style="width:100%; height:min(56vh,520px); object-fit:cover; display:block;">
              </a>
            </div>

            <div id="imgThumbs" style="display:flex; gap:10px; overflow:auto; padding-bottom:4px;"></div>

            <div id="imgDesc" style="font-size:13px; line-height:1.8; opacity:.86; white-space:pre-wrap;"></div>
          </div>
        </div>
      </div>
    `;

    imgModal.dataset.ready = "1";
    imgModal.style.display = "none";
    imgModal.style.display = "flex"; // for alignment baseline
    imgModal.style.display = "none";

    // close
    $("#closeImg", imgModal)?.addEventListener("click", closeModal);
    imgModal.addEventListener("click", (e) => {
      if (e.target === imgModal) closeModal();
    });

    document.addEventListener("keydown", (e) => {
      if (imgModal.style.display !== "flex") return;
      if (e.key === "Escape") closeModal();
      if (e.key === "ArrowLeft") stepModal(-1);
      if (e.key === "ArrowRight") stepModal(1);
    });

    return imgModal;
  };

  let modalImages = [];
  let modalIndex = 0;

  const renderModal = (product) => {
    const modal = ensureModalInner();
    if (!modal) return;

    modalImages = normalizeImages(product?.images);
    modalIndex = 0;

    const titleEl = $("#imgTitle", modal);
    const mainImg = $("#imgMain", modal);
    const linkEl = $("#imgLink", modal);
    const thumbs = $("#imgThumbs", modal);
    const descEl = $("#imgDesc", modal);
    const prevBtn = $("#imgPrev", modal);
    const nextBtn = $("#imgNext", modal);

    if (titleEl) titleEl.textContent = product?.name ? `商品圖片｜${product.name}` : "商品圖片";

    const desc = String(product?.description ?? "").trim();
    if (descEl) descEl.textContent = desc;

    const setIndex = (idx) => {
      if (!modalImages.length) return;
      modalIndex = (idx + modalImages.length) % modalImages.length;
      const src = modalImages[modalIndex];
      if (mainImg) mainImg.src = src;
      if (linkEl) linkEl.href = src;

      // highlight thumb
      if (thumbs) {
        $$("button[data-idx]", thumbs).forEach((b) => {
          b.style.outline = (Number(b.dataset.idx) === modalIndex) ? "2px solid rgba(34,52,40,0.85)" : "0";
          b.style.outlineOffset = "2px";
        });
      }
    };

    // thumbs
    if (thumbs) {
      thumbs.innerHTML = modalImages
        .map((src, i) => `
          <button data-idx="${i}" style="flex:0 0 auto; padding:0; border:0; background:transparent; cursor:pointer;">
            <img src="${escapeHtml(src)}" alt=""
              style="width:88px; height:64px; object-fit:cover; border-radius:12px; border:1px solid rgba(0,0,0,0.10); display:block;">
          </button>
        `)
        .join("");

      $$("button[data-idx]", thumbs).forEach((b) => {
        b.addEventListener("click", () => setIndex(Number(b.dataset.idx) || 0));
      });
    }

    const showNav = modalImages.length > 1;
    if (prevBtn) prevBtn.style.display = showNav ? "inline-flex" : "none";
    if (nextBtn) nextBtn.style.display = showNav ? "inline-flex" : "none";

    prevBtn?.addEventListener("click", () => stepModal(-1));
    nextBtn?.addEventListener("click", () => stepModal(1));

    // placeholder if no images
    if (!modalImages.length) {
      if (mainImg) {
        mainImg.removeAttribute("src");
        mainImg.alt = "No image";
        mainImg.style.objectFit = "contain";
        mainImg.style.background = "rgba(0,0,0,0.06)";
      }
      if (linkEl) linkEl.href = "#";
    } else {
      if (mainImg) {
        mainImg.style.objectFit = "cover";
        mainImg.style.background = "#fff";
      }
      setIndex(0);
    }

    imgModal.style.display = "flex";
  };

  const closeModal = () => {
    if (!imgModal) return;
    imgModal.style.display = "none";
  };

  const stepModal = (delta) => {
    if (!imgModal || imgModal.style.display !== "flex") return;
    if (!modalImages.length) return;
    const next = modalIndex + delta;
    // reuse setIndex by simulating click on thumb
    const modal = ensureModalInner();
    const thumbs = $("#imgThumbs", modal);
    const btn = thumbs?.querySelector(`button[data-idx="${(next + modalImages.length) % modalImages.length}"]`);
    if (btn) btn.click();
  };

  // --- UI builders ---
  const buildCategoryPills = () => {
    if (!categoryBar) return;

    const catsFromData = ALL_PRODUCTS
      .map((p) => String(p.category || "").trim())
      .filter(Boolean);

    // keep order you want
    const preset = ["全部", "項鍊", "手鏈", "耳環", "戒指"];
    const dynamic = Array.from(new Set(catsFromData)).filter((c) => !preset.includes(c));
    const cats = [...preset, ...dynamic].filter((c, i, a) => a.indexOf(c) === i);

    categoryBar.innerHTML = cats
      .map((c) => {
        const active = c === CURRENT_CAT;
        return `
          <button class="cat-pill" data-cat="${escapeHtml(c)}"
            style="flex:0 0 auto; padding:8px 14px; border-radius:999px; border:1px solid rgba(0,0,0,0.12);
              background:${active ? "rgba(34,52,40,0.88)" : "rgba(255,255,255,0.55)"};
              color:${active ? "#fff" : "rgba(40,40,40,0.86)"};
              font-size:13px; cursor:pointer; white-space:nowrap;">
            ${escapeHtml(c)}
          </button>
        `;
      })
      .join("");

    $$("button[data-cat]", categoryBar).forEach((btn) => {
      btn.addEventListener("click", () => {
        CURRENT_CAT = btn.dataset.cat || "全部";
        buildCategoryPills();
        renderProducts();
      });
    });
  };

  const renderProducts = () => {
    const list =
      CURRENT_CAT === "全部"
        ? ALL_PRODUCTS
        : ALL_PRODUCTS.filter((p) => String(p.category || "").trim() === CURRENT_CAT);

    if (!list.length) {
      productsGrid.innerHTML = `<div style="padding:14px 4px; opacity:.75; font-size:13px;">目前沒有商品。</div>`;
      return;
    }

    productsGrid.innerHTML = list
      .map((p) => {
        const imgs = normalizeImages(p.images);
        const cover = imgs[0] || "";
        const styles = normalizeStyles(p.styles);
        const hasStyles = styles.length > 0;

        return `
          <div class="product-card" style="border-radius:18px; background:rgba(255,255,255,0.55);
            border:1px solid rgba(0,0,0,0.08); overflow:hidden;">
            <button type="button" class="open-modal" data-key="${escapeHtml(p.id || p.name || "")}"
              style="border:0; background:transparent; padding:0; cursor:pointer; display:block; width:100%;">
              <div style="width:100%; height:220px; background:rgba(0,0,0,0.05);">
                ${
                  cover
                    ? `<img src="${escapeHtml(cover)}" alt="${escapeHtml(p.name || "")}"
                        style="width:100%; height:220px; object-fit:cover; display:block;">`
                    : `<div style="width:100%; height:220px; display:flex; align-items:center; justify-content:center; opacity:.5; font-size:12px;">No Image</div>`
                }
              </div>
            </button>

            <div style="padding:12px 12px 14px;">
              <div style="display:flex; justify-content:space-between; gap:10px;">
                <div style="min-width:0;">
                  <div style="font-size:13px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                    ${escapeHtml(p.name || "")}
                  </div>
                  <div style="margin-top:4px; font-size:12px; opacity:.65;">
                    ${escapeHtml(p.collection || "")}${p.collection && p.category ? " · " : ""}${escapeHtml(p.category || "")}
                    ${p.id ? " · " + escapeHtml(p.id) : ""}
                  </div>
                </div>
                <div style="text-align:right;">
                  <div style="font-size:13px; font-weight:700;">NT$ ${ntd(p.price)}</div>
                  ${p.status ? `<div style="margin-top:3px; font-size:11px; opacity:.6;">${escapeHtml(p.status)}</div>` : ""}
                </div>
              </div>

              ${
                hasStyles
                  ? `<div style="margin-top:10px;">
                      <div style="font-size:12px; opacity:.75; margin-bottom:6px;">款式</div>
                      <select data-style="${escapeHtml(p.id || p.name || "")}"
                        style="width:100%; padding:9px 10px; border-radius:12px; border:1px solid rgba(0,0,0,0.12); background:rgba(255,255,255,0.65);">
                        ${styles.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("")}
                      </select>
                    </div>`
                  : ""
              }

              <div style="margin-top:10px; display:flex; align-items:center; justify-content:space-between; gap:10px;">
                <div style="display:flex; align-items:center; gap:8px;">
                  <button type="button" data-dec="${escapeHtml(p.id || p.name || "")}"
                    style="width:30px; height:30px; border-radius:10px; border:1px solid rgba(0,0,0,0.15); background:#fff; cursor:pointer;">-</button>
                  <input data-qty="${escapeHtml(p.id || p.name || "")}" value="1" inputmode="numeric"
                    style="width:44px; height:30px; border-radius:10px; border:1px solid rgba(0,0,0,0.15); text-align:center;">
                  <button type="button" data-inc="${escapeHtml(p.id || p.name || "")}"
                    style="width:30px; height:30px; border-radius:10px; border:1px solid rgba(0,0,0,0.15); background:#fff; cursor:pointer;">+</button>
                </div>

                <button type="button" class="add-cart" data-key="${escapeHtml(p.id || p.name || "")}"
                  style="padding:10px 12px; border-radius:14px; border:0; background:rgba(34,52,40,0.88); color:#fff; cursor:pointer; font-size:13px; white-space:nowrap;">
                  加入購物車
                </button>
              </div>
            </div>
          </div>
        `;
      })
      .join("");

    // bind modal open
    $$(".open-modal", productsGrid).forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.key;
        const product = ALL_PRODUCTS.find((x) => String(x.id || x.name) === String(key));
        if (product) renderModal(product);
      });
    });

    // qty controls
    const getQtyInput = (key) => productsGrid.querySelector(`input[data-qty="${CSS.escape(key)}"]`);

    $$("button[data-inc]", productsGrid).forEach((b) => {
      b.addEventListener("click", () => {
        const key = b.dataset.inc;
        const inp = getQtyInput(key);
        if (!inp) return;
        const v = Number(String(inp.value).replace(/[^\d]/g, "")) || 1;
        inp.value = String(Math.min(99, v + 1));
      });
    });

    $$("button[data-dec]", productsGrid).forEach((b) => {
      b.addEventListener("click", () => {
        const key = b.dataset.dec;
        const inp = getQtyInput(key);
        if (!inp) return;
        const v = Number(String(inp.value).replace(/[^\d]/g, "")) || 1;
        inp.value = String(Math.max(1, v - 1));
      });
    });

    $$("input[data-qty]", productsGrid).forEach((inp) => {
      inp.addEventListener("change", () => {
        const v = Number(String(inp.value).replace(/[^\d]/g, "")) || 1;
        inp.value = String(Math.max(1, Math.min(99, v)));
      });
    });

    // add-to-cart (if your site has cart implementation, hook here; otherwise no-op)
    $$(".add-cart", productsGrid).forEach((btn) => {
      btn.addEventListener("click", () => {
        // If you already have cart logic elsewhere, you can replace this block.
        alert("已加入購物車（示範版）");
      });
    });
  };

  // --- fetch ---
  const fetchData = async () => {
    try {
      const res = await fetch(API_URL, { cache: "no-store" });
      const data = await res.json();
      const products = Array.isArray(data.products) ? data.products : [];
      // only show "上架" by default if status exists
      ALL_PRODUCTS = products.filter((p) => !p.status || String(p.status).trim() !== "下架");
      buildCategoryPills();
      renderProducts();
    } catch (e) {
      console.error(e);
      productsGrid.innerHTML = `
        <div style="padding:14px 4px; border-radius:14px; border:1px solid rgba(255,0,0,0.15); background:rgba(255,0,0,0.06);">
          <div style="font-weight:700; font-size:13px;">商品資料載入失敗</div>
          <div style="margin-top:6px; font-size:12px; opacity:.8; line-height:1.7;">
            請確認 Google Apps Script Web App 可公開存取，並回傳 JSON。<br>
            （按 F12 → Console 可看到詳細錯誤）
          </div>
        </div>
      `;
    }
  };

  fetchData();
});
