import { checkTemplate } from "./";

try {
  (async () => {
    await checkTemplate(
      "test/elms/foo-elm.html",
      "test/elms/foo-elm.js",
      "foo.foo_elm",
      [
        {
          path: "custom-externs.js",
          src: "/** @externs */ var page; var Gerrit;"
        }
      ]
    );
  })();
} catch (e) {
  console.log(`Test failed ${e}`);
  process.exit(1);
}
