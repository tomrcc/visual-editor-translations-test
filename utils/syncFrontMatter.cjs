const fs = require("fs");
const path = require("path");
const YAML = require("yaml");
const slugify = require("slugify");
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

const generateRoseyId = (text) => {
  if (!text) {
    return "";
  }
  const lowerCaseText = text.toLowerCase();
  const formattedText = lowerCaseText.replaceAll(
    /(?:__[*#])|\[(.*?)\]\(.*?\)/gm,
    /$1/
  );
  return slugify(formattedText, { remove: /[.*,:\/]/g });
};

async function readContentPage(filePath) {
  const buffer = await fs.promises.readFile(filePath);
  const fileData = buffer.toString("utf-8");
  const fileDataSplit = fileData.split("---");
  const fileDataFrontMatterString = fileDataSplit[1];
  const fileDataBodyContent = fileDataSplit[2];
  const fileFrontMatter = YAML.parse(fileDataFrontMatterString);

  return {
    frontmatter: fileFrontMatter,
    bodyContent: fileDataBodyContent,
  };
}

function getObjWithPathFromNestedStructure(
  structure,
  valueToLookFor,
  path = ""
) {
  // Arrays will also return true for typeof object
  if (!structure || typeof structure !== "object") {
    return false;
  }

  // Check if something is a structure like array or obj
  // If it's an object
  if (!Array.isArray(structure)) {
    const objectKeys = Object.keys(structure);
    // Check if it has the key, and return the whole obj if it does
    let objIncludeValueAtKey = "";
    // Loop objectKeys and look the structure[key] to see if we've found the value
    // If we do, update objIncludeValue to true and break the loop
    for (let i = 0; i < objectKeys.length; i++) {
      const key = objectKeys[i];
      if (structure[key] === valueToLookFor) {
        objIncludeValueAtKey = key;
        break;
      }
    }
    // Continue and return the structure containing the value with the path, or recursively call the function again
    if (objIncludeValueAtKey) {
      console.log(
        `This object includes the right value, of \n ${valueToLookFor}\n at ${objIncludeValueAtKey}`
      );
      return {
        structure: structure,
        path: `${path}.${objIncludeValueAtKey}`,
      };
    } else {
      // If not, loop through the other keys in objectKeys and check if they're typeof obj
      // if they are recursively call this fn with the key
      for (let j = 0; j < objectKeys.length; j++) {
        const key = objectKeys[j];
        let currentPath = path !== "" ? `${path}.${key}` : key;
        const result = getObjWithPathFromNestedStructure(
          structure[objectKeys[j]],
          valueToLookFor,
          currentPath
        );
        if (result) {
          return result;
        }
      }
    }
  } else {
    // Don't check for key: value since we are in array
    // Just look if each item is typeof object and recursively call this fn on the array item if it is
    for (let j = 0; j < structure.length; j++) {
      let currentPath = `${path}[${j}]`;
      const result = getObjWithPathFromNestedStructure(
        structure[j],
        valueToLookFor,
        currentPath
      );
      if (result) {
        return result;
      }
    }
  }
}

function changeDeeplyNestedObjKeys(
  structure,
  valueToLookFor,
  pageTranslationData,
  path = ""
) {
  // Arrays will also return true for typeof object
  if (!structure || typeof structure !== "object") {
    return false;
  }

  // Check if something is a structure like array or obj
  // If it's an object
  if (!Array.isArray(structure)) {
    const objectKeys = Object.keys(structure);
    // Check if it has the key, and update the obj if it does
    let objIncludeValueAtKey = "";

    // Loop objectKeys and look the structure[key] to see if we've found the value
    // If we do, update objIncludeValue to the key containing it and break the loop
    for (let i = 0; i < objectKeys.length; i++) {
      const key = objectKeys[i];
      if (structure[key] === valueToLookFor) {
        objIncludeValueAtKey = key;
        break;
      }
    }
    // Continue and update the structure containing the value, or recursively call the function again
    if (objIncludeValueAtKey) {
      // Check if the structure we are in is in the right format, otherwise refactor it
      // Loop through each locale
      // Check if there is an input for ${locale}_translation, otherwise create one
      // Look for the data file that corresponds and update the ${locale}_translation value
      const currentStructureKeys = Object.keys(structure);
      const isCurrentStructureCorrectFormat =
        currentStructureKeys.includes("selected_translation") &&
        currentStructureKeys.includes("original");

      // console.log("Structure we are in pre-write: ", structure);
      if (!isCurrentStructureCorrectFormat) {
        structure[objIncludeValueAtKey] = {
          selected_translation: "None",
          original: valueToLookFor,
        };

        locales.forEach((locale) => {
          const translationKey = generateRoseyId(valueToLookFor);
          structure[objIncludeValueAtKey][`${locale}_translation`] =
            pageTranslationData[locale][translationKey];
        });

        // If already in the right format, just write the translated value for each locale
      } else {
        locales.forEach((locale) => {
          const translationKey = generateRoseyId(valueToLookFor);
          structure[`${locale}_translation`] =
            pageTranslationData[locale][translationKey];
        });
      }
      return console.log(`Successfully updated translations for ${path}`);
    } else {
      // If not in the right structure, loop through the other keys in objectKeys and check if they're typeof obj
      // if they are recursively call this fn with the key
      for (let j = 0; j < objectKeys.length; j++) {
        const key = objectKeys[j];
        let currentPath = path !== "" ? `${path}.${key}` : key;
        const result = changeDeeplyNestedObjKeys(
          structure[objectKeys[j]],
          valueToLookFor,
          pageTranslationData,
          currentPath
        );
        if (result) {
          return result;
        }
      }
    }
  } else {
    // Don't check for key: value since we are in array
    // Just look if each item is typeof object and recursively call this fn on the array item if it is
    for (let j = 0; j < structure.length; j++) {
      let currentPath = `${path}[${j}]`;
      const result = changeDeeplyNestedObjKeys(
        structure[j],
        valueToLookFor,
        pageTranslationData,
        currentPath
      );
      if (result) {
        return result;
      }
    }
  }
}

// TODO: See if the page has content blocks, loop through them perform an obj search on each block and where we find the original look in the same object for the key ${locale}_translation
// TODO: Then if there's a new translation or its blank or non-existent we overwrite it or create it with the translated value from data file
// TODO: Else we can check if theres a new translation on the page frontmatter that isn't blank or non-existent (or obv the same - being new ) and:
// TODO: Write that to the object we're writing to the object to write to the page
// TODO: Also once we have looped through all the pages content blocks we need to write the page back with the new frontmatter that includes the new translations, remembering to write the body content and ---'s in the right position
// TODO: Conversely we need to check if the pages content blocks contain new translations that we need to write back to the data files and subsequently on to the locales files
// TODO: Think about where to run bookshop/generate in the order of all of this rewriting

const dataFilesDirPath = "./rosey/translations";
const contentDirPath = "./src/content/pages/";
const baseJsonFile = "./rosey/base.json";
const locales = process.env.LOCALES?.toLowerCase().split(",") || ["es"];

(async () => {
  const baseJsonData = await readJsonFromFile(baseJsonFile);
  const baseJsonKeys = Object.keys(baseJsonData.keys);
  const translationsDirFiles = await fs.promises.readdir(dataFilesDirPath);
  const firstTranslationDirPath = path.join(
    dataFilesDirPath,
    translationsDirFiles[0]
  );
  const dataFilePageNames = await fs.promises.readdir(firstTranslationDirPath, {
    recursive: true,
  });
  const contentDirectoryPageNames = await fs.promises.readdir(contentDirPath, {
    recursive: true,
  });

  // Loop through all the pages
  await Promise.all(
    dataFilePageNames.map(async (pageFileName) => {
      // Find the corresponding page content for each page we're looping through in our base.json if its visually editable
      const pageFilePath = path.join(firstTranslationDirPath, pageFileName);

      let pageTranslationData = {};

      if (await isDirectory(pageFilePath)) {
        console.log(`${pageFilePath} is dir - no sync needed`);
        return;
      }

      await Promise.all(
        locales.map(async (locale) => {
          const translationPageFilePath = path.join(
            dataFilesDirPath,
            locale,
            pageFileName
          );
          const pageTranslationDataRaw = await readFileWithFallback(
            translationPageFilePath
          );
          pageTranslationData[locale] = YAML.parse(pageTranslationDataRaw);
        })
      );

      const pageNameMd = pageFileName
        .replace(".yaml", ".md")
        .replace("home", "index");
      const isPageVisuallyEditable =
        contentDirectoryPageNames.includes(pageNameMd);
      if (!isPageVisuallyEditable) {
        return;
      }
      const contentPageFilePath = path.join(contentDirPath, pageNameMd);
      const { frontmatter, bodyContent } = await readContentPage(
        contentPageFilePath
      );

      // Loop through all the Rosey keys
      baseJsonKeys.map((translationKey) => {
        const translationOriginal =
          baseJsonData.keys[translationKey].original.trim();
        // If this page is visually editable and has content blocks
        // find the corresponding translation and add the translated value from the data file to the content block
        // Once we've looped over it's blocks we can write the file with the new transformed frontmatter
        if (isPageVisuallyEditable) {
          const pageContentBlocks = frontmatter.content_blocks;
          if (pageContentBlocks) {
            pageContentBlocks.forEach((block) => {
              changeDeeplyNestedObjKeys(
                block,
                translationOriginal,
                pageTranslationData
              );
            });
          }
        }
      });

      // Combine frontmatter and body content in the correct way then write the file back to src/content/pages
      const pageToWrite = `---\n${YAML.stringify(
        frontmatter
      )}\n---\n${bodyContent.trim()}`;
      await fs.promises.writeFile(contentPageFilePath, pageToWrite);
      console.log("✅✅ " + contentPageFilePath + " updated succesfully");
    })
  );
})();
