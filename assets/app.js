/* =========================================================
   TENYEARS_ONEDAY - app.js (B2 GAS + Cart + Products)
   - 讀取 Google Apps Script JSON (products / notice / discount)
   - 產品列表：分類篩選、圖片放大 modal、加入購物車、數量調整
   - 公告：顯示 active 的公告
   - 購物車：側邊抽屜、繼續購物、結帳摘要
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {
  // ====== 基本設定 ======
  const STORE_KEY = "tenyears_oneday_cart_v1";

  // 外部連結
  const IG_URL =
    "https://www.instagram.com/tenyears_oneday?igsh=MW9hcjBnaTdjNzc0MQ%3D%3D&utm_source=qr";
  const LINE_URL = "https://line.me/R/ti/p/@396kwrga";

  // GAS Web App
  const API_URL =
    "https://script.google.com/macros/s/AKfycbzTQDS9uZ67YPC3yu9B71Ba3WLwe6_4cL3tTe2ZhBcqi_SIjSbEqEbpB6pd2JpVg-hM/exec";

  // ====== DOM IDs ======
  const IDS = {
    productsWrap: "productsWrap",
    productsGrid: "productsGrid",
    noticeWrap: "noticeWrap",
    categoryBar: "categoryBar",

    cartDrawer: "cartDrawer",
    cartItems: "cartItems",
    cartCount: "cartCount",
    cartSubtotal: "cartSubtotal",
    cartCheckoutBtn: "cartCheckoutBtn",

    // icons (如果你的 HTML 沒有這些 id，不影響；我們也會綁 btnCart / btnSearch / btnMember)
    iconIG: "iconIG",
    iconLINE: "iconLINE",
    iconCart: "iconCart",
    iconSearch: "iconSearch",
    iconMember: "iconMember",

    imgModal: "imgModal",
    imgTitle: "imgTitle",
    imgBody: "imgBody",
    closeImg: "closeImg",
  };

  // ====== 全域狀態 ======
  let ALL_PRODUCTS = [];
  let DISCOUNT = [];
  let CURRENT_CATEGORY = "全部";
  let CURRENT_PAGE = "home";
  let CURRENT_SUBSET = [];

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

    const cssEscape = (s) => (window.CSS && window.CSS.escape) ? window.CSS.escape(String(s)) : String(s).replace(/[^a-zA-Z0-9_\-]/g, (c)=>`\${c}`);

  const ntd = (n) => {
    const num = Number(n);
    if (!Number.isFinite(num)) return "";
    return num.toLocaleString("zh-TW");
  };

  // 圖片載入失敗的替代圖（SVG Data URI）
  const IMG_FALLBACK =
    "data:image/svg+xml;charset=UTF-8," +
    encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' width='800' height='500'>
        <rect width='100%' height='100%' fill='#eef4ee'/>
        <rect x='24' y='24' width='752' height='452' rx='22' fill='#ffffff' fill-opacity='0.75' stroke='#c9d6c9'/>
        <text x='50%' y='48%' dominant-baseline='middle' text-anchor='middle' font-family='Arial, sans-serif' font-size='22' fill='#6f7f73'>圖片暫時無法顯示</text>
        <text x='50%' y='56%' dominant-baseline='middle' text-anchor='middle' font-family='Arial, sans-serif' font-size='14' fill='#6f7f73' fill-opacity='0.85'>請更新圖片網址（Google Sheet 的 images 欄位）</text>
      </svg>`
    );

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

  // ====== 版面容器（若 HTML 沒有，就自動補上；不會蓋住你的原本設計） ======
  const ensureMainLayoutIfMissing = () => {
    const main = $("main") || $(".container") || $(".wrap") || document.body;

    const hero = $(".hero") || $(".home-hero") || $(".card") || main;

    // 公告容器（在 hero 下方）
    ensureEl(IDS.noticeWrap, "div", hero, {
      className: "notice-wrap",
      style: "margin: 14px auto 0; max-width: 1100px; padding: 0 18px;",
    });

    // 商品容器（在 main 下面）
    const productsWrap = ensureEl(IDS.productsWrap, "section", main, {
      className: "products-wrap",
      style: "margin: 22px auto; max-width: 1100px; padding: 0 18px;",
    });

    ensureEl(IDS.categoryBar, "div", productsWrap, {
      className: "category-bar",
      style:
        "display:flex; gap:10px; flex-wrap:nowrap; overflow:auto; padding:10px 2px 14px; -webkit-overflow-scrolling:touch;",
    });

    ensureEl(IDS.productsGrid, "div", productsWrap, {
      className: "products-grid",
      style:
        "display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); gap:14px; padding-bottom: 16px;",
    });

    ensureCartDrawer();
    ensureImgModal();
  };

  // ====== 購物車抽屜（避免蓋住頁面：關閉時 pointer-events:none） ======
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
        "pointer-events:none",
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

    $("#cartCloseBtn").addEventListener("click", closeCart);
    $("#cartContinueBtn").addEventListener("click", closeCart);

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeCart();
        closeImgModal();
      }
    });

    document.getElementById(IDS.cartCheckoutBtn).addEventListener("click", () => {
      alert("結帳流程（可接 Stripe / 或你的結帳頁）");
    });

    return drawer;
  };

  // ====== 圖片 Modal ======
  const ensureImgModal = () => {
    let modal = document.getElementById(IDS.imgModal);

    // 若 HTML 先放了一個空的 #imgModal（例如 index.html 內），這裡要補齊結構
    const buildModal = (el) => {
      el.id = IDS.imgModal;
      el.setAttribute(
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

      el.innerHTML = `
        <div style="width:min(900px, 96vw); max-height: 90vh; overflow:auto; background:rgba(255,255,255,0.92); border-radius:18px; border:1px solid rgba(0,0,0,0.10); box-shadow: 0 22px 60px rgba(0,0,0,0.20);">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; padding: 14px 16px; border-bottom: 1px solid rgba(0,0,0,0.08);">
            <h3 id="${IDS.imgTitle}" style="margin:0; font-size:15px; font-weight:600;">商品圖片</h3>
            <button id="${IDS.closeImg}" style="border:0; background:transparent; font-size:20px; cursor:pointer;">×</button>
          </div>
          <div id="${IDS.imgBody}" style="padding: 14px 16px;"></div>
        </div>
      `;

      // 重新綁定事件（避免重複 addEventListener）
      const closeBtn = document.getElementById(IDS.closeImg);
      if (closeBtn) closeBtn.onclick = closeImgModal;

      el.onclick = (e) => {
        if (e.target === el) closeImgModal();
      };
    };

    if (modal) {
      // 若缺少必要節點，就補齊（避免 openImgModal 取到 null）
      const hasTitle = !!document.getElementById(IDS.imgTitle);
      const hasBody = !!document.getElementById(IDS.imgBody);
      const hasClose = !!document.getElementById(IDS.closeImg);
      if (!hasTitle || !hasBody || !hasClose) buildModal(modal);
      return modal;
    }

    modal = document.createElement("div");
    buildModal(modal);
    document.body.appendChild(modal);
    return modal;
  };

  const normalizeImageUrl = (u) => {
    let s = String(u || "").trim();
    if (!s) return "";
    // upgrade http to https (GitHub Pages blocks mixed content)
    if (s.startsWith("http://")) s = "https://" + s.slice(7);
    // Google Drive share -> direct view
    const m1 = s.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (m1) return `https://drive.google.com/uc?export=view&id=${m1[1]}`;
    const m2 = s.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/);
    if (m2) return `https://drive.google.com/uc?export=view&id=${m2[1]}`;
    return s;
  };

  const normalizeImages = (images) => {
    if (!images) return [];
    if (Array.isArray(images)) return images.filter(Boolean).map(normalizeImageUrl).filter(Boolean);
    if (typeof images === "string") {
      const parts = images.split(/[,|]/g).map((s) => s.trim()).filter(Boolean);
      return (parts.length ? parts : [images]).map(normalizeImageUrl).filter(Boolean);
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

  const openImgModal = (product) => {
    ensureImgModal();
    const modal = document.getElementById(IDS.imgModal);
    let titleEl = document.getElementById(IDS.imgTitle);
    let bodyEl = document.getElementById(IDS.imgBody);

    // 保險：若頁面上先存在空的 #imgModal，可能造成 title/body 為 null
    if (!titleEl || !bodyEl) {
      ensureImgModal();
      titleEl = document.getElementById(IDS.imgTitle);
      bodyEl = document.getElementById(IDS.imgBody);
    }
    if (!titleEl || !bodyEl) {
      console.warn('[tenyears_oneday] img modal elements missing');
      return;
    }

    titleEl.textContent = product?.name ? `商品圖片｜${product.name}` : "商品圖片";

    const imgs = normalizeImages(product?.images);
    const desc = escapeHtml(product?.description || "");

    bodyEl.innerHTML = `
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

  // ====== Top Icons（同時支援：icon* / btnCart btnSearch btnMember） ======
  const ensureCartBadgeOnButton = (btn) => {
    if (!btn) return null;
    let badge = document.getElementById(IDS.cartCount);
    if (badge) return badge;

    badge = document.createElement("span");
    badge.id = IDS.cartCount;
    badge.textContent = "0";
    badge.style.cssText =
      "margin-left:6px; display:none; min-width:18px; height:18px; padding:0 6px; border-radius:999px; background:rgba(34,52,40,.9); color:#fff; font-size:11px; line-height:18px; text-align:center;";
    btn.appendChild(badge);
    return badge;
  };

  const bindTopIconsIfExist = () => {
    const ig = document.getElementById(IDS.iconIG);
    if (ig) ig.addEventListener("click", (e) => (e.preventDefault(), window.open(IG_URL, "_blank", "noopener")));

    const line = document.getElementById(IDS.iconLINE);
    if (line) line.addEventListener("click", (e) => (e.preventDefault(), window.open(LINE_URL, "_blank", "noopener")));

    const cart =
      document.getElementById(IDS.iconCart) ||
      document.getElementById("btnCart");
    if (cart) {
      ensureCartBadgeOnButton(cart);
      cart.addEventListener("click", (e) => {
        e.preventDefault();
        openCart();
      });
    }

    const search =
      document.getElementById(IDS.iconSearch) ||
      document.getElementById("btnSearch");
    if (search) {
      search.addEventListener("click", (e) => {
        e.preventDefault();
        const kw = prompt("搜尋商品名稱：");
        if (kw == null) return;
        const k = kw.trim();
        if (!k) return;
        const base = CURRENT_SUBSET.length ? CURRENT_SUBSET : ALL_PRODUCTS;
        renderProducts(base.filter((p) => String(p.name || "").includes(k)));
        scrollToProducts();
      });
    }

    const member =
      document.getElementById(IDS.iconMember) ||
      document.getElementById("btnMember");
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
    const cartBtn = document.getElementById(IDS.iconCart) || document.getElementById("btnCart");
    if (cartBtn) ensureCartBadgeOnButton(cartBtn);

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

    if (idx >= 0) cart[idx].qty += item.qty;
    else cart.push(item);

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
    const drawer = document.getElementById(IDS.cartDrawer);
    drawer.style.transform = "translateX(0)";
    drawer.style.pointerEvents = "auto";
    renderCart();
  };

  const closeCart = () => {
    const drawer = document.getElementById(IDS.cartDrawer);
    if (!drawer) return;
    drawer.style.transform = "translateX(110%)";
    drawer.style.pointerEvents = "none";
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
          ? `<img src="${escapeHtml(it.image)}" alt="" onerror="this.onerror=null;this.src='${IMG_FALLBACK}'" style="width:56px;height:56px;border-radius:12px;object-fit:cover;border:1px solid rgba(0,0,0,0.08);">`
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
  const uniq = (arr) => Array.from(new Set(arr));

  const CATEGORY_ORDER = ["全部","項鍊","手鏈","耳環","戒指","其他"];
  const normalizeCategory = (c) => {
    const s = String(c || "").trim();
    if (!s) return "其他";
    if (CATEGORY_ORDER.includes(s)) return s;
    return "其他";
  };

  const buildCategoryPills = (products) => {
    const bar = document.getElementById(IDS.categoryBar);
    if (!bar) return;

        const present = products.map((p)=> normalizeCategory(p.category)).filter(Boolean);
    const cats = CATEGORY_ORDER.filter((c)=> c==="全部" || present.includes(c));

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
            ? products
            : products.filter((p) => normalizeCategory(p.category) === CURRENT_CATEGORY);
        buildCategoryPills(products);
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
        const category = escapeHtml(normalizeCategory(p.category));
        const collection = escapeHtml(p.collection || "");
        const status = String(p.status || "").trim();
        const price = Number(p.price) || 0;

        const imgs = normalizeImages(p.images);
        const cover = imgs[0] || "";

        const styles = normalizeStyles(p.styles);
        const hasStyles = styles.length > 0;

        const key = String(p.id || p.name || "");

        return `
          <div class="product-card"
               style="border-radius:18px; background: rgba(255,255,255,0.55); border:1px solid rgba(0,0,0,0.08); overflow:hidden;">
            <button data-open-modal="${escapeHtml(key)}"
                    style="border:0; background:transparent; padding:0; cursor:pointer; display:block; width:100%;">
              <div style="width:100%; height: 220px; background: rgba(0,0,0,0.05);">
                ${
                  cover
                    ? `<img src="${escapeHtml(cover)}" alt="${name}" onerror="this.onerror=null;this.src='${IMG_FALLBACK}'"
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
                  <select data-style-select="${escapeHtml(key)}"
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
                  <button data-qty-dec="${escapeHtml(key)}"
                    style="width:30px;height:30px;border-radius:10px;border:1px solid rgba(0,0,0,0.15);background:#fff;cursor:pointer;">-</button>
                  <input data-qty-input="${escapeHtml(key)}" value="1" inputmode="numeric"
                    style="width:44px;height:30px;border-radius:10px;border:1px solid rgba(0,0,0,0.15);text-align:center;">
                  <button data-qty-inc="${escapeHtml(key)}"
                    style="width:30px;height:30px;border-radius:10px;border:1px solid rgba(0,0,0,0.15);background:#fff;cursor:pointer;">+</button>
                </div>

                <button data-add-cart="${escapeHtml(key)}"
                  style="padding: 10px 12px; border-radius: 14px; border:0; background: rgba(34,52,40,0.85); color:#fff; cursor:pointer; font-size:13px; white-space:nowrap;">
                  加入購物車
                </button>
              </div>
            </div>
          </div>
        `;
      })
      .join("");

    // open modal
    $$("[data-open-modal]", grid).forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.openModal;
        const product = ALL_PRODUCTS.find((p) => String(p.id || p.name || "") === String(key));
        if (product) openImgModal(product);
      });
    });

    // qty helpers (避免 cssEscape 相容問題：用 attribute selector 不做 escape)
    const getQtyInput = (key) => $(`[data-qty-input="${cssEscape(key)}"]`, grid);

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

    // add cart
    $$("[data-add-cart]", grid).forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.addCart;
        const product = ALL_PRODUCTS.find((p) => String(p.id || p.name || "") === String(key));
        if (!product) return;

        const qtyInp = getQtyInput(key);
        const qty = qtyInp ? Number(String(qtyInp.value).replace(/[^\d]/g, "")) || 1 : 1;

        let styleName = "";
        const sel = $(`[data-style-select="${cssEscape(key)}"]`, grid);
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

      ALL_PRODUCTS = Array.isArray(data.products) ? data.products : [];
      // normalize categories to the fixed set (others -> 其他)
      ALL_PRODUCTS = ALL_PRODUCTS.map((p)=> ({...p, category: normalizeCategory(p.category)}));
      const notice = Array.isArray(data.notice) ? data.notice : [];
      DISCOUNT = Array.isArray(data.discount) ? data.discount : [];
      window.DISCOUNT = DISCOUNT;

      renderNotice(notice);
      updateCartBadge();
      // re-apply current page after data loaded
      applyPage(CURRENT_PAGE, {skipScroll:true});
    } catch (err) {
      console.error("API 錯誤", err);
      const wrap = document.getElementById(IDS.noticeWrap);
      if (wrap) {
        wrap.innerHTML = `
          <div style="margin: 10px 0; padding: 12px 14px; border-radius: 16px; border:1px solid rgba(255,0,0,0.15); background: rgba(255,0,0,0.06);">
            <div style="font-weight:700; font-size:13px;">資料載入失敗</div>
            <div style="margin-top:6px; font-size:12px; opacity:.8; line-height:1.7;">
              請確認 Google Apps Script 已部署為「網頁應用程式」，並允許存取。<br>
              （你也可以開 F12 Console 看錯誤原因）
            </div>
          </div>
        `;
      }
    }
  };


  // ====== Simple Router (hash pages) ======
  const getPageFromHash = () => {
    const h = (location.hash || "#home").replace("#", "").trim();
    return h || "home";
  };

  const applyPage = (page, opts = {}) => {
    CURRENT_PAGE = page;

    // show/hide pages
    $$("[data-page]").forEach((sec) => {
      const p = sec.getAttribute("data-page");
      const isProducts = p === "products";
      const active =
        (page === "home" && p === "home") ||
        (page === "promo" && p === "promo") ||
        (page === "tips" && p === "tips") ||
        (page === "faq" && p === "faq") ||
        ((page === "all" || page === "silver") && isProducts);

      sec.classList.toggle("isActive", active);
    });

    // nav active
    $$("[data-page-link]").forEach((a) => {
      a.classList.toggle("isActive", a.getAttribute("data-page-link") === page);
    });

    // products page title and filter
    if (page === "all" || page === "silver") {
      const titleEl = document.getElementById("productsPageTitle");
      if (titleEl) titleEl.textContent = page === "silver" ? "純銀飾品✨" : "全系列🌸";

      CURRENT_CATEGORY = "全部";

            const subset =
        page === "silver"
          ? ALL_PRODUCTS.filter((p) => {
              const col = String(p.collection || "");
              const silverFlag = String(p.silver || p.isSilver || "").toLowerCase();
              return col.includes("純銀") || silverFlag === "true" || silverFlag === "1" || silverFlag === "yes";
            })
          : ALL_PRODUCTS;

      CURRENT_SUBSET = subset;

      buildCategoryPills(subset);

      const filtered =
        CURRENT_CATEGORY === "全部"
          ? subset
          : subset.filter((p) => normalizeCategory(p.category) === CURRENT_CATEGORY);

      renderProducts(filtered);
      if (!opts.skipScroll) scrollToProducts();
    } else {
      CURRENT_SUBSET = [];
    }
  };

  window.addEventListener("hashchange", () => {
    applyPage(getPageFromHash());
  });

  // ====== 初始化 ======
  ensureMainLayoutIfMissing();
  bindTopIconsIfExist();
  // initial page skeleton
  applyPage(getPageFromHash());
  fetchData();
});
