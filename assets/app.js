/* =========================================================
   TENYEARS_ONEDAY - app.js (D 完整版)
   - 讀取 Google Apps Script JSON (products / notice / discount)
   - 產品列表：分類篩選、圖片放大 modal、加入購物車、數量調整
   - 公告：顯示 active 的公告
   - 購物車：側邊抽屜、繼續購物、結帳摘要
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {
  // ====== 基本設定 ======
  const STORE_KEY = "tenyears_oneday_cart_v1";

  // 你的外部連結
  const IG_URL =
    "https://www.instagram.com/tenyears_oneday?igsh=MW9hcjBnaTdjNzc0MQ%3D%3D&utm_source=qr";
  const LINE_URL = "https://line.me/R/ti/p/@396kwrga";

  // 你的 GAS Web App (你已提供)
  const API_URL =
    "https://script.google.com/macros/s/AKfycbzTQDS9uZ67YPC3yu9B71Ba3WLwe6_4cL3tTe2ZhBcqi_SIjSbEqEbpB6pd2JpVg-hM/exec";

  // ====== DOM 目標：容器 ID（若你的 HTML 已有，會直接用；沒有就自動建立） ======
  const IDS = {
    // 產品區
    productsWrap: "productsWrap",
    productsGrid: "productsGrid",
    // 公告
    noticeWrap: "noticeWrap",
    // 分類 pills
    categoryBar: "categoryBar",
    // 購物車抽屜
    cartDrawer: "cartDrawer",
    cartItems: "cartItems",
    cartCount: "cartCount",
    cartSubtotal: "cartSubtotal",
    cartCheckoutBtn: "cartCheckoutBtn",
    // 右上 icon
    iconIG: "iconIG",
    iconLINE: "iconLINE",
    iconCart: "iconCart",
    iconSearch: "iconSearch",
    iconMember: "iconMember",
    // 圖片 modal
    imgModal: "imgModal",
    imgTitle: "imgTitle",
    imgBody: "imgBody",
    closeImg: "closeImg",
  };

  // ====== 全域狀態 ======
  let ALL_PRODUCTS = [];
  let ACTIVE_NOTICE = [];
  let DISCOUNT = [];
  let CURRENT_CATEGORY = "全部";

  // ====== 小工具 ======
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
    if (!Number.isFinite(num)) return "";
    return num.toLocaleString("zh-TW");
  };

  const ensureEl = (id, tag = "div", parent = document.body, opts = {}) => {
    let el = document.getElementById(id);
    if (el) return el;
    el = document.createElement(tag);
    el.id = id;
    if (opts.className) el.className = opts.className;
    if (opts.style) el.setAttribute("style", opts.style);
    parent.appendChild(el);
    return el;
  };

  const ensureMainLayoutIfMissing = () => {
    // 優先找 main/容器
    const main =
      $("main") ||
      $(".container") ||
      $(".wrap") ||
      document.body;

    // 產品主容器
    const productsWrap = ensureEl(IDS.productsWrap, "section", main, {
      className: "products-wrap",
      style: "margin: 24px auto; max-width: 1100px; padding: 0 18px;",
    });

    // 分類 bar
    ensureEl(IDS.categoryBar, "div", productsWrap, {
      className: "category-bar",
      style:
        "display:flex; gap:10px; flex-wrap:nowrap; overflow:auto; padding:10px 4px 16px; -webkit-overflow-scrolling:touch;",
    });

    // 產品 grid
    ensureEl(IDS.productsGrid, "div", productsWrap, {
      className: "products-grid",
      style:
        "display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); gap:14px; padding-bottom: 16px;",
    });

    // 公告容器：放在上面內容區（找 hero/card 下面）
    const hero =
      $(".hero") ||
      $(".home-hero") ||
      $(".card") ||
      main;

    ensureEl(IDS.noticeWrap, "div", hero, {
      className: "notice-wrap",
      style: "margin: 16px auto; max-width: 1100px; padding: 0 18px;",
    });

    // 購物車抽屜
    ensureCartDrawer();

    // 圖片 modal
    ensureImgModal();

    // 右上 icon 連結（如果 HTML 沒有，這裡不強塞，只做「有就綁」）
  };

  const ensureCartDrawer = () => {
    let drawer = document.getElementById(IDS.cartDrawer);
    if (drawer) return drawer;

    drawer = document.createElement("div");
    drawer.id = IDS.cartDrawer;
    drawer.setAttribute(
      "style",
      [
        "position:fixed",
        "top:0",
        "right:0",
        "height:100vh",
        "width:min(420px, 92vw)",
        "background:rgba(255,255,255,0.95)",
        "backdrop-filter: blur(10px)",
        "border-left:1px solid rgba(0,0,0,0.08)",
        "transform: translateX(110%)",
        "transition: transform .25s ease",
        "z-index:9999",
        "display:flex",
        "flex-direction:column",
      ].join(";")
    );

    drawer.innerHTML = `
      <div style="padding:16px 16px 10px; display:flex; align-items:center; justify-content:space-between; gap:12px;">
        <div style="font-weight:600; letter-spacing:.02em;">購物車</div>
        <button id="cartCloseBtn" style="border:0; background:transparent; font-size:20px; cursor:pointer;">×</button>
      </div>

      <div id="${IDS.cartItems}" style="padding: 0 16px 16px; overflow:auto; flex: 1;"></div>

      <div style="padding: 12px 16px 16px; border-top:1px solid rgba(0,0,0,0.08);">
        <div style="display:flex; justify-content:space-between; margin-bottom:10px; font-size:14px;">
          <div>小計</div>
          <div><span>NT$</span><span id="${IDS.cartSubtotal}">0</span></div>
        </div>

        <div style="display:flex; gap:10px;">
          <button id="cartContinueBtn"
            style="flex:1; padding:10px 12px; border-radius:12px; border:1px solid rgba(0,0,0,0.15); background:transparent; cursor:pointer;">
            繼續購物
          </button>
          <button id="${IDS.cartCheckoutBtn}"
            style="flex:1; padding:10px 12px; border-radius:12px; border:0; background:rgba(34,52,40,.88); color:#fff; cursor:pointer;">
            前往結帳
          </button>
        </div>

        <div style="margin-top:10px; font-size:12px; opacity:.7;">
          登入會員（待接會員功能）
        </div>
      </div>
    `;

    document.body.appendChild(drawer);

    // Close handlers
    $("#cartCloseBtn").addEventListener("click", closeCart);
    $("#cartContinueBtn").addEventListener("click", closeCart);

    // Click overlay close (optional)
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeCart();
        closeImgModal();
      }
    });

    // Checkout button (目前示範)
    document
      .getElementById(IDS.cartCheckoutBtn)
      .addEventListener("click", () => {
        alert("結帳流程（可接 Stripe / 或你的結帳頁）");
      });

    return drawer;
  };

  const ensureImgModal = () => {
    let modal = document.getElementById(IDS.imgModal);
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = IDS.imgModal;
    modal.setAttribute(
      "style",
      [
        "position:fixed",
        "inset:0",
        "background: rgba(0,0,0,0.35)",
        "display:none",
        "align-items:center",
        "justify-content:center",
        "z-index:9998",
        "padding: 18px",
      ].join(";")
    );

    modal.innerHTML = `
      <div style="width:min(900px, 96vw); max-height: 90vh; overflow:auto; background:rgba(255,255,255,0.92); border-radius:18px; border:1px solid rgba(0,0,0,0.10); box-shadow: 0 22px 60px rgba(0,0,0,0.20);">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; padding: 14px 16px; border-bottom: 1px solid rgba(0,0,0,0.08);">
          <h3 id="${IDS.imgTitle}" style="margin:0; font-size:15px; font-weight:600;">商品圖片</h3>
          <button id="${IDS.closeImg}" style="border:0; background:transparent; font-size:20px; cursor:pointer;">×</button>
        </div>
        <div id="${IDS.imgBody}" style="padding: 14px 16px;"></div>
      </div>
    `;

    document.body.appendChild(modal);

    document.getElementById(IDS.closeImg).addEventListener("click", closeImgModal);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeImgModal();
    });

    return modal;
  };

  const openImgModal = (product) => {
    ensureImgModal();
    const modal = document.getElementById(IDS.imgModal);
    const title = document.getElementById(IDS.imgTitle);
    const body = document.getElementById(IDS.imgBody);

    title.textContent = product?.name ? `商品圖片｜${product.name}` : "商品圖片";

    const imgs = normalizeImages(product?.images);
    const desc = escapeHtml(product?.description || "");

    body.innerHTML = `
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px;">
        ${imgs
          .map(
            (src) => `
          <a href="${escapeHtml(src)}" target="_blank" rel="noreferrer"
             style="display:block; border-radius: 14px; overflow:hidden; border:1px solid rgba(0,0,0,0.08); background:#fff;">
            <img src="${escapeHtml(src)}" alt="" style="width:100%; height: 260px; object-fit: cover; display:block;">
          </a>`
          )
          .join("")}
      </div>
      ${
        desc
          ? `<div style="margin-top:12px; font-size:13px; line-height:1.75; opacity:.85; white-space:pre-wrap;">${desc}</div>`
          : ""
      }
    `;

    modal.style.display = "flex";
  };

  const closeImgModal = () => {
    const modal = document.getElementById(IDS.imgModal);
    if (!modal) return;
    modal.style.display = "none";
  };

  // ====== 連結 icons（若 HTML 有這些 id，就自動綁） ======
  const bindTopIconsIfExist = () => {
    const ig = document.getElementById(IDS.iconIG);
    if (ig) {
      ig.addEventListener("click", (e) => {
        e.preventDefault();
        window.open(IG_URL, "_blank", "noopener");
      });
    }

    const line = document.getElementById(IDS.iconLINE);
    if (line) {
      line.addEventListener("click", (e) => {
        e.preventDefault();
        window.open(LINE_URL, "_blank", "noopener");
      });
    }

    const cart = document.getElementById(IDS.iconCart);
    if (cart) {
      cart.addEventListener("click", (e) => {
        e.preventDefault();
        openCart();
      });
    }

    const search = document.getElementById(IDS.iconSearch);
    if (search) {
      search.addEventListener("click", (e) => {
        e.preventDefault();
        const kw = prompt("搜尋商品名稱：");
        if (kw == null) return;
        const k = kw.trim();
        if (!k) return;
        renderProducts(
          ALL_PRODUCTS.filter((p) => String(p.name || "").includes(k))
        );
        scrollToProducts();
      });
    }

    const member = document.getElementById(IDS.iconMember);
    if (member) {
      member.addEventListener("click", (e) => {
        e.preventDefault();
        alert("會員功能（待接）");
      });
    }
  };

  // ====== Cart ======
  const loadCart = () => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  };

  const saveCart = (cart) => {
    localStorage.setItem(STORE_KEY, JSON.stringify(cart));
    updateCartBadge();
  };

  const updateCartBadge = () => {
    const badge = document.getElementById(IDS.cartCount);
    if (!badge) return;
    const cart = loadCart();
    const totalQty = cart.reduce((sum, it) => sum + (Number(it.qty) || 0), 0);
    badge.textContent = String(totalQty);
    badge.style.display = totalQty > 0 ? "inline-flex" : "none";
  };

  const addToCart = (product, styleName = "", qty = 1) => {
    const cart = loadCart();
    const key = `${product.id || product.name || "item"}__${styleName || ""}`;
    const idx = cart.findIndex((x) => x.key === key);

    const price = Number(product.price) || 0;
    const item = {
      key,
      id: product.id || "",
      name: product.name || "",
      style: styleName || "",
      price,
      image: normalizeImages(product.images)[0] || "",
      qty: Math.max(1, Number(qty) || 1),
    };

    if (idx >= 0) {
      cart[idx].qty += item.qty;
    } else {
      cart.push(item);
    }
    saveCart(cart);
    renderCart();
    openCart();
  };

  const removeFromCart = (key) => {
    const cart = loadCart().filter((x) => x.key !== key);
    saveCart(cart);
    renderCart();
  };

  const setCartQty = (key, qty) => {
    const cart = loadCart();
    const idx = cart.findIndex((x) => x.key === key);
    if (idx < 0) return;
    cart[idx].qty = Math.max(1, Number(qty) || 1);
    saveCart(cart);
    renderCart();
  };

  const calcSubtotal = () => {
    const cart = loadCart();
    return cart.reduce((sum, it) => sum + (Number(it.price) || 0) * (Number(it.qty) || 0), 0);
  };

  const openCart = () => {
    ensureCartDrawer();
    document.getElementById(IDS.cartDrawer).style.transform = "translateX(0)";
    renderCart();
  };

  const closeCart = () => {
    const drawer = document.getElementById(IDS.cartDrawer);
    if (!drawer) return;
    drawer.style.transform = "translateX(110%)";
  };

  const renderCart = () => {
    ensureCartDrawer();
    const wrap = document.getElementById(IDS.cartItems);
    const subtotalEl = document.getElementById(IDS.cartSubtotal);

    const cart = loadCart();
    const subtotal = calcSubtotal();
    subtotalEl.textContent = ntd(subtotal);

    if (!cart.length) {
      wrap.innerHTML = `<div style="padding: 14px 2px; font-size:13px; opacity:.7;">購物車目前是空的。</div>`;
      return;
    }

    wrap.innerHTML = cart
      .map((it) => {
        const title = escapeHtml(it.name);
        const st = it.style ? ` <span style="opacity:.65;">(${escapeHtml(it.style)})</span>` : "";
        const img = it.image
          ? `<img src="${escapeHtml(it.image)}" alt="" style="width:56px;height:56px;border-radius:12px;object-fit:cover;border:1px solid rgba(0,0,0,0.08);">`
          : `<div style="width:56px;height:56px;border-radius:12px;background:rgba(0,0,0,0.06);"></div>`;
        const price = Number(it.price) || 0;
        const qty = Number(it.qty) || 1;
        const line = price * qty;

        return `
          <div style="display:flex; gap:10px; padding:12px 0; border-bottom:1px solid rgba(0,0,0,0.08); align-items:flex-start;">
            ${img}
            <div style="flex:1; min-width: 0;">
              <div style="font-size:13px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                ${title}${st}
              </div>
              <div style="margin-top:6px; display:flex; align-items:center; justify-content:space-between; gap:10px;">
                <div style="font-size:12px; opacity:.75;">NT$ ${ntd(price)}</div>
                <div style="display:flex; align-items:center; gap:8px;">
                  <button data-cart-dec="${escapeHtml(it.key)}"
                    style="width:28px;height:28px;border-radius:10px;border:1px solid rgba(0,0,0,0.15);background:#fff;cursor:pointer;">-</button>
                  <input data-cart-qty="${escapeHtml(it.key)}" value="${qty}" inputmode="numeric"
                    style="width:42px;height:28px;border-radius:10px;border:1px solid rgba(0,0,0,0.15);text-align:center;">
                  <button data-cart-inc="${escapeHtml(it.key)}"
                    style="width:28px;height:28px;border-radius:10px;border:1px solid rgba(0,0,0,0.15);background:#fff;cursor:pointer;">+</button>
                </div>
              </div>

              <div style="margin-top:8px; display:flex; align-items:center; justify-content:space-between;">
                <div style="font-size:12px; opacity:.85;">小計：NT$ ${ntd(line)}</div>
                <button data-cart-remove="${escapeHtml(it.key)}"
                  style="border:0;background:transparent; font-size:12px; opacity:.6; cursor:pointer; text-decoration:underline;">
                  移除
                </button>
              </div>
            </div>
          </div>
        `;
      })
      .join("");

    // Bind cart controls
    $$("[data-cart-remove]", wrap).forEach((btn) => {
      btn.addEventListener("click", () => removeFromCart(btn.dataset.cartRemove));
    });
    $$("[data-cart-inc]", wrap).forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.cartInc;
        const cart = loadCart();
        const it = cart.find((x) => x.key === key);
        if (!it) return;
        setCartQty(key, (Number(it.qty) || 1) + 1);
      });
    });
    $$("[data-cart-dec]", wrap).forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.cartDec;
        const cart = loadCart();
        const it = cart.find((x) => x.key === key);
        if (!it) return;
        setCartQty(key, Math.max(1, (Number(it.qty) || 1) - 1));
      });
    });
    $$("[data-cart-qty]", wrap).forEach((inp) => {
      inp.addEventListener("change", () => {
        const key = inp.dataset.cartQty;
        const v = Number(String(inp.value).replace(/[^\d]/g, "")) || 1;
        inp.value = String(v);
        setCartQty(key, v);
      });
    });
  };

  // ====== Products ======
  const normalizeImages = (images) => {
    if (!images) return [];
    if (Array.isArray(images)) return images.filter(Boolean).map(String);
    if (typeof images === "string") {
      // 允許用 , 或 | 分隔
      const parts = images.split(/[,|]/g).map((s) => s.trim()).filter(Boolean);
      return parts.length ? parts : [images];
    }
    return [];
  };

  const normalizeStyles = (styles) => {
    if (!styles) return [];
    if (Array.isArray(styles)) return styles.filter(Boolean).map(String);
    if (typeof styles === "string") {
      // 允許「隔行」或逗號
      const parts = styles
        .split(/\n|,|、/g)
        .map((s) => s.trim())
        .filter(Boolean);
      return parts;
    }
    return [];
  };

  const uniq = (arr) => Array.from(new Set(arr));

  const buildCategoryPills = (products) => {
    const bar = document.getElementById(IDS.categoryBar);
    if (!bar) return;

    // 你希望的分類：全部、項鍊、手鏈、耳環、戒指（可由 products 推出）
    const cats = uniq(
      ["全部", ...products.map((p) => String(p.category || "").trim()).filter(Boolean)]
    );

    bar.innerHTML = cats
      .map((c) => {
        const active = c === CURRENT_CATEGORY;
        return `
          <button data-cat="${escapeHtml(c)}"
            style="
              flex: 0 0 auto;
              padding: 8px 14px;
              border-radius: 999px;
              border: 1px solid rgba(0,0,0,0.12);
              background: ${active ? "rgba(34,52,40,0.85)" : "rgba(255,255,255,0.45)"};
              color: ${active ? "#fff" : "rgba(40,40,40,0.85)"};
              font-size: 13px;
              cursor: pointer;
              white-space: nowrap;
            ">
            ${escapeHtml(c)}
          </button>
        `;
      })
      .join("");

    $$("button[data-cat]", bar).forEach((btn) => {
      btn.addEventListener("click", () => {
        CURRENT_CATEGORY = btn.dataset.cat || "全部";
        const filtered =
          CURRENT_CATEGORY === "全部"
            ? ALL_PRODUCTS
            : ALL_PRODUCTS.filter((p) => String(p.category || "") === CURRENT_CATEGORY);
        buildCategoryPills(ALL_PRODUCTS);
        renderProducts(filtered);
        scrollToProducts();
      });
    });
  };

  const renderProducts = (products) => {
    const grid = document.getElementById(IDS.productsGrid);
    if (!grid) return;

    if (!products.length) {
      grid.innerHTML = `<div style="padding: 14px 4px; opacity:.7; font-size:13px;">目前沒有商品。</div>`;
      return;
    }

    grid.innerHTML = products
      .map((p) => {
        const name = escapeHtml(p.name || "");
        const id = escapeHtml(p.id || "");
        const category = escapeHtml(p.category || "");
        const collection = escapeHtml(p.collection || "");
        const status = String(p.status || "").trim();
        const price = Number(p.price) || 0;

        const imgs = normalizeImages(p.images);
        const cover = imgs[0] || "";

        const styles = normalizeStyles(p.styles);
        const hasStyles = styles.length > 0;

        return `
          <div class="product-card"
               style="border-radius:18px; background: rgba(255,255,255,0.55); border:1px solid rgba(0,0,0,0.08); overflow:hidden;">
            <button data-open-modal="${escapeHtml(p.id || p.name || "")}"
                    style="border:0; background:transparent; padding:0; cursor:pointer; display:block; width:100%;">
              <div style="width:100%; height: 220px; background: rgba(0,0,0,0.05);">
                ${
                  cover
                    ? `<img src="${escapeHtml(cover)}" alt="${name}"
                         style="width:100%; height:220px; object-fit:cover; display:block;">`
                    : `<div style="width:100%; height:220px; display:flex; align-items:center; justify-content:center; opacity:.45; font-size:12px;">No Image</div>`
                }
              </div>
            </button>

            <div style="padding: 12px 12px 12px;">
              <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:10px;">
                <div style="min-width:0;">
                  <div style="font-size:13px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                    ${name}
                  </div>
                  <div style="margin-top:4px; font-size:12px; opacity:.65;">
                    ${collection ? `${collection}` : ""}${category ? ` · ${category}` : ""}
                    ${id ? ` · ${id}` : ""}
                  </div>
                </div>

                <div style="text-align:right;">
                  <div style="font-size:13px; font-weight:700;">NT$ ${ntd(price)}</div>
                  ${
                    status
                      ? `<div style="margin-top:3px; font-size:11px; opacity:.6;">${escapeHtml(status)}</div>`
                      : ""
                  }
                </div>
              </div>

              ${
                hasStyles
                  ? `
                <div style="margin-top:10px;">
                  <div style="font-size:12px; opacity:.75; margin-bottom:6px;">款式</div>
                  <select data-style-select="${escapeHtml(p.id || p.name || "")}"
                          style="width:100%; padding:9px 10px; border-radius:12px; border:1px solid rgba(0,0,0,0.12); background: rgba(255,255,255,0.65);">
                    ${styles
                      .map((s, idx) => `<option value="${escapeHtml(s)}"${idx === 0 ? " selected" : ""}>${escapeHtml(s)}</option>`)
                      .join("")}
                  </select>
                </div>`
                  : ""
              }

              <div style="margin-top:10px; display:flex; align-items:center; justify-content:space-between; gap:10px;">
                <div style="display:flex; align-items:center; gap:8px;">
                  <button data-qty-dec="${escapeHtml(p.id || p.name || "")}"
                    style="width:30px;height:30px;border-radius:10px;border:1px solid rgba(0,0,0,0.15);background:#fff;cursor:pointer;">-</button>
                  <input data-qty-input="${escapeHtml(p.id || p.name || "")}" value="1" inputmode="numeric"
                    style="width:44px;height:30px;border-radius:10px;border:1px solid rgba(0,0,0,0.15);text-align:center;">
                  <button data-qty-inc="${escapeHtml(p.id || p.name || "")}"
                    style="width:30px;height:30px;border-radius:10px;border:1px solid rgba(0,0,0,0.15);background:#fff;cursor:pointer;">+</button>
                </div>

                <button data-add-cart="${escapeHtml(p.id || p.name || "")}"
                  style="padding: 10px 12px; border-radius: 14px; border:0; background: rgba(34,52,40,0.85); color:#fff; cursor:pointer; font-size:13px; white-space:nowrap;">
                  加入購物車
                </button>
              </div>
            </div>
          </div>
        `;
      })
      .join("");

    // Bind: open modal
    $$("[data-open-modal]", grid).forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.openModal;
        const product = ALL_PRODUCTS.find((p) => (p.id || p.name) == key);
        if (product) openImgModal(product);
      });
    });

    // Bind qty controls
    const getQtyInput = (key) => $(`[data-qty-input="${CSS.escape(key)}"]`, grid);
    $$("[data-qty-inc]", grid).forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.qtyInc;
        const inp = getQtyInput(key);
        if (!inp) return;
        const v = Number(String(inp.value).replace(/[^\d]/g, "")) || 1;
        inp.value = String(Math.min(99, v + 1));
      });
    });
    $$("[data-qty-dec]", grid).forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.qtyDec;
        const inp = getQtyInput(key);
        if (!inp) return;
        const v = Number(String(inp.value).replace(/[^\d]/g, "")) || 1;
        inp.value = String(Math.max(1, v - 1));
      });
    });
    $$("[data-qty-input]", grid).forEach((inp) => {
      inp.addEventListener("change", () => {
        const v = Number(String(inp.value).replace(/[^\d]/g, "")) || 1;
        inp.value = String(Math.max(1, Math.min(99, v)));
      });
    });

    // Bind add to cart
    $$("[data-add-cart]", grid).forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.addCart;
        const product = ALL_PRODUCTS.find((p) => (p.id || p.name) == key);
        if (!product) return;

        const qtyInp = getQtyInput(key);
        const qty = qtyInp ? Number(String(qtyInp.value).replace(/[^\d]/g, "")) || 1 : 1;

        let styleName = "";
        const sel = $(`[data-style-select="${CSS.escape(key)}"]`, grid);
        if (sel) styleName = sel.value || "";

        addToCart(product, styleName, qty);
      });
    });
  };

  const scrollToProducts = () => {
    const wrap = document.getElementById(IDS.productsWrap);
    if (!wrap) return;
    wrap.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // ====== Notice ======
  const renderNotice = (noticeArr) => {
    const wrap = document.getElementById(IDS.noticeWrap);
    if (!wrap) return;

    const list = Array.isArray(noticeArr) ? noticeArr : [];
    const active = list.filter((n) => String(n.active).toLowerCase() !== "false" && n.active !== 0);

    ACTIVE_NOTICE = active;

    if (!active.length) {
      wrap.innerHTML = "";
      return;
    }

    wrap.innerHTML = active
      .map((n) => {
        const title = escapeHtml(n.title || "公告");
        const content = escapeHtml(n.content || "");
        return `
          <div style="
            margin: 10px 0;
            padding: 12px 14px;
            border-radius: 16px;
            border: 1px solid rgba(241, 196, 15, 0.35);
            background: rgba(241, 196, 15, 0.13);
          ">
            <div style="display:flex; align-items:center; gap:10px;">
              <span style="display:inline-flex; align-items:center; justify-content:center; width:40px; height:22px;
                border-radius: 999px; border:1px solid rgba(241,196,15,.45); background: rgba(255,255,255,.35);
                font-size:12px; opacity:.9;">公告</span>
              <div style="font-weight:700; font-size:13px;">${title}</div>
            </div>
            ${content ? `<div style="margin-top:8px; font-size:12.5px; line-height:1.75; opacity:.85; white-space:pre-wrap;">${content}</div>` : ""}
          </div>
        `;
      })
      .join("");
  };

  // ====== Fetch API ======
  const fetchData = async () => {
    try {
      const res = await fetch(API_URL, { cache: "no-store" });
      const data = await res.json();
      console.log("API 回來的資料", data);

      // Products
      ALL_PRODUCTS = Array.isArray(data.products) ? data.products : [];
      // Notice
      const notice = Array.isArray(data.notice) ? data.notice : [];
      // Discount
      DISCOUNT = Array.isArray(data.discount) ? data.discount : [];
      window.DISCOUNT = DISCOUNT;

      // 建分類 pills
      buildCategoryPills(ALL_PRODUCTS);

      // 預設顯示：全部 或依你目前分頁 hash
      const filtered =
        CURRENT_CATEGORY === "全部"
          ? ALL_PRODUCTS
          : ALL_PRODUCTS.filter((p) => String(p.category || "") === CURRENT_CATEGORY);

      renderProducts(filtered);
      renderNotice(notice);

      updateCartBadge();
    } catch (err) {
      console.error("API 錯誤", err);
      // 讓頁面不要空白：顯示錯誤提示
      const wrap = document.getElementById(IDS.noticeWrap);
      if (wrap) {
        wrap.innerHTML = `
          <div style="margin: 10px 0; padding: 12px 14px; border-radius: 16px; border:1px solid rgba(255,0,0,0.15); background: rgba(255,0,0,0.06);">
            <div style="font-weight:700; font-size:13px;">資料載入失敗</div>
            <div style="margin-top:6px; font-size:12px; opacity:.8; line-height:1.7;">
              請確認 Google Apps Script 已「部署為網頁應用程式」，且允許任何人存取（或你已登入同帳號）。<br>
              Console 會顯示詳細錯誤。
            </div>
          </div>
        `;
      }
    }
  };

  // ====== 初始化 ======
  ensureMainLayoutIfMissing();
  bindTopIconsIfExist();
  fetchData();

  // 若你的頁面有自己的購物車 icon，但沒 id，也可以用 data-cart-open 方式
  $$("[data-cart-open]").forEach((el) => el.addEventListener("click", openCart));
});
