import * as chalk from "chalk";
import { readFileSync, writeSync } from "fs";
import { generateInterface } from "twinkie/index";

const compile = require("google-closure-compiler-js").compile;
const tmp = require("tmp");
const toClosureJS = require("tsickle/built/src/main").toClosureJS;
const MODULE_EXTRACTOR = /^goog\.module\(\'(.*)\'\)/;

function getFormattedErrorString(
  sourceFiles: {
    sourceFileContents: string;
    idx: number;
    htmlSrcPath: string;
    generatedHtmlInterfacePath: string;
    additionalSources: { src: string; path?: string }[] | undefined;
  }[],
  errorMessage: {
    file: string;
    description: string;
    type: string;
    lineNo: number;
    charNo: number;
  }
): string {
  let errorString = "";

  if (errorMessage.file) {
    errorString += `Error from file: ${chalk.bold(errorMessage.file)}\n`;
  }
  errorString += `${errorMessage.description}\n`;

  let source: string[] = [];

  if (errorMessage.file && errorMessage.file.startsWith("view-source")) {
    for (const s of sourceFiles) {
      if (errorMessage.file === `view-source${s.idx}.js`) {
        source = s.sourceFileContents.split("\n");
      }
    }
  } else {
    let matchingAdditonalSource = undefined;

    for (const s of sourceFiles) {
      const match = (s.additionalSources || []).find(
        v => v.path === errorMessage.file
      );

      if (match) {
        matchingAdditonalSource = match;
      }
    }

    if (matchingAdditonalSource) {
      source = matchingAdditonalSource.src.split("\n");
    }
  }

  if (source.length === 0) {
    return errorString;
  }

  const lineIndicator = `${errorMessage.lineNo}: `;

  const originalLine = source[errorMessage.lineNo - 1];
  const trimmedLine = originalLine.trim();

  errorString += `${lineIndicator}${trimmedLine}\n`;
  errorString +=
    chalk.gray(
      new Array(
        errorMessage.charNo -
          1 +
          lineIndicator.length -
          (originalLine.length - trimmedLine.length)
      )
        .fill("-")
        .join("")
    ) + ` ${chalk.red("^")}\n`;

  return errorString;
}

// function tmpFileToOriginalFile(
//   originalFile: string,
//   tmpFile: string,
//   errorMessage: string
// ) {
//   // Converts the tmp file to the closure name.
//   // /tmp/tmp-7879f1gAjlmWO7Cf.ts
//   // module$contents$_tmp$tmp_119185rPdGriCsIMF_TemplateInterface
//   const formattedTmpFile =
//     "module$contents$_" +
//     tmpFile
//       .slice(1)
//       .replace(/\-/g, "_")
//       .replace(/\//g, "$") // remove the extension
//       .slice(0, -3) +
//     "_TemplateInterface";

//   while (errorMessage.indexOf(formattedTmpFile) !== -1) {
//     errorMessage = errorMessage.replace(formattedTmpFile, originalFile);
//   }

//   return errorMessage;
// }

async function generateClosureInterfaceFromTemplate(
  generatedInterface: string
) {
  return new Promise<{
    cleanup: () => void;
    closureInterface: string;
    moduleName: string;
    path: string;
  }>((res, rej) => {
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
          cleanup();
          rej(
            Error(
              "Unable to generate JS from typescript interface. Please file a bug."
            )
          );
        }

        const closureInterface = closure.jsFiles.get(
          Array.from(closure.jsFiles.keys())[0]
        );
        const interfaceModule = closureInterface.match(MODULE_EXTRACTOR)[1];

        res({
          moduleName: interfaceModule,
          closureInterface: closureInterface,
          path,
          cleanup
        });
      }
    );
  });
}

export async function checkTemplate(
  toCheck: Array<{
    htmlSrcPath: string;
    jsSrcPath: string;
    jsModule: string;
    additionalSources?: Array<{
      src: string;
      path?: string;
    }>;
  }>
) {
  const polymerExterns = readFileSync(
    require.resolve(
      "google-closure-compiler-js/contrib/externs/polymer-1.0.js"
    ),
    "utf-8"
  );

  const toProcess = await Promise.all(
    toCheck.map(async (v, i) => {
      const generatedInterfaceName = `html_interface_${i}`;
      const generatedInterface = generateInterface(
        v.htmlSrcPath,
        generatedInterfaceName
      );

      const generatedClosureInterface = await generateClosureInterfaceFromTemplate(
        generatedInterface
      );

      const ret = {
        viewSource: readFileSync(v.jsSrcPath, "utf-8"),
        generatedInterface,
        generatedInterfaceName,
        htmlClosureInterface: generatedClosureInterface,
        ...v
      };

      return ret;
    })
  );

  let sourceTest = `
  goog.module('template.check');
  `;

  const additionalSources = toProcess.reduce(
    (accum: Array<{ src: string; path?: string }>, val) => {
      if (val.additionalSources) {
        accum.push(...val.additionalSources);
      }
      return accum;
    },
    [{ src: polymerExterns, path: "polymer-1.0.js" }]
  );

  const sourcesToLoad = toProcess.reduce(
    (accum: Array<{ src: string; path?: string }>, v, idx) => {
      accum.push(
        {
          src: v.htmlClosureInterface.closureInterface,
          path: `generated-html-interface${idx}.js`
        },
        { path: `view-source${idx}.js`, src: v.viewSource }
      );

      return accum;
    },
    []
  );

  for (const [idx, v] of toProcess.entries()) {
    sourceTest += `
      const templateInterface${idx} = goog.require('${
      v.htmlClosureInterface.moduleName
    }') // ${v.htmlSrcPath}
  const View${idx} = goog.require('${v.jsModule}');

  /** @type {!View${idx}} */
  const view${idx} = new View${idx}();

  var /** !templateInterface${idx}.${
      v.generatedInterfaceName
    } */ t${idx} = view${idx};
    `;
  }

  const closureCompilerFlags = {
    polymerVersion: 1,
    warningLevel: "VERBOSE",
    jsCode: additionalSources.concat(sourcesToLoad).concat({
      path: "interface-test.js",
      src: sourceTest
    })
  };

  const compiledResults = compile(closureCompilerFlags);
  for (const v of toProcess) {
    v.htmlClosureInterface.cleanup();
  }
  const joinedErrors = compiledResults.errors.concat(compiledResults.warnings);

  if (joinedErrors.length) {
    for (const v of toProcess) {
      console.log(`GENERATED INTERFACE from ${v.htmlSrcPath}`);
      console.log("-------------");
      console.log(v.htmlClosureInterface.closureInterface);
    }

    console.log(chalk.bgRed.bold.white(`--- Errors --`));
    for (const errorMsg of joinedErrors) {
      errorMsg.errorString = getFormattedErrorString(
        toProcess.map((v, idx) => {
          return {
            idx,
            sourceFileContents: v.viewSource,
            htmlSrcPath: v.htmlSrcPath,
            generatedHtmlInterfacePath: v.htmlClosureInterface.path,
            additionalSources: v.additionalSources
          };
        }),
        errorMsg
      );

      console.log(errorMsg.errorString);
    }
    throw new Error(joinedErrors);
  }
}
