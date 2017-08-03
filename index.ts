import { generateInterface } from "twinkie/index";
import { writeSync, readFileSync } from "fs";
const compile = require("google-closure-compiler-js").compile;
const tmp = require("tmp");
const toClosureJS = require("tsickle/built/src/main").toClosureJS;
const MODULE_EXTRACTOR = /^goog\.module\(\'(.*)\'\)/;

export function checkTemplate(
  htmlSrcPath: string,
  jsSrcPath: string,
  jsModule: string,
  externs: string = ""
) {
  const generatedInterface = generateInterface(htmlSrcPath);

  tmp.file(
    { postfix: ".ts" },
    (err: Error, path: string, fd: number, cleanup: () => void) => {
      const diagnostics: any[] = [];

      if (err) {
        throw err;
      }

      writeSync(fd, generatedInterface);
      const closure = toClosureJS(
        { sourceMap: false, experimentalDecorators: true },
        [path],
        { isTyped: true },
        diagnostics as any[]
      );

      if (closure === null) {
        diagnostics.forEach(v => console.log(v));
        throw Error(
          "Unable to generate JS from typescript interface. Please file a bug."
        );
      }

      const closureInterface = closure.jsFiles.get(
        Array.from(closure.jsFiles.keys())[0]
      );
      const interfaceModule = closureInterface.match(MODULE_EXTRACTOR)[1];
      const polymerExterns = readFileSync(
        require.resolve(
          "google-closure-compiler-js/contrib/externs/polymer-1.0.js"
        ),
        "utf-8"
      );

      const flags = {
        polymerVersion: 1,
        warningLevel: "VERBOSE",
        jsCode: [
          { src: externs, path: "customExterns.js" },
          { src: polymerExterns, path: "polymer-1.0.js" },
          { src: closureInterface, path: "generated-html-interface.js" },
          {
            path: "view-source.js",
            src: readFileSync(jsSrcPath, "utf-8")
          },
          {
            path: "interface-test.js",
            src: `
goog.module('template.check');
const templateInterface = goog.require('${interfaceModule}')
const View = goog.require('${jsModule}');

/** @type {!View} */
const view = new View();

var /** !templateInterface.TemplateInterface */ t = view;
            `
          }
        ]
      };

      const compiledResults = compile(flags);
      const joinedErrors = compiledResults.errors.concat(
        compiledResults.warnings
      );

      if (joinedErrors.length) {
        console.log("GENERATED INTERFACE");
        console.log(closureInterface);
      }

      for (const errorMsg of joinedErrors) {
        console.log(errorMsg.description);
      }
      cleanup();

      if (joinedErrors.length) {
        process.exit(1);
      }
    }
  );
}
