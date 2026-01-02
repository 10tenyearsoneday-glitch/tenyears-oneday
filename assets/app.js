/* TENYEARS_ONEDAY - app.js (商品頁可用版)
   - 讀 GAS JSON：{ products:[], notice:[], discount:[] }
   - 商品卡：圖片 / 名稱 / 價格 / 款式 / 數量 / 加入購物車
   - 點圖片：開啟 modal，可切換多張
   - 購物車：右側抽屜、數量調整、移除、徽章
*/
document.addEventListener("DOMContentLoaded", () => {
  // ===== 基本設定 =====
  const STORE_KEY = "tenyears_oneday_cart_v1";
  const API_URL =
    "https://script.google.com/macros/s/AKfycbzTQDS9uZ67YPC3yu9B71Ba3WLwe6_4cL3tTe2ZhBcqi_SIjSbEqEbpB6pd2JpVg-hM/exec";

  // ===== 小工具 =====
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
    if (!Number.isFinite(num)) return "0";
    return num.toLocaleString("zh-TW");
  };

  const normalizeImages = (images) => {
    if (!images) return [];
    if (Array.isArray(images)) return images.filter(Boolean).map(String);
    if (typeof images === "string") {
      // 支援 , 或 | 分隔；也支援換行
      return images
        .split(/[,|\n]/g)
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return [];
  };

  const normalizeStyles = (styles) => {
    if (!styles) return [];
    if (Array.isArray(styles)) return styles.filter(Boolean).map(String);
    if (typeof styles === "string") {
      return styles
        .split(/\n|,|、|\|/g)
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return [];
  };

  const uniq = (arr) => Array.from(new Set(arr));

  // ===== 確保頁面需要的容器存在（不破壞你原本排版）=====
  const ensureEl = (id, tag = "div", parent = document.body, className = "") => {
    let el = document.getElementById(id);
    if (el) return el;
    el = document.createElement(tag);
    el.id = id;
    if (className) el.className = className;
    parent.appendChild(el);
    return el;
  };

  // 你的 index.html 內已經有 imgModal（空 div），這裡會補齊 modal 結構
  const ensureImgModal = () => {
    const overlay = ensureEl("imgModal", "div", document.body, "modalOverlay");
    // 已經有內容就不重建
    if (overlay.dataset.ready === "1") return;

    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="imgTitle">
        <div class="modalHead">
          <h3 id="imgTitle">商品圖片</h3>
          <button class="closeX" id="closeImg" aria-label="關閉">×</button>
        </div>
        <div class="modalBody" id="imgBody"></div>
      </div>
    `;
    overlay.dataset.ready = "1";

    // 點背景關閉
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeImgModal();
    });
    $("#closeImg")?.addEventListener("click", closeImgModal);
  };

  const openImgModal = (product) => {
    ensureImgModal();
    const titleEl = document.getElementById("imgTitle");
    const bodyEl = document.getElementById("imgBody");
    const overlay = document.getElementById("imgModal");
    if (!titleEl || !bodyEl || !overlay) return;

    const imgs = normalizeImages(product?.images);
    const desc = escapeHtml(product?.description || "");
    let idx = 0;

    const render = () => {
      const current = imgs[idx] || "";
      bodyEl.innerHTML = `
        <div class="modalGallery">
          <button class="navBtn" id="prevImg" ${imgs.length <= 1 ? "disabled" : ""}>‹</button>
          <div class="stage">
            ${
              current
                ? `<img class="stageImg" src="${escapeHtml(current)}" alt="">`
                : `<div class="stageEmpty">沒有圖片</div>`
            }
            <div class="pager">${imgs.length ? `${idx + 1} / ${imgs.length}` : ""}</div>
          </div>
          <button class="navBtn" id="nextImg" ${imgs.length <= 1 ? "disabled" : ""}>›</button>
        </div>

        ${
          imgs.length > 1
            ? `<div class="thumbs">
                ${imgs
                  .map(
                    (src, i) => `
                    <button class="thumb ${i === idx ? "isActive" : ""}" data-thumb="${i}">
                      <img src="${escapeHtml(src)}" alt="">
                    </button>`
                  )
                  .join("")}
              </div>`
            : ""
        }

        ${
          desc
            ? `<div class="modalDesc">${desc.replaceAll("\n", "<br>")}</div>`
            : ""
        }
      `;

      $("#prevImg")?.addEventListener("click", () => {
        idx = (idx - 1 + imgs.length) % imgs.length;
        render();
      });
      $("#nextImg")?.addEventListener("click", () => {
        idx = (idx + 1) % imgs.length;
        render();
      });
      $$("[data-thumb]", bodyEl).forEach((b) => {
        b.addEventListener("click", () => {
          idx = Number(b.dataset.thumb) || 0;
          render();
        });
      });
    };

    titleEl.textContent = product?.name ? `商品圖片｜${product.name}` : "商品圖片";
    overlay.style.display = "flex";
    render();
  };

  const closeImgModal = () => {
    const overlay = document.getElementById("imgModal");
    if (overlay) overlay.style.display = "none";
  };

  // ===== 購物車（抽屜）=====
  const loadCart = () => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  };

  const saveCart = (cart) => {
    localStorage.setItem(STORE_KEY, JSON.stringify(cart));
    updateCartBadge();
  };

  const calcSubtotal = () =>
    loadCart().reduce((sum, it) => sum + (Number(it.price) || 0) * (Number(it.qty) || 0), 0);

  const ensureCartDrawer = () => {
    let drawer = document.getElementById("cartDrawer");
    if (drawer) return;

    drawer = document.createElement("div");
    drawer.id = "cartDrawer";
    drawer.className = "cartDrawer";
    drawer.innerHTML = `
      <div class="cartHead">
        <div class="cartTitle">購物車</div>
        <button class="cartClose" id="cartCloseBtn" aria-label="關閉">×</button>
      </div>
      <div class="cartItems" id="cartItems"></div>
      <div class="cartFoot">
        <div class="row">
          <div>小計</div>
          <div>NT$ <span id="cartSubtotal">0</span></div>
        </div>
        <div class="rowBtns">
          <button class="btnGhost" id="cartContinueBtn">繼續購物</button>
          <button class="btnSolid" id="cartCheckoutBtn">前往結帳</button>
        </div>
        <div class="hint">登入會員（待接會員功能）</div>
      </div>
    `;
    document.body.appendChild(drawer);

    $("#cartCloseBtn").addEventListener("click", closeCart);
    $("#cartContinueBtn").addEventListener("click", closeCart);
    $("#cartCheckoutBtn").addEventListener("click", () => alert("結帳流程（可接 Stripe / 或你的結帳頁）"));

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeCart();
        closeImgModal();
      }
    });
  };

  const openCart = () => {
    ensureCartDrawer();
    const drawer = document.getElementById("cartDrawer");
    if (drawer) drawer.classList.add("isOpen");
    renderCart();
  };

  const closeCart = () => {
    const drawer = document.getElementById("cartDrawer");
    if (drawer) drawer.classList.remove("isOpen");
  };

  const updateCartBadge = () => {
    const badge = document.getElementById("cartCount");
    if (!badge) return;
    const total = loadCart().reduce((s, it) => s + (Number(it.qty) || 0), 0);
    badge.textContent = String(total);
    badge.style.display = total > 0 ? "inline-flex" : "none";
  };

  const addToCart = (product, styleName, qty) => {
    const cart = loadCart();
    const key = `${product.id || product.name || "item"}__${styleName || ""}`;
    const idx = cart.findIndex((x) => x.key === key);

    const item = {
      key,
      id: product.id || "",
      name: product.name || "",
      style: styleName || "",
      price: Number(product.price) || 0,
      image: normalizeImages(product.images)[0] || "",
      qty: Math.max(1, Number(qty) || 1),
    };

    if (idx >= 0) cart[idx].qty += item.qty;
    else cart.push(item);

    saveCart(cart);
    openCart();
  };

  const setCartQty = (key, qty) => {
    const cart = loadCart();
    const it = cart.find((x) => x.key === key);
    if (!it) return;
    it.qty = Math.max(1, Number(qty) || 1);
    saveCart(cart);
    renderCart();
  };

  const removeFromCart = (key) => {
    saveCart(loadCart().filter((x) => x.key !== key));
    renderCart();
  };

  const renderCart = () => {
    ensureCartDrawer();
    const wrap = document.getElementById("cartItems");
    const subtotalEl = document.getElementById("cartSubtotal");
    const cart = loadCart();
    subtotalEl.textContent = ntd(calcSubtotal());

    if (!cart.length) {
      wrap.innerHTML = `<div class="empty">購物車目前是空的。</div>`;
      return;
    }

    wrap.innerHTML = cart
      .map((it) => {
        const img = it.image
          ? `<img src="${escapeHtml(it.image)}" alt="">`
          : `<div class="ph"></div>`;
        return `
          <div class="cartItem">
            <div class="thumbWrap">${img}</div>
            <div class="info">
              <div class="name">${escapeHtml(it.name)}${it.style ? ` <span>(${escapeHtml(it.style)})</span>` : ""}</div>
              <div class="meta">
                <div>NT$ ${ntd(it.price)}</div>
                <div class="qty">
                  <button data-dec="${escapeHtml(it.key)}">-</button>
                  <input data-qty="${escapeHtml(it.key)}" value="${Number(it.qty) || 1}">
                  <button data-inc="${escapeHtml(it.key)}">+</button>
                </div>
              </div>
              <div class="line">
                <div>小計：NT$ ${ntd((Number(it.price) || 0) * (Number(it.qty) || 0))}</div>
                <button class="rm" data-rm="${escapeHtml(it.key)}">移除</button>
              </div>
            </div>
          </div>
        `;
      })
      .join("");

    $$("[data-rm]", wrap).forEach((b) => b.addEventListener("click", () => removeFromCart(b.dataset.rm)));
    $$("[data-inc]", wrap).forEach((b) =>
      b.addEventListener("click", () => {
        const key = b.dataset.inc;
        const it = loadCart().find((x) => x.key === key);
        if (!it) return;
        setCartQty(key, (Number(it.qty) || 1) + 1);
      })
    );
    $$("[data-dec]", wrap).forEach((b) =>
      b.addEventListener("click", () => {
        const key = b.dataset.dec;
        const it = loadCart().find((x) => x.key === key);
        if (!it) return;
        setCartQty(key, Math.max(1, (Number(it.qty) || 1) - 1));
      })
    );
    $$("[data-qty]", wrap).forEach((inp) =>
      inp.addEventListener("change", () => {
        const key = inp.dataset.qty;
        const v = Number(String(inp.value).replace(/[^\d]/g, "")) || 1;
        inp.value = String(v);
        setCartQty(key, v);
      })
    );
  };

  // ===== 商品列表 =====
  let ALL_PRODUCTS = [];
  let CURRENT_CATEGORY = "全部";

  const ensureProductArea = () => {
    const main = document.querySelector("main") || document.body;
    // 公告容器（如果你本來有 noticeWrap 就用）
    ensureEl("noticeWrap", "div", main, "noticeWrap");
    // 商品容器
    const wrap = ensureEl("productsWrap", "section", main, "productsWrap");
    ensureEl("categoryBar", "div", wrap, "categoryBar");
    ensureEl("productsGrid", "div", wrap, "productsGrid");
  };

  const buildCategoryPills = (products) => {
    const bar = document.getElementById("categoryBar");
    if (!bar) return;

    const cats = uniq(["全部", ...products.map((p) => String(p.category || "").trim()).filter(Boolean)]);

    bar.innerHTML = cats
      .map((c) => {
        const active = c === CURRENT_CATEGORY;
        return `
          <button class="pill ${active ? "isActive" : ""}" data-cat="${escapeHtml(c)}">${escapeHtml(c)}</button>
        `;
      })
      .join("");

    $$("button[data-cat]", bar).forEach((btn) => {
      btn.addEventListener("click", () => {
        CURRENT_CATEGORY = btn.dataset.cat || "全部";
        const filtered =
          CURRENT_CATEGORY === "全部" ? ALL_PRODUCTS : ALL_PRODUCTS.filter((p) => String(p.category || "") === CURRENT_CATEGORY);
        buildCategoryPills(ALL_PRODUCTS);
        renderProducts(filtered);
      });
    });
  };

  const renderNotice = (noticeArr) => {
    const wrap = document.getElementById("noticeWrap");
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
          <div class="noticeCard">
            <div class="noticeHead">
              <span class="noticeTag">公告</span>
              <div class="noticeTitle">${title}</div>
            </div>
            ${content ? `<div class="noticeBody">${content.replaceAll("\n", "<br>")}</div>` : ""}
          </div>
        `;
      })
      .join("");
  };

  const renderProducts = (products) => {
    const grid = document.getElementById("productsGrid");
    if (!grid) return;

    if (!products.length) {
      grid.innerHTML = `<div class="empty">目前沒有商品。</div>`;
      return;
    }

    grid.innerHTML = products
      .map((p) => {
        const key = String(p.id || p.name || "");
        const imgs = normalizeImages(p.images);
        const cover = imgs[0] || "";
        const styles = normalizeStyles(p.styles);
        return `
          <div class="productCard">
            <button class="imgBtn" data-open="${escapeHtml(key)}" aria-label="查看圖片">
              ${cover ? `<img src="${escapeHtml(cover)}" alt="">` : `<div class="imgEmpty">No Image</div>`}
            </button>
            <div class="cardBody">
              <div class="rowTop">
                <div class="name">${escapeHtml(p.name || "")}</div>
                <div class="price">NT$ ${ntd(p.price)}</div>
              </div>
              <div class="meta">
                ${escapeHtml(p.collection || "")}${p.collection && p.category ? " · " : ""}${escapeHtml(p.category || "")}
                ${p.id ? ` · ${escapeHtml(p.id)}` : ""}
                ${p.status ? `<span class="status">${escapeHtml(p.status)}</span>` : ""}
              </div>

              ${styles.length ? `
                <div class="field">
                  <div class="label">款式</div>
                  <select data-style="${escapeHtml(key)}">
                    ${styles.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("")}
                  </select>
                </div>` : ""}

              <div class="actions">
                <div class="qty">
                  <button data-dec="${escapeHtml(key)}">-</button>
                  <input data-qty="${escapeHtml(key)}" value="1">
                  <button data-inc="${escapeHtml(key)}">+</button>
                </div>
                <button class="addBtn" data-add="${escapeHtml(key)}">加入購物車</button>
              </div>
            </div>
          </div>
        `;
      })
      .join("");

    // modal
    $$("[data-open]", grid).forEach((b) => {
      b.addEventListener("click", () => {
        const key = b.dataset.open;
        const product = ALL_PRODUCTS.find((x) => String(x.id || x.name || "") === String(key));
        if (product) openImgModal(product);
      });
    });

    // qty
    const getQtyInput = (key) => grid.querySelector(`[data-qty="${CSS.escape(key)}"]`);
    $$("[data-inc]", grid).forEach((b) =>
      b.addEventListener("click", () => {
        const key = b.dataset.inc;
        const inp = getQtyInput(key);
        if (!inp) return;
        const v = Number(String(inp.value).replace(/[^\d]/g, "")) || 1;
        inp.value = String(Math.min(99, v + 1));
      })
    );
    $$("[data-dec]", grid).forEach((b) =>
      b.addEventListener("click", () => {
        const key = b.dataset.dec;
        const inp = getQtyInput(key);
        if (!inp) return;
        const v = Number(String(inp.value).replace(/[^\d]/g, "")) || 1;
        inp.value = String(Math.max(1, v - 1));
      })
    );
    $$("[data-qty]", grid).forEach((inp) =>
      inp.addEventListener("change", () => {
        const v = Number(String(inp.value).replace(/[^\d]/g, "")) || 1;
        inp.value = String(Math.max(1, Math.min(99, v)));
      })
    );

    // add cart
    $$("[data-add]", grid).forEach((b) =>
      b.addEventListener("click", () => {
        const key = b.dataset.add;
        const product = ALL_PRODUCTS.find((x) => String(x.id || x.name || "") === String(key));
        if (!product) return;

        const qtyInp = getQtyInput(key);
        const qty = qtyInp ? Number(String(qtyInp.value).replace(/[^\d]/g, "")) || 1 : 1;

        const sel = grid.querySelector(`[data-style="${CSS.escape(key)}"]`);
        const styleName = sel ? sel.value || "" : "";

        addToCart(product, styleName, qty);
      })
    );
  };

  // ===== 綁定右上 icon（如果你 HTML 有 iconCart / cartCount）=====
  const bindTopIconsIfExist = () => {
    const cart = document.getElementById("iconCart");
    if (cart) cart.addEventListener("click", (e) => (e.preventDefault(), openCart()));
  };

  // ===== 抓資料 =====
  const fetchData = async () => {
    try {
      const res = await fetch(API_URL, { cache: "no-store" });
      const data = await res.json();

      ALL_PRODUCTS = Array.isArray(data.products) ? data.products : [];
      const notice = Array.isArray(data.notice) ? data.notice : [];

      buildCategoryPills(ALL_PRODUCTS);
      renderProducts(ALL_PRODUCTS);
      renderNotice(notice);
      updateCartBadge();
    } catch (e) {
      console.error("API 錯誤", e);
      const wrap = document.getElementById("noticeWrap");
      if (wrap) {
        wrap.innerHTML = `<div class="noticeCard" style="border-color:rgba(255,0,0,.18);background:rgba(255,0,0,.06)">
          <div class="noticeTitle">資料載入失敗</div>
          <div class="noticeBody">請確認 GAS 已部署為「網頁應用程式」，且允許存取。</div>
        </div>`;
      }
    }
  };

  // ===== init =====
  ensureProductArea();
  ensureCartDrawer();
  ensureImgModal();
  bindTopIconsIfExist();
  fetchData();
});
