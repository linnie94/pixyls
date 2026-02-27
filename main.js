(function () {
  "use strict";

  function byId(id) {
    return document.getElementById(id);
  }

  function on(id, event, fn) {
    var el = byId(id);
    if (el) el.addEventListener(event, fn);
  }

  var KEY_OPTIONS = [
    { value: "title", label: "title" },
    { value: "vendor", label: "vendor" },
    { value: "product_type", label: "product_type" },
    { value: "price", label: "price" },
    { value: "images", label: "images" },
    { value: "number_of_stickers", label: "number_of_stickers" },
    { value: "product_size", label: "product_size" },
    { value: "body_html", label: "body_html", hidden: true },
    { value: "created_at", label: "created_at" },
    { value: "handle", label: "handle", hidden: true },
    { value: "id", label: "id", hidden: true },
    { value: "updated_at", label: "updated_at", hidden: true },
    { value: "published_at", label: "published_at", hidden: true },
    { value: "options", label: "options", hidden: true },
    { value: "tags", label: "tags", hidden: true },
    { value: "variants", label: "variants", hidden: true }
  ];

  var SCRAPE_KEYS = ["number_of_stickers", "product_size"];

  var EASY_PEASY_KEYS = ["images", "title", "price", "number_of_stickers"];
  var preferredKeyOrder = null;

  function normalizeUrl(url) {
    const u = (url || "").trim();
    if (!u) return "";
    if (/\/collections\//.test(u) && !/\.json$/.test(u) && !u.includes("products.json")) {
      return u.replace(/\/?$/, "/") + "products.json";
    }
    return u;
  }

  function stripHtml(html) {
    if (!html) return "";
    var div = document.createElement("div");
    div.innerHTML = html;
    return (div.textContent || div.innerText || "").trim().replace(/\s+/g, " ");
  }

  function extractAboutThisKit(bodyHtml) {
    if (!bodyHtml || typeof bodyHtml !== "string") return "[No body_html]";
    var lower = bodyHtml.toLowerCase();
    var startMarkers = ["about this kit", "about the kit"];
    var startIdx = -1;
    for (var i = 0; i < startMarkers.length; i++) {
      var idx = lower.indexOf(startMarkers[i]);
      if (idx !== -1) {
        startIdx = idx;
        break;
      }
    }
    if (startIdx === -1) return "[About this Kit section not found]";
    var afterStart = bodyHtml.slice(startIdx);
    var endMarkers = ["what's inside", "how to frame", "what's inside the kit", "##### what's", "<h5>what's", "<h6>what's"];
    var endIdx = afterStart.length;
    for (var j = 0; j < endMarkers.length; j++) {
      var e = afterStart.toLowerCase().indexOf(endMarkers[j]);
      if (e !== -1 && e < endIdx) {
        endIdx = e;
      }
    }
    var block = afterStart.slice(0, endIdx);
    return stripHtml(block).replace(/^\s*about this kit\s*\/?\s*/i, "").trim() || "[Empty section]";
  }

  function getAboutThisKitFromScrapedHtml(html) {
    return getSectionBodyFromScrapedHtml(html, "About this Kit");
  }

  function getSectionBodyFromScrapedHtml(html, sectionTitle) {
    var sections = scrapeSectionsFromHtml(html);
    for (var i = 0; i < sections.length; i++) {
      if (sections[i].title.indexOf(sectionTitle) !== -1) {
        return sections[i].body;
      }
    }
    return "";
  }

  function getKitSectionBody(html, vendor) {
    if (vendor && String(vendor).toLowerCase() === "vexyls") {
      return getSectionBodyFromScrapedHtml(html, "Kit Details");
    }
    return getAboutThisKitFromScrapedHtml(html);
  }

  function getStickerCountFromScrapedHtml(html, vendor) {
    var body = getKitSectionBody(html, vendor);
    if (!body) return "[Not found]";
    var match = body.match(/(\d+)\s*stickers?/i);
    return match ? match[1] : "[Not found]";
  }

  function getSizeFromScrapedHtml(html, vendor) {
    var body = getKitSectionBody(html, vendor);
    if (!body) return "[Not found]";
    var match = body.match(/(\d+(?:\.\d+)?\s*["']?\s*[x×]\s*\d+(?:\.\d+)?\s*["']?)/i);
    return match ? match[1].trim() : "[Not found]";
  }

  function extractKeyValues(products, keyName, firstOnly, fullObjects) {
    const values = [];
    for (const product of products) {
      if (keyName === "price") {
        const variants = product.variants || [];
        const prices = variants
          .filter(function (v) {
            return v && typeof v === "object" && "price" in v;
          })
          .map(function (v) {
            return v.price;
          });
        if (prices.length === 0) {
          values.push("[No price in variants]");
        } else if (firstOnly) {
          values.push(prices[0]);
        } else {
          values.push(prices);
        }
        continue;
      }
      if (!(keyName in product)) {
        values.push("[Key '" + keyName + "' not found]");
        continue;
      }
      const value = product[keyName];
      if (keyName === "images" && Array.isArray(value) && !fullObjects) {
        const srcUrls = value
          .filter(function (img) {
            return img && typeof img === "object" && "src" in img;
          })
          .map(function (img) {
            return img.src;
          });
        if (firstOnly && srcUrls.length) {
          values.push(srcUrls[0]);
        } else {
          values.push(srcUrls);
        }
      } else if (keyName === "variants" && Array.isArray(value) && !fullObjects) {
        const prices = value
          .filter(function (v) {
            return v && typeof v === "object" && "price" in v;
          })
          .map(function (v) {
            return v.price;
          });
        if (firstOnly && prices.length) {
          values.push(prices[0]);
        } else {
          values.push(prices);
        }
      } else {
        values.push(value);
      }
    }
    return values;
  }

  function formatValue(value, keyName, fullObjects, imageSheetsFormula) {
    if (keyName === "images" && !fullObjects && imageSheetsFormula) {
      const urls = Array.isArray(value) ? value : [value];
      return urls.map(function (url) {
        return '=IMAGE("' + String(url).replace(/"/g, '""') + '", 1)';
      }).join("\n");
    }
    if (Array.isArray(value) && ["images", "variants", "price"].indexOf(keyName) !== -1 && !fullObjects) {
      return value.join("\n");
    }
    if (value !== null && (Array.isArray(value) || typeof value === "object")) {
      return JSON.stringify(value, null, 2);
    }
    return String(value);
  }

  function formatValueForCell(value, keyName, fullObjects, imageSheetsFormula) {
    if (keyName === "images" && !fullObjects && imageSheetsFormula) {
      var urls = Array.isArray(value) ? value : [value];
      return urls.map(function (url) {
        return '=IMAGE("' + String(url).replace(/"/g, '""') + '", 1)';
      }).join(", ");
    }
    if (Array.isArray(value) && ["images", "variants", "price"].indexOf(keyName) !== -1 && !fullObjects) {
      return value.join(", ");
    }
    if (value !== null && (Array.isArray(value) || typeof value === "object")) {
      return JSON.stringify(value);
    }
    return String(value);
  }

  function getKeyLabel(value) {
    for (var i = 0; i < KEY_OPTIONS.length; i++) {
      if (KEY_OPTIONS[i].value === value) return KEY_OPTIONS[i].label;
    }
    return value;
  }

  function escapeTsvCell(str) {
    return String(str).replace(/\t/g, " ").replace(/\r?\n/g, " ").trim();
  }

  function renderOutput(text) {
    const output = byId("output");
    const result = byId("result");
    result.textContent = text;
    output.classList.remove("hidden");
  }

  function showError(msg) {
    const el = byId("error");
    el.textContent = msg;
    el.classList.remove("hidden");
  }

  function clearError() {
    byId("error").classList.add("hidden");
  }

  function setLoading(loading) {
    ["submitBtn", "scrapePageBtn", "easyPeasyFetchBtn"].forEach(function (id) {
      var el = byId(id);
      if (el) el.disabled = loading;
    });
  }

  function getProductPageUrl(urlInput) {
    var input = (urlInput || "").trim();
    if (!input) return null;
    if (/^https?:\/\//i.test(input)) {
      var productMatch = input.match(/\/products\/([^\/\?#.]+)(?:\?|#|\/|$)/i);
      if (productMatch) {
        return input.split("?")[0].split("#")[0];
      }
      return null;
    }
    return STORE_BASE + "/products/" + input.replace(/^\//, "") + "";
  }

  function getTextContent(el) {
    if (!el) return "";
    return (el.textContent || el.innerText || "").trim().replace(/\s+/g, " ");
  }

  function scrapeSectionsFromHtml(html) {
    var parser = new DOMParser();
    var doc = parser.parseFromString(html, "text/html");
    var sections = [];
    var sectionNames = ["About this Kit", "Kit Details", "What's Inside the Kit", "What's Inside", "How to frame", "The Pixyls Promise"];

    function getAccordionContent(trigger) {
      var controlsId = trigger.getAttribute("aria-controls");
      var contentEl = controlsId ? doc.getElementById(controlsId) : null;
      if (!contentEl) {
        contentEl = trigger.nextElementSibling;
      }
      if (!contentEl) return "";
      var inner = contentEl.querySelector(".product_accordion_inner, .product_accordion_content .rte");
      var target = inner || contentEl;
      var items = target.querySelectorAll(".icons-row-block_item");
      if (items.length) {
        return Array.prototype.map.call(items, function (item) {
          return getTextContent(item);
        }).filter(Boolean).join("\n");
      }
      return getTextContent(target);
    }

    var accordionTriggers = doc.querySelectorAll(".product_accordion_title, button[aria-controls*='accordion'], [class*='accordion_title']");
    for (var i = 0; i < accordionTriggers.length; i++) {
      var trigger = accordionTriggers[i];
      var title = getTextContent(trigger);
      for (var s = 0; s < sectionNames.length; s++) {
        if (title.indexOf(sectionNames[s]) !== -1) {
          var body = getAccordionContent(trigger);
          if (body) {
            sections.push({ title: title, body: body });
          }
          break;
        }
      }
    }

    if (sections.length === 0) {
      var headings = doc.querySelectorAll("h1, h2, h3, h4, h5, h6");
      for (var j = 0; j < headings.length; j++) {
        var h = headings[j];
        var hTitle = getTextContent(h);
        for (var k = 0; k < sectionNames.length; k++) {
          if (hTitle.indexOf(sectionNames[k]) !== -1) {
            var parts = [];
            var next = h.nextElementSibling;
            while (next && !/^H[1-6]$/i.test(next.tagName)) {
              parts.push(getTextContent(next));
              next = next.nextElementSibling;
            }
            var body = parts.filter(Boolean).join(" ");
            if (body) {
              sections.push({ title: hTitle, body: body });
            }
            break;
          }
        }
      }
    }
    return sections;
  }

  var STORE_BASE = "https://pixyls.ca";

  /** Known launch / collection handles for the accordion list. Add more as needed. */
  var KNOWN_COLLECTION_NAMES = [
    "jan-25",
    "april-25",
    "y2k-mini-launch",
    // "pixyls-christmas-2025",
    "pets",
    "winter-romance",
    "east-asian-festival",
  ];

  function resolveFetchUrl(urlInput) {
    const input = (urlInput || "").trim();
    if (!input) return { url: "", singleProduct: false, collectionHandle: null };
    if (/^https?:\/\//i.test(input)) {
      var productMatch = input.match(/\/products\/([^\/\?#.]+)(?:\?|#|\/|$)/i);
      if (productMatch) {
        return {
          url: STORE_BASE + "/products/" + productMatch[1] + ".json",
          singleProduct: true,
          collectionHandle: null
        };
      }
      var collMatch = input.match(/\/collections\/([^\/\?#]+)/i);
      return {
        url: normalizeUrl(input),
        singleProduct: false,
        collectionHandle: collMatch ? collMatch[1] : null
      };
    }
    var handle = input.replace(/^\//, "");
    return {
      url: STORE_BASE + "/collections/" + handle + "/products.json",
      singleProduct: false,
      collectionHandle: handle
    };
  }

  function getData() {
    const urlInput = byId("url").value.trim();
    const pasteInput = byId("jsonPaste").value.trim();
    if (urlInput) {
      var resolved = resolveFetchUrl(urlInput);
      return fetch(resolved.url).then(function (res) {
        if (!res.ok) {
          throw new Error("HTTP " + res.status + " " + res.statusText);
        }
        return res.json();
      }).then(function (data) {
        if (resolved.singleProduct && data.product) {
          return { products: [data.product], collectionHandle: null };
        }
        return { products: data.products || [], collectionHandle: resolved.collectionHandle };
      });
    }
    if (pasteInput) {
      try {
        var data = JSON.parse(pasteInput);
        return Promise.resolve({ products: data.products || [], collectionHandle: null });
      } catch (e) {
        throw new Error("Invalid JSON in paste area: " + e.message);
      }
    }
    throw new Error("Enter a URL, collection name, or paste JSON.");
  }

  function getCollectionHandleForLinks(dataCollectionHandle) {
    if (dataCollectionHandle) return dataCollectionHandle;
    var el = byId("collectionNameForLinks");
    return el ? (el.value || "").trim() : "";
  }

  function productUrl(product, collectionHandle) {
    var handle = product.handle || "";
    if (collectionHandle) {
      return STORE_BASE + "/collections/" + collectionHandle + "/products/" + handle;
    }
    return STORE_BASE + "/products/" + handle;
  }

  function renderProductPreview(products, collectionHandle) {
    var container = byId("productPreview");
    if (!container) return;
    var coll = getCollectionHandleForLinks(collectionHandle);
    container.innerHTML = "";
    if (!products.length) {
      container.classList.add("hidden");
      return;
    }
    var heading = document.createElement("h2");
    heading.className = "product-preview-title";
    heading.textContent = "Product preview";
    container.appendChild(heading);
    var grid = document.createElement("div");
    grid.className = "product-preview-grid";
    products.forEach(function (p) {
      var card = document.createElement("div");
      card.className = "product-preview-card";
      var imgSrc = (p.images && p.images[0] && p.images[0].src) ? p.images[0].src : "";
      var link = document.createElement("a");
      link.href = productUrl(p, coll);
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.className = "product-preview-link";
      if (imgSrc) {
        var img = document.createElement("img");
        img.src = imgSrc;
        img.alt = p.title || "";
        img.className = "product-preview-img";
        link.appendChild(img);
      }
      var titleEl = document.createElement("span");
      titleEl.className = "product-preview-title-text";
      titleEl.textContent = p.title || "";
      link.appendChild(titleEl);
      card.appendChild(link);
      var productLink = document.createElement("a");
      productLink.href = productUrl(p, coll);
      productLink.target = "_blank";
      productLink.rel = "noopener noreferrer";
      productLink.className = "product-preview-product-link";
      productLink.textContent = "View product →";
      card.appendChild(productLink);
      grid.appendChild(card);
    });
    container.appendChild(grid);
    setProductPreviewVisible(false);
  }

  function setProductPreviewVisible(visible) {
    var container = byId("productPreview");
    var panel = byId("productPreviewPanel");
    var btn = byId("showProductPreviewBtn");
    if (!panel || !btn) return;
    var hasContent = container && container.children.length > 0;
    if (visible && hasContent) {
      panel.classList.remove("hidden");
      btn.textContent = "Hide product preview";
      btn.setAttribute("aria-expanded", "true");
    } else {
      panel.classList.add("hidden");
      btn.textContent = "Show product preview";
      btn.setAttribute("aria-expanded", "false");
    }
  }

  function renderKnownCollections() {
    var listEl = byId("knownCollectionsList");
    if (!listEl) return;
    listEl.innerHTML = "";
    KNOWN_COLLECTION_NAMES.forEach(function (handle) {
      var a = document.createElement("a");
      a.href = STORE_BASE + "/collections/" + encodeURIComponent(handle);
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = handle;
      listEl.appendChild(a);
    });
  }

  /** Order in which the user checked key checkboxes (used for column order when no preset). */
  var selectedKeysCheckOrder = [];

  function getColumnOrder() {
    var selectedKeys = getSelectedKeys();
    if (preferredKeyOrder && preferredKeyOrder.length) {
      var preferred = preferredKeyOrder.filter(function (k) { return selectedKeys.indexOf(k) !== -1; });
      var rest = selectedKeys.filter(function (k) { return preferredKeyOrder.indexOf(k) === -1; });
      return preferred.concat(rest);
    }
    var orderFromCheck = selectedKeysCheckOrder.filter(function (k) { return selectedKeys.indexOf(k) !== -1; });
    var rest = selectedKeys.filter(function (k) { return orderFromCheck.indexOf(k) === -1; });
    return orderFromCheck.concat(rest);
  }

  function run() {
    clearError();
    setLoading(true);
    var selectedKeys = getSelectedKeys();
    var columnOrder = getColumnOrder();

    getData()
      .then(function (data) {
        var products = data.products || [];
        if (!products.length) {
          showError("No products found in JSON.");
          setLoading(false);
          return;
        }
        var firstOnly = byId("firstOnly").checked;
        var fullObjects = byId("fullObjects").checked;
        var imageSheetsFormula = byId("imageSheetsFormula").checked;

        if (selectedKeys.length === 0) {
          var titles = products.map(function (p) { return p.title || ""; });
          var message = "This collection includes:\n\n" + titles.join("\n") + "\n\nSelect keys above to extract columns for Google Sheets.";
          byId("outputTitle").textContent = "Output";
          renderOutput(message);
          renderProductPreview(products, data.collectionHandle);
          setLoading(false);
          return;
        }

        var valuesByKey = {};
        var syncKeys = selectedKeys.filter(function (k) { return SCRAPE_KEYS.indexOf(k) === -1; });
        var scrapeKeys = selectedKeys.filter(function (k) { return SCRAPE_KEYS.indexOf(k) !== -1; });

        syncKeys.forEach(function (k) {
          var raw = extractKeyValues(products, k, firstOnly, fullObjects);
          valuesByKey[k] = raw.map(function (v) {
            return formatValueForCell(v, k, fullObjects, imageSheetsFormula);
          });
        });

        function finish() {
          buildAndRenderTSV(columnOrder, valuesByKey, products.length);
          renderProductPreview(products, data.collectionHandle);
          setLoading(false);
        }

        if (scrapeKeys.length === 0) {
          finish();
          return;
        }

        return Promise.all(products.map(function (p) {
          var url = STORE_BASE + "/products/" + (p.handle || "");
          return fetch(url).then(function (res) {
            if (!res.ok) throw new Error("HTTP " + res.status + " for " + url);
            return res.text();
          }).then(function (html) {
            var row = {};
            if (scrapeKeys.indexOf("number_of_stickers") !== -1) {
              row.number_of_stickers = getStickerCountFromScrapedHtml(html, p.vendor);
            }
            if (scrapeKeys.indexOf("product_size") !== -1) {
              row.product_size = getSizeFromScrapedHtml(html, p.vendor);
            }
            return row;
          });
        })).then(function (scrapedRows) {
          scrapeKeys.forEach(function (k) {
            valuesByKey[k] = scrapedRows.map(function (r) { return r[k] || ""; });
          });
          finish();
        }).catch(function (err) {
          showError(err.message || "Scrape failed. CORS may block cross-origin requests.");
          var corsNote = byId("corsNote"); if (corsNote) corsNote.classList.remove("hidden");
          setLoading(false);
        });
      })
      .catch(function (err) {
        showError(err.message || "Request failed.");
        if (err.message && err.message.indexOf("fetch") !== -1) {
          var corsNote = byId("corsNote"); if (corsNote) corsNote.classList.remove("hidden");
        }
        setLoading(false);
      });
  }

  function getSelectedKeys() {
    var container = byId("keyCheckboxes");
    if (!container) return [];
    var checkboxes = container.querySelectorAll("input[name=keySel]:checked");
    var out = [];
    for (var i = 0; i < checkboxes.length; i++) {
      out.push(checkboxes[i].value);
    }
    return out;
  }

  function updateKeyOptions() {
    var keys = getSelectedKeys();
    var imagesSelected = keys.indexOf("images") !== -1;
    var showFirst = keys.some(function (k) { return ["images", "variants", "price"].indexOf(k) !== -1; });
    var showFull = keys.some(function (k) { return ["images", "variants"].indexOf(k) !== -1; });
    var showSheets = imagesSelected;
    var keyOptionsEl = byId("keyOptions");
    if (keyOptionsEl) {
      keyOptionsEl.classList.toggle("hidden", !imagesSelected);
      keyOptionsEl.setAttribute("aria-hidden", imagesSelected ? "false" : "true");
    }
    var firstOnlyWrap = byId("firstOnlyWrap"); if (firstOnlyWrap) firstOnlyWrap.classList.toggle("hidden", !showFirst);
    var fullObjectsWrap = byId("fullObjectsWrap"); if (fullObjectsWrap) fullObjectsWrap.classList.toggle("hidden", !showFull);
    var imageSheetsWrap = byId("imageSheetsWrap"); if (imageSheetsWrap) imageSheetsWrap.classList.toggle("hidden", !showSheets);
  }

  function buildAndRenderTSV(selectedKeys, valuesByKey, productCount) {
    var headers = selectedKeys.map(getKeyLabel);
    var rows = [];
    for (var i = 0; i < productCount; i++) {
      rows.push(selectedKeys.map(function (k) {
        return valuesByKey[k] ? valuesByKey[k][i] : "";
      }).map(escapeTsvCell));
    }
    var tsv = [headers.join("\t")].concat(rows.map(function (row) { return row.join("\t"); })).join("\n");
    byId("outputTitle").textContent = "Output (copy and paste into Google Sheets)";
    renderOutput(tsv);
  }

  var keyCheckboxesEl = byId("keyCheckboxes");
  var keyCheckboxesExtraEl = document.createElement("div");
  keyCheckboxesExtraEl.className = "key-checkboxes-extra hidden";
  keyCheckboxesExtraEl.id = "keyCheckboxesExtra";

  KEY_OPTIONS.forEach(function (opt) {
    var label = document.createElement("label");
    label.className = "checkbox";
    var input = document.createElement("input");
    input.type = "checkbox";
    input.name = "keySel";
    input.value = opt.value;
    input.id = "key_" + opt.value;
    input.addEventListener("change", function () {
      preferredKeyOrder = null;
      var val = input.value;
      if (input.checked) {
        if (selectedKeysCheckOrder.indexOf(val) === -1) {
          selectedKeysCheckOrder.push(val);
        }
      } else {
        selectedKeysCheckOrder = selectedKeysCheckOrder.filter(function (k) { return k !== val; });
      }
      updateKeyOptions();
    });
    label.appendChild(input);
    label.appendChild(document.createTextNode(" " + opt.label));
    if (opt.hidden) {
      keyCheckboxesExtraEl.appendChild(label);
    } else {
      keyCheckboxesEl.appendChild(label);
    }
  });
  keyCheckboxesEl.appendChild(keyCheckboxesExtraEl);

  on("selectAllKeysBtn", "click", function () {
    preferredKeyOrder = null;
    keyCheckboxesEl.querySelectorAll("input[name=keySel]").forEach(function (cb) { cb.checked = true; });
    updateKeyOptions();
  });
  on("clearKeysBtn", "click", function () {
    preferredKeyOrder = null;
    keyCheckboxesEl.querySelectorAll("input[name=keySel]").forEach(function (cb) { cb.checked = false; });
    updateKeyOptions();
  });
  on("easyPeasyBtn", "click", function () {
    preferredKeyOrder = EASY_PEASY_KEYS.slice();
    keyCheckboxesEl.querySelectorAll("input[name=keySel]").forEach(function (cb) {
      cb.checked = EASY_PEASY_KEYS.indexOf(cb.value) !== -1;
    });
    var fo = byId("firstOnly"); if (fo) fo.checked = true;
    var isf = byId("imageSheetsFormula"); if (isf) isf.checked = true;
    updateKeyOptions();
  });

  on("showMoreKeysBtn", "click", function () {
    var extra = byId("keyCheckboxesExtra");
    var btn = byId("showMoreKeysBtn");
    if (extra && btn) {
      extra.classList.toggle("hidden");
      btn.textContent = extra.classList.contains("hidden") ? "Show more keys" : "Hide extra keys";
    }
  });

  on("showProductPreviewBtn", "click", function () {
    var panel = byId("productPreviewPanel");
    var isExpanded = panel && !panel.classList.contains("hidden");
    setProductPreviewVisible(!isExpanded);
  });

  var form = byId("form");
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      run(false);
    });
  }

  on("easyPeasyFetchBtn", "click", function (e) {
    e.preventDefault();
    preferredKeyOrder = EASY_PEASY_KEYS.slice();
    keyCheckboxesEl.querySelectorAll("input[name=keySel]").forEach(function (cb) {
      cb.checked = EASY_PEASY_KEYS.indexOf(cb.value) !== -1;
    });
    var firstOnly = byId("firstOnly");
    if (firstOnly) firstOnly.checked = true;
    var imageSheetsFormula = byId("imageSheetsFormula");
    if (imageSheetsFormula) imageSheetsFormula.checked = true;
    updateKeyOptions();
    run(false);
  });

  on("scrapePageBtn", "click", function () {
    clearError();
    var urlInput = byId("url").value.trim();
    var pageUrl = getProductPageUrl(urlInput);
    if (!pageUrl) {
      showError("Enter a product page URL to scrape (e.g. https://pixyls.ca/collections/.../products/product-handle).");
      return;
    }
    setLoading(true);
    fetch(pageUrl, { method: "GET", headers: { Accept: "text/html" } })
      .then(function (res) {
        if (!res.ok) {
          throw new Error("HTTP " + res.status + " " + res.statusText);
        }
        return res.text();
      })
      .then(function (html) {
        var sections = scrapeSectionsFromHtml(html);
        if (!sections.length) {
          renderOutput("No known sections found on the page (looked for: About this Kit, What's Inside the Kit, How to frame, etc.). The theme may use different headings.");
        } else {
          var lines = ["Scraped sections from: " + pageUrl + "\n"];
          sections.forEach(function (sec) {
            lines.push("--- " + sec.title + " ---");
            lines.push(sec.body);
            lines.push("");
          });
          byId("outputTitle").textContent = "Scraped sections";
          renderOutput(lines.join("\n").trim());
        }
      })
      .catch(function (err) {
        showError(err.message || "Scrape failed. If you see a CORS or network error, the site may block cross-origin requests.");
        var corsNote = byId("corsNote"); if (corsNote) corsNote.classList.remove("hidden");
      })
      .then(function () {
        setLoading(false);
      });
  });

  updateKeyOptions();

  on("usePasteBtn", "click", function () {
    clearError();
    var pasteInput = byId("jsonPaste").value.trim();
    if (!pasteInput) {
      showError("Paste JSON first.");
      return;
    }
    try {
      var data = JSON.parse(pasteInput);
    } catch (e) {
      showError("Invalid JSON: " + e.message);
      return;
    }
    var products = data.products || [];
    if (!products.length) {
      showError("No products array in JSON.");
      return;
    }
    var selectedKeys = getSelectedKeys();
    var columnOrder = getColumnOrder();
    var firstOnly = byId("firstOnly").checked;
    var fullObjects = byId("fullObjects").checked;
    var imageSheetsFormula = byId("imageSheetsFormula").checked;
    var availableKeys = Object.keys(products[0]);

    if (selectedKeys.length === 0) {
      var titles = products.map(function (p) { return p.title || ""; });
      var message = "This collection includes:\n\n" + titles.join("\n") + "\n\nSelect keys above to extract columns for Google Sheets.";
      byId("outputTitle").textContent = "Output";
      renderOutput(message);
      renderProductPreview(products, null);
      return;
    }

    setLoading(true);
    var valuesByKey = {};
    var syncKeys = selectedKeys.filter(function (k) { return SCRAPE_KEYS.indexOf(k) === -1; });
    var scrapeKeys = selectedKeys.filter(function (k) { return SCRAPE_KEYS.indexOf(k) !== -1; });

    syncKeys.forEach(function (k) {
      var raw = extractKeyValues(products, k, firstOnly, fullObjects);
      valuesByKey[k] = raw.map(function (v) {
        return formatValueForCell(v, k, fullObjects, imageSheetsFormula);
      });
    });

    function finish() {
      buildAndRenderTSV(columnOrder, valuesByKey, products.length);
      renderProductPreview(products, null);
      setLoading(false);
    }

    if (scrapeKeys.length === 0) {
      finish();
      return;
    }

    Promise.all(products.map(function (p) {
      var url = STORE_BASE + "/products/" + (p.handle || "");
      return fetch(url).then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status + " for " + url);
        return res.text();
      }).then(function (html) {
        var row = {};
        if (scrapeKeys.indexOf("number_of_stickers") !== -1) {
          row.number_of_stickers = getStickerCountFromScrapedHtml(html, p.vendor);
        }
        if (scrapeKeys.indexOf("product_size") !== -1) {
          row.product_size = getSizeFromScrapedHtml(html, p.vendor);
        }
        return row;
      });
    })).then(function (scrapedRows) {
      scrapeKeys.forEach(function (k) {
        valuesByKey[k] = scrapedRows.map(function (r) { return r[k] || ""; });
      });
      finish();
    }).catch(function (err) {
      showError(err.message || "Scrape failed. CORS may block cross-origin requests.");
      var corsNote = byId("corsNote"); if (corsNote) corsNote.classList.remove("hidden");
      setLoading(false);
    });
  });

  on("copyBtn", "click", function () {
    var pre = byId("result");
    if (!navigator.clipboard || !navigator.clipboard.writeText) {
      return;
    }
    navigator.clipboard.writeText(pre.textContent).then(
      function () {
        var btn = byId("copyBtn");
        var orig = btn.textContent;
        btn.textContent = "Copied!";
        setTimeout(function () {
          btn.textContent = orig;
        }, 1500);
      }
    );
  });

  renderKnownCollections();
  on("knownCollectionsAccordionBtn", "click", function () {
    var btn = byId("knownCollectionsAccordionBtn");
    var panel = byId("knownCollectionsPanel");
    var isExpanded = btn.getAttribute("aria-expanded") === "true";
    btn.setAttribute("aria-expanded", !isExpanded);
    panel.classList.toggle("hidden", isExpanded);
  });
  on("pasteAccordionBtn", "click", function () {
    var btn = byId("pasteAccordionBtn");
    var panel = byId("pasteAccordionPanel");
    var isExpanded = btn.getAttribute("aria-expanded") === "true";
    btn.setAttribute("aria-expanded", !isExpanded);
    panel.classList.toggle("hidden", isExpanded);
  });
})();
