(function () {
  "use strict";

  var statusEl = document.getElementById("status");

  function setStatus(msg) { statusEl.textContent = msg; }

  /* ---------- Location helpers ---------- */
  function getPosition(onOk) {
    if (!navigator.geolocation) {
      setStatus("Your browser cannot share location. Opening a general search instead.");
      onOk(null);
      return;
    }
    setStatus("Finding your location…");
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        setStatus("");
        onOk({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      function () {
        setStatus("Location is blocked. Allow location in your browser, or use the general search that just opened.");
        onOk(null);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }

  function openNearby(query) {
    getPosition(function (p) {
      var url = p
        ? "https://www.google.com/maps/search/" + encodeURIComponent(query) + "/@" + p.lat + "," + p.lng + ",14z"
        : "https://www.google.com/maps/search/" + encodeURIComponent(query + " near me");
      window.open(url, "_blank", "noopener");
    });
  }

  document.getElementById("hospitalBtn").addEventListener("click", function () { openNearby("hospital"); });
  document.querySelectorAll(".chip[data-q]").forEach(function (btn) {
    btn.addEventListener("click", function () { openNearby(btn.getAttribute("data-q")); });
  });

  /* ---------- Share location ---------- */
  function shareLocation(channel) {
    getPosition(function (p) {
      if (!p) { setStatus("Could not get your location, so nothing was shared."); return; }
      var link = "https://www.google.com/maps?q=" + p.lat + "," + p.lng;
      var text = "I need help. My location: " + link;
      var url = channel === "wa"
        ? "https://wa.me/?text=" + encodeURIComponent(text)
        : "sms:?&body=" + encodeURIComponent(text);
      window.open(url, "_blank", "noopener");
    });
  }
  document.getElementById("shareWa").addEventListener("click", function () { shareLocation("wa"); });
  document.getElementById("shareSms").addEventListener("click", function () { shareLocation("sms"); });

  /* ---------- Emergency card (saved on this device) ---------- */
  var KEY = "emergency-card-v1";
  var form = document.getElementById("cardForm");
  var view = document.getElementById("cardView");

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; }
  }
  function save(data) {
    try { localStorage.setItem(KEY, JSON.stringify(data)); return true; } catch (e) { return false; }
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function render(d) {
    if (!d) { view.hidden = true; view.innerHTML = ""; return; }
    var phone = (d.cphone || "").replace(/[^\d+]/g, "");
    var rows = [
      ["Name", d.name], ["Blood group", d.blood],
      ["Allergies / conditions", d.medical],
      ["Emergency contact", d.cname]
    ].filter(function (r) { return r[1]; })
     .map(function (r) { return "<dt>" + r[0] + "</dt><dd>" + esc(r[1]) + "</dd>"; }).join("");
    view.innerHTML =
      "<h3>Emergency card</h3><dl>" + rows + "</dl>" +
      (phone ? '<a class="btn btn-red" href="tel:' + esc(phone) + '">Call ' + esc(d.cname || phone) + "</a>" : "");
    view.hidden = false;
  }

  var saved = load();
  if (saved) {
    Object.keys(saved).forEach(function (k) { if (form.elements[k]) form.elements[k].value = saved[k]; });
    render(saved);
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var data = {};
    ["name", "blood", "medical", "cname", "cphone"].forEach(function (k) {
      data[k] = form.elements[k].value.trim();
    });
    if (!save(data)) { setStatus("Could not save on this browser. The card is shown but will be lost on refresh."); }
    render(data);
  });

  document.getElementById("clearCard").addEventListener("click", function () {
    try { localStorage.removeItem(KEY); } catch (e) {}
    form.reset();
    render(null);
  });
})();