import { checkTemplate } from "./";

checkTemplate(
  "test/polygerrit/gr-change-list-view.html",
  "test/polygerrit/gr-change-list-view.js",
  "foo.bar.gr-change-list-view",
  "/** @externs */ var page; var Gerrit;"
);
