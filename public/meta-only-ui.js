(function (root) {
  "use strict";
  function hide(element) { if (!element) return; element.hidden = true; element.setAttribute("aria-hidden", "true"); }
  function hideLegacyUi() {
    ["#accountForm", "#showAccountForm", "#accountsGrid", "#inboxCompose"].forEach(function (selector) { hide(document.querySelector(selector)); });
    document.querySelectorAll("[data-launch], [data-enable-openwa], [data-close], [data-inbox-action='handoff']").forEach(hide);
    document.querySelectorAll("#accountsView .section-heading").forEach(function (heading) {
      if ((heading.textContent || "").toLowerCase().includes("whatsapp numbers")) {
        hide(heading);
        if (heading.nextElementSibling && heading.nextElementSibling.id === "accountsGrid") hide(heading.nextElementSibling);
      }
    });
  }
  function labelMetaUi() {
    var panel = document.querySelector("#metaSignupPanel");
    if (!panel) return;
    var heading = panel.querySelector("strong");
    var button = panel.querySelector("#metaSignupButton");
    if (heading) heading.textContent = "Connect WhatsApp with Meta";
    if (button) button.textContent = "Connect WhatsApp with Meta";
    var status = panel.querySelector("#metaSignupStatus");
    if (status && status.textContent.trim() && !status.dataset.providerLabeled) {
      status.textContent = status.textContent.split("\n").map(function (line) {
        return line && !line.toLowerCase().includes("meta / whatsapp cloud") && !line.toLowerCase().includes("no official") ? "Meta / WhatsApp Cloud — " + line : line;
      }).join("\n");
      status.dataset.providerLabeled = "true";
    }
  }
  function apply(features) {
    root.WA_FEATURES = features || {};
    if (root.WA_FEATURES.openwaEnabled !== true) hideLegacyUi();
    labelMetaUi();
  }
  function discover() {
    fetch("/api/features", { credentials: "same-origin" }).then(function (response) { return response.ok ? response.json() : {}; }).then(apply).catch(function () { apply({ openwaEnabled: false }); });
  }
  if (typeof document !== "undefined") {
    new MutationObserver(function () { labelMetaUi(); if (!root.WA_FEATURES || root.WA_FEATURES.openwaEnabled !== true) hideLegacyUi(); }).observe(document.documentElement, { childList: true, subtree: true });
    apply({ openwaEnabled: false });
    discover();
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
