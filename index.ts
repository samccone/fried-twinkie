import * as chalk from "chalk";
import { readFileSync, writeSync } from "fs";
import { generateInterface } from "twinkie/index";

const compile = require("google-closure-compiler-js").compile;
const tmp = require("tmp");
const toClosureJS = require("tsickle/built/src/main").toClosureJS;
const MODULE_EXTRACTOR = /^goog\.module\(\'(.*)\'\)/;

function printError(
  sourceFileContents: string,
  htmlSrcPath: string,
  generatedHtmlInterfacePath: string,
  additionalSources: { src: string; path?: string }[] | undefined,
  errorMessage: {
    file: string;
    description: string;
    type: string;
    lineNo: number;
    charNo: number;
  }
) {
  if (errorMessage.file) {
    console.log(`Error from file: ${chalk.bold(errorMessage.file)}`);
  }

  console.log(
    chalk.white.bold(
      tmpFileToOriginalFile(
        htmlSrcPath,
        generatedHtmlInterfacePath,
        errorMessage.description
      )
    )
  );

  let source: string[] = [];

  if (errorMessage.file === "view-source.js") {
    source = sourceFileContents.split("\n");
  } else {
    const matchingAdditonalSource = (additionalSources || [])
      .find(v => v.path === errorMessage.file);

    if (matchingAdditonalSource) {
      source = matchingAdditonalSource.src.split("\n");
    }
  }

  if (source.length === 0) {
    return;
  }

  const lineIndicator = `${errorMessage.lineNo}: `;

  const originalLine = source[errorMessage.lineNo - 1];
  const trimmedLine = originalLine.trim();

  console.log(`${lineIndicator}${trimmedLine}`);
  console.log(
    chalk.gray(
      new Array(
        errorMessage.charNo -
          1 +
          lineIndicator.length -
          (originalLine.length - trimmedLine.length)
      )
        .fill("-")
        .join("")
    ) + ` ${chalk.red("^")}`
  );
}

function tmpFileToOriginalFile(
  originalFile: string,
  tmpFile: string,
  errorMessage: string
) {
  // Converts the tmp file to the closure name.
  // /tmp/tmp-7879f1gAjlmWO7Cf.ts
  // module$contents$_tmp$tmp_119185rPdGriCsIMF_TemplateInterface
  const formattedTmpFile =
    "module$contents$_" +
    tmpFile
      .slice(1)
      .replace(/\-/g, "_")
      .replace(/\//g, "$") // remove the extension
      .slice(0, -3) +
    "_TemplateInterface";

  while (errorMessage.indexOf(formattedTmpFile) !== -1) {
    errorMessage = errorMessage.replace(formattedTmpFile, originalFile);
  }

  return errorMessage;
}

export function checkTemplate(
  htmlSrcPath: string,
  jsSrcPath: string,
  jsModule: string,
  additionalSources: { src: string; path?: string }[] = []
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

      const viewSource = readFileSync(jsSrcPath, "utf-8");

      const flags = {
        polymerVersion: 1,
        warningLevel: "VERBOSE",
        jsCode: additionalSources.concat([
          { src: polymerExterns, path: "polymer-1.0.js" },
          { src: closureInterface, path: "generated-html-interface.js" },
          { path: "view-source.js", src: viewSource },
          {
            path: "interface-test.js",
            src: `
goog.module('template.check');
const templateInterface = goog.require('${interfaceModule}') // ${htmlSrcPath}
const View = goog.require('${jsModule}');

/** @type {!View} */
const view = new View();

var /** !templateInterface.TemplateInterface */ t = view;
            `
          }
        ])
      };

      const compiledResults = compile(flags);
      const joinedErrors = compiledResults.errors.concat(
        compiledResults.warnings
      );

      if (joinedErrors.length) {
        console.log(`GENERATED INTERFACE from ${htmlSrcPath}`);
        console.log("-------------");
        console.log(closureInterface);
        console.log(chalk.bgRed.bold.white(`--- Errors --`));
        for (const errorMsg of joinedErrors) {
          printError(
            viewSource,
            htmlSrcPath,
            path,
            additionalSources,
            errorMsg
          );
          console.log("");
        }
      }
      cleanup();

      if (joinedErrors.length) {
        process.exit(1);
      }
    }
  );
}
