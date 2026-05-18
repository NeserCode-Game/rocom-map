import ReactDOM from "react-dom/client";
import { App } from "./App";
import React from "react";
import { BrowserRouter } from "react-router";

import { WindowUtils } from "@/lib/window.utils";
import { nextTick } from "./composables";

if (window.location.pathname !== "/selector" && window.location.pathname !== "/nav-island") {
  const $windowMain = new WindowUtils("main");
  nextTick(() => {
    $windowMain.renderFocus();
  });
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
