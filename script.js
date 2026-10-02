(function () {
  "use strict";

  var DEFAULT_CC = "91";            // country code added to 10-digit numbers
  var KEY = "emergency-card-v2";
  var OLD_KEY = "emergency-card-v1"; // migrated automatically
  var MAX_CONTACTS = 5;

  var $ = function (id) { return document.getElementById(id); };
  var statusEl = $("status");
  function setStatus(msg) { if (statusEl) statusEl.textContent = msg; }
  function on(el, fn) { if (el) el.addEventListener("click", fn); }

  /* ---------- Location ---------- */
  // cb receives a coords object {latitude, longitude, accuracy} or null.
  function getPosition(cb) {
    if (!navigator.geolocation) {
      setStatus("Your browser cannot share location.");
      cb(null);
      return;
    }
    setStatus("Finding your location…");
    navigator.geolocation.getCurrentPosition(
      function (pos) { setStatus(""); cb(pos.coords); },
      function () {
        setStatus("Location is blocked or unavailable. Allow location in your browser settings.");
        cb(null);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }

  // Opens a tab inside the tap (so popup blockers allow it), then points it at
  // the URL once the location arrives. open(null) closes the tab again.
  function withTab(task) {
    var tab = window.open("", "_blank");
    task(function (url) {
      if (!url) { if (tab) tab.close(); return; }
      if (tab && !tab.closed) {
        try { tab.opener = null; } catch (e) {}
        tab.location.href = url;
      } else {
        window.location.href = url;
      }
    });
  }

  function mapsLink(c) {
    return "https://www.google.com/maps?q=" + c.latitude.toFixed(6) + "," + c.longitude.toFixed(6);
  }

  function phoneOf(p) {
    var d = String(p || "").replace(/\D/g, "").replace(/^00/, "");
    if (d.length === 11 && d.charAt(0) === "0") d = d.slice(1);
    return d.length === 10 ? DEFAULT_CC + d : d;
  }

  function smsHref(nums, q) {
    if (!nums) return "sms:?&body=" + q;
    var ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    // On iOS a raw "+" inside a query string can be read as a space.
    return ios ? "sms:/open?addresses=" + nums.replace(/\+/g, "%2B") + "&body=" + q
               : "sms:" + nums + "?body=" + q;
  }

  /* ---------- Nearby help ---------- */
  function openNearby(query) {
    withTab(function (open) {
      getPosition(function (c) {
        open(c
          ? "https://www.google.com/maps/search/" + encodeURIComponent(query) + "/@" + c.latitude + "," + c.longitude + ",14z"
          : "https://www.google.com/maps/search/" + encodeURIComponent(query + " near me"));
      });
    });
  }
  on($("hospitalBtn"), function () { openNearby("hospital"); });
  document.querySelectorAll(".chip[data-q]").forEach(function (btn) {
    btn.addEventListener("click", function () { openNearby(btn.getAttribute("data-q")); });
  });

  /* ---------- Share location ---------- */
  function shareText(c) { return "I need help. My location: " + mapsLink(c); }

  on($("shareWa"), function () {
    withTab(function (open) {
      getPosition(function (c) {
        if (!c) { setStatus("Could not get your location, so nothing was shared."); open(null); return; }
        open("https://wa.me/?text=" + encodeURIComponent(shareText(c)));
      });
    });
  });
  on($("shareSms"), function () {
    getPosition(function (c) {
      if (!c) { setStatus("Could not get your location, so nothing was shared."); return; }
      window.location.href = smsHref("", encodeURIComponent(shareText(c)));
    });
  });

  /* ---------- Emergency card (saved on this device) ---------- */
  var form = $("cardForm");
  var view = $("cardView");

  function blank() { return { name: "", blood: "", medical: "", contacts: [] }; }

  function load() {
    try {
      var cur = JSON.parse(localStorage.getItem(KEY));
      if (cur && Array.isArray(cur.contacts)) return Object.assign(blank(), cur);
      var old = JSON.parse(localStorage.getItem(OLD_KEY)); // v1 had one contact
      if (old) {
        var d = blank();
        d.name = old.name || ""; d.blood = old.blood || ""; d.medical = old.medical || "";
        if (old.cphone) d.contacts.push({ n: old.cname || "Contact", p: old.cphone });
        return d;
      }
    } catch (e) {}
    return blank();
  }
  function save(d) {
    try { localStorage.setItem(KEY, JSON.stringify(d)); return true; } catch (e) { return false; }
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  var data = load();

  // Extra contact rows are created here, so no HTML change is needed.
  var extra = document.createElement("div");
  extra.className = "extra-contacts";
  var addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "btn btn-ghost";
  addBtn.textContent = "+ Add another contact";
  (function place() {
    var f = form.elements.cphone;
    var anchor = f && (f.closest("label") || f.parentNode);
    if (anchor) anchor.insertAdjacentElement("afterend", extra); else form.appendChild(extra);
    extra.insertAdjacentElement("afterend", addBtn);
  })();

  function addRow(n, p) {
    if (extra.children.length >= MAX_CONTACTS - 1) {
      setStatus("You can save up to " + MAX_CONTACTS + " contacts.");
      return;
    }
    var row = document.createElement("div");
    row.className = "contact-row";
    var ni = document.createElement("input");
    ni.type = "text"; ni.placeholder = "Contact name"; ni.value = n || "";
    ni.setAttribute("aria-label", "Extra contact name");
    var pi = document.createElement("input");
    pi.type = "tel"; pi.placeholder = "Phone number"; pi.value = p || "";
    pi.setAttribute("aria-label", "Extra contact phone");
    var rm = document.createElement("button");
    rm.type = "button"; rm.className = "mini"; rm.textContent = "Remove";
    rm.addEventListener("click", function () { row.remove(); });
    row.appendChild(ni); row.appendChild(pi); row.appendChild(rm);
    extra.appendChild(row);
  }
  on(addBtn, function () { addRow("", ""); });

  function fill(d) {
    ["name", "blood", "medical"].forEach(function (k) { form.elements[k].value = d[k] || ""; });
    form.elements.cname.value = d.contacts[0] ? d.contacts[0].n : "";
    form.elements.cphone.value = d.contacts[0] ? d.contacts[0].p : "";
    extra.innerHTML = "";
    d.contacts.slice(1).forEach(function (x) { addRow(x.n, x.p); });
  }

  function readForm() {
    var d = blank();
    ["name", "blood", "medical"].forEach(function (k) { d[k] = form.elements[k].value.trim(); });
    var list = [{ n: form.elements.cname.value.trim(), p: form.elements.cphone.value.trim() }];
    extra.querySelectorAll(".contact-row").forEach(function (r) {
      var i = r.querySelectorAll("input");
      list.push({ n: i[0].value.trim(), p: i[1].value.trim() });
    });
    var entered = list.filter(function (x) { return x.p; }).length;
    d.contacts = list
      .filter(function (x) { return phoneOf(x.p).length >= 10; })
      .slice(0, MAX_CONTACTS)
      .map(function (x) { return { n: x.n || "Contact", p: x.p }; });
    if (d.contacts.length < entered) setStatus("Some phone numbers looked too short and were skipped.");
    return d;
  }

  function render(d) {
    if (!d.name && !d.blood && !d.medical && !d.contacts.length) {
      view.hidden = true; view.innerHTML = ""; return;
    }
    var rows = [["Name", d.name], ["Blood group", d.blood], ["Allergies / conditions", d.medical]]
      .filter(function (r) { return r[1]; })
      .map(function (r) { return "<dt>" + r[0] + "</dt><dd>" + esc(r[1]) + "</dd>"; }).join("");
    var calls = d.contacts.map(function (x) {
      return '<a class="btn btn-red" href="tel:+' + esc(phoneOf(x.p)) + '">Call ' + esc(x.n) + "</a>";
    }).join("");
    view.innerHTML = "<h3>Emergency card</h3><dl>" + rows + "</dl>" + calls;
    view.hidden = false;
  }

  fill(data);
  render(data);

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    data = readForm();
    if (!save(data)) setStatus("Could not save on this browser. The card is shown but will be lost on refresh.");
    render(data);
  });

  on($("clearCard"), function () {
    try { localStorage.removeItem(KEY); localStorage.removeItem(OLD_KEY); } catch (e) {}
    form.reset();
    extra.innerHTML = "";
    data = blank();
    render(data);
    var p = document.querySelector(".sos-panel");
    if (p) p.hidden = true;
  });

  /* ---------- SOS: one tap opens SMS to everyone, buttons for WhatsApp ---------- */
  var box = document.querySelector(".hero-actions");
  if (box) {
    var panel = document.createElement("div");
    panel.className = "sos-panel";
    panel.hidden = true;
    box.insertAdjacentElement("afterend", panel);

    var sos = document.createElement("button");
    sos.className = "btn btn-sos";
    sos.type = "button";
    sos.textContent = "SOS: alert my contacts";
    box.appendChild(sos);

    // Keep a fresh GPS fix ready so SOS is instant (once location was allowed).
    var last = null, watchId = null;
    var startWatch = function () {
      if (watchId !== null || !navigator.geolocation) return;
      watchId = navigator.geolocation.watchPosition(
        function (p) { last = { c: p.coords, t: Date.now() }; },
        function () {},
        { enableHighAccuracy: true, maximumAge: 0 }
      );
    };
    var stopWatch = function () {
      if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
    };
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: "geolocation" }).then(function (s) {
        if (s.state === "granted") startWatch();
      }).catch(function () {});
    }
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) stopWatch(); else if (last) startWatch();
    });

    var link = function (href, text, cls) {
      var a = document.createElement("a");
      a.href = href; a.textContent = text; a.className = cls;
      if (href.indexOf("https") === 0) { a.target = "_blank"; a.rel = "noopener"; }
      return a;
    };

    var buildMessage = function (c) {
      var m = "EMERGENCY! " + (data.name ? data.name + " needs" : "I need") + " help right now.";
      if (c) m += " Live location: " + mapsLink(c) + " (accurate to about " + Math.round(c.accuracy) + " m).";
      else m += " Location unavailable, please call me.";
      if (data.blood) m += " Blood group: " + data.blood + ".";
      if (data.medical) m += " Medical: " + data.medical + ".";
      return m;
    };

    var showPanel = function (c) {
      var q = encodeURIComponent(buildMessage(c));
      var nums = data.contacts.map(function (x) { return "+" + phoneOf(x.p); }).join(",");
      panel.innerHTML = "";
      var h = document.createElement("h3");
      h.textContent = "Alert ready. If your SMS app did not open, tap below.";
      var info = document.createElement("p");
      info.textContent = c
        ? "Location found, accurate to about " + Math.round(c.accuracy) + " metres."
        : "Could not get your location. The message will go without it.";
      panel.appendChild(h);
      panel.appendChild(info);
      panel.appendChild(link(smsHref(nums, q), "SMS everyone at once", "btn btn-red"));
      panel.appendChild(link("https://wa.me/?text=" + q, "WhatsApp: choose a group or chat", "btn btn-ghost"));
      data.contacts.forEach(function (x) {
        var row = document.createElement("div");
        row.className = "sos-row";
        var nm = document.createElement("b");
        nm.textContent = x.n;
        row.appendChild(nm);
        row.appendChild(link("https://wa.me/" + phoneOf(x.p) + "?text=" + q, "WhatsApp", "mini"));
        row.appendChild(link(smsHref("+" + phoneOf(x.p), q), "SMS", "mini"));
        panel.appendChild(row);
      });
      panel.appendChild(link("tel:112", "Call 112 now", "btn btn-ghost"));
      panel.hidden = false;
      panel.scrollIntoView({ behavior: "smooth", block: "center" });
      return smsHref(nums, q);
    };

    sos.addEventListener("click", function () {
      if (!data.contacts.length) {
        alert("Add at least one emergency contact first.");
        location.hash = "#card";
        return;
      }
      startWatch();
      var go = function (c) { window.location.href = showPanel(c); };
      if (last && Date.now() - last.t < 30000) { go(last.c); return; }
      getPosition(function (c) { go(c || (last && last.c) || null); });
    });
  }

  /* ---------- Loading screen with safety quotes ---------- */
  (function () {
    var L = $("loader");
    if (!L) return;
    var seen = null;
    try { seen = sessionStorage.getItem("seen"); } catch (e) {}
    if (seen) { L.remove(); return; }

    var quotes = [
      "Stay calm. Clear thinking saves lives.",
      "Know your exits before you need them.",
      "Two minutes of first aid can change everything.",
      "In an emergency, call first, then help.",
      "Preparation turns panic into action.",
      "Safety is what you do before it is needed."
    ];
    var q = $("quote"), i = 0;
    var timer = q ? setInterval(function () {
      i = (i + 1) % quotes.length;
      q.classList.add("swap");
      setTimeout(function () { q.textContent = quotes[i]; q.classList.remove("swap"); }, 300);
    }, 2200) : null;

    var done = false, minDone = false, loaded = document.readyState === "complete";
    function hide() {
      if (done) return;
      done = true;
      if (timer) clearInterval(timer);
      L.classList.add("done");
      setTimeout(function () { L.remove(); }, 500);
      try { sessionStorage.setItem("seen", "1"); } catch (e) {}
    }
    setTimeout(function () { minDone = true; if (loaded) hide(); }, 2000);
    window.addEventListener("load", function () { loaded = true; if (minDone) hide(); });
    setTimeout(hide, 4000);
    on($("skipLoader"), hide);
  })();

  /* ---------- Sections fade in as you scroll ---------- */
  (function () {
    if (!("IntersectionObserver" in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      });
    }, { threshold: 0 });
    document.querySelectorAll("main section:not(.hero)").forEach(function (s) {
      s.classList.add("reveal");
      io.observe(s);
    });
  })();
})();
