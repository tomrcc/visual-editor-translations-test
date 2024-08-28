const fs = require("fs");
const YAML = require("yaml");
const {
  NodeHtmlMarkdown,
  NodeHtmlMarkdownOptions,
} = require("node-html-markdown");

const {
  isDirectory,
  readFileWithFallback,
  readJsonFromFile,
} = require("./helpers/file-helper.cjs");
const nhm = new NodeHtmlMarkdown(
  /* options (optional) */ {},
  /* customTransformers (optional) */ undefined,
  /* customCodeBlockTranslators (optional) */ undefined
);
const Diff = require("diff");
const path = require("path");

const inputFilePath = "./rosey/base.json";
const inputURLFilePath = "./rosey/base.urls.json";
const translationFilesDirPath = "./rosey/translations";
const localesDirPath = "./rosey/locales";
const contentDirPath = "./src/content/pages/";

const baseURL = process.env.BASEURL || "http://localhost:4321/";
const locales = process.env.LOCALES?.toLowerCase().split(",") || ["es"];

function getPageString(page) {
  return page.replace(".html", "").replace("index", "");
}

function initDefaultInputs(data, page, locale) {
  // Create the inputs obj if there is none
  if (!data["_inputs"]) {
    data["_inputs"] = {};
  }

  // Create the page input object
  if (!data["_inputs"]["$"]) {
    const pageString = getPageString(page);
    data["_inputs"]["$"] = {
      type: "object",
      comment: `[See ${pageString}](${baseURL}${pageString})`,
      options: {
        place_groups_below: false,
        groups: [
          {
            heading: `Still to translate (${locale})`,
            comment: `Text to translate on [${pageString}](${baseURL}${pageString})`,
            inputs: [],
          },
          {
            heading: `Already translated (${locale})`,
            comment: `Text already translated on [${pageString}](${baseURL}${pageString})`,
            inputs: [],
          },
        ],
      },
    };
  }
}

function formatMarkdown(markdown) {
  return (
    markdown
      .trim()
      // Remove all md links
      .replaceAll(/(?:__[*#])|\[(.*?)\]\(.*?\)/gm, /$1/)
      // Remove special chars
      .replaceAll(/[&\/\\#,+()$~%.":*?<>{}]/gm, "")
  );
}
function formatMarkdownForComments(markdown) {
  return (
    markdown
      .trim()
      // Remove all md links
      .replaceAll(/(?:__[*#])|\[(.*?)\]\(.*?\)/gm, /$1/)
      // Remove special chars
      .replaceAll(/[&\/\\#+()$~%"*<>{}]/gm, "")
  );
}

function generateDiffString(oldOriginalFromLocale, untranslatedPhraseMarkdown) {
  const diff = Diff.diffWordsWithSpace(
    oldOriginalFromLocale,
    untranslatedPhraseMarkdown
  );

  let diffStringAdded = "";
  let diffStringRemoved = "";
  diff.forEach((part) => {
    // green for additions, red for deletions
    if (part.added && part.value.trim().length > 0) {
      return (diffStringAdded = `${diffStringAdded} ${part.value}`);
    }
    if (part.removed && part.value.trim().length > 0) {
      return (diffStringRemoved = `${diffStringRemoved} ${part.value}`);
    }
  });
  const formattedDiffStringAdded =
    diffStringAdded.length > 0
      ? `<p>Added: ${formatMarkdownForComments(diffStringAdded)}</p>`
      : "";
  const formattedDiffStringRemoved =
    diffStringRemoved.length > 0
      ? `<p>Removed: ${formatMarkdownForComments(diffStringRemoved)}</p>`
      : "";

  const formattedStringCombined = nhm.translate(
    `${formattedDiffStringAdded}${formattedDiffStringRemoved}`
  );

  return formattedStringCombined;
}

function getInputConfig(inputKey, page, inputTranslationObj, oldLocaleData) {
  const untranslatedPhrase = inputTranslationObj.original.trim();
  // Turn into markdown
  const untranslatedPhraseMarkdown = nhm.translate(untranslatedPhrase);
  const oldOriginalFromLocale = oldLocaleData[inputKey]?.original
    ? nhm.translate(oldLocaleData[inputKey].original)
    : "";

  const originalPhraseTidied = formatMarkdown(untranslatedPhraseMarkdown);
  const originalPhraseTidiedForComment = formatMarkdownForComments(
    untranslatedPhraseMarkdown
  );

  // If key is static, we present editors with a diff to assist in adding/removing changes to the original
  // In this iteration, all static inputs are type markdown
  // Meaning the parent container needs to be a block element (like a <div>) that can contain other elements
  // Add a namespace using the data-rosey-ns="static" wherever there is a data-rosey="" tag present
  const isKeyStatic = inputKey.slice(0, 10).includes("static:");
  const isKeyStaticOrMarkdown =
    inputKey.slice(0, 10).includes("static:") ||
    inputKey.slice(0, 10).includes("markdown:");
  const isInputShortText = untranslatedPhrase.length < 20;

  const inputType = isKeyStaticOrMarkdown
    ? "markdown"
    : isInputShortText
    ? "text"
    : "textarea";

  const options = isKeyStaticOrMarkdown
    ? {
        bold: true,
        format: "p h1 h2 h3 h4",
        italic: true,
        link: true,
        undo: true,
        redo: true,
        removeformat: true,
        copyformatting: true,
        bulletedlist: true,
        numberedlist: true,
        blockquote: true,
        superscript: true,
        subscript: true,
        code: true,
        horizontalrule: true,
        image: true,
      }
    : {};

  const diffString = isKeyStatic
    ? generateDiffString(oldOriginalFromLocale, untranslatedPhraseMarkdown)
    : "";

  const locationString = generateLocationString(originalPhraseTidied, page);
  const joinedComment =
    diffString.length > 0
      ? `${diffString}\n\n${locationString}`
      : `${locationString}`;

  const isLabelConcat = originalPhraseTidiedForComment.length > 42;

  const formattedLabel = isLabelConcat
    ? `${originalPhraseTidiedForComment.substring(0, 42)}...`
    : originalPhraseTidiedForComment;

  const inputConfig = isLabelConcat
    ? {
        label: formattedLabel,
        hidden: untranslatedPhrase === "" ? true : false,
        type: inputType,
        options: options,
        comment: joinedComment,
        context: {
          open: false,
          title: "Untranslated Text",
          icon: "translate",
          content: untranslatedPhraseMarkdown,
        },
      }
    : {
        label: formattedLabel,
        hidden: untranslatedPhrase === "" ? true : false,
        type: inputType,
        options: options,
        comment: joinedComment,
      };

  return inputConfig;
}

function getTranslationHTMLFilename(translationFilename) {
  if (translationFilename === "404.yaml") {
    return "404.html";
  }

  if (translationFilename === "home.yaml") {
    return "index.html";
  }

  return translationFilename.replace(".yaml", "/index.html");
}

function generateLocationString(originalPhraseTidied, page) {
  // Limit each phrase to 3 words
  const urlHighlighterWordLength = 3;
  const originalPhraseArray = originalPhraseTidied.split(/[\n]+/);
  // Get the first and last line of the markdown so we only have complete lines in the highlight url
  const firstPhrase = originalPhraseArray[0];
  const lastPhrase = originalPhraseArray[originalPhraseArray.length - 1];
  const endHighlightArrayAll = lastPhrase.split(" ");

  const startHighlightArray = firstPhrase
    .split(" ")
    .slice(0, urlHighlighterWordLength);

  const endHighlightArray = endHighlightArrayAll.slice(
    endHighlightArrayAll.length - urlHighlighterWordLength,
    endHighlightArrayAll.length
  );

  const originalPhraseArrayByWord = originalPhraseArray.join(" ").split(" ");

  // Trim and encode the resulting phrase
  const startHighlight = startHighlightArray.join(" ").trim();
  const endHighlight = endHighlightArray.join(" ").trim();

  const encodedStartHighlight = encodeURI(startHighlight);
  const encodedEndHighlight = encodeURI(endHighlight);
  const encodedOriginalPhrase = encodeURI(originalPhraseArray.join(" "));

  const pageString = getPageString(page);
  // Look to see if original phrase is 5 words or shorter
  // if it is fallback to the encoded original phrase for the highlight link
  return originalPhraseArrayByWord.length > urlHighlighterWordLength * 2
    ? `[See on page](${baseURL}${pageString}#:~:text=${encodedStartHighlight},${encodedEndHighlight})`
    : `[See on page](${baseURL}${pageString}#:~:text=${encodedOriginalPhrase})`;
}

function getObjValueFromNestedStructure(structure, keyToLookFor) {
  // Arrays will also return true for typeof object
  if (!structure || typeof structure !== "object") {
    return false;
  }
  // Check if something is a structure like array or obj
  // If it's an object
  if (!Array.isArray(structure)) {
    const objectKeys = Object.keys(structure);
    // Check if it has the key: value, and return the value if it does
    if (objectKeys.includes(keyToLookFor)) {
      console.log("This includes the right key", structure[keyToLookFor]);
      return structure[keyToLookFor];
    } else {
      // If not, loop through the other keys in objectKeys and check if they're typeof obj
      // if they are recursively call this fn with the key
      for (let i = 0; i < objectKeys.length; i++) {
        const result = getObjValueFromNestedStructure(
          structure[objectKeys[i]],
          keyToLookFor
        );
        if (result) {
          return result;
        }
      }
    }
  } else {
    // Don't check for key: value since we are in array
    // Just look if each item is typeof object and recursively call this fn on the array item if it is
    for (let i = 0; i < structure.length; i++) {
      const result = getObjValueFromNestedStructure(structure[i], keyToLookFor);
      if (result) {
        return result;
      }
    }
  }
}

async function readContentDirTranslations(contentDirectory, locale) {
  const contentDirectoryFiles = await fs.promises.readdir(contentDirectory, {
    recursive: true,
  });

  // Look through each file for translations
  contentDirectoryFiles.forEach(async (filename) => {
    try {
      const filePath = path.join(contentDirectory, filename);
      const fileStats = await fs.promises.stat(filePath);
      const isFileDirectory = fileStats.isDirectory();
      if (isFileDirectory) {
        console.log("This is a dir (not a file), skipping read");
      } else {
        const buffer = await fs.promises.readFile(filePath);
        const fileData = buffer.toString("utf-8");
        const fileDataFrontMatterWithContent = fileData.split("---")[1];
        const fileFrontMatter = YAML.parse(fileDataFrontMatterWithContent);

        if (fileFrontMatter.content_blocks) {
          fileFrontMatter.content_blocks.forEach((block) => {
            const translationValue = getObjValueFromNestedStructure(
              block,
              "es_translation"
            );
            console.log("Translation Value", translationValue);
          });
        }
      }
    } catch (err) {
      throw err;
    }
  });
}

async function main(locale) {
  // Get the Rosey generated data
  const localePath = path.join(localesDirPath, `${locale}.json`);
  const oldLocaleData = await readJsonFromFile(localePath);
  const inputFileData = await readJsonFromFile(inputFilePath);
  const inputURLFileData = await readJsonFromFile(inputURLFilePath);

  await readContentDirTranslations(contentDirPath, locale);

  const pages = Object.keys(inputURLFileData.keys);

  const translationsLocalePath = path.join(translationFilesDirPath, locale);

  console.log(`📂 ${translationsLocalePath} ensuring folder exists`);
  await fs.promises.mkdir(translationsLocalePath, { recursive: true });

  const translationsFiles = await fs.promises.readdir(translationsLocalePath, {
    recursive: true,
  });

  // Remove translations pages no longer present in the base.json file
  await Promise.all(
    translationsFiles.map(async (fileNameWithExt) => {
      const filePath = path.join(translationsLocalePath, fileNameWithExt);

      if (await isDirectory(filePath)) {
        return;
      }

      const fileNameHTMLFormatted = getTranslationHTMLFilename(fileNameWithExt);

      if (!pages.includes(fileNameHTMLFormatted)) {
        console.log(
          `❌ Deleting ${fileNameHTMLFormatted}(${filePath}), since it doesn't exist in the pages in our base.json`
        );

        await fs.promises.unlink(filePath);
        console.log(`❌ ${fileNameHTMLFormatted} at ${filePath} was deleted`);
      }
    })
  );

  // Loop through the pages present in the base.json
  await Promise.all(
    pages.map(async (page) => {
      // Format the page name
      const pageName = page
        .replace("/index.html", "")
        .replace(".html", "")
        .replace("index", "home");

      // Find the page file path
      const translationFilePath = path.join(
        translationFilesDirPath,
        locale,
        `${pageName}.yaml`
      );

      let cleanedOutputFileData = {};

      // Ensure nested pages have parent folders
      const pageHasParentFolder = pageName.includes("/");
      if (pageHasParentFolder) {
        const parentFolder = pageName.substring(
          0,
          pageName.lastIndexOf("/") + 1
        );
        const parentFolderFilePath = path.join(
          translationFilesDirPath,
          locale,
          parentFolder
        );
        await fs.promises.mkdir(parentFolderFilePath, { recursive: true });
      }

      const translationFileString = await readFileWithFallback(
        translationFilePath,
        "_inputs: {}"
      );
      const translationFileData = await YAML.parse(translationFileString);

      // Create the url key
      if (translationFileData["urlTranslation"]?.length > 0) {
        cleanedOutputFileData["urlTranslation"] =
          translationFileData["urlTranslation"];
      } else {
        cleanedOutputFileData["urlTranslation"] = page;
      }

      initDefaultInputs(cleanedOutputFileData, page, locale);

      Object.keys(inputFileData.keys).forEach((inputKey) => {
        const inputTranslationObj = inputFileData.keys[inputKey];
        // If input exists on this page
        if (!inputTranslationObj.pages[page]) {
          return;
        }

        // Only add the key to our output data if it still exists in base.json
        // If entry no longer exists in base.json it's content has changed in the visual editor
        if (translationFileData[inputKey]) {
          cleanedOutputFileData[inputKey] = translationFileData[inputKey];
        }

        // If entry doesn't exist in our output file, add it
        if (!cleanedOutputFileData[inputKey]) {
          cleanedOutputFileData[inputKey] = "";
        }

        cleanedOutputFileData["_inputs"][inputKey] = getInputConfig(
          inputKey,
          page,
          inputTranslationObj,
          oldLocaleData
        );

        // Add each entry to page object group depending on whether they are translated or not
        if (cleanedOutputFileData[inputKey].length > 0) {
          cleanedOutputFileData["_inputs"]["$"].options.groups[1].inputs.push(
            inputKey
          );
        } else {
          cleanedOutputFileData["_inputs"]["$"].options.groups[0].inputs.push(
            inputKey
          );
        }
      });

      await fs.promises.writeFile(
        translationFilePath,
        YAML.stringify(cleanedOutputFileData)
      );
      console.log("✅✅ " + translationFilePath + " updated succesfully");
    })
  );
}

// Loop through locales
for (let i = 0; i < locales.length; i++) {
  const locale = locales[i];

  main(locale).catch((err) => {
    console.error(`❌❌ Encountered an error translating ${locale}:`, err);
  });
}

module.exports = { main };
