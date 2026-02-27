(function () {
  "use strict";

  function byId(id) {
    return document.getElementById(id);
  }

  function normalizeUrl(url) {
    const u = (url || "").trim();
    if (!u) return "";
    if (/\/collections\//.test(u) && !/\.json$/.test(u) && !u.includes("products.json")) {
      return u.replace(/\/?$/, "/") + "products.json";
    }
    return u;
  }

  function extractKeyValues(products, keyName, firstOnly, fullObjects) {
    const values = [];
    for (const product of products) {
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

  function formatValue(value, keyName, fullObjects) {
    if (Array.isArray(value) && ["images", "variants"].indexOf(keyName) !== -1 && !fullObjects) {
      return value.join("\n");
    }
    if (value !== null && (Array.isArray(value) || typeof value === "object")) {
      return JSON.stringify(value, null, 2);
    }
    return String(value);
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
    byId("submitBtn").disabled = loading;
    byId("listKeysBtn").disabled = loading;
  }

  function getData() {
    const urlInput = byId("url").value.trim();
    const pasteInput = byId("jsonPaste").value.trim();
    if (pasteInput) {
      try {
        return Promise.resolve(JSON.parse(pasteInput));
      } catch (e) {
        throw new Error("Invalid JSON in paste area: " + e.message);
      }
    }
    if (!urlInput) {
      throw new Error("Enter a URL or paste JSON.");
    }
    const url = normalizeUrl(urlInput);
    return fetch(url).then(function (res) {
      if (!res.ok) {
        throw new Error("HTTP " + res.status + " " + res.statusText);
      }
      return res.json();
    });
  }

  function run(listKeysOnly) {
    clearError();
    setLoading(true);
    getData()
      .then(function (data) {
        const products = data.products || [];
        if (!products.length) {
          showError("No products found in JSON.");
          setLoading(false);
          return;
        }
        const keyName = byId("key").value.trim();
        const firstOnly = byId("firstOnly").checked;
        const fullObjects = byId("fullObjects").checked;
        const availableKeys = Object.keys(products[0]);

        let lines = ["Found " + products.length + " products\n", "Available keys:"];
        availableKeys.forEach(function (k) {
          lines.push("  • " + k);
        });

        if (listKeysOnly || !keyName) {
          renderOutput(lines.join("\n"));
          setLoading(false);
          return;
        }

        const values = extractKeyValues(products, keyName, firstOnly, fullObjects);
        lines = [];
        lines.push("Values for key '" + keyName + "':");
        if (keyName === "images" && !fullObjects) {
          lines.push(firstOnly ? "(Showing first src URL only)" : "(Showing src URLs only. Use Full objects to see all image data)");
        } else if (keyName === "variants" && !fullObjects) {
          lines.push(firstOnly ? "(Showing first variant price only)" : "(Showing prices only. Use Full objects to see all variant data)");
        }
        lines.push("");

        values.forEach(function (value) {
          lines.push(formatValue(value, keyName, fullObjects));
          lines.push("");
        });

        byId("outputTitle").textContent = "Output";
        renderOutput(lines.join("\n").trim());
      })
      .catch(function (err) {
        showError(err.message || "Request failed.");
        if (err.message && err.message.indexOf("fetch") !== -1) {
          byId("corsNote").classList.remove("hidden");
        }
      })
      .then(function () {
        setLoading(false);
      });
  }

  byId("form").addEventListener("submit", function (e) {
    e.preventDefault();
    run(false);
  });

  byId("listKeysBtn").addEventListener("click", function () {
    run(true);
  });

  byId("usePasteBtn").addEventListener("click", function () {
    clearError();
    const pasteInput = byId("jsonPaste").value.trim();
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
    var keyName = byId("key").value.trim();
    var firstOnly = byId("firstOnly").checked;
    var fullObjects = byId("fullObjects").checked;
    var availableKeys = Object.keys(products[0]);
    var lines = ["Found " + products.length + " products\n", "Available keys:"];
    availableKeys.forEach(function (k) {
      lines.push("  • " + k);
    });
    if (!keyName) {
      byId("outputTitle").textContent = "Output";
      renderOutput(lines.join("\n"));
      return;
    }
    var values = extractKeyValues(products, keyName, firstOnly, fullObjects);
    lines = [];
    lines.push("Values for key '" + keyName + "':");
    if (keyName === "images" && !fullObjects) {
      lines.push(firstOnly ? "(Showing first src URL only)" : "(Showing src URLs only.)");
    } else if (keyName === "variants" && !fullObjects) {
      lines.push(firstOnly ? "(Showing first variant price only)" : "(Showing prices only.)");
    }
    lines.push("");
    values.forEach(function (value) {
      lines.push(formatValue(value, keyName, fullObjects));
      lines.push("");
    });
    byId("outputTitle").textContent = "Output";
    renderOutput(lines.join("\n").trim());
  });

  byId("copyBtn").addEventListener("click", function () {
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
})();
